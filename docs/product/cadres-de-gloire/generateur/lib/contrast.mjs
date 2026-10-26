// La garde de LISIBILITÉ des textes (#10265, prompt § 5.2 et § 7 L3) : chaque emplacement de texte d'un cadre tient
// son contraste minimal contre ce qui est dessous (4,5:1, 3:1 au-dessus de 24 px), ou déclare un effet — une copie
// posée avec lui (ombre, lueur) ou un contour — qui, MESURÉ au bord du glyphe sur le rendu final, le rend lisible.
// La règle vit dans lib/contrast-rule.mjs, partagée avec l'export (qui inscrit `contrast` au contrat).
// Usage : node lib/contrast.mjs [--out out] [--only neon,olympe-legende-3] [--jobs 3] [--check] [--report fichier.json]
//                               [--contracts packages/shared/design/glory-frames] [--gaps <contrats>/known-gaps.json]
//                               [--mutate low-contrast]
//   sans --check : mesure et rend compte, sans jamais échouer ;
//   --check      : la GARDE de CI — sort en 1 dès qu'un texte est bas sans être au cliquet `lowContrast` (#10265) ;
//                  un texte du cliquet redevenu lisible est signalé : il s'en retire au prochain réexport, avec le
//                  contrat, puisque le témoin de packages/shared juge le contrat publié ;
//   --mutate low-contrast efface presque le titre de chaque cadre (opacité 6 %, sans effet) : la garde doit rougir.
// Seuls les cadres QUI PARTENT sont jugés : ceux d'une collection qui a son contrat (--contracts, par défaut
// packages/shared/design/glory-frames/<collection>.json). Une étude d'atelier (`poses`) est dessinée, pas livrée ; le
// jour où elle entre au catalogue, son contrat la fait entrer sous la garde.
//
// Par cadre (Chromium, 1080×1920, polices aux graisses exactes, comme l'export) : les textes de décor NEUTRES de la
// table du tri (lib/decor-sorts.mjs) sont cuits dans le décor et ne sont pas des emplacements ; quatre rendus —
// la scène sans texte, la scène finale privée du remplissage des textes principaux, les remplissages seuls, les masques
// à plat — nourrissent les deux mesures.
import fs from 'node:fs';
import path from 'node:path';
import { declaresEffect, edgeContrastOf, flatColor, judgeContrast, minContrastFor, slotsOf, underGlyphContrastOf, verdictOf } from './contrast-rule.mjs';
import { bakedSlotsOf, DECOR_TEXTS_FILE, frameIdOf, readDecorTexts } from './decor-sorts.mjs';
import { launch } from './launch.mjs';
import { classify, isFront, markBaked, read, show } from './layers.mjs';
import { openPage, pool, SCALE, shoot, showSvg, W, H } from './page.mjs';
import sharp from './sharp.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = path.resolve(arg('--out', path.join(HERE, '../out')));
const CONTRACTS = path.resolve(arg('--contracts', path.join(HERE, '../../../../../packages/shared/design/glory-frames')));
const GAPS = path.resolve(arg('--gaps', path.join(CONTRACTS, 'known-gaps.json')));
const ONLY = arg('--only') ? new Set(arg('--only').split(',')) : null;
const JOBS = Number(arg('--jobs', '3'));
const CHECK = process.argv.includes('--check');
const REPORT = arg('--report', null);
const MUTATE = arg('--mutate', null);
const DECOR_TEXTS = readDecorTexts(path.resolve(arg('--decor-texts', DECOR_TEXTS_FILE)));
const FW = W * SCALE;
const FH = H * SCALE;

if (MUTATE !== null && MUTATE !== 'low-contrast') throw new Error(`--mutate ${MUTATE} : seul low-contrast est connu`);

const decode = async (png) => ({ data: (await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data, width: FW, height: FH });

function fadeTitle() {
  const texts = [...document.querySelectorAll('text[data-slot="title"]')];
  if (texts.length === 0) throw new Error('--mutate low-contrast : ce cadre n’a pas de titre');
  texts.slice(0, -1).forEach((t) => t.remove());
  const title = texts.at(-1);
  title.removeAttribute('filter');
  title.setAttribute('stroke', 'none');
  title.style.opacity = '0.06';
}

// Ce qui ENTOURE les textes principaux : la scène finale sans leur remplissage — leur contour, leurs ombres et leurs
// lueurs restent, et leur anticrénelage ne se mêle pas à ce qu'on mesure autour d'eux.
function withoutFills(indices) {
  const texts = document.querySelectorAll('text[data-slot]');
  indices.forEach((index) => [texts[index], ...texts[index].querySelectorAll('*')].forEach((el) => el.style.setProperty('fill', 'none')));
}

// Les remplissages SEULS des textes principaux : leur couleur réelle à chaque pixel (dégradé résolu), sans contour,
// filtre ni opacité — l'opacité se compose à la mesure, sur ce qui entoure le glyphe.
function paintFills(indices) {
  const root = document.querySelector('g[data-layer="root"]');
  const texts = document.querySelectorAll('text[data-slot]');
  const bare = 'visibility:visible;stroke:none;filter:none;opacity:1';
  indices.forEach((index) => {
    const el = texts[index];
    el.setAttribute('style', `${bare};display:inline`);
    el.querySelectorAll('*').forEach((d) => d.setAttribute('style', bare));
    for (let n = el.parentElement; n && n !== root; n = n.parentElement) n.setAttribute('style', 'display:inline;visibility:hidden;filter:none;opacity:1;mask:none');
  });
}

async function measure(handle, { collection, name }) {
  const svg = fs.readFileSync(path.join(OUT, collection, name + '.svg'), 'utf8');
  await showSvg(handle, svg, { fonts: 'exact' });
  const { page } = handle;
  if (MUTATE === 'low-contrast') await page.evaluate(fadeTitle);
  const { order, runs } = await page.evaluate(classify);
  const dom = await page.evaluate(read);
  const id = frameIdOf(collection, name);
  const samples = new Map(slotsOf(dom.texts).map((s) => [s.slot, s.main.text]));
  const baked = bakedSlotsOf(DECOR_TEXTS, id, samples);
  if (baked.length) await page.evaluate(markBaked, baked);
  const slots = slotsOf(dom.texts.filter((t) => !baked.includes(t.slot)));
  if (slots.length === 0) return [];
  const render = async (kinds) => {
    await page.evaluate(show, { kinds });
    return decode(await shoot(handle));
  };
  const scene = ['photo', 'photo-bg', 'backdrop', ...runs.map((r) => r.kind), ...(baked.length ? ['baked'] : []), ...Object.keys(order).filter(isFront), 'crest', 'plate', 'birds'];
  const under = await render(scene);
  await page.evaluate(withoutFills, slots.map((s) => s.main.index));
  const around = await render([...scene, 'text']);
  await page.evaluate(show, { kinds: [] });
  await page.evaluate(paintFills, slots.map((s) => s.main.index));
  const fills = await decode(await shoot(handle));
  await page.evaluate(show, { kinds: [], flatSlots: slots.map((s, i) => ({ index: s.main.index, color: `rgb(${flatColor(i).join(',')})` })) });
  const mask = await decode(await shoot(handle));
  return slots.map((s, i) => {
    const slot = s.main;
    const color = flatColor(i);
    const effect = declaresEffect({ effects: s.effects, stroke: slot.stroke });
    const contrast = underGlyphContrastOf({ mask, color, under, slot })?.contrast ?? null;
    const withEffect = edgeContrastOf({ mask, color, fills, around, slot })?.contrast ?? null;
    const size = slot.font.size;
    return { id: `${id}#${s.slot}`, sample: slot.text, size, min: minContrastFor(size), contrast, withEffect, effect, verdict: verdictOf({ size, contrast, withEffect, effect }) };
  });
}

const listed = JSON.parse(fs.readFileSync(GAPS, 'utf8')).lowContrast?.slots ?? [];
const drawn = fs.readdirSync(OUT).filter((d) => fs.existsSync(path.join(OUT, d, 'manifest.json'))).sort();
const collections = drawn.filter((d) => fs.existsSync(path.join(CONTRACTS, `${d}.json`)));
const studies = drawn.filter((d) => !collections.includes(d));
const jobs = collections.flatMap((collection) => fs.readdirSync(path.join(OUT, collection))
  .filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort()
  .filter((name) => !ONLY || ONLY.has(collection) || ONLY.has(name))
  .map((name) => ({ collection, name })));
if (jobs.length === 0) throw new Error(`aucun cadre sous ${OUT} : générer d'abord les SVG des ateliers`);
const browser = await launch();
const handles = await Promise.all(Array.from({ length: JOBS }, () => openPage(browser)));
const free = [...handles];
const rows = (await pool(jobs, JOBS, async (job) => {
  const handle = free.pop();
  try {
    return await measure(handle, job);
  } finally {
    free.push(handle);
  }
})).flat();
await Promise.all(handles.map((h) => h.dispose()));
await browser.close();

const measuredFrames = new Set(rows.map((row) => row.id.split('#')[0]));
const judged = judgeContrast(rows, ONLY ? listed.filter((slotId) => measuredFrames.has(slotId.split('#')[0])) : listed);
if (REPORT) fs.writeFileSync(path.resolve(REPORT), JSON.stringify({ gaps: path.relative(process.cwd(), GAPS), rows, solved: judged.solved }, null, 1) + '\n');
const count = (verdict) => rows.filter((row) => row.verdict === verdict).length;
const show1 = (row) => `${row.id} « ${row.sample} » ${row.size} px : ${row.contrast ?? '—'}:1 dessous, ${row.withEffect ?? '—'}:1 au bord${row.effect ? ' (effet déclaré)' : ''}, seuil ${row.min}:1`;
for (const row of judged.fresh) console.error(`  BAS ${show1(row)}`);
if (studies.length && !ONLY) console.log(`  hors catalogue, non jugé(s) (aucun contrat sous ${path.relative(process.cwd(), CONTRACTS)}) : ${studies.join(', ')}`);
if (judged.solved.length) console.log(`  ${judged.solved.length} texte(s) du cliquet lisible(s) ou cuit(s) ici, à retirer au prochain réexport : ${judged.solved.join(', ')}`);
const summary = `${rows.length} textes dans ${measuredFrames.size} cadres : ${count('tenu')} tiennent le seuil, ${count('effet')} lisibles par leur effet, ${count('bas')} bas dont ${judged.tolerated.length} au cliquet #10265 et ${judged.fresh.length} nouveau(x)`;
if (judged.fresh.length) {
  console.error(`ROUGE — ${summary}`);
  process.exit(CHECK ? 1 : 0);
}
console.log(`VERT — ${summary}`);
