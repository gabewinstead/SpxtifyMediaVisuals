use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

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
            Err(error) => {
                eprintln!("Unable to connect to Windows media session manager: {error}");
                return;
            }
        };
        let mut last_key = String::new();
        let mut missed_sessions = 0u8;
        loop {
            if let Ok(session) = manager.GetCurrentSession() {
                missed_sessions = 0;
                let properties = session
                    .TryGetMediaPropertiesAsync()
                    .and_then(|operation| operation.get());
                if let Ok(properties) = properties {
                    let title = properties.Title().unwrap_or_default().to_string();
                    let artist = properties.Artist().unwrap_or_default().to_string();
                    let playback = session.GetPlaybackInfo().ok();
                    let playing = playback
                        .as_ref()
                        .and_then(|info| info.PlaybackStatus().ok())
                        == Some(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing);
                    let key = format!("{title}::{artist}");
                    if key != last_key || (last_key.is_empty() && !title.is_empty()) {
                        last_key = key;
                        let _ = app.emit(
                            "track-changed",
                            Track {
                                title,
                                artist,
                                album_art_url: None,
                                playing,
                                ..Default::default()
                            },
                        );
                    }

                    if let Ok(timeline) = session.GetTimelineProperties() {
                        if let (Ok(position), Ok(end)) = (timeline.Position(), timeline.EndTime()) {
                            let _ = app.emit(
                                "position-updated",
                                Track {
                                    position: position.Duration as f64 / 10_000_000.0,
                                    duration: end.Duration as f64 / 10_000_000.0,
                                    playing,
                                    ..Default::default()
                                },
                            );
                        }
                    }
                }
            } else if !last_key.is_empty() {
                missed_sessions = missed_sessions.saturating_add(1);
                if missed_sessions >= 3 {
                    last_key.clear();
                    missed_sessions = 0;
                    let _ = app.emit("track-changed", Track::default());
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
                    if values.len() >= 6 {
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
                            Track {
                                position: parse_playerctl_time(values[3]),
                                duration: parse_playerctl_time(values[4]),
                                playing,
                                ..Default::default()
                            },
                        );
                    }
                } else if !last_key.is_empty() {
                    last_key.clear();
                    let _ = app.emit("track-changed", Track::default());
                }
            } else if !last_key.is_empty() {
                last_key.clear();
                let _ = app.emit("track-changed", Track::default());
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
