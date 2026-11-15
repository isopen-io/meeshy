/**
 * `bun run compose:glory-frame-atlases` (#10275, § 5.10.5) — l'ATLAS de chaque
 * pack `glory-frame` : une bande WebP d'une cellule 90 × 160 par cadre visible,
 * dans l'ordre du contrat, composée depuis les vignettes du magasin.
 *
 *   services/gateway/assets/packs/<sha16>.webp                 (les vignettes, import:glory-frames)
 *     ├─ services/gateway/assets/packs/<sha16>.webp            (l'atlas, adressé par contenu)
 *     └─ packages/shared/design/glory-frames/atlases.json      (clé des entrées → atlas)
 *
 * Puis `bun run generate:glory-frames` le relit et le pose en `preview`.
 *
 * Sans navigateur, par sharp (épinglé par la passerelle, résolu depuis elle,
 * comme `apps/web/scripts/check-glory-frames.ts`). Ce sont les OCTETS commités
 * qui font foi : le générateur et ses témoins ne recomposent jamais, donc deux
 * machines aux libwebp différentes ne divergent pas. Un atlas dont la clé
 * (cellule + empreintes des vignettes, `gloryFrameAtlasKey`) n'a pas changé
 * n'est pas recomposé : rejouer le script ne touche à rien.
 *
 * La taille est BORNÉE (`PACK_PREVIEW_MAX_BYTES`) : la qualité descend par
 * paliers, et un atlas qui ne tient pas arrête tout, rien n'est écrit à moitié.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PackAssetRef } from '../types/content-pack.js';
import { GLORY_FRAME_ATLAS_CELL, GLORY_FRAME_ATLAS_MAX_CELLS, PACK_PREVIEW_MAX_BYTES, gloryFrameAtlasFrames, gloryFrameAtlasSize } from '../types/glory-frame-atlas.js';
import type { GloryFrame } from '../types/glory-frames.js';
import { ATLASES_FILE, PACK_ASSETS_DIR, REPO_ROOT, gloryFrameAtlasKey, jsonText, readGloryFrameSources } from './generate-glory-frames.js';

type SharpImage = {
  resize(width: number, height: number, options: Record<string, unknown>): SharpImage;
  composite(layers: readonly { readonly input: Buffer; readonly left: number; readonly top: number }[]): SharpImage;
  webp(options: Record<string, unknown>): SharpImage;
  png(): SharpImage;
  toBuffer(): Promise<Buffer>;
};
type Sharp = ((input?: Buffer | Record<string, unknown>, options?: Record<string, unknown>) => SharpImage) & { concurrency(n: number): void };

export const ATLAS_NOTICE = 'GÉNÉRÉ par `bun run compose:glory-frame-atlases` depuis les vignettes du magasin — ne pas éditer.';

/** Les qualités essayées, de la plus fidèle à la plus légère, jusqu'à tenir la borne. */
const QUALITIES = [82, 74, 66, 58, 50] as const;

const loadSharp = (): Sharp => {
  const sharp = createRequire(join(REPO_ROOT, 'services/gateway/package.json'))('sharp') as Sharp;
  sharp.concurrency(1);
  return sharp;
};

async function compose(sharp: Sharp, frames: readonly GloryFrame[]): Promise<Buffer> {
  const visible = gloryFrameAtlasFrames(frames);
  if (visible.length === 0 || visible.length > GLORY_FRAME_ATLAS_MAX_CELLS) throw new Error(`atlas de ${visible.length} cellules : hors de [1, ${GLORY_FRAME_ATLAS_MAX_CELLS}]`);
  const cells = await Promise.all(
    visible.map((frame) =>
      sharp(readFileSync(join(PACK_ASSETS_DIR, frame.thumb.src)))
        .resize(GLORY_FRAME_ATLAS_CELL.width, GLORY_FRAME_ATLAS_CELL.height, { fit: 'cover', kernel: 'lanczos3' })
        .png()
        .toBuffer(),
    ),
  );
  const size = gloryFrameAtlasSize(visible.length);
  const canvas = await sharp({ create: { width: size.width, height: size.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(cells.map((input, index) => ({ input, left: index * GLORY_FRAME_ATLAS_CELL.width, top: 0 })))
    .png()
    .toBuffer();
  for (const quality of QUALITIES) {
    const encoded = await sharp(canvas).webp({ quality, alphaQuality: 90, effort: 6, smartSubsample: true }).toBuffer();
    if (encoded.length <= PACK_PREVIEW_MAX_BYTES) return encoded;
  }
  throw new Error(`atlas de ${visible.length} cellules au-delà de ${PACK_PREVIEW_MAX_BYTES} octets, même en qualité ${QUALITIES[QUALITIES.length - 1]}`);
}

const addressed = (bytes: Buffer): PackAssetRef => {
  const digest = createHash('sha256').update(bytes).digest('hex');
  return { src: `${digest.slice(0, 16)}.webp`, bytes: bytes.length, sha256: digest };
};

async function main(): Promise<void> {
  const sharp = loadSharp();
  const sources = readGloryFrameSources();
  const known = sources.atlases ?? {};
  const composed = await Promise.all(
    sources.registry.map(async (entry) => {
      const frames = entry.collections.flatMap(({ slug }) => sources.collections.get(slug)?.frames ?? []);
      const key = gloryFrameAtlasKey(frames);
      const kept = known[key];
      if (kept !== undefined && existsSync(join(PACK_ASSETS_DIR, kept.src))) return { slug: entry.slug, key, ref: kept, fresh: false };
      const bytes = await compose(sharp, frames);
      const ref = addressed(bytes);
      writeFileSync(join(PACK_ASSETS_DIR, ref.src), bytes);
      return { slug: entry.slug, key, ref, fresh: true };
    }),
  );
  const atlases = Object.fromEntries([...composed].sort((left, right) => left.key.localeCompare(right.key)).map(({ key, ref }) => [key, ref]));
  writeFileSync(ATLASES_FILE, jsonText({ generated: ATLAS_NOTICE, cell: GLORY_FRAME_ATLAS_CELL, atlases }));
  for (const { slug, ref, fresh } of composed) process.stdout.write(`${slug} : ${ref.src} (${(ref.bytes / 1024).toFixed(1)} Kio)${fresh ? ' — composé' : ''}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
