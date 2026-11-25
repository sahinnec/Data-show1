# Google Sign-In + Gmail OAuth setup

The app now supports **Sign in with Google**. When signed in, Gmail Auto uses OAuth (no App password needed).

## 1. Google Cloud Console (required once)

1. Go to https://console.cloud.google.com/
2. Create a project (or select one).
3. **APIs & Services → Library** → enable **Gmail API** (optional but recommended).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
5. If asked, configure the OAuth consent screen:
   - User type: External
   - App name: Data Show
   - Scopes: add `.../auth/userinfo.email` and `https://mail.google.com/`
6. Create an **Android** OAuth client:
   - Package name: `com.datashow.app`
   - SHA-1 fingerprint (from the debug keystore):

```bash
keytool -list -v -keystore app/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

Copy the **SHA1** line (looks like `AB:CD:12:...`).

7. (Optional) Also create a **Web application** client if you later want ID tokens.

## 2. Rebuild the APK

```bash
./gradlew assembleDebug
```

Install the new APK. Old in-app updates of JS/CSS still work; Java changes need a new APK.

## 3. How to use in the app

1. Open **Table → Portfolio → ⚙ Settings**
2. Tap **Sign in with Google**
3. Choose the Gmail account and allow access
4. After that, **Gmail Auto** works without typing an App password

App password still works as a fallback if you prefer it or if Google Sign-In is not available.

## Notes

- First time Google may show a consent screen for Gmail access.
- Token is stored only on the phone.
- Sign out is available in the same Settings panel.

## Google Drive backup of saved price history (v17)
1. Google Cloud Console → **APIs & Services → Library** → enable **Google Drive API**.
2. OAuth consent screen → add scope `https://www.googleapis.com/auth/drive.file` (non-sensitive: the app only sees files it created).
3. Rebuild the APK (Java changed: `DriveHelper.java`, `MainActivity.driveOp`, `GoogleAuthHelper`). Already signed-in users get a one-time Drive permission screen on the first upload.
File name in My Drive: `DataShow-history.json.gz`.
