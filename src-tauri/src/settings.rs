use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    pub accent_color: String,
    pub background_color: String,
    pub secondary_background: String,
    pub text_color: String,
    pub muted_text_color: String,
    pub font_family: String,
    pub title_size: String,
    pub artist_size: String,
    pub lyric_size: String,
    pub panel_opacity: f32,
    pub blur_amount: String,
    pub border_radius: String,
}

impl Default for Theme {
    fn default() -> Self {
        Self {
            accent_color: "#1DB954".to_string(),
            background_color: "#121212".to_string(),
            secondary_background: "#181818".to_string(),
            text_color: "#FFFFFF".to_string(),
            muted_text_color: "#B3B3B3".to_string(),
            font_family: "Inter, Arial, sans-serif".to_string(),
            title_size: "32px".to_string(),
            artist_size: "18px".to_string(),
            lyric_size: "42px".to_string(),
            panel_opacity: 0.72,
            blur_amount: "42px".to_string(),
            border_radius: "12px".to_string(),
        }
    }
}

fn settings_dir() -> Result<PathBuf, String> {
    let path = dirs::config_dir().ok_or_else(|| "Unable to locate the user config directory".to_string())?
        .join("spotify-media-visuals");
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

#[tauri::command]
pub fn get_theme() -> Result<Theme, String> {
    let path = settings_dir()?.join("theme.json");
    if !path.exists() {
        let theme = Theme::default();
        fs::write(&path, serde_json::to_string_pretty(&theme).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        return Ok(theme);
    }
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_theme(theme: Theme) -> Result<(), String> {
    let path = settings_dir()?.join("theme.json");
    fs::write(path, serde_json::to_string_pretty(&theme).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_view_mode() -> Result<String, String> {
    let path = settings_dir()?.join("view-mode");
    fs::read_to_string(path).or_else(|error| {
        if error.kind() == std::io::ErrorKind::NotFound { Ok("combined".to_string()) } else { Err(error) }
    }).map_err(|error: std::io::Error| error.to_string())
}

#[tauri::command]
pub fn save_view_mode(mode: String) -> Result<(), String> {
    if !["lyrics", "album", "artist", "combined"].contains(&mode.as_str()) {
        return Err("Invalid view mode".to_string());
    }
    fs::write(settings_dir()?.join("view-mode"), mode).map_err(|error| error.to_string())
}
