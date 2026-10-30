<div align="center">
  <img src="./src-tauri/icons/icon.png" alt="Spotify Lyrics Overlay icon" width="112" />
  <h1>Spotify Lyrics Overlay</h1>
  <p><strong>A beautiful, always-on-top companion for the music already playing on your desktop.</strong></p>
  <p>
    <a href="https://github.com/gabewinstead/SpxtifyMediaVisuals/releases"><img src="https://img.shields.io/github/v/release/gabewinstead/SpxtifyMediaVisuals?style=flat-square&color=1ed760" alt="Latest release" /></a>
    <a href="https://github.com/gabewinstead/SpxtifyMediaVisuals/actions"><img src="https://img.shields.io/github/actions/workflow/status/gabewinstead/SpxtifyMediaVisuals/build.yml?style=flat-square&label=build" alt="Build status" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-proprietary--source--available-111714?style=flat-square" alt="Proprietary source-available license" /></a>
    <a href="https://gabewinstead.github.io/SpxtifyMediaVisuals/"><img src="https://img.shields.io/badge/showcase-live-1ed760?style=flat-square" alt="Project showcase" /></a>
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
| Follow along with time-synced lyrics fetched from LRCLIB. | Pulls artwork from iTunes and derives a rich accent color automatically. | Freely rearrange widgets, drag and resize elements, and save custom layouts. |

## What makes it feel good

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🎤 Three ways to experience a track</h3>
      <p>Use a focused lyric view, an album-first canvas, or combine both for the full now-playing experience.</p>
    </td>
    <td width="50%" valign="top">
      <h3>🎨 Themes that respond to the music</h3>
      <p>Fine-tune accent, background, and text colors with HSL controls, adjust glow on lyrics, opacity, blur, size, and more. Album art can provide the accent, or you can choose your own.</p>
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
  <tr>
    <td width="50%" valign="top">
      <h3>🧩 Moveable layouts & widgets</h3>
      <p>Drag any widget to reposition it, resize by the corners, add new widgets (cover art, lyrics, title & artist, clock, playback status, and more), then save your layout for next time.</p>
    </td>
    <td width="50%" valign="top">
      <h3>✨ Custom color, glow & opacity</h3>
      <p>Open the theme editor for precise HSL color control, glowing lyric effects, background blur, lyric size, and opacity adjustments — all live-previewed.</p>
    </td>
  </tr>
</table>

## See it in action

<div align="center">
  <img src="https://cdn.discordapp.com/attachments/1207855250657124393/1565186745203560508/preview.png?ex=6ae3fd3f&is=6ae2abbf&hm=9a5353a1d7e6747030cd724cb2b8a7c30e5b36db78ac633a971b2cbe6e5554af&" alt="Lyrics overlay preview" width="48%" />
  <img src="./src-tauri/icons/icon.png" alt="Spotify Lyrics Overlay app icon" width="18%" />
</div>

<br />

### Layout editor — move, resize & add widgets

Drag boxes to move them, pull corners to resize, add widgets from the toolbar, then save your custom arrangement.

<div align="center">
  <img src="https://cdn.discordapp.com/attachments/1207855250657124393/1565563455497576458/image.png?ex=6ae55c16&is=6ae40a96&hm=c29ff3a36c22e5c2efe846b9ee41265977e3af5067cf3ca72aaaa53d4445d1aa&" alt="Layout editor showing movable widgets, cover art, lyrics, and controls" width="860" />
</div>

<br />

### Theme editor — custom colors, glow & opacity

Dial in accent, background, and text colors with HSL sliders, control lyric glow intensity, background blur, lyric size, and opacity for a look that matches the music.

<div align="center">
  <img src="https://cdn.discordapp.com/attachments/1207855250657124393/1565563630986993797/image.png?ex=6ae55c40&is=6ae40ac0&hm=395e815b5a8642fc61c24bd0c881ca8ba177098b175fb7ac2c3fd5b6cbe64393&" alt="Theme editor with HSL color controls, glow, blur, and opacity settings" width="860" />
</div>

> **Tip:** Start with the combined view, then open the layout editor to rearrange widgets or the theme editor to experiment with accent, glow, opacity, and type controls. Themes and layouts are saved per-user and hot-reloaded.

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

Install dependencies with `npm install`, run `npm run tauri dev` while developing, and run `npm run build` before opening a pull request. Contributions require a separate written contributor license agreement or copyright assignment accepted by Gabe Winstead before they can be accepted. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for more detail.

## License

This project is **proprietary source-available software**, not open-source software. Personal, non-commercial use is allowed under the terms of the [`Proprietary Source-Available License`](./LICENSE). Commercial use, resale, redistribution, sublicensing, and claiming authorship are prohibited without prior written permission from Gabe Winstead. Approved public use must credit Gabe Winstead as the original creator.

See the complete [`LICENSE`](./LICENSE). This custom license should be reviewed by a qualified attorney before distribution.

<div align="center">
  <br />
  <sub>Built for people who like their music a little more visible.</sub>
</div>
