// I checkpoint: com'era il codice prima che Claude lo toccasse.
//
// Sono l'unica cosa in tutta l'estensione che *riscrive* dei file tuoi, quindi sono
// l'unica che non puo' permettersi di sbagliare bersaglio. La domanda a cui questo
// controllo risponde e' una sola, ed e' quella che rendeva pericolosa la freccia
// disegnata accanto ai messaggi: tornare a un punto butta via quelli dopo, e i
// messaggi seguenti ne aprono di nuovi. Se un punto fosse la sua *posizione*
// nell'elenco, quelle posizioni si riciclerebbero — e la freccia di un messaggio piu'
// vecchio, rimasto sullo schermo, rimetterebbe a posto i file di qualcun altro.
//
// Il file non sa niente di VSCode: si compila da solo e si prova per davvero, su file
// veri in una cartella temporanea, perche' l'unica prova che conta e' cosa c'e'
// scritto dentro dopo.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.dirname(__dirname);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-checkpoints-'));

let bad = 0;
const t = (ok, msg) => {
  if (!ok) {
    bad++;
    console.error('- ' + msg);
  }
};

async function main() {
  const out = path.join(tmp, 'checkpoints.cjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'src', 'chat', 'checkpoints.ts')],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  const { Checkpoints } = require(out);

  const file = path.join(tmp, 'work.txt');
  const write = (s) => fs.writeFileSync(file, s, 'utf8');
  const read = () => fs.readFileSync(file, 'utf8');
  const cp = new Checkpoints();

  // Tre messaggi, ognuno col suo punto, e a ogni giro il file cambia.
  write('one');
  const a = cp.begin('first message');
  await cp.before('Edit', { file_path: file });
  write('two');
  const b = cp.begin('second message');
  await cp.before('Edit', { file_path: file });
  write('three');
  const c = cp.begin('third message');
  await cp.before('Edit', { file_path: file });
  write('four');

  t(a !== b && b !== c, 'due punti hanno lo stesso id: ' + [a, b, c].join(','));
  t(cp.entries().length === 3, 'i punti aperti non sono tre: ' + cp.entries().length);
  t(cp.filesAt(b) === 1, 'da b non torna indietro un file: ' + cp.filesAt(b));

  // Si torna a `b`: il file torna com'era prima del secondo messaggio, non del terzo.
  const r1 = await cp.restore(b);
  t(r1.restored === 1 && !r1.skipped.length, 'il ripristino non ha rimesso il file: ' + JSON.stringify(r1));
  t(read() === 'two', 'ha rimesso il contenuto sbagliato: ' + read());
  t(cp.entries().length === 1, 'i punti dopo b non sono stati buttati: ' + cp.entries().length);

  // Ed ecco il punto di tutto questo. Dopo il ritorno arrivano messaggi nuovi, che
  // riprendono le *posizioni* appena liberate. La freccia di `c` — un messaggio del
  // ramo abbandonato, rimasto disegnato in chat — non deve toccare niente.
  const d = cp.begin('after the rewind');
  await cp.before('Edit', { file_path: file });
  write('five');
  t(d !== c, "un punto nuovo ha ripreso l'id di uno buttato: " + d + ' = ' + c);
  const stale = await cp.restore(c);
  t(stale.restored === 0, 'una freccia di un ramo morto ha riscritto dei file: ' + stale.restored);
  t(read() === 'five', 'una freccia di un ramo morto ha cambiato il file: ' + read());
  t(cp.filesAt(c) === 0, 'un punto che non esiste dice di avere dei file: ' + cp.filesAt(c));

  // E quella buona continua a funzionare.
  const r2 = await cp.restore(d);
  t(r2.restored === 1 && read() === 'two', 'il punto ancora vivo non rimette il file: ' + read());

  // Un file che prima non c'era torna a non esserci.
  const born = path.join(tmp, 'born.txt');
  const e = cp.begin('makes a file');
  await cp.before('Write', { file_path: born });
  fs.writeFileSync(born, 'hello', 'utf8');
  await cp.restore(e);
  t(!fs.existsSync(born), 'un file nato dopo il punto e’ rimasto li’');

  // Uno strumento che non scrive non apre niente da rimettere.
  const f = cp.begin('just reads');
  await cp.before('Read', { file_path: file });
  t(cp.filesAt(f) === 0, 'una lettura si e’ messa da parte un file: ' + cp.filesAt(f));
}

main()
  .then(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (bad) {
      console.error('FAILED: ' + bad);
      process.exit(1);
    }
    console.log('checkpoint-check ok — gli id non si riciclano, e una freccia morta non tocca niente');
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
