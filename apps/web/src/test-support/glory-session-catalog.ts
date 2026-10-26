import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PackAssetRef } from '@meeshy/shared/types/content-pack';
import type { AchievementRarity } from '@meeshy/shared/utils/game/glory';

import type { FramePackDetail, FramePackSummary } from '@/lib/api/packs-glory-frame';
import type { GloryAssetDeps } from '@/lib/game-photo/glory/frame-assets';
import type { GloryCatalogPorts } from '@/lib/game-photo/glory/frame-catalog';
import type { GloryStep } from '@/lib/game-photo/glory/glory-scene';

/**
 * UN CATALOGUE DE SESSION SUR LES MANIFESTES VERSIONNÉS (#10168) — l'Afrique
 * éternelle (Savane) et le pack `succes`, installés, servis par les PORTS que
 * la production lit : le témoin les remet à `loadGloryCatalog` et suit une
 * étape jusqu'au cadre que la scène retient, sans réseau ni magasin. Ce module
 * n'importe AUCUNE valeur de `glory/` (garde du chunk `glory_painter`).
 */

const DESIGN = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..', 'packages', 'shared', 'design', 'glory-frames');
const framesOf = (collection: string): readonly unknown[] => (JSON.parse(readFileSync(join(DESIGN, `${collection}.json`), 'utf8')) as { readonly frames: readonly unknown[] }).frames;

const PACKS: Readonly<Record<string, string>> = { afrique: 'savane', succes: 'succes' };

const contractRef = (slug: string): PackAssetRef => ({ src: `contract-${slug}.json`, bytes: 1, sha256: slug.padEnd(64, '0') });

const summary = (slug: string): FramePackSummary => ({
  slug,
  name: slug,
  description: '',
  author: 'Meeshy',
  builtin: false,
  status: 'approved',
  itemCount: 1,
  coverUrl: null,
  installed: true,
  installCount: 0,
  domain: 'glory-frame',
  origin: 'official',
  version: 1,
  downloadBytes: null,
  removable: false,
  names: {},
  preview: null,
  previewUrl: null,
  usage: null,
});

const detail = (slug: string): FramePackDetail => ({ ...summary(slug), contractSchema: 1, contract: contractRef(slug), strings: {} });

export const succesCatalogPorts: GloryCatalogPorts = {
  installed: async () => ({ ok: true, data: Object.keys(PACKS).map(summary) }),
  detail: async (slug) => ({ ok: true, data: detail(slug) }),
  readJson: async (ref) => {
    const slug = Object.keys(PACKS).find((candidate) => contractRef(candidate).src === ref.src);
    return slug === undefined ? null : { schema: 1, frames: framesOf(PACKS[slug] ?? '') };
  },
};

/** Une couche décodée : une image d'un pixel, qui rend sa mémoire. */
const decodedLayer = (): ImageBitmap => ({ width: 1, height: 1, close: () => undefined });

/** Un magasin qui tient toutes les couches : chaque cadre est PRÊT. */
export const storedGloryAssets = (): GloryAssetDeps => ({
  read: async () => new Blob(['couche']),
  request: () => undefined,
  has: async () => true,
  decode: async () => decodedLayer(),
  rasterSticker: async () => null,
  stickerMarkup: () => null,
});

export const achievementStep = (rarity?: AchievementRarity | null): GloryStep => ({
  stepId: 'achievement:messages.3',
  atmosphere: null,
  lastChosen: null,
  ...(rarity === undefined ? {} : { rarity }),
});
