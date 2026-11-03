use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;

#[cfg(any(target_os = "windows", target_os = "linux", target_os = "android"))]
use std::time::Duration;
#[cfg(any(target_os = "windows", target_os = "linux", target_os = "android"))]
use tauri::Emitter;

#[cfg(target_os = "windows")]
fn thumbnail_data_url(
    properties: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
) -> Option<String> {
    use base64::Engine;
    use windows::Storage::Streams::DataReader;

    let reference = properties.Thumbnail().ok()?;
    let stream = reference.OpenReadAsync().ok()?.get().ok()?;
    let size = stream.Size().ok()?.min(10 * 1024 * 1024) as u32;
    if size == 0 {
        return None;
    }
    let input = stream.GetInputStreamAt(0).ok()?;
    let reader = DataReader::CreateDataReader(&input).ok()?;
    reader.LoadAsync(size).ok()?.get().ok()?;
    let mut bytes = vec![0; size as usize];
    reader.ReadBytes(&mut bytes).ok()?;
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

static FRONTEND_READY: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "android")]
fn android_bridge_call(method: &str) -> Result<String, String> {
    use jni::{
        objects::{JClass, JObject, JString, JValue},
        JavaVM,
    };
    let context = ndk_context::android_context();
    let vm = unsafe { JavaVM::from_raw(context.vm() as *mut _) }
        .map_err(|error| format!("Unable to access Android JVM: {error}"))?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|error| format!("Unable to attach to Android JVM: {error}"))?;
    let context_object = unsafe {
        JObject::from_raw(context.context() as jni::sys::jobject)
    };
    let class_loader = env
        .call_method(&context_object, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])
        .and_then(|value| value.l())
        .map_err(|error| format!("Android class loader is unavailable: {error}"))?;
    let class_name = env
        .new_string("com.spotify.media.visuals.AndroidMediaBridge")
        .map_err(|error| format!("Unable to create Android class name: {error}"))?;
    let class = JClass::from(env
        .call_method(
            &class_loader,
            "loadClass",
            "(Ljava/lang/String;)Ljava/lang/Class;",
            &[JValue::Object(&JObject::from(class_name))],
        )
        .and_then(|value| value.l())
        .map_err(|error| format!("Android media bridge is unavailable: {error}"))?);
    let value = env
        .call_static_method(class, method, "()Ljava/lang/String;", &[])
        .map_err(|error| format!("Android media bridge call failed: {error}"))?
        .l()
        .map_err(|error| format!("Android media bridge returned an invalid value: {error}"))?;
    let value: JString = value.into();
    env.get_string(&value)
        .map(|value| value.to_string_lossy().into_owned())
        .map_err(|error| format!("Unable to read Android media bridge result: {error}"))
}

#[cfg(target_os = "android")]
fn android_result(result: Result<String, String>) -> Result<String, String> {
    let json = result?;
    let value: serde_json::Value =
        serde_json::from_str(&json).map_err(|error| format!("Invalid Android media response: {error}"))?;
    if let Some(error) = value.get("error").and_then(serde_json::Value::as_str) {
        return Err(error.to_string());
    }
    Ok(json)
}

#[tauri::command]
pub fn android_media_access_status() -> bool {
    #[cfg(target_os = "android")]
    {
        return android_bridge_call("hasNotificationAccess")
            .map(|value| value == "true")
            .unwrap_or(false);
    }
    #[cfg(not(target_os = "android"))]
    false
}

#[tauri::command]
pub fn open_android_media_access_settings() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        android_result(android_bridge_call("openNotificationAccessSettings")).map(|_| ())
    }
    #[cfg(not(target_os = "android"))]
    {
        Err("Android media access is only available on Android".to_string())
    }
}

#[cfg(target_os = "windows")]
const POLL_INTERVAL: Duration = Duration::from_millis(250);
/// Spotify often publishes the new cover a moment after the new title, so the cover is re-read a few times.
#[cfg(target_os = "windows")]
const ART_RETRY_INTERVAL: Duration = Duration::from_millis(1200);
#[cfg(target_os = "windows")]
const ART_RETRIES: u8 = 3;

#[cfg(target_os = "windows")]
fn spotify_session(
    manager: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager,
) -> Option<windows::Media::Control::GlobalSystemMediaTransportControlsSession> {
    let sessions = manager.GetSessions().ok()?;
    let count = sessions.Size().ok()?;
    (0..count).find_map(|index| {
        let session = sessions.GetAt(index).ok()?;
        let source = session.SourceAppUserModelId().ok()?.to_string();
        source.to_lowercase().contains("spotify").then_some(session)
    })
}

/// The session that playback commands should go to: Spotify if it is running, otherwise whatever Windows
/// considers current. `GetCurrentSession` alone can pick a browser tab that happens to be playing.
#[cfg(target_os = "windows")]
fn target_session(
    manager: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager,
) -> Result<windows::Media::Control::GlobalSystemMediaTransportControlsSession, String> {
    spotify_session(manager)
        .or_else(|| manager.GetCurrentSession().ok())
        .ok_or_else(|| "No media session is available".to_string())
}

/// Windows reports the timeline position as it was at `LastUpdatedTime` and never advances it on its
/// own, so a playing session has to be extrapolated forward. Without this the value goes stale between
/// Spotify's updates, and two readers that see different snapshots disagree by seconds.
#[cfg(target_os = "windows")]
fn timeline_snapshot(
    timeline: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionTimelineProperties,
    playing: bool,
) -> Option<(f64, f64)> {
    const TICKS_PER_SECOND: f64 = 10_000_000.0;
    // Windows DateTime ticks count from 1601-01-01, Unix time from 1970-01-01
    const UNIX_EPOCH_IN_WINDOWS_TICKS: i64 = 116_444_736_000_000_000;

    let mut position = timeline.Position().ok()?.Duration as f64 / TICKS_PER_SECOND;
    let duration = timeline.EndTime().ok()?.Duration as f64 / TICKS_PER_SECOND;
    if playing {
        if let Ok(updated) = timeline.LastUpdatedTime() {
            if updated.UniversalTime > 0 {
                if let Ok(since_unix) = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
                    let now = (since_unix.as_nanos() / 100) as i64 + UNIX_EPOCH_IN_WINDOWS_TICKS;
                    let elapsed = (now - updated.UniversalTime) as f64 / TICKS_PER_SECOND;
                    if (0.0..=4.0 * 3600.0).contains(&elapsed) {
                        position += elapsed;
                    }
                }
            }
        }
        if duration > 0.0 {
            position = position.min(duration);
        }
    }
    Some((position, duration))
}

#[tauri::command]
pub fn frontend_ready() {
    FRONTEND_READY.store(true, Ordering::Release);
}

#[tauri::command]
/// `include_art` (JS: `includeArt`) defaults to true. Frequent callers pass false to skip encoding the cover.
pub async fn get_current_track(include_art: Option<bool>) -> Result<Track, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::{
            GlobalSystemMediaTransportControlsSessionManager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus,
        };

        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .and_then(|operation| operation.get())
            .map_err(|error| error.to_string())?;
        let session = spotify_session(&manager)
            .ok_or_else(|| "No Spotify media session is available".to_string())?;
        let properties = session
            .TryGetMediaPropertiesAsync()
            .and_then(|operation| operation.get())
            .map_err(|error| error.to_string())?;
        let playback = session.GetPlaybackInfo().map_err(|error| error.to_string())?;
        let playing = playback.PlaybackStatus()
            .map_err(|error| error.to_string())?
            == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;
        let mut track = Track {
            title: properties.Title().map_err(|error| error.to_string())?.to_string(),
            artist: properties.Artist().map_err(|error| error.to_string())?.to_string(),
            album: properties.AlbumTitle().unwrap_or_default().to_string(),
            album_art_url: if include_art.unwrap_or(true) { thumbnail_data_url(&properties) } else { None },
            playing,
            ..Default::default()
        };
        if let Ok(timeline) = session.GetTimelineProperties() {
            if let Some((position, duration)) = timeline_snapshot(&timeline, playing) {
                track.position = position;
                track.duration = duration;
            }
        }
        return Ok(track);
    }
    #[cfg(target_os = "android")]
    {
        let method = if include_art.unwrap_or(true) { "currentTrackWithArt" } else { "currentTrack" };
        let json = android_bridge_call(method)?;
        let value: serde_json::Value = serde_json::from_str(&json).map_err(|error| error.to_string())?;
        if let Some(error) = value.get("error").and_then(serde_json::Value::as_str) {
            return Err(error.to_string());
        }
        return serde_json::from_value(value).map_err(|error| error.to_string());
    }
    #[cfg(not(any(target_os = "windows", target_os = "android")))]
    {
        let _ = include_art;
        Err("Current media track is not supported on this platform".to_string())
    }
}

#[tauri::command]
pub async fn media_play_pause() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .and_then(|operation| operation.get()).map_err(|error| error.to_string())?;
        let session = target_session(&manager)?;
        session.TryTogglePlayPauseAsync().map_err(|error| error.to_string())?.get().map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "android")]
    { android_result(android_bridge_call("playPause")).map(|_| ()) }
    #[cfg(target_os = "linux")]
    { run_playerctl("play-pause") }
    #[cfg(not(any(target_os = "android", target_os = "linux", target_os = "windows")))]
    { Err("Media controls are not supported on this platform".to_string()) }
}

#[tauri::command]
pub async fn media_next() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .and_then(|operation| operation.get()).map_err(|error| error.to_string())?;
        let session = target_session(&manager)?;
        session.TrySkipNextAsync().map_err(|error| error.to_string())?.get().map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "android")]
    { android_result(android_bridge_call("next")).map(|_| ()) }
    #[cfg(target_os = "linux")]
    { run_playerctl("next") }
    #[cfg(not(any(target_os = "android", target_os = "linux", target_os = "windows")))]
    { Err("Media controls are not supported on this platform".to_string()) }
}

#[tauri::command]
pub async fn media_previous() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .and_then(|operation| operation.get()).map_err(|error| error.to_string())?;
        let session = target_session(&manager)?;
        session.TrySkipPreviousAsync().map_err(|error| error.to_string())?.get().map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "android")]
    { android_result(android_bridge_call("previous")).map(|_| ()) }
    #[cfg(target_os = "linux")]
    { run_playerctl("previous") }
    #[cfg(not(any(target_os = "android", target_os = "linux", target_os = "windows")))]
    { Err("Media controls are not supported on this platform".to_string()) }
}

#[derive(Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art_url: Option<String>,
    pub duration: f64,
    pub position: f64,
    pub playing: bool,
}

/// What the frontend has already been told about the current song.
#[cfg(target_os = "windows")]
#[derive(Default)]
struct Announced {
    /// "title::artist". A change means a new song.
    key: String,
    album: String,
    art: Option<String>,
    art_checks_left: u8,
    next_art_check: Option<std::time::Instant>,
}

/// One poll: announce a new song (or a late album or cover for the same song), then report the position.
///
/// The title is read on every poll, which is cheap, so a song change is noticed within 250ms. The cover is
/// expensive to read and encode, so it is only read for a new song, when the album changes, and for a few
/// retries afterwards. The frontend treats repeats of "track-changed" for one song as cover refreshes.
#[cfg(target_os = "windows")]
fn poll_once(
    app: &AppHandle,
    session: &windows::Media::Control::GlobalSystemMediaTransportControlsSession,
    announced: &mut Announced,
) {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;

    let Ok(properties) = session
        .TryGetMediaPropertiesAsync()
        .and_then(|operation| operation.get())
    else {
        return;
    };
    let title = properties.Title().unwrap_or_default().to_string();
    if title.trim().is_empty() {
        return;
    }
    let artist = properties.Artist().unwrap_or_default().to_string();
    let album = properties.AlbumTitle().unwrap_or_default().to_string();

    let playing = session
        .GetPlaybackInfo()
        .ok()
        .and_then(|info| info.PlaybackStatus().ok())
        == Some(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing);

    if FRONTEND_READY.load(Ordering::Acquire) {
        let now = std::time::Instant::now();
        let key = format!("{title}::{artist}");
        let new_track = key != announced.key;
        let art_due = announced.art_checks_left > 0
            && announced.next_art_check.map_or(false, |at| now >= at);

        if new_track || album != announced.album || art_due {
            let art = thumbnail_data_url(&properties);
            if new_track {
                announced.art_checks_left = ART_RETRIES;
            } else if art_due {
                announced.art_checks_left -= 1;
            }
            announced.next_art_check = Some(now + ART_RETRY_INTERVAL);

            if new_track || album != announced.album || art != announced.art {
                let _ = app.emit(
                    "track-changed",
                    Track {
                        title: title.clone(),
                        artist: artist.clone(),
                        album: album.clone(),
                        album_art_url: art.clone(),
                        playing,
                        ..Default::default()
                    },
                );
            }
            announced.key = key;
            announced.album = album;
            announced.art = art;
        }
    }

    if let Ok(timeline) = session.GetTimelineProperties() {
        if let Some((position, duration)) = timeline_snapshot(&timeline, playing) {
            let _ = app.emit(
                "position-updated",
                serde_json::json!({
                    "position": position,
                    "duration": duration,
                    "playing": playing
                }),
            );
        }
    }
}

#[cfg(target_os = "windows")]
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };

        loop {
            // A fresh manager every time Spotify (re)appears, so a stale session can never stick around
            let manager = match GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
                .and_then(|operation| operation.get())
            {
                Ok(manager) => manager,
                Err(_) => {
                    std::thread::sleep(Duration::from_secs(2));
                    continue;
                }
            };
            let mut announced = Announced::default();
            while let Some(session) = spotify_session(&manager) {
                poll_once(&app, &session, &mut announced);
                std::thread::sleep(POLL_INTERVAL);
            }
            std::thread::sleep(Duration::from_secs(1));
        }
    });
}

#[cfg(target_os = "linux")]
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_key = String::new();
        loop {
            let output = std::process::Command::new("playerctl")
                .args([
                    "metadata",
                    "--format",
                    "{{title}}\t{{artist}}\t{{albumArtUrl}}\t{{position}}\t{{mpris:length}}\t{{status}}",
                ])
                .output();

            if let Ok(output) = output {
                if output.status.success() {
                    let output_text = String::from_utf8_lossy(&output.stdout);
                    let values: Vec<&str> = output_text
                        .trim()
                        .split('\t')
                        .collect();
                    if values.len() >= 6 && !values[0].trim().is_empty() {
                        let key = format!("{}::{}", values[0], values[1]);
                        let playing = values[5].eq_ignore_ascii_case("playing");
                        if key != last_key {
                            last_key = key;
                            let _ = app.emit(
                                "track-changed",
                                Track {
                                    title: values[0].to_string(),
                                    artist: values[1].to_string(),
                                    album_art_url: non_empty(values[2]),
                                    playing,
                                    ..Default::default()
                                },
                            );
                        }
                        let _ = app.emit(
                            "position-updated",
                            serde_json::json!({
                                "position": parse_playerctl_time(values[3]),
                                "duration": parse_playerctl_time(values[4]),
                                "playing": playing
                            }),
                        );
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}

#[cfg(target_os = "android")]
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_key = String::new();
        loop {
            if let Ok(json) = android_bridge_call("currentTrack") {
                if let Ok(track) = serde_json::from_str::<Track>(&json) {
                    if !track.title.trim().is_empty() {
                        let key = format!("{}::{}", track.title, track.artist);
                        if key != last_key {
                            last_key = key;
                            let _ = app.emit("track-changed", track.clone());
                        }
                        let _ = app.emit(
                            "position-updated",
                            serde_json::json!({
                                "position": track.position,
                                "duration": track.duration,
                                "playing": track.playing
                            }),
                        );
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}

#[cfg(target_os = "linux")]
fn non_empty(value: &str) -> Option<String> {
    (!value.is_empty()).then(|| value.to_string())
}

#[cfg(target_os = "linux")]
fn parse_playerctl_time(value: &str) -> f64 {
    value.parse::<f64>().unwrap_or_default() / 1_000_000.0
}

#[cfg(all(unix, not(target_os = "windows")))]
fn run_playerctl(command: &str) -> Result<(), String> {
    let status = std::process::Command::new("playerctl").arg(command).status().map_err(|error| error.to_string())?;
    if status.success() { Ok(()) } else { Err(format!("playerctl {command} failed")) }
}

#[cfg(not(any(unix, target_os = "windows")))]
pub fn start(_app: AppHandle) {}