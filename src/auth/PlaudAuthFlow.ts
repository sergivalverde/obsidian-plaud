import { Notice } from 'obsidian';

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/122.0.0.0 Safari/537.36';

/**
 * Capture a bearer token by opening an Electron BrowserWindow for web.plaud.ai.
 *
 * Three independent capture strategies (whichever fires first wins):
 *
 * 1. localStorage scan on load — if the user already has a cached Plaud session
 *    in the persistent partition, the token is in storage and we resolve
 *    immediately without any OAuth interaction needed.
 *
 * 2. webRequest interception — catches the Bearer token from any outgoing
 *    request to api.plaud.ai from the main window or any child window.
 *
 * 3. localStorage scan on navigate — after any navigation back to web.plaud.ai
 *    (e.g. post-OAuth redirect), re-scans storage for the freshly stored token.
 *
 * Google OAuth fixes:
 * - Chrome UA spoof on session (prevents gsi/transform blank-page block)
 * - FedCM disabled via injected JS (forces popup fallback so button click works)
 * - Google popups forced into same persist:plaud-auth partition (same session/cookies)
 */
export async function captureToken(): Promise<string> {
  const remote = getElectronRemote();
  if (!remote?.BrowserWindow) {
    throw new Error('Electron remote not available');
  }

  return new Promise((resolve, reject) => {
    const win = new remote.BrowserWindow({
      width: 1000,
      height: 700,
      title: 'Plaud — Log in to capture token',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:plaud-auth',
      },
    });

    win.webContents.session.setUserAgent(CHROME_UA);

    let resolved = false;
    const resolveWith = (token: string) => {
      if (resolved) return;
      resolved = true;
      resolve(token);
      setTimeout(() => { try { win.close(); } catch (_) {} }, 400);
    };

    // ── Strategy 1 & 3: localStorage / sessionStorage scan ───────────────
    const scanStorage = () => {
      win.webContents.executeJavaScript(`
        (() => {
          const isJWT = v =>
            typeof v === 'string' &&
            /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v.trim());
          for (const store of [localStorage, sessionStorage]) {
            try {
              for (const key of Object.keys(store)) {
                const raw = store.getItem(key);
                if (!raw) continue;
                if (isJWT(raw)) return raw.trim();
                try {
                  const p = JSON.parse(raw);
                  for (const f of ['access_token','token','accessToken','id_token','jwt']) {
                    if (p && isJWT(p[f])) return p[f].trim();
                  }
                } catch(_) {}
              }
            } catch(_) {}
          }
          return null;
        })()
      `).then((token: string | null) => {
        if (token) resolveWith(token);
      }).catch(() => {});
    };

    // Scan on first load (already-logged-in fast path)
    win.webContents.on('did-finish-load', scanStorage);

    // Re-scan after any navigation back to web.plaud.ai (post-OAuth redirect)
    win.webContents.on('did-navigate', (_: any, url: string) => {
      if (url.includes('web.plaud.ai')) scanStorage();
    });
    win.webContents.on('did-navigate-in-page', (_: any, url: string) => {
      if (url.includes('web.plaud.ai')) scanStorage();
    });

    // ── Strategy 2: outgoing API request interception ─────────────────────
    win.webContents.session.webRequest.onBeforeSendHeaders(
      { urls: ['*://api.plaud.ai/*', '*://api-euc1.plaud.ai/*'] },
      (details: any, callback: (arg: any) => void) => {
        const auth: string | undefined = details.requestHeaders['Authorization'];
        if (auth?.startsWith('Bearer ')) resolveWith(auth.slice(7));
        callback({ requestHeaders: details.requestHeaders });
      }
    );

    // ── Google OAuth fixes ────────────────────────────────────────────────

    // Injected on every page load:
    // (a) Disable FedCM so the Google button click actually opens the popup
    //     instead of silently doing nothing (Electron has no FedCM UI).
    // (b) Clear navigator.webdriver to avoid Google bot detection.
    const injectScript = `
      (function() {
        try {
          const _get = navigator.credentials.get.bind(navigator.credentials);
          navigator.credentials.get = function(opts) {
            if (opts && opts.identity) {
              return Promise.reject(new DOMException('FedCM not available', 'NetworkError'));
            }
            return _get(opts);
          };
        } catch(_) {}
        try {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        } catch(_) {}
      })();
    `;
    win.webContents.on('did-finish-load', () => {
      win.webContents.executeJavaScript(injectScript).catch(() => {});
    });

    // Force Google OAuth popups (gsi/select etc.) into the same session so they
    // have access to the user's Google cookies. Apply Chrome UA to child windows.
    win.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: 'persist:plaud-auth',
        },
      },
    }));

    win.webContents.on('did-create-window', (childWin: any) => {
      childWin.webContents.session.setUserAgent(CHROME_UA);
    });

    win.on('closed', () => {
      if (!resolved) reject(new Error('Auth window closed without completing login'));
    });

    win.loadURL('https://web.plaud.ai').catch(reject);
  });
}

export function openManualTokenFallback(): void {
  // Don't auto-open the browser — that confused users into thinking auth succeeded.
  // The settings tab now has a prominent manual extraction section with instructions.
  new Notice(
    'Plaud: embedded login closed.\n' +
    'Use Settings → Authentication → Manual token extraction to get your token.',
    6000
  );
}

function getElectronRemote(): any {
  try {
    const electronRemote = (window as any).electron?.remote;
    if (electronRemote) return electronRemote;
    return require('@electron/remote');
  } catch (_) {
    return null;
  }
}
