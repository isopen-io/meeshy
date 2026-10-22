// Les cibles de fidélité (lot L21a, #10177, prompt § 8.3) : ce contre quoi les peintres web et iOS se jugent, rendu
// par le générateur AVANT que l'app ne peigne. Une commande :
//   node lib/cible.mjs --generate            régénère les ateliers (lib/ateliers.mjs) puis rend l'ÉCHANTILLON
//                                            (lib/cible-plan.mjs : un cadre par collection × plain/message × 9:16)
//                                            sous docs/product/cadres-de-gloire/cible/ (--cible <dossier>)
//   node lib/cible.mjs --check               rend l'échantillon à part et le compare à l'octet aux cibles versionnées
//   node lib/cible.mjs --full                le jeu COMPLET (191 cadres × 2 variantes) sous generateur/cible-complete/,
//                                            jamais versionné : c'est l'artefact du job du générateur
// Options : --only savane,poses · --jobs 3 · --final (garde le 1080×1920, sans descente à l'échelle de design)
//           --out out · --plates out-plate (les SVG des deux variantes, CADRES_PLATE)
//           --only et --final EXIGENT --cible, et ne se combinent pas à --check : le dossier versionné ne reçoit que l'échantillon complet,
//           et un plan vide (collection inconnue, dossier `out` vide) est rouge, jamais un index à zéro cible.
//
// Méthode, par cible (Chromium par lib/launch.mjs, 1080×1920, polices aux graisses exactes) :
//   - la fenêtre est trouvée comme à l'export (photo factice magenta puis verte) ; la photo FIXTURE
//     (fixture/photo.jpg, lib/fixture.mjs) prend la place des silhouettes, recadrée en cover sur sa boîte ;
//   - le cadre complet est rendu DEUX fois, depuis deux chargements de page : des octets différents (un titre en
//     dégradé sur chemin courbe) rendent la cible instable et la commande rouge — une cible se prouve ;
//   - le rendu descend à l'échelle de design par la moyenne exacte 2×2 (halve), WebP sans perte.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateAteliers } from './ateliers.mjs';
import { destinationOf, halve, indexOf, planTargets, RENDERED, selectCollections, targetName } from './cible-plan.mjs';
import { FIXTURE } from './fixture.mjs';
import { launch } from './launch.mjs';
import { classify, show } from './layers.mjs';
import { openPage, pool, shoot, showSvg } from './page.mjs';
import sharp, { sharpVersion } from './sharp.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const has = (flag) => process.argv.includes(flag);
const FULL = has('--full');
const CHECK = has('--check');
const FINAL = has('--final');
const OUT = path.resolve(arg('--out', path.join(HERE, '../out')));
const PLATES = path.resolve(arg('--plates', path.join(HERE, '../out-plate')));
const ONLY = arg('--only') ? new Set(arg('--only').split(',')) : null;
const CIBLE = destinationOf({ here: HERE, cible: arg('--cible'), full: FULL, only: Boolean(ONLY), final: FINAL, check: CHECK });
const JOBS = Number(arg('--jobs', '3'));
const [FW, FH] = RENDERED;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const decode = async (png) => (await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;

if (has('--generate')) generateAteliers({ out: OUT, plates: PLATES });

const photoBytes = fs.readFileSync(FIXTURE);
const photoHref = 'data:image/jpeg;base64,' + photoBytes.toString('base64');

function windowBox(m, g) {
  let x0 = FW, y0 = FH, x1 = -1, y1 = -1;
  for (let i = 0; i < FW * FH; i++) {
    const p = i * 4;
    const t = (Math.abs(m[p] - g[p]) + Math.abs(m[p + 1] - g[p + 1]) + Math.abs(m[p + 2] - g[p + 2])) / (3 * 255);
    if (t <= 0.02) continue;
    const x = i % FW;
    const y = (i - x) / FW;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? [0, 0, FW, FH] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

async function renderOnce(handle, svg) {
  await showSvg(handle, svg, { fonts: 'exact' });
  const { order, runs } = await handle.page.evaluate(classify);
  const decorKinds = runs.map((r) => r.kind);
  await handle.page.evaluate(show, { kinds: decorKinds, probe: '#FF00FF' });
  const magenta = await decode(await shoot(handle));
  await handle.page.evaluate(show, { kinds: decorKinds, probe: '#00FF00' });
  const green = await decode(await shoot(handle));
  const window = windowBox(magenta, green);
  const kinds = Object.keys(order).filter((k) => k !== 'photo');
  await handle.page.evaluate(show, { kinds, photo: { href: photoHref, box: window.map((v) => v / 2) } });
  return { png: await shoot(handle), window };
}

async function renderTarget(handle, target) {
  const svg = fs.readFileSync(path.join(PLATES, target.variant, target.collection, target.frame + '.svg'), 'utf8');
  const first = await renderOnce(handle, svg);
  const stable = FULL ? null : sha256((await renderOnce(handle, svg)).png) === sha256(first.png);
  const raw = await decode(first.png);
  const image = FINAL ? { data: raw, width: FW, height: FH } : { data: halve(raw, FW, FH), width: FW / 2, height: FH / 2 };
  const webp = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer();
  return { ...target, file: targetName(target), window: first.window, bytes: webp.length, sha256: sha256(webp), stable, webp };
}

const collections = selectCollections({ available: fs.readdirSync(OUT).filter((d) => fs.existsSync(path.join(OUT, d, 'manifest.json'))), only: ONLY });
const manifests = Object.fromEntries(collections.map((c) => [c, JSON.parse(fs.readFileSync(path.join(OUT, c, 'manifest.json'), 'utf8'))]));
const targets = planTargets({ collections, manifests, full: FULL });

const destination = CHECK ? fs.mkdtempSync(path.join(os.tmpdir(), 'cibles-')) : CIBLE;
fs.mkdirSync(destination, { recursive: true });
if (!CHECK && !ONLY) for (const stale of fs.readdirSync(destination).filter((f) => f.endsWith('.webp') || f === 'index.json')) fs.rmSync(path.join(destination, stale));

const browser = await launch();
const handles = await Promise.all(Array.from({ length: JOBS }, () => openPage(browser)));
const free = [...handles];
let done = 0;
const rendered = await pool(targets, JOBS, async (target) => {
  const handle = free.pop();
  try {
    const result = await renderTarget(handle, target);
    fs.writeFileSync(path.join(destination, result.file), result.webp);
    done++;
    if (done % 10 === 0 || done === targets.length) console.log(`  ${done}/${targets.length}`);
    return result;
  } finally {
    free.push(handle);
  }
});
const index = indexOf({ chromium: browser.version(), sharp: sharpVersion().sharp, libwebp: sharpVersion().webp, photo: { sha256: sha256(photoBytes), bytes: photoBytes.length }, targets: rendered });
if (FINAL) index.size = RENDERED;
fs.writeFileSync(path.join(destination, 'index.json'), JSON.stringify(index, null, 2) + '\n');
await Promise.all(handles.map((h) => h.dispose()));
await browser.close();

const total = rendered.reduce((acc, t) => acc + t.bytes, 0);
console.log(`cibles : ${rendered.length} (${collections.length} collections), ${(total / 1024 / 1024).toFixed(2)} Mo, ${index.size[0]}×${index.size[1]} → ${path.relative(process.cwd(), destination) || '.'}`);
const unstable = rendered.filter((t) => t.stable === false);
for (const t of unstable) console.log(`  INSTABLE : ${t.file} — deux rendus Chromium diffèrent, cette cible ne peut pas se prouver`);

if (CHECK) {
  const differing = [...rendered.map((t) => t.file), 'index.json'].filter((file) => {
    const kept = path.join(CIBLE, file);
    return !fs.existsSync(kept) || !fs.readFileSync(kept).equals(fs.readFileSync(path.join(destination, file)));
  });
  for (const file of differing) console.log(`  DIFFÈRE : ${file}`);
  console.log(differing.length ? `check : ${differing.length} fichier(s) diffèrent des cibles versionnées (${path.relative(process.cwd(), CIBLE)})` : `check : ${rendered.length} cibles et index.json identiques à l'octet aux cibles versionnées`);
  fs.rmSync(destination, { recursive: true, force: true });
  process.exit(differing.length || unstable.length ? 1 : 0);
}
process.exit(unstable.length ? 1 : 0);
