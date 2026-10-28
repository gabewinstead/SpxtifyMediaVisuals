use once_cell::sync::Lazy;
use serde::Deserialize;
use std::{collections::HashMap, sync::Mutex};
use tauri::{AppHandle, Emitter};

static CACHE: Lazy<Mutex<HashMap<String, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));
#[derive(Clone, Deserialize)]
struct Response {
    #[serde(default, alias = "syncedLyrics")]
    synced_lyrics: Option<String>,
}

async fn request_lyrics(
    client: &reqwest::Client,
    artist: &str,
    track: &str,
    album: &str,
    duration: f64,
) -> Option<String> {
    let mut query = vec![
        ("artist_name", artist.to_string()),
        ("track_name", track.to_string()),
    ];
    if !album.is_empty() {
        query.push(("album_name", album.to_string()));
    }
    if duration > 0.0 {
        query.push(("duration", duration.round().to_string()));
    }
    let response = client.get("https://lrclib.net/api/get")
        .query(&query)
        .send().await.ok()?.error_for_status().ok()?
        .json::<Response>().await.ok()?;
    response.synced_lyrics.filter(|lyrics| !lyrics.trim().is_empty())
}

async fn search_lyrics(client: &reqwest::Client, artist: &str, track: &str) -> Option<String> {
    #[derive(Deserialize)]
    struct SearchResponse {
        #[serde(default, alias = "syncedLyrics")]
        synced_lyrics: Option<String>,
    }
    let results = client.get("https://lrclib.net/api/search")
        .query(&[("artist_name", artist), ("track_name", track)])
        .send().await.ok()?.error_for_status().ok()?
        .json::<Vec<SearchResponse>>().await.ok()?;
    results.into_iter().find_map(|result| result.synced_lyrics.filter(|lyrics| !lyrics.trim().is_empty()))
}

#[tauri::command]
pub async fn fetch_lyrics(app: AppHandle, artist: String, track: String, album: String, duration: f64) -> Result<String, String> {
    let key = format!("{}::{}", artist.to_lowercase(), track.to_lowercase());
    if let Some(value) = CACHE.lock().map_err(|e| e.to_string())?.get(&key).cloned() {
        app.emit("lyrics-received", value.clone()).map_err(|e| e.to_string())?;
        return Ok(value);
    }
    let client = reqwest::Client::new();
    let lyrics = if let Some(value) = request_lyrics(&client, &artist, &track, &album, duration).await {
        value
    } else {
        search_lyrics(&client, &artist, &track).await.unwrap_or_default()
    };
    if !lyrics.is_empty() {
        CACHE.lock().map_err(|e| e.to_string())?.insert(key, lyrics.clone());
    }
    app.emit("lyrics-received", lyrics.clone()).map_err(|e| e.to_string())?;
    Ok(lyrics)
}
