# Spotify Lyrics Overlay

A frameless, always-on-top Spotify lyrics and now-playing overlay for Windows and Linux.

![Screenshot placeholder](docs/screenshot-placeholder.png)

## Features

- Reads the active track through Windows SMTC or Linux MPRIS.
- Fetches synchronized lyrics from LRCLIB without an API key.
- Looks up album art through the iTunes Search API.
- Lyrics, album cover, and combined presentation modes.
- Dominant album-art accent color extraction.
- Frameless, draggable, resizable, always-on-top window with playback controls.
- Theme settings hot-reloaded from the per-user configuration directory.

## Prerequisites

- Windows 10/11 with WebView2, or a Linux desktop with `playerctl`.
- Node.js 18 or newer.
- Rust stable and the Tauri prerequisites.

## Quick Start

Clone the repository, run `SpotifyMediaVisuals.exe` from the root, or build from source:

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run build
npm run tauri build
```

The Windows NSIS installer is written to `src-tauri/target/release/bundle/nsis/`.

## Configuration

The application creates `%APPDATA%/spotify-media-visuals/theme.json`:

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `accentColor` | string | `#1DB954` | Fallback accent color. |
| `backgroundColor` | string | `#121212` | Overlay background color. |
| `secondaryBackground` | string | `#181818` | Secondary panel color. |
| `textColor` | string | `#FFFFFF` | Primary text color. |
| `mutedTextColor` | string | `#B3B3B3` | Secondary text color. |
| `fontFamily` | string | `Inter, Arial, sans-serif` | Font stack. |
| `titleSize` | string | `32px` | Track title size. |
| `artistSize` | string | `18px` | Artist text size. |
| `lyricSize` | string | `42px` | Legacy lyric size setting. |
| `panelOpacity` | number | `0.72` | Theme panel opacity. |
| `blurAmount` | string | `42px` | Album-art blur amount. |
| `borderRadius` | string | `12px` | Cover and panel corner radius. |

## How it works

The Rust backend polls the system media session, emits track and progress events to React, and retrieves lyrics through LRCLIB. The frontend renders the current view and uses the album artwork to calculate an accent color.

## License

MIT. See [LICENSE](./LICENSE).
