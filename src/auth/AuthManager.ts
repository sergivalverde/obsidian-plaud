import { Notice } from 'obsidian';
import type PlaudPlugin from '../../main';
import { captureToken, openManualTokenFallback } from './PlaudAuthFlow';

const TOKEN_MAX_AGE_MS = 23 * 60 * 60 * 1000; // 23 hours

/**
 * IAuthProvider — stub interface for future Partner API OAuth swap-in.
 * Currently only WebCaptureProvider is implemented.
 */
export interface IAuthProvider {
  getToken(): Promise<string>;
  refresh(): Promise<string>;
}

export class WebCaptureProvider implements IAuthProvider {
  constructor(private plugin: PlaudPlugin) {}

  async getToken(): Promise<string> {
    const { bearerToken } = this.plugin.settings;
    if (!bearerToken) throw new Error('No bearer token stored. Please authenticate.');
    return bearerToken;
  }

  async refresh(): Promise<string> {
    const token = await captureToken();
    this.plugin.settings.bearerToken = token;
    this.plugin.settings.tokenCapturedAt = new Date().toISOString();
    await this.plugin.saveSettings();
    new Notice('Plaud: token refreshed successfully.');
    return token;
  }
}

export class AuthManager {
  private provider: IAuthProvider;
  private refreshIntervalId: number | null = null;

  constructor(private plugin: PlaudPlugin) {
    this.provider = new WebCaptureProvider(plugin);
  }

  /**
   * Returns stored token, refreshing silently if it is stale (>23h old).
   * If refresh fails, throws so callers can surface the error.
   */
  async ensureToken(): Promise<string> {
    const { bearerToken, tokenCapturedAt } = this.plugin.settings;

    const isStale = !tokenCapturedAt ||
      Date.now() - new Date(tokenCapturedAt).getTime() > TOKEN_MAX_AGE_MS;

    if (!bearerToken || isStale) {
      try {
        return await this.provider.refresh();
      } catch (err) {
        if (!bearerToken) {
          openManualTokenFallback();
          throw new Error('Authentication required. Please add your token in settings.');
        }
        // Token stale but we still have one — log warning, use existing
        console.warn('Plaud: token refresh failed, using existing token.', err);
        new Notice('Plaud: could not refresh token automatically. Using cached token.');
        return bearerToken;
      }
    }

    return bearerToken;
  }

  /** Returns the stored token without any refresh check. Throws if missing. */
  getToken(): string {
    const { bearerToken } = this.plugin.settings;
    if (!bearerToken) throw new Error('No bearer token. Please authenticate in settings.');
    return bearerToken;
  }

  /** Trigger interactive re-auth (e.g. from settings button). */
  async reauthenticate(): Promise<void> {
    try {
      await this.provider.refresh();
    } catch (err) {
      openManualTokenFallback();
      throw err;
    }
  }

  /** Schedule a background token refresh every 23 hours. */
  scheduleRefresh(): void {
    if (this.refreshIntervalId !== null) return;
    this.refreshIntervalId = window.setInterval(async () => {
      const { bearerToken, tokenCapturedAt } = this.plugin.settings;
      if (!bearerToken) return;
      const isStale = !tokenCapturedAt ||
        Date.now() - new Date(tokenCapturedAt).getTime() > TOKEN_MAX_AGE_MS;
      if (isStale) {
        try {
          await this.provider.refresh();
        } catch (_) {
          // Silent failure for background refresh — user will see error on next sync
        }
      }
    }, TOKEN_MAX_AGE_MS);
  }

  stopRefresh(): void {
    if (this.refreshIntervalId !== null) {
      window.clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
  }

  /** How old is the current token in human-readable form. */
  tokenAge(): string {
    const { tokenCapturedAt } = this.plugin.settings;
    if (!tokenCapturedAt) return 'never';
    const ms = Date.now() - new Date(tokenCapturedAt).getTime();
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    return `${hours}h ${minutes}m ago`;
  }
}
