/**
 * Génère le registre des packs de CADRES DE CAPTURE (#10169, lot LC, PP4) :
 * les douze ambiances de `packages/shared/design/call-capture-frames/` deviennent
 * douze packs INTÉGRÉS, installés par défaut et retirables, servis par le moteur
 * des packs sous `/api/v1/packs/capture-frame`.
 *
 *   sources  packages/shared/design/call-capture-frames/<ambiance>.json   (les cadres, lus par le web et le générateur Swift)
 *            packages/shared/design/call-capture-frames/pack-names.json   (nom et description de chaque pack, sept langues)
 *   sorties  services/gateway/assets/packs/<sha16>.{webp,json}             (contrat = le fichier d'ambiance ; couverture)
 *            packages/shared/design/call-capture-frames/packs.json         (le registre)
 *
 * INSTALLER NE TÉLÉCHARGE RIEN (#10187) : les cadres restent embarqués (import
 * statique sur le web, littéraux Swift sur iOS) ; `downloadBytes.story` vaut 0.
 * Le contrat adressé par contenu n'est là que pour que la passerelle valide le
 * pack avec le schéma même des clients (`FrameMoodFileSchema`) et en compte les
 * cadres — et pour qu'un pack futur au `contractSchema` inconnu s'affiche
 * « Mettre à jour Meeshy » sur un ancien client (LC2). Aucune couche `assets/`
 * n'entre au magasin.
 *
 * La couverture se rasterise depuis le FOND du premier motif de l'ambiance
 * (uni, dégradé linéaire ou radial) et sa bordure : une vignette de couleur,
 * sans texte ni police. Idempotent : même source ⇒ mêmes octets ⇒ mêmes adresses.
 *
 * Usage : bun scripts/generate-capture-frame-packs.ts
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { FRAME_MOODS, FrameMoodFileSchema, captureFramePackUsage, type FrameLook, type FrameMood } from '@meeshy/shared/types/capture-frames';
import { PACK_LANGUAGES } from '@meeshy/shared/types/content-pack';
import { parsePackIndex } from '@meeshy/shared/types/content-pack-index';

const ROOT = resolve(import.meta.dir, '../../..');
const FRAMES = join(ROOT, 'packages/shared/design/call-capture-frames');
const ASSETS = join(ROOT, 'services/gateway/assets/packs');
const COVER = { width: 270, height: 480 } as const;
const ACCENT = '#6366F1';

type Ref = { readonly src: string; readonly bytes: number; readonly sha256: string };
type Names = Readonly<Record<string, Readonly<Record<string, { readonly name: string; readonly description: string }>>>>;

function store(bytes: Buffer, ext: 'webp' | 'json'): Ref {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const src = `${sha256.slice(0, 16)}.${ext}`;
  writeFileSync(join(ASSETS, src), bytes);
  return { src, bytes: bytes.length, sha256 };
}

/** Le contrat : le fichier d'ambiance tel qu'il est versionné, en une forme canonique. */
const captureFrameContractBytes = (raw: unknown): Buffer => Buffer.from(`${JSON.stringify(raw, null, 1)}\n`, 'utf8');

const gradientStops = (colors: readonly string[]): string =>
  colors.map((color, index) => `<stop offset="${colors.length === 1 ? 0 : index / (colors.length - 1)}" stop-color="${color}"/>`).join('');

function backgroundSvg(background: FrameLook['background']): { readonly defs: string; readonly fill: string } {
  if (background.kind === 'solid') return { defs: '', fill: background.color };
  if (background.kind === 'accent') return { defs: '', fill: ACCENT };
  if (background.kind === 'radial') return { defs: `<radialGradient id="g">${gradientStops(background.colors)}</radialGradient>`, fill: 'url(#g)' };
  const radians = ((background.angle - 90) * Math.PI) / 180;
  const [dx, dy] = [Math.cos(radians) / 2, Math.sin(radians) / 2];
  const at = (value: number) => (0.5 + value).toFixed(4);
  return {
    defs: `<linearGradient id="g" x1="${at(-dx)}" y1="${at(-dy)}" x2="${at(dx)}" y2="${at(dy)}">${gradientStops(background.colors)}</linearGradient>`,
    fill: 'url(#g)',
  };
}

function coverSvg(look: FrameLook): string {
  const { defs, fill } = backgroundSvg(look.background);
  const border = look.border;
  const inset = border === undefined ? 0 : Math.round(border.inset * COVER.width);
  const stroke = border === undefined ? 0 : Math.max(1, Math.round(border.width * COVER.width));
  const frame =
    border === undefined
      ? ''
      : `<rect x="${inset + stroke / 2}" y="${inset + stroke / 2}" width="${COVER.width - 2 * inset - stroke}" height="${COVER.height - 2 * inset - stroke}" fill="none" stroke="${border.color}" stroke-width="${stroke}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER.width}" height="${COVER.height}"><defs>${defs}</defs><rect width="${COVER.width}" height="${COVER.height}" fill="${fill}"/>${frame}</svg>`;
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

async function buildEntry(mood: FrameMood, order: number, names: Names) {
  const raw = readJson(join(FRAMES, `${mood}.json`));
  const parsed = FrameMoodFileSchema.safeParse(raw);
  if (!parsed.success || parsed.data.mood !== mood) throw new Error(`L'ambiance ${mood} ne passe pas FrameMoodFileSchema`);
  const first = parsed.data.motifs[0];
  if (first === undefined) throw new Error(`L'ambiance ${mood} n'a aucun motif`);
  const usage = captureFramePackUsage(parsed.data);
  if (usage.kind !== 'free' || !usage.surfaces.includes('call')) throw new Error(`L'ambiance ${mood} ne sert pas l'appel : sa description le dirait à tort`);
  const contract = store(captureFrameContractBytes(raw), 'json');
  const cover = store(await sharp(Buffer.from(coverSvg(first.base))).webp({ quality: 82, effort: 6 }).toBuffer(), 'webp');
  return {
    slug: mood,
    domain: 'capture-frame',
    origin: 'builtin',
    version: 1,
    order,
    installedByDefault: true,
    removable: true,
    hidden: false,
    contractSchema: 1,
    cover,
    preview: null,
    contract,
    strings: {},
    downloadBytes: { story: 0, square: null },
    names: Object.fromEntries(
      PACK_LANGUAGES.map((language) => {
        const named = names[language]?.[mood];
        if (named === undefined) throw new Error(`Le pack ${mood} n'a pas de nom en ${language}`);
        return [language, named];
      }),
    ),
    usage,
  };
}

mkdirSync(ASSETS, { recursive: true });
const names = readJson(join(FRAMES, 'pack-names.json')) as Names;
const entries = await Promise.all(FRAME_MOODS.map((mood, order) => buildEntry(mood, order, names)));
const parsed = parsePackIndex(entries);
if (parsed.rejected > 0) throw new Error(`capture-frame : ${parsed.rejected} entrée(s) refusée(s) par PackIndexEntrySchema`);
writeFileSync(join(FRAMES, 'packs.json'), `${JSON.stringify(entries, null, 2)}\n`);
console.log(`capture-frame : ${entries.length} pack(s) → packages/shared/design/call-capture-frames/packs.json`);
