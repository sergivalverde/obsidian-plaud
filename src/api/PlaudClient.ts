import { requestUrl } from 'obsidian';
import { PlaudAuth, PlaudClient as CoreClient, PlaudConfig } from '@plaud/core';
import type { PlaudRecording, PlaudRecordingDetail } from '@plaud/core';
import type PlaudPlugin from '../../main';

/**
 * Thin wrapper around @plaud/core's PlaudClient, adapted for Obsidian.
 * Delegates API calls to the core library and adds Obsidian-specific
 * methods (downloadFromUrl, trashRecording).
 */
export class PlaudClient {
  private plugin: PlaudPlugin;
  private core: CoreClient;
  private auth: PlaudAuth;

  constructor(plugin: PlaudPlugin) {
    this.plugin = plugin;
    const config = new PlaudConfig();
    this.auth = new PlaudAuth(config);
    this.core = new CoreClient(this.auth, plugin.settings.plaudRegion);
  }

  async listRecordings(): Promise<PlaudRecording[]> {
    return this.core.listRecordings();
  }

  async getRecordingDetail(id: string): Promise<PlaudRecordingDetail> {
    return this.core.getRecording(id);
  }

  async downloadAudioBuffer(id: string): Promise<ArrayBuffer> {
    return this.core.downloadAudio(id);
  }

  async getMp3TempUrl(id: string): Promise<string | null> {
    return this.core.getMp3Url(id);
  }

  /** Ensure we have a valid token (delegates to @plaud/core auto-refresh). */
  async ensureToken(): Promise<string> {
    return this.auth.getToken();
  }

  /** Check if credentials are configured in ~/.plaud/config.json. */
  hasCredentials(): boolean {
    const config = new PlaudConfig();
    return !!config.getCredentials();
  }

  /**
   * Download a buffer from an arbitrary URL (e.g. a signed S3 temp URL).
   * Uses Obsidian's requestUrl for compatibility.
   */
  async downloadFromUrl(url: string): Promise<ArrayBuffer> {
    const response = await requestUrl({ url, method: 'GET' });
    if (response.status !== 200) {
      throw new Error(`Download failed: ${response.status}`);
    }
    return response.arrayBuffer;
  }

  /**
   * Trash a recording on Plaud servers.
   * Not in @plaud/core — uses Obsidian's requestUrl directly.
   */
  async trashRecording(id: string): Promise<boolean> {
    const token = await this.auth.getToken();
    const baseUrl = this.plugin.settings.plaudRegion === 'eu'
      ? 'https://api-euc1.plaud.ai'
      : 'https://api.plaud.ai';
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    try {
      const res = await requestUrl({
        url: `${baseUrl}/file/${id}`,
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
        url: `${baseUrl}/file/trash`,
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
}
