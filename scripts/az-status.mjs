import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
const p = b
  .contexts()
  .flatMap((c) => c.pages())
  .find((x) => x.url().includes('marketplace.visualstudio.com/manage'));
await p.reload({ waitUntil: 'load', timeout: 60000 }).catch(() => {});
await p.waitForTimeout(6000);
const txt = (await p.locator('body').innerText()).replace(/\s+/g, ' ');
const m = txt.match(/Claude Studio\s*(.*?)\s*(?:Contact us|$)/);
console.log('RIGA ESTENSIONE: ' + (m ? m[1].slice(0, 200) : 'non trovata'));
console.log('STATO: ' + ((txt.match(/Verifying|Verification failed|Approved|Published|Error/i) || ['?'])[0]));
await b.close();
