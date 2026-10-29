use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    #[serde(default = "default_theme_id")]
    pub id: String,
    #[serde(default = "default_theme_name")]
    pub name: String,
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
    #[serde(default = "default_glow")]
    pub glow: String,
    #[serde(default = "default_progress_glow")]
    pub progress_glow: String,
    #[serde(default = "default_layout")]
    pub layout: String,
}

fn default_theme_id() -> String { "spotify-dark".to_string() }
fn default_theme_name() -> String { "Spotify Dark".to_string() }
fn default_layout() -> String { "center".to_string() }
fn default_glow() -> String { "0 0 20px rgba(29, 185, 84, 0.3)".to_string() }
fn default_progress_glow() -> String { "none".to_string() }

impl Default for Theme {
    fn default() -> Self {
        Self {
            id: default_theme_id(),
            name: default_theme_name(),
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
            layout: default_layout(),
            glow: default_glow(),
            progress_glow: default_progress_glow(),
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
pub fn save_theme_preset(id: String) -> Result<Theme, String> {
    let mut theme = Theme::default();
    let (name, background, secondary, text, muted, accent, layout, glow, progress_glow) = match id.as_str() {
        "midnight" => ("Midnight", "linear-gradient(180deg, #0a0a1a, #1a1035)", "#14142b", "#F5F3FF", "#AAA7C7", "#6366F1", "cinematic", "0 0 20px rgba(99, 102, 241, 0.4)", "none"),
        "sunset" => ("Sunset", "linear-gradient(180deg, #1a0a0a, #2d1210)", "#2b1414", "#FFF7ED", "#FDBA74", "#F97316", "center", "0 0 20px rgba(249, 115, 22, 0.3)", "none"),
        "ocean" => ("Ocean", "linear-gradient(180deg, #0a1a1a, #0a2535)", "#102727", "#ECFEFF", "#A5F3FC", "#06B6D4", "split", "0 0 20px rgba(6, 182, 212, 0.3)", "none"),
        "light" => ("Light Mode", "#f5f5f5", "#FFFFFF", "#1a1a1a", "#666666", "#1DB954", "center", "0 0 20px rgba(29, 185, 84, 0.2)", "none"),
        "neon" => ("Neon", "#0a0a0a", "#171717", "#FFFFFF", "#444444", "#FF00FF", "full-bleed", "0 0 10px #ff00ff, 0 0 30px #ff00ff40", "0 0 8px #ff00ff"),
        _ => ("Spotify Dark", "#121212", "#181818", "#FFFFFF", "#B3B3B3", "#1DB954", "center", "0 0 20px rgba(29, 185, 84, 0.3)", "none"),
    };
    theme.id = id;
    theme.name = name.to_string();
    theme.background_color = background.to_string();
    theme.secondary_background = secondary.to_string();
    theme.text_color = text.to_string();
    theme.muted_text_color = muted.to_string();
    theme.accent_color = accent.to_string();
    theme.layout = layout.to_string();
    theme.glow = glow.to_string();
    theme.progress_glow = progress_glow.to_string();
    save_theme(theme.clone())?;
    Ok(theme)
}

#[tauri::command]
pub fn save_layout(style: String) -> Result<Theme, String> {
    if !["center", "full-bleed", "split", "cinematic"].contains(&style.as_str()) {
        return Err("Invalid layout style".to_string());
    }
    let mut theme = get_theme()?;
    theme.layout = style;
    save_theme(theme.clone())?;
    Ok(theme)
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
