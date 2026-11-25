package com.sharepricereader.app;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Minimal Google Drive v3 REST client (no extra library). Scope: drive.file, so the app only sees
 * files it created itself. One file per name in My Drive:  find / put (create or update) / get.
 * Throws DriveHelper.Http with the HTTP status so the caller can refresh an expired token (401).
 */
final class DriveHelper {

    static final class Http extends Exception {
        final int status;
        Http(int status, String msg) {
            super(msg);
            this.status = status;
        }
    }

    private static final String API = "https://www.googleapis.com/drive/v3/files";
    private static final String UP = "https://www.googleapis.com/upload/drive/v3/files";

    private DriveHelper() {
    }

    /** Returns {id, modifiedTime, size} of the newest file with this name, or null. */
    static String[] find(String token, String name) throws Exception {
        String q = "name='" + name.replace("\\", "\\\\").replace("'", "\\'") + "' and trashed=false";
        String url = API + "?q=" + URLEncoder.encode(q, "UTF-8")
                + "&orderBy=modifiedTime%20desc&pageSize=1&spaces=drive"
                + "&fields=" + URLEncoder.encode("files(id,modifiedTime,size)", "UTF-8");
        String body = new String(request("GET", url, token, null, null), StandardCharsets.UTF_8);
        String id = first(body, "\"id\"\\s*:\\s*\"([^\"]+)\"");
        if (id == null) return null;
        String mt = first(body, "\"modifiedTime\"\\s*:\\s*\"([^\"]+)\"");
        String sz = first(body, "\"size\"\\s*:\\s*\"?(\\d+)\"?");
        return new String[]{id, mt == null ? "" : mt, sz == null ? "0" : sz};
    }

    /** Create the file, or replace the content of the existing one. Returns the file id. */
    static String put(String token, String name, byte[] data) throws Exception {
        String[] ex = find(token, name);
        String boundary = "dsb" + System.currentTimeMillis();
        String meta = "{\"name\":\"" + name.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}";
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        bo.write(("--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta
                + "\r\n--" + boundary + "\r\nContent-Type: application/octet-stream\r\n\r\n")
                .getBytes(StandardCharsets.UTF_8));
        bo.write(data);
        bo.write(("\r\n--" + boundary + "--").getBytes(StandardCharsets.UTF_8));
        String ct = "multipart/related; boundary=" + boundary;
        byte[] out;
        if (ex == null) {
            out = request("POST", UP + "?uploadType=multipart&fields=id", token, ct, bo.toByteArray());
        } else {
            // HttpURLConnection has no PATCH: Google accepts POST + X-HTTP-Method-Override
            out = request("PATCH", UP + "/" + ex[0] + "?uploadType=multipart&fields=id", token, ct, bo.toByteArray());
        }
        String id = first(new String(out, StandardCharsets.UTF_8), "\"id\"\\s*:\\s*\"([^\"]+)\"");
        return id == null ? (ex == null ? "" : ex[0]) : id;
    }

    static byte[] get(String token, String id) throws Exception {
        return request("GET", API + "/" + URLEncoder.encode(id, "UTF-8") + "?alt=media", token, null, null);
    }

    private static String first(String s, String re) {
        Matcher m = Pattern.compile(re).matcher(s);
        return m.find() ? m.group(1) : null;
    }

    private static byte[] request(String method, String url, String token, String contentType, byte[] body)
            throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(20000);
        c.setReadTimeout(60000);
        c.setRequestProperty("Authorization", "Bearer " + token);
        c.setRequestProperty("Accept", "application/json");
        if ("PATCH".equals(method)) {
            c.setRequestMethod("POST");
            c.setRequestProperty("X-HTTP-Method-Override", "PATCH");
        } else {
            c.setRequestMethod(method);
        }
        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", contentType);
            c.setFixedLengthStreamingMode(body.length);
            OutputStream os = c.getOutputStream();
            os.write(body);
            os.close();
        }
        int code = c.getResponseCode();
        InputStream in = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
        byte[] data = in == null ? new byte[0] : readAll(in);
        c.disconnect();
        if (code < 200 || code >= 300) {
            String t = new String(data, StandardCharsets.UTF_8);
            String m = first(t, "\"message\"\\s*:\\s*\"([^\"]+)\"");
            throw new Http(code, "Drive " + code + (m == null ? "" : ": " + m));
        }
        return data;
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        in.close();
        return bo.toByteArray();
    }
}
