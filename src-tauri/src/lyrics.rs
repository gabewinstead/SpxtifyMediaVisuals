use once_cell::sync::Lazy;
use serde::Deserialize;
use std::{collections::HashMap, sync::Mutex};
use tauri::{AppHandle, Emitter};

static CACHE: Lazy<Mutex<HashMap<String, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));
#[derive(Clone, Deserialize)]
struct Response {
    #[serde(default, alias = "syncedLyrics")]
    synced_lyrics: Option<String>,
    #[serde(default, alias = "plainLyrics")]
    plain_lyrics: Option<String>,
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
    response.synced_lyrics
        .or(response.plain_lyrics)
        .filter(|lyrics| !lyrics.trim().is_empty())
}

async fn search_lyrics(client: &reqwest::Client, artist: &str, track: &str) -> Option<String> {
    #[derive(Deserialize)]
    struct SearchResponse {
        #[serde(default, alias = "syncedLyrics")]
        synced_lyrics: Option<String>,
        #[serde(default, alias = "plainLyrics")]
        plain_lyrics: Option<String>,
    }
    let results = client.get("https://lrclib.net/api/search")
        .query(&[("artist_name", artist), ("track_name", track)])
        .send().await.ok()?.error_for_status().ok()?
        .json::<Vec<SearchResponse>>().await.ok()?;
    let mut plain = None;
    for result in results {
        if let Some(lyrics) = result.synced_lyrics.filter(|lyrics| !lyrics.trim().is_empty()) {
            return Some(lyrics);
        }
        if plain.is_none() {
            plain = result.plain_lyrics.filter(|lyrics| !lyrics.trim().is_empty());
        }
    }
    plain
}

async fn qobuzify_lyrics(client: &reqwest::Client, artist: &str, track: &str) -> Option<String> {
    #[derive(Deserialize)]
    struct QobuzifyResponse {
        #[serde(default, alias = "syncedLyrics")]
        synced_lyrics: Option<String>,
        #[serde(default)]
        lyrics: Option<String>,
    }
    let response = client.get("https://api.qobuzify.app/v2/track")
        .query(&[("name", track), ("artist", artist)])
        .send().await.ok()?.error_for_status().ok()?
        .json::<QobuzifyResponse>().await.ok()?;
    response.synced_lyrics
        .or(response.lyrics)
        .filter(|lyrics| !lyrics.trim().is_empty())
}

#[tauri::command]
pub async fn fetch_lyrics(app: AppHandle, artist: String, track: String, album: String, duration: f64) -> Result<String, String> {
    let key = format!("{}::{}", artist.to_lowercase(), track.to_lowercase());
    if let Some(value) = CACHE.lock().map_err(|e| e.to_string())?.get(&key).cloned() {
        app.emit("lyrics-received", value.clone()).map_err(|e| e.to_string())?;
        return Ok(value);
    }
    let client = reqwest::Client::builder()
        .user_agent("SpotifyLyricsOverlay/0.1")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|error| error.to_string())?;
    let lyrics = if let Some(value) = request_lyrics(&client, &artist, &track, &album, duration).await {
        value
    } else if let Some(value) = search_lyrics(&client, &artist, &track).await {
        value
    } else {
        qobuzify_lyrics(&client, &artist, &track).await.unwrap_or_default()
    };
    if !lyrics.is_empty() {
        CACHE.lock().map_err(|e| e.to_string())?.insert(key, lyrics.clone());
    }
    app.emit("lyrics-received", lyrics.clone()).map_err(|e| e.to_string())?;
    Ok(lyrics)
}
