use serde::Serialize;
use std::{sync::atomic::{AtomicBool, Ordering}, time::Duration};
use tauri::{AppHandle, Emitter};

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

#[tauri::command]
pub fn frontend_ready() {
    FRONTEND_READY.store(true, Ordering::Release);
}

#[tauri::command]
pub async fn get_current_track() -> Result<Track, String> {
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
            album_art_url: thumbnail_data_url(&properties),
            playing,
            ..Default::default()
        };
        if let Ok(timeline) = session.GetTimelineProperties() {
            if let (Ok(position), Ok(end)) = (timeline.Position(), timeline.EndTime()) {
                track.position = position.Duration as f64 / 10_000_000.0;
                track.duration = end.Duration as f64 / 10_000_000.0;
            }
        }
        return Ok(track);
    }
    #[cfg(not(target_os = "windows"))]
    { Err("Current media track is not supported on this platform".to_string()) }
}

#[tauri::command]
pub async fn media_play_pause() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .and_then(|operation| operation.get()).map_err(|error| error.to_string())?;
        let session = manager.GetCurrentSession().map_err(|error| error.to_string())?;
        session.TryTogglePlayPauseAsync().map_err(|error| error.to_string())?.get().map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "windows")))]
    { run_playerctl("play-pause") }
    #[cfg(not(any(unix, target_os = "windows")))]
    { Err("Media controls are not supported on this platform".to_string()) }
}

#[tauri::command]
pub async fn media_next() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .and_then(|operation| operation.get()).map_err(|error| error.to_string())?;
        let session = manager.GetCurrentSession().map_err(|error| error.to_string())?;
        session.TrySkipNextAsync().map_err(|error| error.to_string())?.get().map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "windows")))]
    { run_playerctl("next") }
    #[cfg(not(any(unix, target_os = "windows")))]
    { Err("Media controls are not supported on this platform".to_string()) }
}

#[tauri::command]
pub async fn media_previous() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
        let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .and_then(|operation| operation.get()).map_err(|error| error.to_string())?;
        let session = manager.GetCurrentSession().map_err(|error| error.to_string())?;
        session.TrySkipPreviousAsync().map_err(|error| error.to_string())?.get().map_err(|error| error.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "windows")))]
    { run_playerctl("previous") }
    #[cfg(not(any(unix, target_os = "windows")))]
    { Err("Media controls are not supported on this platform".to_string()) }
}

#[derive(Clone, Serialize, Default)]
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

#[cfg(target_os = "windows")]
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
            let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        }
        use windows::Media::Control::{
            GlobalSystemMediaTransportControlsSessionManager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus,
        };

        let manager = match GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
            .and_then(|operation| operation.get())
        {
            Ok(manager) => manager,
            Err(_) => {
                return;
            }
        };
        let mut last_key = String::new();
        loop {
            if let Some(session) = spotify_session(&manager) {
                let properties = session
                    .TryGetMediaPropertiesAsync()
                    .and_then(|operation| operation.get());
                if let Ok(properties) = properties {
                    let title = properties.Title().unwrap_or_default().to_string();
                    let artist = properties.Artist().unwrap_or_default().to_string();
                    if title.trim().is_empty() {
                        std::thread::sleep(Duration::from_millis(500));
                        continue;
                    }
                    let album = properties.AlbumTitle().unwrap_or_default().to_string();
                    let album_art_url = thumbnail_data_url(&properties);
                    let playback = session.GetPlaybackInfo().ok();
                    let playing = playback
                        .as_ref()
                        .and_then(|info| info.PlaybackStatus().ok())
                        == Some(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing);
                    let key = format!("{title}::{artist}");
                    if key != last_key && FRONTEND_READY.load(Ordering::Acquire) {
                        last_key = key;
                        let _ = app.emit(
                            "track-changed",
                            Track {
                                title,
                                artist,
                                album,
                                album_art_url,
                                playing,
                                ..Default::default()
                            },
                        );
                    }

                    if let Ok(timeline) = session.GetTimelineProperties() {
                        if let (Ok(position), Ok(end)) = (timeline.Position(), timeline.EndTime()) {
                            let _ = app.emit(
                                "position-updated",
                                serde_json::json!({
                                    "position": position.Duration as f64 / 10_000_000.0,
                                    "duration": end.Duration as f64 / 10_000_000.0,
                                    "playing": playing
                                }),
                            );
                        }
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}

#[cfg(all(unix, not(target_os = "windows")))]
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
                    let values: Vec<&str> = String::from_utf8_lossy(&output.stdout)
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

#[cfg(all(unix, not(target_os = "windows")))]
fn non_empty(value: &str) -> Option<String> {
    (!value.is_empty()).then(|| value.to_string())
}

#[cfg(all(unix, not(target_os = "windows")))]
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
