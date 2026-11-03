mod lyrics;
mod media_session;
mod settings;

fn log_startup_error(message: &str) {
    eprintln!("{message}");
    if let Some(config_dir) = dirs::config_dir() {
        let directory = config_dir.join("spotify-media-visuals");
        if std::fs::create_dir_all(&directory).is_ok() {
            let path = directory.join("crash.log");
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|value| value.as_secs())
                .unwrap_or_default();
            let entry = format!("[{timestamp}] {message}\n");
            let _ = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
                .and_then(|mut file| std::io::Write::write_all(&mut file, entry.as_bytes()));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    std::panic::set_hook(Box::new(|panic| {
        log_startup_error(&format!("panic: {panic}"));
    }));

    if let Ok(executable) = std::env::current_exe() {
        if let Some(directory) = executable.parent() {
            if let Err(error) = std::env::set_current_dir(directory) {
                log_startup_error(&format!("unable to set executable directory: {error}"));
            }
        }
    }

    #[cfg(target_os = "android")]
    let builder = tauri::Builder::default();
    #[cfg(not(target_os = "android"))]
    let mut builder = tauri::Builder::default();
    #[cfg(not(target_os = "android"))]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    let result = builder
        .invoke_handler(tauri::generate_handler![
            lyrics::fetch_lyrics,
            media_session::media_play_pause,
            media_session::media_next,
            media_session::media_previous,
            media_session::frontend_ready,
            media_session::get_current_track,
            media_session::android_media_access_status,
            media_session::open_android_media_access_settings,
            settings::get_theme,
            settings::save_theme,
            settings::save_theme_preset,
            settings::save_layout,
            settings::get_view_mode,
            settings::save_view_mode
        ])
        .setup(|app| {
            media_session::start(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!());
    if let Err(error) = result {
        log_startup_error(&format!("tauri runtime error: {error}"));
    }
}
