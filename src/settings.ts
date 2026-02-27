export interface PlaudSettings {
  authMethod: 'web-capture' | 'partner-api';
  bearerToken: string;
  tokenCapturedAt: string;          // ISO timestamp
  plaudRegion: 'us' | 'eu';         // api.plaud.ai vs api-euc1.plaud.ai
  pythonPath: string;               // e.g. '/usr/local/bin/python3'
  whisperModel: string;             // e.g. 'mlx-community/whisper-large-v3-mlx'
  whisperLanguage: string;          // 'auto' or ISO code
  audioFolder: string;              // vault path, e.g. 'Plaud/Audio'
  notesFolder: string;              // vault path, e.g. 'Plaud/Notes'
  syncIntervalMinutes: number;      // 15 | 30 | 60 | 240 | 0=manual
  noteTemplate: string;             // multiline template with {{variables}}
  syncedIds: string[];              // deduplication list
  partnerClientId: string;          // future: Partner API
  partnerSecretKey: string;         // future: Partner API
}

export const DEFAULT_SETTINGS: PlaudSettings = {
  authMethod: 'web-capture',
  bearerToken: '',
  tokenCapturedAt: '',
  plaudRegion: 'us',
  pythonPath: '/Users/tensor/Library/Python/3.9/bin/mlx_whisper',
  whisperModel: 'mlx-community/whisper-large-v3-mlx',
  whisperLanguage: 'auto',
  audioFolder: 'Plaud/Audio',
  notesFolder: 'Plaud/Notes',
  syncIntervalMinutes: 60,
  noteTemplate: `---
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
`,
  syncedIds: [],
  partnerClientId: '',
  partnerSecretKey: '',
};
