// The memory, searched by topic: does it find the right note, and does it never hand
// out what it must not?
//
// A home of its own (USERPROFILE/HOME pointed at a temporary folder, like data-check)
// with notes in every shape found on a real machine: the nested `metadata:`
// frontmatter of today, the flat one with `type:` on top, notes with no frontmatter at
// all, a sub-index, a block-scalar description, the `._*` the Mac leaves next to every
// file it copies, MEMORY.md, a broken link, and credentials that look real. Pure: the
// search module as it is, no editor, no CLI.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.dirname(__dirname);
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-memory-'));
process.env.HOME = home;
process.env.USERPROFILE = home;

const bundle = path.join(home, 'memory.cjs');
esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'memory', 'memory.ts')],
  bundle: true,
  outfile: bundle,
  platform: 'node',
  format: 'cjs',
  logLevel: 'warning',
});

// ---- the project, and its memory folder written with different capitals ----
const cwd = process.platform === 'win32' ? 'C:\\lavoro\\CRM' : '/lavoro/CRM';
const slug = cwd.replace(/[^a-zA-Z0-9]/g, '-');
const onDisk = slug.replace(/^C/, 'c').replace(/^-lavoro/, '-LAVORO'); // capitals that differ
const mem = path.join(home, '.claude', 'projects', onDisk, 'memory');
fs.mkdirSync(mem, { recursive: true });
const other = path.join(home, '.claude', 'projects', 'altro-progetto', 'memory');
fs.mkdirSync(other, { recursive: true });

const FAKE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLWZpbnRhLXBlci1pbC10ZXN0';
const FAKE_SBP = 'sbp_' + 'f'.repeat(40);
const FAKE_GH = 'ghp_' + 'A1b2C3d4'.repeat(5);
const FAKE_PW = 'Correct-Horse-Battery-9';

const write = (dir, name, text) => fs.writeFileSync(path.join(dir, name), text, 'utf8');
write(
  mem,
  'fuoricitta-stampanti-diagnosi-rete.md',
  `---
name: "Fuoricittà: perché non stampava"
description: "La stampante stava su una rete separata; ⚠️ un fix al motore senza bump VERSION non arriva"
metadata:
  node_type: memory
  type: project
  originSessionId: 58cfe5b6
  modified: 2026-09-22T10:00:00.000Z
---

Le stampanti della cucina erano su una VLAN diversa dal tablet.
⚠️ Prima di dare la colpa al Ponte, guarda la rete.

Vedi [[comanda-accodata-dal-server]] e [[non-esiste-piu]].
`
);
write(
  mem,
  'comanda-accodata-dal-server.md',
  `---
name: Comanda accodata dal server
description: dal 22/09 la carta parte nel PATCH send
metadata:
  type: project
  modified: 2026-09-22T18:00:00.000Z
---

La comanda si accoda lato server, poi il Ponte stampa.
`
);
write(
  mem,
  'credentials_supabase.md',
  `---
name: Supabase credentials
description: chiavi del progetto di prova
type: reference
originSessionId: 1234
---

## Supabase
- Service Role Key: \`${FAKE_JWT}\`
- Management API Token: \`${FAKE_SBP}\`
- GitHub token: ${FAKE_GH}
- password: ${FAKE_PW}

-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC
-----END PRIVATE KEY-----
`
);
write(mem, 'ios-builds.md', '# iOS Build via SSH\n\nIl Mac si raggiunge in SSH; la build di rilascio parte da li.\n');
write(mem, '_index_ristoranti.md', '# Ristoranti — sotto-indice\n\n- [Comanda](comanda-accodata-dal-server.md) — accodata dal server\n');
write(
  mem,
  'descrizione-a-blocco.md',
  `---
name: Una descrizione su piu' righe
description: >
  Il cassetto della cassa
  si apre solo col PIN
type: feedback
---

Testo.
`
);
// Not notes: the index the CLI loads, and the Mac's shadow files.
write(mem, 'MEMORY.md', '# Memory\n\n- [Stampanti](fuoricitta-stampanti-diagnosi-rete.md) — stampanti fuoricitta stampanti\n');
fs.writeFileSync(path.join(mem, '._fuoricitta-stampanti-diagnosi-rete.md'), Buffer.from('\u0000\u0005\u0016\u0007Mac OS X stampanti fuoricitta', 'utf8'));
fs.writeFileSync(path.join(mem, '._MEMORY.md'), Buffer.from('\u0000\u0005\u0016\u0007 stampanti', 'utf8'));
write(other, 'deploy-cloudflare.md', '---\nname: Deploy su Cloudflare\ndescription: il push su main pubblica il worker\ntype: project\n---\n\nPUSH = DEPLOY.\n');

const m = require(bundle);

let bad = 0;
const check = (name, ok, detail) => {
  if (ok) console.log('  ✓ ' + name);
  else {
    bad++;
    console.error('  ✗ ' + name + (detail ? ' — ' + String(detail).slice(0, 500) : ''));
  }
};

// ---- every shape of note ----
const found = m.findNotes(cwd, 'stampanti fuoricitta', 'project', 10);
const top = found[0];
check('«stampanti fuoricitta» finds the note written «Fuoricittà» and «stampante»', top && top.slug === 'fuoricitta-stampanti-diagnosi-rete', JSON.stringify(found.map((f) => f.slug)));
check('…with its name and type from the nested metadata', top && top.name === 'Fuoricittà: perché non stampava' && top.type === 'project', JSON.stringify(top));
check('…dated by metadata.modified, not by the file', top && m.day(top.date) === '22/09/2026', top && m.day(top.date));
check('…with its warnings counted', top && top.warnings === 2, top && top.warnings);
const slugs = found.map((f) => f.slug);
check('MEMORY.md is never a result', !slugs.some((s) => /^memory$/i.test(s)), slugs.join(', '));
check('the Mac ._ files are never a result', !slugs.some((s) => s.startsWith('._')), slugs.join(', '));

const flat = m.findNotes(cwd, 'supabase credentials', 'project', 3)[0];
check('a flat frontmatter (type: on top) is read', flat && flat.slug === 'credentials_supabase' && flat.type === 'reference', JSON.stringify(flat));
const bare = m.findNotes(cwd, 'build ios ssh', 'project', 3)[0];
check('a note with no frontmatter: the name is the file, the description its first line', bare && bare.name === 'ios-builds' && bare.description === 'iOS Build via SSH', JSON.stringify(bare));
const block = m.findNotes(cwd, 'cassetto cassa pin', 'project', 3)[0];
check('a block-scalar description is read whole', block && block.description === 'Il cassetto della cassa si apre solo col PIN', JSON.stringify(block));
check('a sub-index is a note like the others', m.findNotes(cwd, 'sotto-indice ristoranti', 'project', 3)[0]?.slug === '_index_ristoranti');

// ---- what the model reads ----
const out = m.searchMemory(cwd, 'stampanti fuoricitta');
check('the answer opens by saying notes are from the past', out.startsWith(m.PAST), out.slice(0, 120));
check('each note: slug — description (type · dd/mm/yyyy · N⚠️)', /1\. fuoricitta-stampanti-diagnosi-rete — La stampante stava su una rete separata; ⚠️ .* \(project · 22\/09\/2026 · 2⚠️\)/.test(out), out);
check('…the lines that matched', /> Le stampanti della cucina erano su una VLAN/.test(out), out);
check('…and the notes one step away, not the ones already listed', /see also: .*comanda-accodata-dal-server/.test(out) || slugsIn(out).includes('comanda-accodata-dal-server'), out);
check('…and the file, to open it', out.includes('file: ' + path.join(mem, 'fuoricitta-stampanti-diagnosi-rete.md')), out);
check('no MEMORY.md and no ._ in the answer', !/MEMORY\.md|\._fuori/.test(out.replace(/Read a whole note.*$/, '')), out);

// ---- secrets ----
const cred = m.readMemory(cwd, 'credentials_supabase');
const leaks = [FAKE_JWT, FAKE_SBP, FAKE_GH, FAKE_PW, 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC'].filter((s) => cred.includes(s));
check('reading a note with credentials: every secret hidden', leaks.length === 0, leaks.join(' | '));
check('…the lines stay, the values go', /Service Role Key: `\[hidden\]`/.test(cred) && /Management API Token: `\[hidden\]`/.test(cred) && /\[hidden key\]/.test(cred), cred);
const credSearch = m.searchMemory(cwd, 'service role key management token');
check('…in a search too', ![FAKE_JWT, FAKE_SBP].some((s) => credSearch.includes(s)), credSearch);

// ---- memory_read: the whole note, who cites it, what is broken ----
const read = m.readMemory(cwd, 'fuoricitta-stampanti-diagnosi-rete');
check('memory_read gives the whole note with its date', read.includes('Le stampanti della cucina') && read.includes('22/09/2026'), read);
check('…its broken links', /broken links: non-esiste-piu/.test(read), read);
const cited = m.readMemory(cwd, 'comanda-accodata-dal-server');
check('…and who cites it', /cited by: .*fuoricitta-stampanti-diagnosi-rete/.test(cited) && /_index_ristoranti/.test(cited), cited);
check('…found by capitals, by .md and by [[link]] too', m.readMemory(cwd, '[[IOS-BUILDS.md]]').includes('iOS Build via SSH'));
check('…and says so when there is no such note', /No note called/.test(m.readMemory(cwd, 'nessuna-nota')));

// ---- scope ----
check('scope project: only this project', !m.searchMemory(cwd, 'deploy cloudflare worker').includes('deploy-cloudflare'));
const all = m.searchMemory(cwd, 'deploy cloudflare worker', 'all');
check('scope all: every project, each with its folder', /deploy-cloudflare \[altro-progetto\]/.test(all), all);
check('…and a note of another project can be read', m.readMemory(cwd, 'deploy-cloudflare').includes('PUSH = DEPLOY'));

// ---- the automatic recall: only what really fits, and never the body ----
const rec = m.recall(cwd, 'perché le stampanti del Fuoricittà non stampano?');
check('recall finds the note that fits', rec.length >= 1 && rec[0].slug === 'fuoricitta-stampanti-diagnosi-rete', JSON.stringify(rec));
check('…even with the verb instead of the noun («stampava» → stampanti)', m.findNotes(cwd, 'stampava fuoricitta')[0]?.slug === 'fuoricitta-stampanti-diagnosi-rete');
check('…and not a note that has the words only deep in its body', m.recall(cwd, 'tablet cucina diversa').every((r) => r.slug !== 'fuoricitta-stampanti-diagnosi-rete'), JSON.stringify(m.recall(cwd, 'tablet cucina diversa')));
check('…at most three', rec.length <= 3);
check('…and nothing for a message about something else', m.recall(cwd, 'scrivimi una poesia sul mare').length === 0, JSON.stringify(m.recall(cwd, 'scrivimi una poesia sul mare')));
const ctxText = m.recallContext(rec);
check('…the context has name, description and date, never the body', ctxText.includes('fuoricitta-stampanti-diagnosi-rete') && ctxText.includes('22/09/2026') && !ctxText.includes('VLAN'), ctxText);

// ---- autoMemoryDirectory: the settings say where the memory is ----
{
  const proj = path.join(home, 'progetto-con-impostazioni');
  fs.mkdirSync(path.join(proj, '.claude'), { recursive: true });
  const custom = path.join(home, 'mia-memoria');
  fs.mkdirSync(custom);
  write(custom, 'nota-altrove.md', '---\nname: Nota altrove\ndescription: una memoria fuori posto\n---\n\nqui\n');
  fs.writeFileSync(path.join(proj, '.claude', 'settings.local.json'), JSON.stringify({ autoMemoryDirectory: '~/mia-memoria' }));
  check('autoMemoryDirectory in the local settings is followed (with ~)', m.searchMemory(proj, 'memoria fuori posto').includes('nota-altrove'));
  fs.writeFileSync(path.join(proj, '.claude', 'settings.local.json'), '{}');
  fs.writeFileSync(path.join(proj, '.claude', 'settings.json'), JSON.stringify({ autoMemoryDirectory: '~/mia-memoria' }));
  check('…but not from the checked-in project settings, as the CLI does', !m.searchMemory(proj, 'memoria fuori posto').includes('nota-altrove'));
}

// ---- a note that changes is read again, one that goes away is forgotten ----
write(mem, 'ios-builds.md', '# iOS Build via SSH\n\nAdesso si firma con un certificato nuovo di zecca.\n');
const later = new Date(Date.now() + 5000);
fs.utimesSync(path.join(mem, 'ios-builds.md'), later, later);
check('an edited note is read again', m.searchMemory(cwd, 'certificato zecca').includes('ios-builds'));
fs.rmSync(path.join(mem, 'ios-builds.md'));
check('a deleted note is gone from the results', !m.searchMemory(cwd, 'certificato zecca').includes('ios-builds'));

function slugsIn(text) {
  return [...text.matchAll(/^\d+\. (\S+)/gm)].map((x) => x[1]);
}

try {
  fs.rmSync(home, { recursive: true, force: true });
} catch {
  // a temporary folder: the system gets rid of it anyway
}
if (bad) {
  console.error(`\n${bad} case(s) wrong: the memory would miss a note, show one that is not a note, or hand out a secret.`);
  process.exit(1);
}
console.log('\nmemory-check ok — every shape of note read, accents and plurals found, dates and warnings shown, secrets hidden, scope and settings followed.');
