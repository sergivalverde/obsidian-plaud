# Obsidian Plaud Pin Sync

> **Alpha version** — This plugin is in early development and may not work for everybody. Expect rough edges, breaking changes, and the occasional surprise. Issues and feedback welcome!

An Obsidian plugin that syncs audio recordings from your [Plaud Pin](https://www.plaud.ai/) device, transcribes them locally with [mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper), and creates structured markdown notes with transcripts and timestamps.

## Features

- **Automatic sync** — Fetches new recordings from the Plaud API on a configurable interval (or manually)
- **Server-side transcripts** — Uses Plaud's own transcription when available
- **Local Whisper transcription** — Falls back to mlx-whisper for fast, private, on-device transcription (Apple Silicon)
- **MP3 auto-download** — Always fetches the playable MP3 version when the original is encrypted `.opus`
- **Smart note naming** — Notes are automatically renamed based on the first words of the transcript (`date_context.md`)
- **Sidebar recordings view** — Browse all synced recordings with sort (newest/oldest) and filter (all/transcribed/pending)
- **Re-transcribe** — Re-transcribe any recording from the sidebar or via command palette (`Plaud: Re-transcribe current note`)
- **Delete recordings** — Remove recordings locally (note + audio) with option to trash on Plaud servers
- **Bulk cleanup** — Delete all local recordings at once
- **Customizable note template** — Use `{{variables}}` for flexible note formatting
- **Region auto-detection** — Automatically corrects US/EU API endpoint mismatches

## Requirements

- **Obsidian** 1.4.0+
- **macOS** (desktop only — uses mlx-whisper which requires Apple Silicon)
- **mlx-whisper** installed for local transcription:
  ```bash
  pip install mlx-whisper
  ```
- A **Plaud Pin** device with recordings synced to the Plaud cloud

## Installation

### Manual installation

1. Clone or download this repository
2. Copy the folder to your vault's plugins directory:
   ```
   <your-vault>/.obsidian/plugins/obsidian-plaud/
   ```
3. Install dependencies and build:
   ```bash
   cd <your-vault>/.obsidian/plugins/obsidian-plaud
   npm install
   npm run build
   ```
4. Enable the plugin in Obsidian Settings > Community Plugins

## Setup

### Authentication

The plugin uses a bearer token captured from the Plaud web app:

1. Open the plugin settings in Obsidian
2. Click **Capture token from Plaud web app**
3. Log in to your Plaud account in the popup window
4. The token is captured automatically

Tokens auto-refresh every 23 hours. If a refresh fails, you'll be prompted to re-authenticate.

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Region | US | `us` or `eu` — auto-corrected on first sync |
| Audio folder | `Plaud/Audio` | Vault folder for downloaded audio files |
| Notes folder | `Plaud/Notes` | Vault folder for generated notes |
| Sync interval | 60 min | Auto-sync interval (0 = manual only) |
| Python path | `mlx_whisper` | Path to the mlx_whisper executable |
| Whisper model | `mlx-community/whisper-large-v3-mlx` | Hugging Face model ID |
| Language | `auto` | Language code or `auto` for detection |
| Note template | (built-in) | Customizable with `{{id}}`, `{{title}}`, `{{date}}`, `{{time}}`, `{{duration}}`, `{{transcript}}`, `{{timestamps}}`, `{{audio_path}}` |

## Usage

### Sync recordings

- Click the **mic** icon in the ribbon to open the sidebar
- Click the **refresh** icon to sync new recordings
- Or use the command palette: `Plaud: Sync Plaud recordings`

### Browse recordings

The sidebar shows all synced recordings with:
- **Sort toggle** — click "Newest" / "Oldest" to change order
- **Filter pills** — `All` | `Transcribed` | `Pending`
- **Hover actions** — re-transcribe (languages icon) and delete (trash icon) per recording
- Click any recording to open its note

### Re-transcribe

Two ways to re-transcribe a recording:
1. **Sidebar** — hover a recording and click the languages icon
2. **Command palette** — open a Plaud note and run `Plaud: Re-transcribe current note`

This fetches a fresh transcript from Plaud's server (or runs Whisper locally) and replaces the Transcript and Timestamps sections in the note.

### Delete recordings

- **Single** — hover a recording in the sidebar and click the trash icon
- **Bulk** — click the trash icon in the sidebar header to delete all

Both options offer a toggle to also trash the recording on Plaud's servers (enabled by default).

## Commands

| Command | Description |
|---------|-------------|
| `Plaud: Sync Plaud recordings` | Fetch and process new recordings |
| `Plaud: Open Plaud recordings sidebar` | Show the recordings panel |
| `Plaud: Re-transcribe current note` | Re-transcribe the active Plaud note |
| `Plaud: Retranscribe pending recordings` | Batch re-transcribe all pending notes |
| `Plaud: Re-authenticate with Plaud` | Refresh the API token |

## Note template

The default template creates notes with frontmatter metadata, a transcript section, and timestamped segments:

```markdown
---
plaud_id: {{id}}
title: "{{title}}"
date: {{date}}
time: {{time}}
duration: "{{duration}}"
source: plaud_pin
audio: "[[{{audio_path}}]]"
tags: [voice-note, transcription]
---

# {{title}}

## Transcript

{{transcript}}

## Timestamps

{{timestamps}}
```

You can customize this in the plugin settings.

## Architecture

```
src/
  api/PlaudClient.ts      — Plaud REST API client (list, detail, download, trash)
  auth/AuthManager.ts      — Token lifecycle and auto-refresh
  auth/PlaudAuthFlow.ts    — Web-capture authentication flow
  notes/NoteFactory.ts     — Template-based note creation
  sync/SyncManager.ts      — Sync orchestration, transcription, delete
  ui/RecordingsView.ts     — Sidebar view with sort, filter, actions
  ui/SettingsTab.ts        — Plugin settings UI
  whisper/WhisperBridge.ts — Local mlx-whisper transcription bridge
  types.ts                 — TypeScript interfaces
  settings.ts              — Settings schema and defaults
main.ts                    — Plugin entry point
styles.css                 — UI styles
```

## License

MIT
