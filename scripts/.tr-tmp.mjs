import * as fs from 'node:fs';
const [, , file, mapFile] = process.argv;
const subs = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
let s = fs.readFileSync(file, 'utf8');
const missing = [];
const crlf = (x) => x.replace(/\n/g, '\r\n');
for (const [a, b] of subs) {
  if (s.includes(a)) { s = s.split(a).join(b); continue; }
  if (s.includes(crlf(a))) { s = s.split(crlf(a)).join(crlf(b)); continue; }
  missing.push(a.slice(0, 80));
}
fs.writeFileSync(file, s, 'utf8');
console.log(missing.length ? 'MISSING:\n  ' + missing.join('\n  ') : 'all applied');
