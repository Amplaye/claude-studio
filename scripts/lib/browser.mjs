// Browser persistente dedicato al publishing.
// Profilo separato da quello personale: il login Microsoft/GitHub viene fatto
// una volta e resta valido per le pubblicazioni successive.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const PROFILE_DIR = path.join(os.homedir(), '.claude-studio-publish-profile');
export const CDP_PORT = 9333;

// Windows e macOS: su un Mac i percorsi 'C:/...' non esistono e `existsSync` diceva
// sempre di no, quindi pubblicare dal Mac finiva su "Nessun browser Chromium trovato".
const BROWSERS = [
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const cdpUp = async () => {
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
};

export async function ensureBrowser({ startUrl = 'about:blank' } = {}) {
  if (!(await cdpUp())) {
    const exe = BROWSERS.find(existsSync);
    if (!exe) throw new Error('Nessun browser Chromium trovato');
    mkdirSync(PROFILE_DIR, { recursive: true });
    console.log(`  avvio ${path.basename(exe)} (profilo publishing)`);
    spawn(exe, [
      `--user-data-dir=${PROFILE_DIR}`,
      `--remote-debugging-port=${CDP_PORT}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate',
      startUrl,
    ], { detached: true, stdio: 'ignore' }).unref();

    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await cdpUp()) break;
    }
    if (!(await cdpUp())) throw new Error(`CDP non raggiungibile sulla porta ${CDP_PORT}`);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  return browser;
}

export async function getPage(browser, urlMatch) {
  const pages = browser
    .contexts()
    .flatMap((c) => c.pages())
    .filter((p) => !p.url().startsWith('devtools://'));
  return urlMatch ? pages.find((p) => p.url().includes(urlMatch)) : pages[0];
}

/** Apre/riusa una tab sull'URL indicato e aspetta che sia caricata. */
export async function openTab(browser, url, { match } = {}) {
  const ctx = browser.contexts()[0];
  let page = (await getPage(browser, match ?? new URL(url).hostname)) || (await ctx.newPage());
  if (!page.url().includes(match ?? new URL(url).hostname)) {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  }
  await page.bringToFront();
  await page.waitForTimeout(2000);
  return page;
}
