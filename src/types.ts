export interface PlaudFile {
  id: string;
  filename: string;             // title from API
  fullname: string;             // e.g. "abc123.opus"
  filesize: number;             // bytes
  filetype: string;
  file_md5: string;
  duration: number;             // milliseconds from API
  start_time: number;           // epoch ms
  end_time: number;             // epoch ms
  edit_time: number;            // epoch seconds
  edit_from: string;            // 'ios', 'ai', etc
  version: number;
  version_ms: number;
  timezone: number;
  scene: number;
  serial_number: string;
  is_trash: boolean;
  is_trans: boolean;            // has transcription
  is_summary: boolean;          // has summary
  is_markmemo: boolean;
  wait_pull: number;
  filetag_id_list: string[];
  keywords: string[];
  ori_ready: boolean;
}

export interface PlaudFileDetail extends PlaudFile {
  audioUrl?: string;            // download URL (may need separate endpoint)
  ori_url?: string;             // original audio URL
  mp3_url?: string;             // MP3 version URL
  transcript?: string;
  summary?: string;
}

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments: WhisperSegment[];
  language?: string;
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'downloading' | 'transcribing' | 'error';
  message?: string;
  recordingId?: string;
  progress?: number;
}
