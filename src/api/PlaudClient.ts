import { requestUrl, RequestUrlResponse } from 'obsidian';
import type PlaudPlugin from '../../main';
import type { PlaudFile, PlaudFileDetail } from '../types';

const BASE_URLS: Record<string, string> = {
  us: 'https://api.plaud.ai',
  eu: 'https://api-euc1.plaud.ai',
};

export class PlaudClient {
  private plugin: PlaudPlugin;

  constructor(plugin: PlaudPlugin) {
    this.plugin = plugin;
  }

  private get baseUrl(): string {
    return BASE_URLS[this.plugin.settings.plaudRegion] ?? BASE_URLS['us'];
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.plugin.authManager.ensureToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * GET /file/simple/web — list all recordings.
   * Auto-corrects region on -302 mismatch.
   */
  async listRecordings(): Promise<PlaudFile[]> {
    const headers = await this.authHeaders();
    const response = await requestUrl({
      url: `${this.baseUrl}/file/simple/web`,
      method: 'GET',
      headers,
    });

    if (response.status !== 200) {
      throw new Error(`Plaud API error ${response.status}: ${response.text}`);
    }

    const data = response.json;

    // Handle region mismatch: { status: -302, data: { domains: { api } } }
    if (data?.status === -302 && data?.data?.domains?.api) {
      const correctDomain: string = data.data.domains.api;
      this.plugin.settings.plaudRegion = correctDomain.includes('euc1') ? 'eu' : 'us';
      await this.plugin.saveSettings();
      const retry = await requestUrl({
        url: `${this.baseUrl}/file/simple/web`,
        method: 'GET',
        headers,
      });
      return this.parseFileList(retry.json);
    }

    return this.parseFileList(data);
  }

  private parseFileList(data: any): PlaudFile[] {
    if (Array.isArray(data?.data_file_list)) return data.data_file_list;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  }

  /**
   * GET /file/detail/{id} — full recording detail including transcript.
   * Returns { data: { file_id, file_name, content_list, pre_download_content_list, ... } }
   */
  async getRecordingDetail(id: string): Promise<PlaudFileDetail> {
    const headers = await this.authHeaders();
    const response = await requestUrl({
      url: `${this.baseUrl}/file/detail/${id}`,
      method: 'GET',
      headers,
    });

    if (response.status !== 200) {
      throw new Error(`Plaud API detail error ${response.status}: ${response.text}`);
    }

    const raw = response.json?.data ?? response.json;

    // Extract transcript from pre_download_content_list
    let transcript = '';
    const preDownload: any[] = raw.pre_download_content_list ?? [];
    for (const item of preDownload) {
      const content = item.data_content ?? '';
      if (content.length > transcript.length) {
        transcript = content;
      }
    }

    return {
      ...raw,
      id: raw.file_id ?? id,
      filename: raw.file_name ?? raw.filename ?? id,
      transcript,
    } as PlaudFileDetail;
  }

  /**
   * GET /file/download/{id} — download raw audio binary.
   */
  async downloadAudioBuffer(id: string): Promise<ArrayBuffer> {
    const headers = await this.authHeaders();
    const response = await requestUrl({
      url: `${this.baseUrl}/file/download/${id}`,
      method: 'GET',
      headers,
    });

    if (response.status !== 200) {
      throw new Error(`Audio download failed: ${response.status}`);
    }

    return response.arrayBuffer;
  }

  /**
   * GET /file/temp-url/{id}?is_opus=false — get a temporary signed URL
   * for the MP3 (non-encrypted) version of a recording.
   * Returns null if no MP3 version is available.
   */
  async getMp3TempUrl(id: string): Promise<string | null> {
    const headers = await this.authHeaders();
    try {
      const response = await requestUrl({
        url: `${this.baseUrl}/file/temp-url/${id}?is_opus=false`,
        method: 'GET',
        headers,
      });
      if (response.status !== 200) return null;
      const data = response.json;
      // The response contains a signed URL — could be in data.url, data.data, or data.temp_url
      return data?.url ?? data?.data?.url ?? data?.data ?? data?.temp_url ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Trash a recording on Plaud servers.
   * Tries PATCH /file/{id} first, falls back to POST /file/trash.
   */
  async trashRecording(id: string): Promise<boolean> {
    const headers = await this.authHeaders();
    try {
      const res = await requestUrl({
        url: `${this.baseUrl}/file/${id}`,
        method: 'PATCH',
        headers,
        body: JSON.stringify({ is_trash: true }),
      });
      if (res.status >= 200 && res.status < 300) return true;
    } catch (e: any) {
      console.log('Plaud: PATCH trash failed, trying POST fallback', e.message);
    }

    try {
      const res = await requestUrl({
        url: `${this.baseUrl}/file/trash`,
        method: 'POST',
        headers,
        body: JSON.stringify({ file_ids: [id] }),
      });
      if (res.status >= 200 && res.status < 300) return true;
      console.warn('Plaud: POST /file/trash returned', res.status, res.text);
      return false;
    } catch (e: any) {
      console.error('Plaud: trashRecording failed for', id, e);
      return false;
    }
  }

  /**
   * Download a buffer from an arbitrary URL (e.g. a signed S3 temp URL).
   */
  async downloadFromUrl(url: string): Promise<ArrayBuffer> {
    const response = await requestUrl({ url, method: 'GET' });
    if (response.status !== 200) {
      throw new Error(`Download failed: ${response.status}`);
    }
    return response.arrayBuffer;
  }
}
