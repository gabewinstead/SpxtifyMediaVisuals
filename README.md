<div align="center">
  <img src="./src-tauri/icons/icon.png" alt="Spotify Lyrics Overlay icon" width="112" />
  <h1>Spotify Lyrics Overlay</h1>
  <p><strong>A beautiful, always-on-top companion for the music already playing on your desktop.</strong></p>
  <p>
    <a href="https://github.com/gabewinstead/SpxtifyMediaVisuals/releases"><img src="https://img.shields.io/github/v/release/gabewinstead/SpxtifyMediaVisuals?style=flat-square&color=1ed760" alt="Latest release" /></a>
    <a href="https://github.com/gabewinstead/SpxtifyMediaVisuals/actions"><img src="https://img.shields.io/github/actions/workflow/status/gabewinstead/SpxtifyMediaVisuals/build.yml?style=flat-square&label=build" alt="Build status" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-111714?style=flat-square" alt="MIT license" /></a>
  </p>
</div>

<br />

<div align="center">
  <img src="https://cdn.discordapp.com/attachments/1207855250657124393/1565186745203560508/preview.png?ex=6ae3fd3f&is=6ae2abbf&hm=9a5353a1d7e6747030cd724cb2b8a7c30e5b36db78ac633a971b2cbe6e5554af&" alt="Spotify Lyrics Overlay showing synchronized lyrics over album artwork" width="860" />
</div>

<br />

## A better way to stay in the moment

Spotify Lyrics Overlay turns the track already playing on your computer into a focused visual experience. Keep the lyrics close, make them yours, and let album art bring the color to your desktop — without opening another full-size player.

| Synchronized lyrics | Album-art atmosphere | Your layout, your rules |
| --- | --- | --- |
| Follow along with time-synced lyrics fetched from LRCLIB. | Pulls artwork from iTunes and derives a rich accent color automatically. | Switch between lyrics, album cover, and combined views with live theme controls. |

## What makes it feel good

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🎤 Three ways to experience a track</h3>
      <p>Use a focused lyric view, an album-first canvas, or combine both for the full now-playing experience.</p>
    </td>
    <td width="50%" valign="top">
      <h3>🎨 Themes that respond to the music</h3>
      <p>Tune colors, type, opacity, blur, spacing, and corner radii. Album art can provide the accent, or you can choose your own.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🖥️ Made for your desktop</h3>
      <p>Frameless, draggable, resizable, and always on top. Put it beside your work, over a game, or wherever the music belongs.</p>
    </td>
    <td width="50%" valign="top">
      <h3>⚡ Quietly automatic</h3>
      <p>Reads the active track through Windows SMTC or Linux MPRIS, updates progress in real time, and needs no lyrics API key.</p>
    </td>
  </tr>
</table>

## See it in action

<div align="center">
  <img src="https://cdn.discordapp.com/attachments/1207855250657124393/1565186745203560508/preview.png?ex=6ae3fd3f&is=6ae2abbf&hm=9a5353a1d7e6747030cd724cb2b8a7c30e5b36db78ac633a971b2cbe6e5554af&" alt="Lyrics overlay preview" width="48%" />
  <img src="./src-tauri/icons/icon.png" alt="Spotify Lyrics Overlay app icon" width="18%" />
</div>

> **Tip:** Start with the combined view, then open settings to experiment with the accent, blur, opacity, and type controls. The theme is hot-reloaded from your per-user configuration.

## Get started

### Use a release

Download the latest Windows installer from [Releases](https://github.com/gabewinstead/SpxtifyMediaVisuals/releases). The installer is per-user and does not require administrator access.

### Build from source

**Requirements**

- Windows 10/11 with WebView2, or a Linux desktop with `playerctl`
- [Node.js 18+](https://nodejs.org/)
- [Rust stable](https://www.rust-lang.org/tools/install) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

```bash
git clone https://github.com/gabewinstead/SpxtifyMediaVisuals.git
cd SpxtifyMediaVisuals
npm install
npm run tauri dev
```

## Build and package

```bash
npm run build
npm run tauri build
```

The Windows NSIS installer is written to `src-tauri/target/release/bundle/nsis/`. Release builds also generate a signed updater artifact; the GitHub Actions workflow publishes it and refreshes [`latest.json`](./latest.json).

## Personalize everything

The app creates `%APPDATA%/spotify-media-visuals/theme.json` on Windows. Linux uses the equivalent per-user configuration directory.

| Key | Type | Default | What it controls |
| --- | --- | --- | --- |
| `accentColor` | string | `#1DB954` | Fallback accent color |
| `backgroundColor` | string | `#121212` | Main overlay background |
| `secondaryBackground` | string | `#181818` | Secondary panel background |
| `textColor` | string | `#FFFFFF` | Primary text |
| `mutedTextColor` | string | `#B3B3B3` | Secondary text |
| `fontFamily` | string | `Inter, Arial, sans-serif` | UI and lyric typeface |
| `titleSize` | string | `32px` | Track title size |
| `artistSize` | string | `18px` | Artist text size |
| `lyricSize` | string | `42px` | Legacy lyric size setting |
| `panelOpacity` | number | `0.72` | Theme panel opacity |
| `blurAmount` | string | `42px` | Album-art blur amount |
| `borderRadius` | string | `12px` | Cover and panel corner radius |

## How it works

The Rust backend polls the system media session, emits track and progress events to React, and retrieves synchronized lyrics through [LRCLIB](https://lrclib.net/). The frontend renders the current view and uses album artwork to calculate an accent color.

## Contributing

Install dependencies with `npm install`, run `npm run tauri dev` while developing, and run `npm run build` before opening a pull request. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for more detail.

## License

MIT. See [`LICENSE`](./LICENSE).

<div align="center">
  <br />
  <sub>Built for people who like their music a little more visible.</sub>
</div>
