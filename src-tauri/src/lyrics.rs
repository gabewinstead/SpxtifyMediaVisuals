use once_cell::sync::Lazy;
use serde::Deserialize;
use std::{collections::HashMap, sync::Mutex};

static CACHE: Lazy<Mutex<HashMap<String, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));
#[derive(Deserialize)] struct Response { #[serde(default)] synced_lyrics: Option<String> }

#[tauri::command]
pub async fn fetch_lyrics(artist: String, track: String) -> Result<String, String> {
    eprintln!("[LYRICS] fetching {track:?} by {artist:?}");
    let key = format!("{}::{}", artist.to_lowercase(), track.to_lowercase());
    if let Some(value) = CACHE.lock().map_err(|e| e.to_string())?.get(&key).cloned() { return Ok(value); }
    let response: Response = reqwest::Client::new().get("https://lrclib.net/api/get")
        .query(&[("artist_name", artist), ("track", track.clone())])
        .send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;
    let lyrics = response.synced_lyrics.unwrap_or_default();
    eprintln!("[LYRICS] received {} characters for {track:?}", lyrics.len());
    CACHE.lock().map_err(|e| e.to_string())?.insert(key, lyrics.clone());
    Ok(lyrics)
}
