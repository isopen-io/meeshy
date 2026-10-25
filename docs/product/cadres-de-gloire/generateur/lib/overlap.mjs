// La règle d'empiètement (lot L2, prompt § 5.7) : Mee et Meo ne recouvrent jamais la photo — dans CHAQUE mise en page
// qu'un cadre déclare (#10277).
// Usage : node lib/overlap.mjs [--out out] [--controle ../controle] [--only neon,savane-orateur-a] [--jobs 3]
//                              [--check] [--png dossier] [--mutate bird-in-window|layout-in-window]
//   sans --check : mesure la mise en page dessinée de chaque cadre, CHERCHE les autres (pied, perchés, côtés, duo,
//                  selfie : lib/bird-layouts.mjs), ne garde que celles que le détecteur valide, et RÉÉCRIT
//                  controle/empietements-<collection>.json (la mise en page dessinée) et
//                  controle/mises-en-page-<collection>.json (chaque mise en page déclarée, ses ancres, son verdict ;
//                  la source de l'export et des contrats) ;
//   --check      : la GARDE de CI — re-mesure chaque mise en page DÉCLARÉE à ses ancres, n'écrit rien, sort en 1 dès
//                  qu'un cadre est hors règle, qu'une mise en page déclarée l'est, que les ancres dessinées ont bougé
//                  sans relevé, ou que le défaut manque ou est un selfie ;
//   --mutate bird-in-window pose le premier oiseau dessiné de chaque cadre au centre de sa fenêtre ;
//   --mutate layout-in-window pose la première ancre de la première mise en page générée déclarée au centre de la
//                  photo : la garde doit rougir dans les deux cas.
// Le détecteur vit dans lib/overlap-measure.mjs, la règle dans lib/overlap-rule.mjs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { drawnLayoutOf, frameRecord, layoutsToTry, nominalAnchors, placeBody, posesFor, recordFailures } from './bird-layouts.mjs';
import { launch } from './launch.mjs';
import { bodyOf, declaredAnchor, injectable, loadPoses, measureBirds, openFrame, placeBirds, searchScene } from './overlap-measure.mjs';
import { isSelfie, RULE, verdict } from './overlap-rule.mjs';
import { openPage, pool, SCALE } from './page.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = path.resolve(arg('--out', path.join(HERE, '../out')));
const CONTROLE = path.resolve(arg('--controle', path.join(HERE, '../../controle')));
const ONLY = arg('--only') ? new Set(arg('--only').split(',').filter(Boolean)) : null;
const JOBS = Number(arg('--jobs', '3'));
const CHECK = process.argv.includes('--check');
const PNG = arg('--png', null);
const MUTATE = arg('--mutate', null);
const POSES = loadPoses();
const STRIDE = 2;

function birdIntoWindow() {
  const bird = document.querySelector('[data-layer="birds"]');
  const photo = document.querySelector('[data-layer="photo"]');
  if (!bird || !photo) return;
  const r = photo.getBoundingClientRect();
  const b = bird.getBoundingClientRect();
  const dx = r.x + r.width / 2 - (b.x + b.width / 2);
  const dy = r.y + r.height / 2 - (b.y + b.height / 2);
  bird.setAttribute('transform', `translate(${dx} ${dy}) ${bird.getAttribute('transform') ?? ''}`);
}

const declaredFile = (collection) => path.join(CONTROLE, `mises-en-page-${collection}.json`);
const readDeclared = (collection) => (fs.existsSync(declaredFile(collection)) ? JSON.parse(fs.readFileSync(declaredFile(collection), 'utf8')) : []);

// La carte du détecteur (`--png`) : la fenêtre en gris clair, les oiseaux en vert, l'empiètement en rouge.
function writePng(collection, name, shade) {
  if (!PNG) return;
  const [W, H] = [540 * SCALE, 960 * SCALE];
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = shade[y * W + x];
      const rgb = v === 3 ? [255, 0, 0] : v === 2 ? [120, 220, 160] : v === 1 ? [200, 200, 200] : [60, 60, 60];
      raw.set(rgb, y * (W * 3 + 1) + 1 + x * 3);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  fs.mkdirSync(path.join(PNG, collection), { recursive: true });
  fs.writeFileSync(path.join(PNG, collection, name + '.png'), png);
}

function windowCenter(shade) {
  const W = 540 * SCALE;
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < shade.length; i++) {
    if (!(shade[i] & 1)) continue;
    sx += i % W;
    sy += Math.floor(i / W);
    n++;
  }
  return n ? [sx / n, sy / n] : [540, 960];
}

const rowOf = (name, layout, measured) => {
  const selfie = layout === 'selfie';
  const { shade, ...row } = measured;
  return { file: name, ...row, layout, verdict: verdict({ ...row, selfie }) };
};

const validatedOf = ({ overlap, depth, face }) => ({ overlap, depth, face });

// La recherche d'une mise en page générée : chaque oiseau part de sa place canonique et s'écarte de la photo le moins
// possible ; puis le détecteur juge la mise en page ENTIÈRE, rendue.
async function generate(handle, frame, scene, layout) {
  const anchors = nominalAnchors(layout, posesFor(frame.dom.birds));
  const placed = [];
  for (const anchor of anchors) {
    const body = await bodyOf(handle, anchor, POSES, { stride: STRIDE });
    const found = placeBody(body, anchor.center, scene, { selfie: layout === 'selfie', target: { overlap: 400 / STRIDE ** 2, depth: 8 } });
    if (!found) return null;
    placed.push({ ...anchor, center: [anchor.center[0] + found.dx, anchor.center[1] + found.dy], size: Math.round(anchor.size * found.scale * 10) / 10 });
  }
  const birds = (await placeBirds(handle, placed, POSES)).map(declaredAnchor(POSES));
  return { layout, birds, validated: validatedOf(await measureBirds(handle, frame)) };
}

async function measure(handle, { collection, name, prose }) {
  const svg = fs.readFileSync(path.join(OUT, collection, name + '.svg'), 'utf8');
  const frame = await openFrame(handle, { svg, mutate: MUTATE === 'bird-in-window' ? birdIntoWindow : null });
  const drawnBirds = frame.dom.birds.map(declaredAnchor(POSES));
  const drawn = drawnLayoutOf(prose, drawnBirds.length);
  const first = await measureBirds(handle, frame);
  writePng(collection, name, first.shade);
  const row = rowOf(name, isSelfie(prose) ? 'selfie' : (prose ?? '').split(/[ :(,]/)[0] || null, first);
  const drawnEntry = { layout: drawn, birds: drawnBirds, validated: validatedOf(first) };
  if (CHECK) return { collection, row, drawn: drawnEntry, frame, drawnBirds, center: windowCenter(first.shade) };
  const scene = searchScene(frame, first);
  const tried = [];
  const unplaced = [];
  for (const layout of layoutsToTry({ drawn, tied: frame.tied })) {
    const found = await generate(handle, frame, scene, layout);
    if (found) tried.push(found);
    else unplaced.push(layout);
  }
  return { collection, row, record: frameRecord({ frame: name, drawn, measured: [drawnEntry, ...tried], unplaced }) };
}

// La garde : chaque mise en page DÉCLARÉE, re-mesurée à ses ancres.
async function check(handle, job, declared) {
  const result = await measure(handle, job);
  const record = declared.get(job.name);
  const remeasured = { [result.drawn.layout]: result.drawn.validated };
  const generated = record ? Object.entries(record.layouts).filter(([layout]) => layout !== record.drawn) : [];
  for (const [at, [layout, { birds }]] of generated.entries()) {
    const anchors = birds.map(injectable);
    if (MUTATE === 'layout-in-window' && at === 0) {
      anchors[0] = { ...anchors[0], center: result.center };
    }
    await placeBirds(handle, anchors, POSES);
    remeasured[layout] = validatedOf(await measureBirds(handle, result.frame));
  }
  return { ...result, failures: recordFailures(record, { drawnBirds: result.drawnBirds, remeasured }) };
}

const collections = fs.readdirSync(OUT).filter((d) => fs.existsSync(path.join(OUT, d, 'manifest.json'))).sort();
const jobs = collections.flatMap((collection) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, collection, 'manifest.json'), 'utf8'));
  const layouts = new Map(manifest.map((e) => [e.file.replace(/\.jpg$/, ''), e.layout]));
  return fs.readdirSync(path.join(OUT, collection)).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort()
    .filter((name) => !ONLY || ONLY.has(collection) || ONLY.has(name))
    .map((name) => ({ collection, name, prose: layouts.get(name) ?? null }));
});
const declared = new Map(collections.flatMap((collection) => readDeclared(collection).map((record) => [record.frame, record])));
const browser = await launch();
const handles = await Promise.all(Array.from({ length: JOBS }, () => openPage(browser)));
const free = [...handles];
const results = await pool(jobs, JOBS, async (job) => {
  const handle = free.pop();
  try {
    return CHECK ? await check(handle, job, declared) : await measure(handle, job);
  } finally {
    free.push(handle);
  }
});
await Promise.all(handles.map((h) => h.dispose()));
await browser.close();

if (!CHECK) {
  fs.mkdirSync(CONTROLE, { recursive: true });
  for (const collection of collections) {
    const mine = results.filter((r) => r.collection === collection);
    if (mine.length === 0) continue;
    const merge = (file, rows, key) => {
      const kept = ONLY && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).filter((p) => !rows.some((r) => r[key] === p[key])) : [];
      fs.writeFileSync(file, JSON.stringify([...kept, ...rows].sort((x, y) => x[key].localeCompare(y[key])), null, 1) + '\n');
    };
    merge(path.join(CONTROLE, `empietements-${collection}.json`), mine.map((r) => r.row), 'file');
    merge(declaredFile(collection), mine.map((r) => r.record), 'frame');
  }
}

const out = results.filter((r) => r.row.verdict !== 'ok');
for (const { row } of out) console.error(`  ${row.verdict === 'face' ? 'VISAGE' : 'HORS RÈGLE'} ${row.file} overlap=${row.overlap} depth=${row.depth} face=${row.face} bbox=${JSON.stringify(row.bbox)}`);
const broken = CHECK ? results.filter((r) => r.failures.length > 0) : results.filter((r) => r.record.default === null);
for (const r of broken) console.error(`  MISE EN PAGE ${r.row.file} : ${(r.failures ?? ['aucune mise en page par défaut hors selfie']).join(' ; ')}`);
const faces = out.filter((r) => r.row.verdict === 'face').length;
const layouts = CHECK
  ? results.reduce((n, r) => n + Object.keys(declared.get(r.row.file)?.layouts ?? {}).length, 0)
  : results.reduce((n, r) => n + Object.keys(r.record.layouts).length, 0);
const summary = `${results.length - out.length}/${results.length} cadres dans la règle (overlap ≤ ${RULE.overlap} px, depth ≤ ${RULE.depth} px, face = 0) ; ${out.length} hors règle dont ${faces} visage(s) touché(s) ; ${layouts} mise(s) en page déclarée(s), ${broken.length} cadre(s) en défaut`;
if (out.length || broken.length) {
  console.error(`ROUGE — ${summary}`);
  process.exit(CHECK ? 1 : 0);
}
console.log(`VERT — ${summary}`);
