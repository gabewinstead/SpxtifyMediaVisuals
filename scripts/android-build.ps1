param(
  [switch]$Bundle
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $root 'src-tauri\gen\android'
$assetsDir = Join-Path $androidDir 'app\src\main\assets'
$native = Join-Path $root 'src-tauri\target\aarch64-linux-android\release\libspotify_media_visuals.so'
$jniDir = Join-Path $androidDir 'app\src\main\jniLibs\arm64-v8a'
$jniNative = Join-Path $jniDir 'libspotify_media_visuals.so'
$gradleTask = if ($Bundle) { ':app:bundleArm64Release' } else { ':app:assembleArm64Release' }

Push-Location $root
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }

  $tauriArgs = if ($Bundle) { @('tauri', 'android', 'build', '--aab', '--target', 'aarch64') } else { @('tauri', 'android', 'build', '--apk', '--target', 'aarch64') }
  & npx @tauriArgs
  $tauriExit = $LASTEXITCODE

  if (-not (Test-Path $native)) {
    throw "Android Rust library was not produced. Tauri exited with code $tauriExit."
  }

  New-Item -ItemType Directory -Force -Path $assetsDir, $jniDir | Out-Null
  Remove-Item (Join-Path $assetsDir '*') -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item (Join-Path $root 'dist\*') $assetsDir -Recurse -Force
  Copy-Item (Join-Path $root 'src-tauri\tauri.conf.json') (Join-Path $assetsDir 'tauri.conf.json') -Force
  Copy-Item $native $jniNative -Force

  $env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
  Push-Location $androidDir
  try {
    & '.\gradlew.bat' $gradleTask '--no-daemon' '-x' ':app:rustBuildArm64Release'
    if ($LASTEXITCODE -ne 0) { throw 'Gradle Android packaging failed.' }
  } finally {
    Pop-Location
  }

  $kind = if ($Bundle) { 'AAB' } else { 'APK' }
  Write-Host "Android $kind build completed without requiring Windows symlink privileges."
} finally {
  Pop-Location
}
