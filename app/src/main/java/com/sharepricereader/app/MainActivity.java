package com.sharepricereader.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.text.InputType;
import android.util.Base64;
import android.view.Gravity;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import android.widget.EditText;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import com.google.android.gms.auth.UserRecoverableAuthException;

public class MainActivity extends Activity {

    private static final int REQ_FILE = 1;
    private static final int REQ_PERM = 2;
    private static final int REQ_UPDATE = 3;
    private static final int REQ_CAM = 4;
    private static final int REQ_BROWSER = 5;
    /** Tab the in-app browser asked for (Home/Show/Cards...). Applied in onResume. */
    static String pendingNav;
    /** Text sent from the still-running in-app browser; it is delivered to the page in onResume. */
    static String pendingSendText, pendingSendUrl;
    private static final int REQ_WEBCAM = 6;
    private static final int REQ_GOOGLE_SIGN_IN = 7;
    private static final int REQ_GOOGLE_RECOVER = 8;
    private static final int REQ_AUTH_LOCK = 9;
    private String authLockMode;
    private android.webkit.PermissionRequest pendingCam;
    private Uri camUri;
    private File camFile;
    private static final String HOME = "file:///android_asset/index.html";

    private WebView web;
    private ValueCallback<Uri[]> chooser;
    private GoogleAuthHelper googleAuth;
    private AuthStore authStore;

    private void jsAuthLock(final boolean ok) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript("window.__authLockRes&&window.__authLockRes(" + ok + ")", null);
            }
        });
    }

    /** Ask for the phone PIN / pattern / fingerprint. mode = unlock | enable | disable */
    private void askAuthCredential(final String mode) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    android.app.KeyguardManager km =
                            (android.app.KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                    Intent i = (km != null && km.isDeviceSecure())
                            ? km.createConfirmDeviceCredentialIntent("Authentication", "Confirm it is you") : null;
                    if (i == null) {
                        toast("Set a phone screen lock (PIN, pattern or fingerprint) first");
                        jsAuthLock(false);
                        return;
                    }
                    authLockMode = mode;
                    startActivityForResult(i, REQ_AUTH_LOCK);
                } catch (Throwable e) {
                    jsAuthLock(false);
                }
            }
        });
    }

    private synchronized AuthStore auth() {
        if (authStore == null) authStore = new AuthStore(this);
        return authStore;
    }
    private String pendingGoogleCbId; // JS callback id waiting for sign-in result

    // পেজ ঠিকমতো চালু হলো কিনা দেখার জন্য (ভুল আপডেটের পর উদ্ধার)
    private volatile boolean pageReady;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable readyCheck = new Runnable() {
        @Override
        public void run() {
            if (!pageReady && !isFinishing()) showRecovery();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // নতুন APK install হলে পুরনো ইন-অ্যাপ আপডেট মুছে যায়
        Updater.resetIfApkChanged(this);

        // Android 6-9: Downloads-এ লেখার অনুমতি চাওয়া
        if (Build.VERSION.SDK_INT >= 23 && Build.VERSION.SDK_INT < 29
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_PERM);
        }

        web = new WebView(this);
        rootFl = new android.widget.FrameLayout(this);
        rootFl.addView(web, new android.widget.FrameLayout.LayoutParams(-1, -1));
        setContentView(rootFl);

        googleAuth = new GoogleAuthHelper(this);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // Assets need file access; block cross-file and universal access (XSS / path traversal hardening)
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setAllowContentAccess(false);
        if (Build.VERSION.SDK_INT >= 21) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        // Never leave remote debugging on in production builds
        if (Build.VERSION.SDK_INT >= 19) {
            WebView.setWebContentsDebuggingEnabled(false);
        }

        web.addJavascriptInterface(new Bridge(), "Android");

        // বদলানো ফাইল থাকলে সেটা দেখানো, না থাকলে মূল asset
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                WebResourceResponse r = Updater.intercept(MainActivity.this, req.getUrl());
                return r != null ? r : super.shouldInterceptRequest(view, req);
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                super.onPageStarted(view, url, icon);
                pageReady = false;
                handler.removeCallbacks(readyCheck);
                if (Updater.hasUpdate(MainActivity.this)) handler.postDelayed(readyCheck, 8000);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final android.webkit.PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        boolean wantsVideo = false;
                        for (String r : request.getResources()) {
                            if (android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsVideo = true;
                        }
                        if (!wantsVideo) {
                            request.deny();
                            return;
                        }
                        if (Build.VERSION.SDK_INT >= 23
                                && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                            pendingCam = request;
                            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_WEBCAM);
                        } else {
                            request.grant(new String[]{android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                        }
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (chooser != null) {
                    chooser.onReceiveValue(null);
                }
                chooser = callback;
                if (params.isCaptureEnabled()) {
                    try {
                        camFile = new File(ShareProvider.dir(MainActivity.this), "cap_" + System.currentTimeMillis() + ".jpg");
                        camFile.createNewFile();
                        camUri = ShareProvider.uriFor(camFile);
                        Intent ci = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        ci.putExtra(MediaStore.EXTRA_OUTPUT, camUri);
                        ci.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivityForResult(ci, REQ_CAM);
                        return true;
                    } catch (Exception e) {
                        // camera না পেলে সাধারণ file বাছাই
                    }
                }
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    chooser = null;
                    toast("File বাছাই খোলা যায়নি");
                    return false;
                }
                return true;
            }
        });

        loadHome();
    }

    // ------------------------------------------------------------ Update menu

    private void showUpdateMenu() {
        String[] items = {
                "Update from file",
                "Paste update code",
                "Undo last update",
                "Save updated files",
                "Reset to original"
        };
        new AlertDialog.Builder(this)
                .setTitle("App update")
                .setItems(items, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        switch (which) {
                            case 0: pickUpdateFile(); break;
                            case 1: showPasteDialog(); break;
                            case 2: confirmUndo(); break;
                            case 3: exportUpdates(); break;
                            case 4: confirmReset(); break;
                        }
                    }
                })
                .setNegativeButton("Close", null)
                .show();
    }

    /** আপডেট ভেঙে গেলে (পেজ চালু হয়নি) উদ্ধারের ডায়ালগ। */
    private void showRecovery() {
        new AlertDialog.Builder(this)
                .setTitle("App did not load")
                .setMessage("The last update may be broken.")
                .setPositiveButton("Undo update", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        Updater.undo(MainActivity.this);
                        reloadApp();
                    }
                })
                .setNeutralButton("Reset", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        Updater.reset(MainActivity.this);
                        reloadApp();
                    }
                })
                .setNegativeButton("Ignore", null)
                .show();
    }

    private void pickUpdateFile() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        try {
            startActivityForResult(i, REQ_UPDATE);
        } catch (Exception e) {
            toast("Cannot open file picker");
        }
    }

    private void showPasteDialog() {
        final EditText et = new EditText(this);
        et.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE
                | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        et.setTypeface(Typeface.MONOSPACE);
        et.setTextSize(12);
        et.setGravity(Gravity.TOP | Gravity.START);
        et.setMinLines(8);
        et.setMaxLines(14);
        et.setHorizontallyScrolling(true);
        et.setHint("Paste code starting with #SRUPDATE");

        // ক্লিপবোর্ডে আপডেট কোড থাকলে নিজে থেকেই বসিয়ে দেওয়া
        String clip = readClipboard();
        if (clip != null && clip.trim().startsWith("#SRUPDATE")) et.setText(clip);

        new AlertDialog.Builder(this)
                .setTitle("Paste update code")
                .setView(et)
                .setPositiveButton("Apply", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        String t = et.getText().toString();
                        if (t.trim().isEmpty()) { toast("Nothing pasted"); return; }
                        runUpdate(t.getBytes(StandardCharsets.UTF_8));
                    }
                })
                .setNeutralButton("Clipboard", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        String c = readClipboard();
                        if (c == null || c.trim().isEmpty()) { toast("Clipboard is empty"); return; }
                        runUpdate(c.getBytes(StandardCharsets.UTF_8));
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private String readClipboard() {
        try {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return null;
            ClipData cd = cm.getPrimaryClip();
            if (cd == null || cd.getItemCount() == 0) return null;
            CharSequence cs = cd.getItemAt(0).coerceToText(this);
            return cs == null ? null : cs.toString();
        } catch (Exception e) {
            return null;
        }
    }

    private void runUpdate(final byte[] data) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    final PatchEngine.Result r = Updater.apply(MainActivity.this, data);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            reloadApp();
                            showMessage("✅ Updated", r.summary());
                        }
                    });
                } catch (final Exception e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            String m = e.getMessage() != null ? e.getMessage() : e.toString();
                            showMessage("❌ Failed (nothing changed)", m);
                        }
                    });
                }
            }
        }).start();
    }

    private void confirmUndo() {
        if (!Updater.hasUpdate(this)) { toast("Nothing to undo"); return; }
        new AlertDialog.Builder(this)
                .setTitle("Undo last update?")
                .setPositiveButton("Yes", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        Updater.undo(MainActivity.this);
                        reloadApp();
                        toast("Undone");
                    }
                })
                .setNegativeButton("No", null)
                .show();
    }

    private void confirmReset() {
        if (!Updater.hasUpdate(this)) { toast("Already original"); return; }
        new AlertDialog.Builder(this)
                .setTitle("Reset to original?")
                .setMessage("All updates are removed. Your saved data stays.")
                .setPositiveButton("Reset", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        Updater.reset(MainActivity.this);
                        reloadApp();
                        toast("Reset done");
                    }
                })
                .setNegativeButton("No", null)
                .show();
    }

    private void exportUpdates() {
        try {
            byte[] z = Updater.exportZip(this);
            if (z == null) { toast("No updated files"); return; }
            saveToDownloads("DataShow-updated-files.zip", "application/zip", z, "Saved to Downloads: ");
        } catch (Exception e) {
            toast("Failed: " + e.getMessage());
        }
    }

    private void reloadApp() {
        web.clearCache(true);
        loadHome();
    }

    /**
     * Main page load. Updated index.html is given to the WebView directly
     * (base URL stays file:///android_asset/index.html, so saved data / localStorage is the same).
     * shouldInterceptRequest is not reliable for the main file:// page on many phones,
     * that is why the update showed in the dialog but the old page kept loading.
     */
    private void loadHome() {
        try {
            File f = new File(Updater.dir(this), "index.html");
            if (Updater.hasUpdate(this) && f.isFile() && f.length() > 0) {
                String html;
                try (InputStream in = new java.io.FileInputStream(f)) {
                    html = new String(PatchEngine.readAll(in), StandardCharsets.UTF_8);
                }
                web.loadDataWithBaseURL(HOME, html, "text/html", "UTF-8", HOME);
                return;
            }
        } catch (Exception ignored) {
            // fall back to the original page below
        }
        web.loadUrl(HOME);
    }

    private void showMessage(String title, String msg) {
        new AlertDialog.Builder(this)
                .setTitle(title)
                .setMessage(msg)
                .setPositiveButton("OK", null)
                .show();
    }

    // ------------------------------------------------------------ সাধারণ অংশ

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_WEBCAM && pendingCam != null) {
            android.webkit.PermissionRequest r = pendingCam;
            pendingCam = null;
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                r.grant(new String[]{android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            } else {
                r.deny();
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_CAM && chooser != null) {
            Uri[] r = (resultCode == RESULT_OK && camFile != null && camFile.length() > 0)
                    ? new Uri[]{camUri} : null;
            chooser.onReceiveValue(r);
            chooser = null;
        } else if (requestCode == REQ_FILE && chooser != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            chooser.onReceiveValue(result);
            chooser = null;
        } else if (requestCode == REQ_BROWSER) {
            String t = BrowserActivity.resText, u = BrowserActivity.resUrl;
            BrowserActivity.resText = null;
            BrowserActivity.resUrl = null;
            if (resultCode == RESULT_OK && t != null && !t.isEmpty()) {
                web.evaluateJavascript("window.__browserSend&&window.__browserSend("
                        + JSONObject.quote(u == null ? "" : u) + "," + JSONObject.quote(t) + ")", null);
            }
        } else if (requestCode == REQ_UPDATE && resultCode == RESULT_OK && data != null
                && data.getData() != null) {
            try (InputStream in = getContentResolver().openInputStream(data.getData())) {
                if (in == null) throw new Exception("Cannot open file");
                byte[] bytes = PatchEngine.readAll(in);
                if (bytes.length > 30 * 1024 * 1024) throw new Exception("File too large (over 30 MB)");
                runUpdate(bytes);
            } catch (Exception e) {
                showMessage("❌ Cannot read file", String.valueOf(e.getMessage()));
            }
        } else if (requestCode == REQ_GOOGLE_SIGN_IN) {
            JSONObject result = googleAuth.handleSignInResult(data);
            final String cb = pendingGoogleCbId;
            pendingGoogleCbId = null;
            if (cb != null) {
                final String js = "window.__googleAuth&&window.__googleAuth(" + JSONObject.quote(cb) + "," + result.toString() + ")";
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        web.evaluateJavascript(js, null);
                    }
                });
            }
        } else if (requestCode == REQ_AUTH_LOCK) {
            boolean lockOk = resultCode == RESULT_OK;
            String mode = authLockMode;
            authLockMode = null;
            if (lockOk && mode != null) {
                if ("unlock".equals(mode)) {
                    auth().setUnlocked(true);
                } else if ("enable".equals(mode)) {
                    auth().setLockEnabled(true);
                } else if ("disable".equals(mode)) {
                    auth().setLockEnabled(false);
                }
            }
            jsAuthLock(lockOk);
        } else if (requestCode == REQ_GOOGLE_RECOVER) {
            // After user grants the extra Gmail permission, just notify JS that status may have changed
            final String js = "window.__googleAuth&&window.__googleAuth('recover'," + googleAuth.statusJson(true).toString() + ")";
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    web.evaluateJavascript(js, null);
                }
            });
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        final String nav = pendingNav;
        pendingNav = null;
        final String sendT = pendingSendText, sendU = pendingSendUrl;
        pendingSendText = null;
        pendingSendUrl = null;
        if (web != null) {
            if (nav != null && nav.matches("[a-z]{1,12}")) {
                web.evaluateJavascript("window.__navTo&&window.__navTo('" + nav + "')", null);
            }
            if (sendT != null && !sendT.isEmpty()) {
                web.evaluateJavascript("window.__browserSend&&window.__browserSend("
                        + JSONObject.quote(sendU == null ? "" : sendU) + "," + JSONObject.quote(sendT) + ")", null);
            }
            web.evaluateJavascript("window.__liveRefresh&&window.__liveRefresh()", null);
        }
    }

    private long lastBackAt = 0;

    /** Back goes one step at a time inside the app (pop-up, page, tab). The app closes only on a second press at the start screen. */
    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript(
                "(function(){try{return window.__appBack?(window.__appBack()?'1':'0'):'x'}catch(e){return 'x'}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String v) {
                        if ("\"1\"".equals(v)) return; // the page handled it
                        if ("\"x\"".equals(v) && web.canGoBack()) {
                            web.goBack();
                            return;
                        }
                        long now = System.currentTimeMillis();
                        if (now - lastBackAt < 2000) {
                            MainActivity.super.onBackPressed();
                        } else {
                            lastBackAt = now;
                            toast("Press back again to exit");
                        }
                    }
                });
    }

    @Override
    protected void onDestroy() {
        try {
            if (pvWeb != null) pvWeb.destroy();
        } catch (Exception ignored) {
        }
        handler.removeCallbacks(readyCheck);
        super.onDestroy();
    }

    private void toast(final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
            }
        });
    }

    private void saveToDownloads(String name, String mime, byte[] data, String okMsg) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, name);
            v.put(MediaStore.Downloads.MIME_TYPE, mime);
            v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new Exception("file বানানো যায়নি");
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                out.write(data);
            }
        } else {
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            dir.mkdirs();
            try (FileOutputStream out = new FileOutputStream(new File(dir, name))) {
                out.write(data);
            }
        }
        toast(okMsg + name);
    }

    private void jsRes(String id, boolean ok, byte[] data) {
        final String js = "window.__urlRes('" + id + "'," + ok + ",'" + Base64.encodeToString(data, Base64.NO_WRAP) + "')";
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript(js, null);
            }
        });
    }

    /** Gmail import result: window.__gmRes(id, ok, base64 of text) */
    /** Backup result -> window.__bkRes(id, ok, base64(payload)) */
    private void jsBk(String id, boolean ok, byte[] payload) {
        final String js = "window.__bkRes&&window.__bkRes('" + id + "'," + ok + ",'"
                + Base64.encodeToString(payload, Base64.NO_WRAP) + "')";
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript(js, null);
            }
        });
    }

    /** Drive result -> window.__drRes(id, ok, base64(payload)) */
    private void jsDr(String id, boolean ok, byte[] payload) {
        final String js = "window.__drRes&&window.__drRes('" + id + "'," + ok + ",'"
                + Base64.encodeToString(payload, Base64.NO_WRAP) + "')";
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript(js, null);
            }
        });
    }

    /** One Drive operation: put (create/replace file) | get | info. Returns the payload bytes. */
    private byte[] driveRun(String op, String token, String name, String b64) throws Exception {
        if ("put".equals(op)) {
            byte[] data = Base64.decode(b64 == null ? "" : b64, Base64.DEFAULT);
            String fid = DriveHelper.put(token, name, data);
            return ("{\"id\":\"" + fid + "\"}").getBytes(StandardCharsets.UTF_8);
        }
        String[] f = DriveHelper.find(token, name);
        if ("info".equals(op)) {
            if (f == null) return "{}".getBytes(StandardCharsets.UTF_8);
            return ("{\"id\":\"" + f[0] + "\",\"modifiedTime\":\"" + f[1] + "\",\"size\":" + f[2] + "}")
                    .getBytes(StandardCharsets.UTF_8);
        }
        if (f == null) throw new Exception("No backup file named " + name + " in this Google Drive yet");
        return DriveHelper.get(token, f[0]);
    }

    /** One backup operation against Gmail (put | list | get). Returns the payload bytes. */
    private byte[] backupOp(String op, String email, String secret, boolean oauth, String arg, String b64) throws Exception {
        if ("put".equals(op)) {
            byte[] d = Base64.decode(b64, Base64.DEFAULT);
            return BackupMail.put(email, secret, oauth, arg, d).getBytes(StandardCharsets.UTF_8);
        } else if ("list".equals(op)) {
            return BackupMail.list(email, secret, oauth).getBytes(StandardCharsets.UTF_8);
        } else if ("get".equals(op)) {
            return BackupMail.get(email, secret, oauth, Long.parseLong(arg));
        }
        throw new Exception("Unknown backup operation");
    }

    private void jsGm(String id, boolean ok, String text) {
        final String js = "window.__gmRes&&window.__gmRes('" + id + "'," + ok + ",'"
                + Base64.encodeToString(text.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP) + "')";
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript(js, null);
            }
        });
    }


    // ---- Live Preview: a real website shown INSIDE the Preview box (a native WebView laid over the box) ----
    private android.widget.FrameLayout rootFl;
    private WebView pvWeb;
    private String pvReq = "";

    private static boolean pvTrusted(String h) {
        String l = h == null ? "" : h.toLowerCase(java.util.Locale.US);
        return l.equals("dsebd.org") || l.endsWith(".dsebd.org")
                || l.equals("dse.com.bd") || l.endsWith(".dse.com.bd")
                || l.equals("cse.com.bd") || l.endsWith(".cse.com.bd");
    }

    private void pvTell(String url) {
        if (web == null || pvWeb == null) return;
        final String js = "window.__pvLiveState&&window.__pvLiveState(" + JSONObject.quote(url == null ? "" : url)
                + "," + pvWeb.canGoBack() + "," + pvWeb.canGoForward() + ")";
        web.evaluateJavascript(js, null);
    }

    /** Smart-selection toolbar (Full article / + / - / Copy / Send to Data Show / Translate / Share / Search) inside the live page. */
    private String pvSelJs;

    private String pvLoadSelJs() {
        if (pvSelJs != null) return pvSelJs;
        try {
            InputStream in = getAssets().open("libs/smartsel.js");
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            in.close();
            pvSelJs = bo.toString("UTF-8");
        } catch (Exception e) {
            pvSelJs = "";
        }
        return pvSelJs;
    }

    /** Minimal bridge used only by the injected smartsel.js in the live page (size limits, http(s)-only open). */
    private class PvSelBridge {
        @JavascriptInterface
        public void send(final String t) {
            if (t == null || t.trim().isEmpty() || t.length() > 2 * 1024 * 1024) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (web == null) return;
                    String cur = pvWeb == null ? pvReq : (pvWeb.getUrl() == null ? pvReq : pvWeb.getUrl());
                    web.evaluateJavascript("window.__browserSend&&window.__browserSend("
                            + JSONObject.quote(cur) + "," + JSONObject.quote(t) + ")", null);
                }
            });
        }

        @JavascriptInterface
        public void mode(boolean on) {
        }

        @JavascriptInterface
        public void share(final String t) {
            if (t == null || t.length() > 100 * 1024) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    i.putExtra(Intent.EXTRA_TEXT, t);
                    startActivity(Intent.createChooser(i, "Share"));
                }
            });
        }

        @JavascriptInterface
        public void open(final String u) {
            if (u == null || u.length() > 2048) return;
            String low = u.trim().toLowerCase(java.util.Locale.US);
            if (!(low.startsWith("http://") || low.startsWith("https://"))) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u.trim())));
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        @JavascriptInterface
        public void addHist(String t) {
            if (t == null) return;
            try {
                SharedPreferences sp = getSharedPreferences("dssel", MODE_PRIVATE);
                JSONArray old = new JSONArray(sp.getString("hist", "[]"));
                JSONArray a = new JSONArray();
                JSONObject o = new JSONObject();
                o.put("t", t.length() > 6000 ? t.substring(0, 6000) : t);
                o.put("d", System.currentTimeMillis());
                a.put(o);
                for (int i = 0; i < old.length() && a.length() < 50; i++) a.put(old.get(i));
                sp.edit().putString("hist", a.toString()).apply();
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public String hist() {
            return getSharedPreferences("dssel", MODE_PRIVATE).getString("hist", "[]");
        }
    }

    private void pvEnsure() {
        if (pvWeb != null || rootFl == null) return;
        pvWeb = new WebView(this);
        WebSettings ps = pvWeb.getSettings();
        ps.setJavaScriptEnabled(true);
        ps.setDomStorageEnabled(true);
        ps.setDatabaseEnabled(true);
        ps.setLoadWithOverviewMode(true);
        ps.setUseWideViewPort(true);
        ps.setSupportZoom(true);
        ps.setBuiltInZoomControls(true);
        ps.setDisplayZoomControls(false);
        ps.setAllowFileAccess(false);
        ps.setAllowContentAccess(false);
        if (Build.VERSION.SDK_INT >= 21) {
            ps.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }
        String ua = ps.getUserAgentString();
        if (ua != null) {
            ps.setUserAgentString(ua.replace("; wv)", ")").replaceAll("\\sVersion/\\d+(\\.\\d+)*", ""));
        }
        android.webkit.CookieManager cm = android.webkit.CookieManager.getInstance();
        cm.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 21) cm.setAcceptThirdPartyCookies(pvWeb, true);
        pvWeb.addJavascriptInterface(new PvSelBridge(), "DSSelB");
        pvWeb.setWebChromeClient(new WebChromeClient());
        pvWeb.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                String low = url == null ? "" : url.toLowerCase(java.util.Locale.US);
                return !(low.startsWith("http://") || low.startsWith("https://")); // other schemes are blocked
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                android.webkit.CookieManager.getInstance().flush();
                pvTell(url);
            }

            @Override
            public void onReceivedSslError(WebView v, android.webkit.SslErrorHandler h, android.net.http.SslError err) {
                String host = "";
                try {
                    host = Uri.parse(err.getUrl()).getHost();
                } catch (Exception ignored) {
                }
                if (pvTrusted(host)) h.proceed();
                else h.cancel();
            }
        });
        pvWeb.setVisibility(android.view.View.GONE);
        rootFl.addView(pvWeb, new android.widget.FrameLayout.LayoutParams(1, 1));
    }

    /** JavaScript থেকে ডাকা হয়: window.Android.save(filename, mime, base64) */
    private class Bridge {

        /** Copy any size of text to the system clipboard (WebView clipboard is unreliable for big tables). */
        @JavascriptInterface
        public boolean copyText(final String txt) {
            if (txt == null) return false;
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm == null) return false;
                cm.setPrimaryClip(ClipData.newPlainText("Data Show", txt));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Live Preview: load a page inside the Preview box (kept alive until pvLiveClose). */
        @JavascriptInterface
        public void pvLiveOpen(final String url) {
            if (url == null || url.length() > 4096) return;
            String low = url.trim().toLowerCase(java.util.Locale.US);
            if (!(low.startsWith("http://") || low.startsWith("https://"))) return;
            final String u = url.trim();
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pvEnsure();
                    if (pvWeb == null) return;
                    if (!u.equals(pvReq)) {
                        pvReq = u;
                        pvWeb.loadUrl(u);
                    }
                }
            });
        }

        /** Place the live page exactly over the Preview box (CSS pixels, relative to the app page). */
        @JavascriptInterface
        public void pvLiveBounds(final int x, final int y, final int w, final int h) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (pvWeb == null) return;
                    if (w < 20 || h < 20) {
                        pvWeb.setVisibility(android.view.View.GONE);
                        return;
                    }
                    float d = getResources().getDisplayMetrics().density;
                    android.widget.FrameLayout.LayoutParams lp =
                            new android.widget.FrameLayout.LayoutParams(Math.round(w * d), Math.round(h * d));
                    lp.leftMargin = Math.round(x * d);
                    lp.topMargin = Math.round(y * d);
                    pvWeb.setLayoutParams(lp);
                    pvWeb.setVisibility(android.view.View.VISIBLE);
                }
            });
        }

        /** Hide (not close) the live page, e.g. while another tab is open. The page keeps its place. */
        @JavascriptInterface
        public void pvLiveHide() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (pvWeb != null) pvWeb.setVisibility(android.view.View.GONE);
                }
            });
        }

        /** Close the live page for good (only when the user clears the Preview). */
        @JavascriptInterface
        public void pvLiveClose() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pvReq = "";
                    if (pvWeb == null) return;
                    pvWeb.setVisibility(android.view.View.GONE);
                    if (rootFl != null) rootFl.removeView(pvWeb);
                    pvWeb.stopLoading();
                    pvWeb.destroy();
                    pvWeb = null;
                }
            });
        }

        /** cmd: back | fwd | reload | stop */
        @JavascriptInterface
        public void pvLiveNav(final String cmd) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (pvWeb == null || cmd == null) return;
                    if (cmd.equals("back") && pvWeb.canGoBack()) pvWeb.goBack();
                    else if (cmd.equals("fwd") && pvWeb.canGoForward()) pvWeb.goForward();
                    else if (cmd.equals("reload")) pvWeb.reload();
                    else if (cmd.equals("stop")) pvWeb.stopLoading();
                }
            });
        }

        /** Table copy in the live page: shows the selection toolbar and pre-selects the biggest table (or the whole article). */
        @JavascriptInterface
        public void pvLiveSel() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (pvWeb == null) return;
                    String js = pvLoadSelJs();
                    if (js.isEmpty()) return;
                    pvWeb.evaluateJavascript(js + "\n;try{if(!window.__dsInit){window.__dsInit=1;window.DSSel.init({hideFab:true,onMode:function(v){DSSelB.mode(!!v)},"
                            + "send:function(t){DSSelB.send(t)},share:function(t){DSSelB.share(t)},openUrl:function(u){DSSelB.open(u)},"
                            + "save:function(t){},addHist:function(t){DSSelB.addHist(t)},hist:function(){return DSSelB.hist()}})}"
                            + "window.DSSel.mode(true);"
                            + "var ts=[].slice.call(document.querySelectorAll('table')).sort(function(a,b){return b.rows.length-a.rows.length});"
                            + "if(ts.length&&ts[0].rows.length>1)window.DSSel.select(ts[0]);else window.DSSel.autoPick()}catch(e){}", null);
                }
            });
        }

        /** Page address of the live page ("" when none). */
        @JavascriptInterface
        public String pvLiveUrl() {
            return pvWeb == null ? "" : pvReq;
        }

        /** Text of the live page: the selected text if there is a selection, otherwise the whole page. Result goes to window.__pvLiveText(url, text). */
        @JavascriptInterface
        public void pvLiveCopy(final String mode) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (pvWeb == null) return;
                    final String m = "table".equals(mode) ? "table" : ("all".equals(mode) ? "all" : "sel");
                    String js = "(function(){try{var m='" + m + "';"
                            + "if(m==='sel'){return String(window.getSelection?window.getSelection():'')}"
                            + "if(m==='all'){return document.body?document.body.innerText:''}"
                            + "var cl=function(c){return c.innerText.trim().replace(/\\s+/g,' ')};"
                            + "var ts=[].slice.call(document.querySelectorAll('table')).sort(function(a,b){return b.rows.length-a.rows.length});"
                            + "if(ts.length&&ts[0].rows.length>1){return [].slice.call(ts[0].rows).map(function(r){return [].slice.call(r.cells).map(cl).join('\\t')}).join('\\n')}"
                            + "var rs=[].slice.call(document.querySelectorAll('[role=row]'));"
                            + "if(rs.length>1){return rs.map(function(r){return [].slice.call(r.querySelectorAll('[role=cell],[role=columnheader],[role=gridcell]')).map(cl).join('\\t')}).join('\\n')}"
                            + "return ''}catch(e){return ''}})()";
                    pvWeb.evaluateJavascript(js, new ValueCallback<String>() {
                        @Override
                        public void onReceiveValue(String v) {
                            String text = "";
                            try {
                                Object o = new org.json.JSONTokener(v == null ? "\"\"" : v).nextValue();
                                text = o == null ? "" : String.valueOf(o);
                            } catch (Exception ignored) {
                            }
                            if ("null".equals(text)) text = "";
                            if (text.length() > 2 * 1024 * 1024) text = text.substring(0, 2 * 1024 * 1024);
                            web.evaluateJavascript("window.__pvLiveCopy&&window.__pvLiveCopy("
                                    + JSONObject.quote(m) + "," + JSONObject.quote(text) + ")", null);
                        }
                    });
                }
            });
        }

        @JavascriptInterface
        public void pvLiveText() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (pvWeb == null) return;
                    final String cur = pvWeb.getUrl() == null ? pvReq : pvWeb.getUrl();
                    pvWeb.evaluateJavascript("(function(){try{var s=String(window.getSelection?window.getSelection():'');"
                            + "if(s.trim())return s;return document.body?document.body.innerText:''}catch(e){return ''}})()",
                            new ValueCallback<String>() {
                                @Override
                                public void onReceiveValue(String v) {
                                    String text = "";
                                    try {
                                        Object o = new org.json.JSONTokener(v == null ? "\"\"" : v).nextValue();
                                        text = o == null ? "" : String.valueOf(o);
                                    } catch (Exception ignored) {
                                    }
                                    if ("null".equals(text)) text = "";
                                    if (text.length() > 2 * 1024 * 1024) text = text.substring(0, 2 * 1024 * 1024);
                                    final String js = "window.__pvLiveText&&window.__pvLiveText("
                                            + JSONObject.quote(cur) + "," + JSONObject.quote(text) + ")";
                                    web.evaluateJavascript(js, null);
                                }
                            });
                }
            });
        }
        @JavascriptInterface
        public void save(String name, String mime, String base64) {
            try {
                saveToDownloads(name, mime, Base64.decode(base64, Base64.DEFAULT),
                        "Downloads ফোল্ডারে সেভ হয়েছে: ");
            } catch (Exception e) {
                toast("সেভ হয়নি: " + e.getMessage());
            }
        }

        /** Customize > App > Update app বোতাম থেকে ডাকা হয় */
        @JavascriptInterface
        public void openUpdater() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    showUpdateMenu();
                }
            });
        }

        /** Website box: open the full mobile browser (fast, video works, search bar on top) */
        /** QR-এর যেকোনো লিংক/স্কিম (FIDO:/, mailto:, tel:, geo: ...) সরাসরি Android-কে খুলতে দেয় */
        @JavascriptInterface
        public void openUri(final String uri) {
            if (uri == null || uri.length() > 4096) return;
            // Allow common safe schemes from QR; block file/content/javascript
            String low = uri.trim().toLowerCase(java.util.Locale.US);
            boolean ok = low.startsWith("http://") || low.startsWith("https://")
                    || low.startsWith("mailto:") || low.startsWith("tel:")
                    || low.startsWith("sms:") || low.startsWith("geo:")
                    || low.startsWith("fido:") || low.startsWith("market:");
            if (!ok) {
                toast("এই ধরনের লিংক খোলা নিরাপদ নয়");
                return;
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent i = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(uri.trim()));
                        i.addCategory(Intent.CATEGORY_BROWSABLE);
                        startActivity(i);
                    } catch (Exception e) {
                        toast("এই QR খোলার মতো অ্যাপ পাওয়া যায়নি");
                    }
                }
            });
        }

        @JavascriptInterface
        public void openBrowser(final String url) {
            if (url == null || url.length() > 4096) return;
            String low = url.trim().toLowerCase(java.util.Locale.US);
            // In-app browser: only http(s)
            if (!(low.startsWith("http://") || low.startsWith("https://"))) {
                toast("শুধু http/https লিংক খোলা যায়");
                return;
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (BrowserActivity.live != null) {
                        // browser is still running: bring it back (and open the new link if it is different)
                        String nu = url.trim();
                        if (!nu.equals(BrowserActivity.lastUrl)) BrowserActivity.pendingUrl = nu;
                        Intent j = new Intent(MainActivity.this, BrowserActivity.class);
                        j.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                        startActivity(j);
                        return;
                    }
                    Intent i = new Intent(MainActivity.this, BrowserActivity.class);
                    i.putExtra("url", url.trim());
                    startActivityForResult(i, REQ_BROWSER);
                }
            });
        }

        /** Page the in-app browser is still showing ("" when it is closed). */
        @JavascriptInterface
        public String browserLive() {
            if (BrowserActivity.live == null) return "";
            String u = BrowserActivity.lastUrl;
            return u == null ? "" : u;
        }

        /** Bring the running browser back to the screen. */
        @JavascriptInterface
        public void resumeBrowser() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (BrowserActivity.live == null) return;
                    Intent j = new Intent(MainActivity.this, BrowserActivity.class);
                    j.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                    startActivity(j);
                }
            });
        }

        /** Close the running browser. */
        @JavascriptInterface
        public void closeBrowser() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    BrowserActivity b = BrowserActivity.live;
                    if (b != null) b.finish();
                }
            });
        }

        /** Share sheet: text */
        @JavascriptInterface
        public void shareText(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    i.putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(i, "Share"));
                }
            });
        }

        /** Share sheet: file (PDF, Excel, photo...) */
        @JavascriptInterface
        public void shareFile(String name, final String mime, String base64) {
            try {
                String safe = name.replaceAll("[^A-Za-z0-9._ -]", "_");
                File f = new File(ShareProvider.dir(MainActivity.this), safe);
                try (FileOutputStream o = new FileOutputStream(f)) {
                    o.write(Base64.decode(base64, Base64.DEFAULT));
                }
                final Uri u = ShareProvider.uriFor(f);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Intent i = new Intent(Intent.ACTION_SEND);
                        i.setType(mime == null || mime.isEmpty() ? "*/*" : mime);
                        i.putExtra(Intent.EXTRA_STREAM, u);
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(i, "Share"));
                    }
                });
            } catch (Exception e) {
                toast("Share failed: " + e.getMessage());
            }
        }

        /** Website page download (preview box): result comes back via window.__urlRes */
        @JavascriptInterface
        public void fetchUrl(final String url, final String id) {
            if (url == null || id == null || url.length() > 4096) return;
            if (!id.matches("[A-Za-z0-9]{1,20}")) return;
            String low = url.trim().toLowerCase(java.util.Locale.US);
            if (!(low.startsWith("http://") || low.startsWith("https://"))) {
                jsRes(id, false, "Only http/https allowed".getBytes(StandardCharsets.UTF_8));
                return;
            }
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        String cur = url.trim();
                        HttpURLConnection c = null;
                        for (int hop = 0; hop < 6; hop++) {
                            String hh = new URL(cur).getHost().toLowerCase();
                            boolean dse = hh.equals("dsebd.org") || hh.endsWith(".dsebd.org");
                            int code = -1;
                            // 1st try: normal certificate check. Only if that fails for a DSE page
                            // (known bad certificate chain on some phones) retry with the relaxed check.
                            for (int attempt = 0; attempt < 2; attempt++) {
                                c = (HttpURLConnection) new URL(cur).openConnection();
                                if (attempt == 1 && c instanceof javax.net.ssl.HttpsURLConnection) {
                                    javax.net.ssl.TrustManager[] tm = new javax.net.ssl.TrustManager[]{new javax.net.ssl.X509TrustManager() {
                                        public void checkClientTrusted(java.security.cert.X509Certificate[] x, String a) {}
                                        public void checkServerTrusted(java.security.cert.X509Certificate[] x, String a) {}
                                        public java.security.cert.X509Certificate[] getAcceptedIssuers() { return new java.security.cert.X509Certificate[0]; }
                                    }};
                                    javax.net.ssl.SSLContext sc = javax.net.ssl.SSLContext.getInstance("TLS");
                                    sc.init(null, tm, new java.security.SecureRandom());
                                    ((javax.net.ssl.HttpsURLConnection) c).setSSLSocketFactory(sc.getSocketFactory());
                                    ((javax.net.ssl.HttpsURLConnection) c).setHostnameVerifier(new javax.net.ssl.HostnameVerifier() {
                                        public boolean verify(String h, javax.net.ssl.SSLSession ss) { String l = h.toLowerCase(); return l.equals("dsebd.org") || l.endsWith(".dsebd.org"); }
                                    });
                                }
                                c.setInstanceFollowRedirects(false);
                                c.setConnectTimeout(15000);
                                c.setReadTimeout(20000);
                                c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36");
                                c.setRequestProperty("Accept-Language", "en,bn;q=0.8");
                                c.setRequestProperty("Accept", "text/html,application/xhtml+xml,*/*;q=0.8");
                                if (hh.equals("dse.com.bd") || hh.endsWith(".dse.com.bd")) {
                                    c.setRequestProperty("Accept", "application/json,text/plain,*/*");
                                    c.setRequestProperty("Referer", "https://www.dse.com.bd/data-archives");
                                } else {
                                    c.setRequestProperty("Referer", "https://www.dsebd.org/");
                                }
                                try {
                                    code = c.getResponseCode();
                                    break;
                                } catch (javax.net.ssl.SSLException se) {
                                    if (!dse || attempt == 1) throw se;
                                }
                            }
                            if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                                cur = new URL(new URL(cur), c.getHeaderField("Location")).toString();
                                continue;
                            }
                            break;
                        }
                        InputStream in = c.getResponseCode() >= 400 ? c.getErrorStream() : c.getInputStream();
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        byte[] buf = new byte[16384];
                        int n;
                        while (in != null && (n = in.read(buf)) > 0 && bo.size() < 3 * 1024 * 1024) bo.write(buf, 0, n);
                        jsRes(id, c.getResponseCode() < 400, c.getResponseCode() < 400 ? bo.toByteArray()
                                : ("HTTP " + c.getResponseCode()).getBytes(StandardCharsets.UTF_8));
                    } catch (Exception e) {
                        jsRes(id, false, String.valueOf(e.getMessage()).getBytes(StandardCharsets.UTF_8));
                    }
                }
            }).start();
        }

        /**
         * Table > Import from Gmail.
         * Prefer Google OAuth (if signed in) → XOAUTH2.
         * Fall back to App password if provided.
         * Result → window.__gmRes(id, ok, base64)
         */
        @JavascriptInterface
        public void gmailFetch(final String user, final String pass, final String from, final int days, final String id) {
            if (id == null || !id.matches("[A-Za-z0-9]{1,20}")) return;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        String email = user;
                        String secret = pass;
                        boolean oauth = false;

                        // Prefer Google Sign-In token when available
                        if (googleAuth.isSignedIn()) {
                            try {
                                String token = googleAuth.getAccessToken(false);
                                email = googleAuth.getEmail();
                                secret = token;
                                oauth = true;
                            } catch (UserRecoverableAuthException e) {
                                // Need user consent for Gmail scope – launch recovery on UI thread
                                final Intent recover = e.getIntent();
                                if (recover != null) {
                                    runOnUiThread(new Runnable() {
                                        @Override
                                        public void run() {
                                            startActivityForResult(recover, REQ_GOOGLE_RECOVER);
                                        }
                                    });
                                }
                                jsGm(id, false, "Gmail permission needed. Please grant access and try again.");
                                return;
                            } catch (Exception e) {
                                // Token failed – fall through to App password if present
                                if (pass == null || pass.trim().isEmpty()) {
                                    jsGm(id, false, "Google token failed: " + e.getMessage());
                                    return;
                                }
                            }
                        }

                        if (email == null || email.trim().isEmpty()) {
                            jsGm(id, false, "No Gmail address. Sign in with Google or enter address + App password.");
                            return;
                        }
                        if (secret == null || secret.trim().isEmpty()) {
                            jsGm(id, false, "Not signed in and no App password. Use \"Sign in with Google\" or enter an App password.");
                            return;
                        }

                        String result = oauth
                                ? GmailFetcher.fetchOAuth(email, secret, from, days)
                                : GmailFetcher.fetch(email, secret, from, days);
                        jsGm(id, true, result);
                    } catch (javax.mail.AuthenticationFailedException e) {
                        jsGm(id, false, "Gmail login failed. If using App password check it is correct. If using Google Sign-In try Sign out → Sign in again.");
                    } catch (Throwable e) {
                        jsGm(id, false, "Gmail: " + e.getClass().getSimpleName() + (e.getMessage() == null ? "" : " - " + e.getMessage()));
                    }
                }
            }).start();
        }

        /** Start Google Sign-In flow. Result → window.__googleAuth(cbId, {ok, email, ...}) */
        @JavascriptInterface
        public void googleSignIn(final String cbId) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingGoogleCbId = cbId;
                    startActivityForResult(googleAuth.getSignInIntent(), REQ_GOOGLE_SIGN_IN);
                }
            });
        }

        /** Sign out from Google */
        @JavascriptInterface
        public void googleSignOut() {
            // token clearing is a network call: keep it off the UI thread
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        googleAuth.signOut();
                    } catch (Throwable ignored) {
                    }
                }
            }).start();
        }

        /** Current Google auth status as JSON string */
        @JavascriptInterface
        public String googleAuthStatus() {
            return googleAuth.statusJson(true).toString();
        }

        /**
         * Google Drive (scope drive.file): op = put | get | info on the file `name` in My Drive.
         * Result -> window.__drRes(id, ok, base64). Needs Sign in with Google.
         */
        @JavascriptInterface
        public void driveOp(final String op, final String name, final String b64, final String id) {
            if (id == null || !id.matches("[A-Za-z0-9]{1,20}")) return;
            if (name == null || !name.matches("[A-Za-z0-9._-]{1,80}")) {
                jsDr(id, false, "Bad file name".getBytes(StandardCharsets.UTF_8));
                return;
            }
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        if (!googleAuth.isSignedIn()) {
                            jsDr(id, false, "Sign in with Google first.".getBytes(StandardCharsets.UTF_8));
                            return;
                        }
                        String token;
                        try {
                            token = googleAuth.getDriveToken(false);
                        } catch (UserRecoverableAuthException e) {
                            final Intent recover = e.getIntent();
                            if (recover != null) {
                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        startActivityForResult(recover, REQ_GOOGLE_RECOVER);
                                    }
                                });
                            }
                            jsDr(id, false, "Drive permission needed. Allow it, then try again."
                                    .getBytes(StandardCharsets.UTF_8));
                            return;
                        }
                        byte[] out;
                        try {
                            out = driveRun(op, token, name, b64);
                        } catch (DriveHelper.Http e) {
                            if (e.status != 401) throw e;
                            token = googleAuth.getDriveToken(true);
                            out = driveRun(op, token, name, b64);
                        }
                        jsDr(id, true, out);
                    } catch (Throwable e) {
                        jsDr(id, false, ("Drive: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()))
                                .getBytes(StandardCharsets.UTF_8));
                    }
                }
            }).start();
        }

        /**
         * Backup: op = put | list | get against the Gmail label "DataShow-Backup". Result -> window.__bkRes
         * Uses the Google sign-in (OAuth) when signed in, else the Gmail address + App password.
         */
        @JavascriptInterface
        public void backupMail(final String op, final String user, final String pass,
                               final String arg, final String b64, final String id) {
            if (id == null || !id.matches("[A-Za-z0-9]{1,20}")) return;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        String email = user;
                        String secret = pass;
                        boolean oauth = false;
                        if (googleAuth.isSignedIn()) {
                            try {
                                secret = googleAuth.getAccessToken(false);
                                email = googleAuth.getEmail();
                                oauth = true;
                            } catch (UserRecoverableAuthException e) {
                                final Intent recover = e.getIntent();
                                if (recover != null) {
                                    runOnUiThread(new Runnable() {
                                        @Override
                                        public void run() {
                                            startActivityForResult(recover, REQ_GOOGLE_RECOVER);
                                        }
                                    });
                                }
                                jsBk(id, false, "Gmail permission needed. Please grant access and try again."
                                        .getBytes(StandardCharsets.UTF_8));
                                return;
                            } catch (Exception e) {
                                if (pass == null || pass.trim().isEmpty()) {
                                    jsBk(id, false, ("Google token failed: " + e.getMessage())
                                            .getBytes(StandardCharsets.UTF_8));
                                    return;
                                }
                            }
                        }
                        if (email == null || email.trim().isEmpty() || secret == null || secret.trim().isEmpty()) {
                            jsBk(id, false, "Sign in with Google or enter Gmail address + App password."
                                    .getBytes(StandardCharsets.UTF_8));
                            return;
                        }
                        byte[] out;
                        try {
                            out = backupOp(op, email, secret, oauth, arg, b64);
                        } catch (javax.mail.AuthenticationFailedException e) {
                            if (!oauth) throw e;
                            // cached access token may have expired: get a fresh one and retry once
                            secret = googleAuth.getAccessToken(true);
                            out = backupOp(op, email, secret, true, arg, b64);
                        }
                        jsBk(id, true, out);
                    } catch (javax.mail.AuthenticationFailedException e) {
                        jsBk(id, false, "Gmail login failed. Sign out and sign in with Google again, or check the App password."
                                .getBytes(StandardCharsets.UTF_8));
                    } catch (Throwable e) {
                        jsBk(id, false, ("Gmail: " + e.getClass().getSimpleName()
                                + (e.getMessage() == null ? "" : " - " + e.getMessage()))
                                .getBytes(StandardCharsets.UTF_8));
                    }
                }
            }).start();
        }

        /** Share sheet with e-mail fields filled (To / Subject): pick Gmail in the chooser */
        @JavascriptInterface
        public void mailFile(String name, final String mime, String base64, final String to, final String subject) {
            try {
                String safe = name.replaceAll("[^A-Za-z0-9._ -]", "_");
                File f = new File(ShareProvider.dir(MainActivity.this), safe);
                try (FileOutputStream o = new FileOutputStream(f)) {
                    o.write(Base64.decode(base64, Base64.DEFAULT));
                }
                final Uri u = ShareProvider.uriFor(f);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Intent i = new Intent(Intent.ACTION_SEND);
                        i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                        i.putExtra(Intent.EXTRA_STREAM, u);
                        if (to != null && to.length() > 0) i.putExtra(Intent.EXTRA_EMAIL, new String[]{to});
                        i.putExtra(Intent.EXTRA_SUBJECT, subject == null ? "" : subject);
                        i.putExtra(Intent.EXTRA_TEXT, "Data Show backup file attached.");
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(i, "Send backup by e-mail"));
                    }
                });
            } catch (Exception e) {
                toast("Mail failed: " + e.getMessage());
            }
        }

        /** true when the phone is on Wi-Fi (for "Automatic backup only works on Wi-Fi") */
        @JavascriptInterface
        public boolean isWifi() {
            try {
                android.net.ConnectivityManager cm =
                        (android.net.ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                android.net.Network n = cm.getActiveNetwork();
                if (n == null) return false;
                android.net.NetworkCapabilities c = cm.getNetworkCapabilities(n);
                return c != null && (c.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)
                        || c.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET));
            } catch (Throwable e) {
                return false;
            }
        }

        /** Reload the page after a restore (keeps the in-app update files in use) */
        @JavascriptInterface
        public void reload() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    reloadApp();
                }
            });
        }

        /* ---------- Authentication page (TOTP). JS never receives a secret, only codes ---------- */

        @JavascriptInterface
        public String authList() {
            return auth().list();
        }

        @JavascriptInterface
        public String authAdd(String otpauthUri) {
            return auth().addUri(otpauthUri);
        }

        @JavascriptInterface
        public String authAddManual(String issuer, String name, String secret) {
            return auth().addManual(issuer, name, secret);
        }

        @JavascriptInterface
        public String authRename(String id, String issuer, String name) {
            return auth().rename(id, issuer, name);
        }

        @JavascriptInterface
        public String authDelete(String id) {
            return auth().delete(id);
        }

        /** {"enabled":bool,"secure":bool,"locked":bool} */
        @JavascriptInterface
        public String authLockState() {
            boolean secure = false;
            try {
                android.app.KeyguardManager km =
                        (android.app.KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                secure = km != null && km.isDeviceSecure();
            } catch (Throwable ignored) {
            }
            return "{\"enabled\":" + auth().lockEnabled() + ",\"secure\":" + secure
                    + ",\"locked\":" + auth().isLocked() + "}";
        }

        @JavascriptInterface
        public void authUnlock() {
            askAuthCredential("unlock");
        }

        /** Turn the PIN / fingerprint lock on or off (asks for the credential first) */
        @JavascriptInterface
        public void authSetLock(boolean on) {
            askAuthCredential(on ? "enable" : "disable");
        }

        @JavascriptInterface
        public void authRelock() {
            auth().setUnlocked(false);
        }

        /** Block screenshots / recent-apps preview while the codes are on screen */
        @JavascriptInterface
        public void secureScreen(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (on) {
                        getWindow().setFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE,
                                android.view.WindowManager.LayoutParams.FLAG_SECURE);
                    } else {
                        getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
                    }
                }
            });
        }

        /** পেজের শেষে ডাকা হয়: পেজ ঠিকমতো চালু হয়েছে */
        @JavascriptInterface
        public void ready() {
            pageReady = true;
        }
    }
}
