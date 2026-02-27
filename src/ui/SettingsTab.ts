import { App, PluginSettingTab, Setting, Notice, Modal } from 'obsidian';
import type PlaudPlugin from '../../main';

const WHISPER_LANGUAGES: Record<string, string> = {
  auto: 'Auto-detect',
  en: 'English',
  zh: 'Chinese',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  ja: 'Japanese',
  ko: 'Korean',
  pt: 'Portuguese',
  ru: 'Russian',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  uk: 'Ukrainian',
  ar: 'Arabic',
  hi: 'Hindi',
};

export class SettingsTab extends PluginSettingTab {
  plugin: PlaudPlugin;

  constructor(app: App, plugin: PlaudPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Authentication ──────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Authentication' });

    new Setting(containerEl)
      .setName('Plaud region')
      .setDesc('Select the API region for your Plaud account.')
      .addDropdown(drop => drop
        .addOption('us', 'US (api.plaud.ai)')
        .addOption('eu', 'EU (api-euc1.plaud.ai)')
        .setValue(this.plugin.settings.plaudRegion)
        .onChange(async value => {
          this.plugin.settings.plaudRegion = value as 'us' | 'eu';
          await this.plugin.saveSettings();
        }),
      );

    // Token status banner
    const tokenStatus = containerEl.createDiv('plaud-token-status');
    if (this.plugin.settings.bearerToken) {
      tokenStatus.createEl('span', {
        text: `✓ Token stored — captured ${this.plugin.authManager.tokenAge()}`,
        cls: 'plaud-token-ok',
      });
    } else {
      tokenStatus.createEl('span', {
        text: '✗ No token stored — follow the steps below to authenticate.',
        cls: 'plaud-token-missing',
      });
    }

    new Setting(containerEl)
      .setName('Re-authenticate (embedded window)')
      .setDesc('Try to capture the token automatically. May not complete if Google login is blocked.')
      .addButton(btn => btn
        .setButtonText('Open Login Window')
        .onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText('Waiting…');
          try {
            await this.plugin.authManager.reauthenticate();
            new Notice('Plaud: token captured!');
            this.display();
          } catch (err: any) {
            // Don't show error — user likely closed it intentionally
          } finally {
            btn.setDisabled(false);
            btn.setButtonText('Open Login Window');
          }
        }),
      );

    // ── Manual token extraction (primary reliable method) ─────────────────
    containerEl.createEl('h3', { text: 'Manual token extraction' });

    const steps = containerEl.createDiv('plaud-manual-steps');
    steps.createEl('p', {
      text: 'If the login window gets stuck, use this one-time browser method:',
    });
    const ol = steps.createEl('ol');
    ol.createEl('li', { text: 'Open web.plaud.ai in your browser and log in.' });
    ol.createEl('li', { text: 'Open the browser DevTools console: Cmd+Option+J (Mac) or F12 → Console.' });
    const li3 = ol.createEl('li');
    li3.appendText('Paste this command and press Enter (it patches fetch to intercept the real API token):');

    const codeWrap = steps.createDiv('plaud-code-wrap');
    // Intercepts the actual fetch() call to api.plaud.ai and copies
    // the real Bearer token — localStorage only has an identity JWT, not the API token.
    const consoleCmd =
      `(()=>{const f=window.fetch;window.fetch=function(u,o){` +
      `if(String(u).includes('plaud.ai')){` +
      `const a=(o?.headers?.Authorization||o?.headers?.authorization);` +
      `if(a?.startsWith('Bearer ')){copy(a.slice(7));` +
      `console.log('\\u2713 Token copied to clipboard — paste it in Obsidian now')}}` +
      `return f.apply(this,arguments)}})()` +
      `; console.log('Interceptor active — now refresh this page (Cmd+R)')`;
    const codeEl = codeWrap.createEl('code', { text: consoleCmd });
    codeEl.style.fontSize = '11px';
    codeEl.style.wordBreak = 'break-all';
    codeEl.style.display = 'block';
    codeEl.style.padding = '6px';
    codeEl.style.background = 'var(--background-primary)';
    codeEl.style.borderRadius = '4px';
    codeEl.style.userSelect = 'all';

    const copyBtn = steps.createEl('button', { text: 'Copy command', cls: 'mod-cta' });
    copyBtn.style.marginTop = '6px';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(consoleCmd);
      copyBtn.setText('Copied!');
      setTimeout(() => copyBtn.setText('Copy command'), 2000);
    });

    ol.createEl('li', { text: 'Refresh the page (Cmd+R). When it loads you\'ll see "✓ Token copied to clipboard" in the console.' });
    ol.createEl('li', { text: 'Paste the token below and click Save & verify.' });

    new Setting(containerEl)
      .setName('Bearer token')
      .setDesc('Paste the token copied from the browser console.')
      .addTextArea(text => {
        text
          .setPlaceholder('eyJ…')
          .setValue(this.plugin.settings.bearerToken)
          .onChange(async value => {
            const trimmed = value.trim();
            this.plugin.settings.bearerToken = trimmed;
            if (trimmed) this.plugin.settings.tokenCapturedAt = new Date().toISOString();
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 3;
        text.inputEl.style.width = '100%';
        text.inputEl.style.fontSize = '11px';
        text.inputEl.style.fontFamily = 'monospace';
        return text;
      })
      .addButton(btn => btn
        .setButtonText('Save & verify')
        .setCta()
        .onClick(async () => {
          const token = this.plugin.settings.bearerToken;
          if (!token) { new Notice('Paste a token first.'); return; }
          btn.setDisabled(true);
          btn.setButtonText('Verifying…');
          try {
            const recordings = await this.plugin.plaudClient.listRecordings();
            new Notice(`✓ Token valid — ${recordings.length} recording(s) found.`);
            this.display();
          } catch (err: any) {
            new Notice(`Token invalid: ${err.message}`);
          } finally {
            btn.setDisabled(false);
            btn.setButtonText('Save & verify');
          }
        }),
      );

    // ── Transcription ────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Transcription' });

    new Setting(containerEl)
      .setName('mlx_whisper path')
      .setDesc('Absolute path to the mlx_whisper CLI binary.')
      .addText(text => text
        .setPlaceholder('/Users/tensor/Library/Python/3.9/bin/mlx_whisper')
        .setValue(this.plugin.settings.pythonPath)
        .onChange(async value => {
          this.plugin.settings.pythonPath = value.trim();
          await this.plugin.saveSettings();
        }),
      )
      .addButton(btn => btn
        .setButtonText('Check')
        .onClick(async () => {
          btn.setDisabled(true);
          const err = await this.plugin.whisperBridge.checkInstallation(
            this.plugin.settings.pythonPath,
          );
          btn.setDisabled(false);
          if (err) {
            new Notice(`mlx_whisper check failed:\n${err}`, 8000);
          } else {
            new Notice('mlx_whisper is installed and working!');
          }
        }),
      );

    new Setting(containerEl)
      .setName('Whisper model')
      .setDesc('HuggingFace model ID for mlx_whisper. Requires an Apple Silicon Mac.')
      .addText(text => text
        .setPlaceholder('mlx-community/whisper-large-v3-mlx')
        .setValue(this.plugin.settings.whisperModel)
        .onChange(async value => {
          this.plugin.settings.whisperModel = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Language')
      .setDesc('Transcription language. Auto-detect is recommended.')
      .addDropdown(drop => {
        for (const [code, label] of Object.entries(WHISPER_LANGUAGES)) {
          drop.addOption(code, label);
        }
        drop
          .setValue(this.plugin.settings.whisperLanguage)
          .onChange(async value => {
            this.plugin.settings.whisperLanguage = value;
            await this.plugin.saveSettings();
          });
        return drop;
      });

    // ── Storage ──────────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Storage' });

    new Setting(containerEl)
      .setName('Audio folder')
      .setDesc('Vault path where downloaded MP3 files are saved.')
      .addText(text => text
        .setPlaceholder('Plaud/Audio')
        .setValue(this.plugin.settings.audioFolder)
        .onChange(async value => {
          this.plugin.settings.audioFolder = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Notes folder')
      .setDesc('Vault path where transcription notes are created.')
      .addText(text => text
        .setPlaceholder('Plaud/Notes')
        .setValue(this.plugin.settings.notesFolder)
        .onChange(async value => {
          this.plugin.settings.notesFolder = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    // ── Sync ─────────────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Sync' });

    new Setting(containerEl)
      .setName('Auto-sync interval')
      .setDesc('How often to check for new recordings. Set to Manual to disable auto-sync.')
      .addDropdown(drop => drop
        .addOption('0', 'Manual only')
        .addOption('15', 'Every 15 minutes')
        .addOption('30', 'Every 30 minutes')
        .addOption('60', 'Every hour')
        .addOption('240', 'Every 4 hours')
        .setValue(String(this.plugin.settings.syncIntervalMinutes))
        .onChange(async value => {
          this.plugin.settings.syncIntervalMinutes = Number(value);
          await this.plugin.saveSettings();
          this.plugin.syncManager.restart();
        }),
      );

    new Setting(containerEl)
      .setName('Sync now')
      .setDesc('Manually trigger a sync of new recordings.')
      .addButton(btn => btn
        .setButtonText('Sync Now')
        .setCta()
        .onClick(() => {
          this.plugin.syncManager.syncNow();
        }),
      );

    new Setting(containerEl)
      .setName('Clear sync history')
      .setDesc('Remove all synced IDs so all recordings will be re-downloaded on next sync.')
      .addButton(btn => btn
        .setButtonText('Clear')
        .setWarning()
        .onClick(async () => {
          this.plugin.settings.syncedIds = [];
          await this.plugin.saveSettings();
          new Notice('Plaud: sync history cleared.');
        }),
      );

    // ── Note Template ────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Note Template' });
    containerEl.createEl('p', {
      text: 'Available variables: {{id}}, {{title}}, {{date}}, {{time}}, {{duration}}, {{audio_path}}, {{transcript}}, {{timestamps}}',
      cls: 'setting-item-description',
    });

    const templateSetting = new Setting(containerEl)
      .setName('Template')
      .setDesc('Markdown template for generated notes.');
    templateSetting.settingEl.style.display = 'block';

    const textarea = templateSetting.controlEl.createEl('textarea');
    textarea.rows = 20;
    textarea.style.width = '100%';
    textarea.style.fontFamily = 'monospace';
    textarea.style.fontSize = '12px';
    textarea.value = this.plugin.settings.noteTemplate;
    textarea.addEventListener('change', async () => {
      this.plugin.settings.noteTemplate = textarea.value;
      await this.plugin.saveSettings();
    });

    // ── Advanced (Partner API — coming soon) ─────────────────────────────────
    containerEl.createEl('h2', { text: 'Advanced' });

    const partnerDesc = containerEl.createEl('p', {
      text: 'Partner API credentials — coming soon. These fields are reserved for future use when Plaud releases an official Partner API.',
      cls: 'setting-item-description',
    });
    partnerDesc.style.opacity = '0.6';

    const clientIdSetting = new Setting(containerEl)
      .setName('Partner Client ID')
      .addText(text => text
        .setPlaceholder('(coming soon)')
        .setValue(this.plugin.settings.partnerClientId)
        .setDisabled(true),
      );
    clientIdSetting.settingEl.style.opacity = '0.5';

    const secretSetting = new Setting(containerEl)
      .setName('Partner Secret Key')
      .addText(text => text
        .setPlaceholder('(coming soon)')
        .setValue(this.plugin.settings.partnerSecretKey)
        .setDisabled(true),
      );
    secretSetting.settingEl.style.opacity = '0.5';
  }
}
