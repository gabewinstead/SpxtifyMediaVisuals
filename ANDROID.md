# Android build and install workflow

NowPlaying Visuals is an independent project and is not affiliated with, endorsed by,
or sponsored by Spotify. Spotify is a trademark of Spotify AB.

The Android project is committed with the release workflow so GitHub Actions can build the APK and
AAB. Use a separate worktree for local Android experimentation to keep desktop work isolated.

## One-time setup

Install the Android prerequisites:

- Android Studio with the Android SDK, SDK Platform, SDK Build-Tools, and an emulator or USB device
- Java 17
- Rust Android targets:

```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi
```

Create an isolated mobile worktree beside the desktop checkout:

```powershell
git worktree add ..\SpotifyMediaVisuals-android -b android-target
Set-Location ..\SpotifyMediaVisuals-android
npm ci
npx tauri android init
```

`npx tauri android init` creates `src-tauri\gen\android` in the mobile worktree. It reuses the same
TypeScript/Vite frontend and Rust crate source from that worktree; the original checkout and its
Windows build remain untouched.

## Development and APK build

```powershell
npm run android:dev
npm run android:build
```

`android:dev` is for development with a running Vite server. Do not install its debug APK
unless the Vite server is running on the development machine; otherwise Android will report a
`localhost:1420` connection error. The Android configuration in this worktree is production-asset
based, so the APK intended for a phone is the release APK.

The debug APK is written below:

```text
src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk
```

Install it on a connected device:

```powershell
adb install -r -i com.android.vending .\src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk
```

For a release APK, use Tauri's release build output after configuring Android signing. The release
APK loads the bundled `dist` files and does not require `localhost:1420`:

```powershell
npx tauri android build --apk
```

For Google Play, build an Android App Bundle instead of an APK:

```powershell
npm run android:release
```

The `.aab` output is under
`src-tauri\gen\android\app\build\outputs\bundle\arm64Release\`. Google Play requires a
developer account, store listing, privacy policy, and a release-signed bundle. Keep the upload
keystore and passwords outside Git; losing the upload key can block future updates.

The Android launcher icon is already generated from the project icon and is declared by the
Android manifest as `@mipmap/ic_launcher`. Google Play also requires a 512x512 store-listing icon,
feature graphic, screenshots, and a privacy-policy URL; those are store assets, not APK assets.

## Install the release APK

1. Open the project website and tap **Get Android APK**, or open the latest GitHub release.
2. Download the asset ending in `.apk`; do not download the `.aab` file or a debug APK.
3. If Android blocks the install, open the prompt for **Allow from this source** for the
   browser or file manager you used, then return to the installer.
4. Open NowPlaying Visuals after installation.
5. In Settings, choose **Enable Spotify access**, enable notification access for the app,
   return to the app, and start playback in Spotify.

The `.aab` is for Google Play publishing and cannot normally be installed directly on a phone.
Only install releases from the project’s official GitHub repository, and verify the release
version before installing.

## Spotify access on Android

The Android target includes a notification-listener/media-session bridge for Spotify. On first launch,
open Settings in the app and choose **Enable Spotify access**. Android will open Notification access;
enable **NowPlaying Visuals**, return to the app, and Spotify playback should then provide track
metadata, artwork, position updates, and play/next/previous controls.

Android may revoke notification access after an app restore or security-policy change. If playback
stops updating, use the same Settings action to verify access is still enabled. The Windows SMTC
implementation remains separate and unchanged.

## Android Auto and CarPlay

The phone app is now touch-friendly on small screens, and custom layouts use percentage-based
positions and sizes so they scale automatically on the phone. Android Auto is a separate host
environment: it will not automatically display an arbitrary Tauri screen or expose the phone
app's WebView just because the phone is connected. The Android target now includes a native media
browser service, so Android Auto can discover NowPlaying Visuals as a media source and show the
current Spotify title, artist, album, album art, progress, play/pause, previous, and next controls.
The service also exposes a compact browse entry for the current song, so the Auto media picker has
a useful destination instead of an empty app shell. Enable Spotify
notification access on the phone first, then connect Android Auto and look for the app in the
media-source list.

Android Auto still cannot show the exact full-screen Tauri visualizer, arbitrary widget positions,
or custom animated lyrics while driving. Those remain available in the phone app. The Auto service
uses Android's driving-safe media template instead. Apple CarPlay is not available from an Android
phone.

If the app does not appear in Android Auto after installing an update, disconnect and reconnect
the phone, open Android Auto settings on the phone, enable the app in the launcher/customize-apps
list, and open the media app picker. Android Auto caches the available media sources; restarting
Android Auto or the phone may be required after the first installation. Keep notification access
enabled for NowPlaying Visuals so the service has Spotify metadata to publish.

Standard desktop commands remain unchanged:

```powershell
npm run tauri:build
```
