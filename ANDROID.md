# Android build workflow

The desktop checkout is intentionally kept free of generated Android files. Tauri 2 normally creates
`src-tauri/gen/android`, so initialize Android from a separate worktree.

## One-time setup

Install the Android prerequisites:

- Android Studio with the Android SDK, SDK Platform, SDK Build-Tools, and an emulator or USB device
- Java 17
- Windows Developer Mode enabled (Tauri uses a symlink for the native Rust library)
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

The generated mobile crate includes a library target (`src-tauri\src\lib.rs`) because Android loads
the Rust code as a native `.so`. Windows-only SMTC dependencies remain target-gated, and Android
uses the Rust-safe fallback until an Android media-session bridge is added.

## Development and APK build

```powershell
npm run android:dev
npm run android:build
```

The debug APK is written below:

```text
src-tauri\gen\android\app\build\outputs\apk\universal\debug\app-universal-debug.apk
```

Install it on a connected device:

```powershell
adb install -r -i com.android.vending .\src-tauri\gen\android\app\build\outputs\apk\universal\debug\app-universal-debug.apk
```

On an arm64 device, the generated debug artifact is usually:

```powershell
adb install -r -i com.android.vending .\src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk
```

If Windows Developer Mode cannot be enabled, the Rust library can be copied instead of symlinked
and Gradle can assemble the APK directly:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
cargo build --manifest-path src-tauri\Cargo.toml --target aarch64-linux-android --release
New-Item -ItemType Directory -Force src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a
Copy-Item src-tauri\target\aarch64-linux-android\release\libspotify_media_visuals.so `
  src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a\libspotify_media_visuals.so
Set-Location src-tauri\gen\android
.\gradlew.bat app:assembleArm64Release -x rustBuildArm64Release
```

For a release APK, use Tauri's release build output after configuring Android signing:

```powershell
npx tauri android build --apk
```

## Spotify access on Android

The Android target includes a notification-listener/media-session bridge for Spotify. On first launch,
open Settings in the app and choose **Enable Spotify access**. Android will open Notification access;
enable **Spxtify Media Visuals**, return to the app, and Spotify playback should then provide track
metadata, artwork, position updates, and play/next/previous controls.

Android may revoke notification access after an app restore or security-policy change. If playback
stops updating, use the same Settings action to verify access is still enabled. The Windows SMTC
implementation remains separate and unchanged.

Do not copy the generated `src-tauri\gen\android` directory back into the desktop checkout.
Standard desktop commands remain unchanged:

```powershell
npm run tauri:build
```
