import { isStickerAnimated, stickerMimeFromSignature } from '@meeshy/shared/types/sticker-definition';
import { STICKER_PACK_LIMITS, validateStickerPackManifest } from '@meeshy/shared/types/sticker-pack';
import type {
  StickerKind,
  StickerPackManifest,
  StickerPackProblem,
  StickerPackProblemCode,
  StickerTextBox,
  StickerTextZone,
} from '@meeshy/shared/types/sticker-pack';

import type { PlainStickerPacksKey } from '@/lib/i18n-sticker-packs-catalog';

/**
 * **LE BROUILLON D'UN PACK** (#9141) — ce que le tiers remplit dans l'éditeur,
 * et sa traduction en manifeste. Tout ce qui peut se DÉDUIRE se déduit, pour
 * que proposer un pack se résume à déposer ses images et lui donner un nom :
 * - l'adresse (`slug`) vient du nom ;
 * - la clé et le titre d'un sticker viennent du nom de son fichier ;
 * - le genre vient des OCTETS : une image qui bouge est cinématique, une
 *   image fixe est fixe ; seul « Instant » se choisit, parce qu'il ajoute du
 *   texte ;
 * - une zone d'Instant naît en bandeau en bas du sticker, déjà valide.
 * La validation est celle de la passerelle (`validateStickerPackManifest`) :
 * ce que l'éditeur accepte, la passerelle l'accepte.
 */

export type DraftItem = {
  readonly id: string;
  readonly file: File;
  readonly key: string;
  readonly title: string;
  readonly emoji: string;
  /** Lu dans les octets — ce qui décide entre fixe et cinématique. */
  readonly animated: boolean;
  readonly instant: boolean;
  readonly zones: readonly StickerTextZone[];
};

export type PackDraft = {
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly items: readonly DraftItem[];
};

export const EMPTY_DRAFT: PackDraft = { name: '', description: '', author: '', items: [] };

/** `Chats de Paris` → `chats-de-paris` ; borné, sans accent, sans tiret en bord. */
export function slugOf(value: string, max: number = STICKER_PACK_LIMITS.maxSlugLength): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, max)
    .replace(/^-+|-+$/g, '');
}

const titleOf = (fileName: string): string => {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  const title = base === '' ? 'Sticker' : base.charAt(0).toUpperCase() + base.slice(1);
  return title.slice(0, STICKER_PACK_LIMITS.maxTitleLength);
};

/** Une clé neuve, unique dans le pack : le nom du fichier, suffixé s'il est déjà pris. */
function freshKey(fileName: string, taken: ReadonlySet<string>): string {
  const base = slugOf(fileName.replace(/\.[^.]+$/, ''), STICKER_PACK_LIMITS.maxKeyLength - 3) || 'sticker';
  if (!taken.has(base)) return base;
  const n = Array.from({ length: STICKER_PACK_LIMITS.maxItems + 1 }, (_, i) => i + 2).find((i) => !taken.has(`${base}-${i}`));
  return `${base}-${n ?? taken.size + 2}`;
}

/** La zone d'un Instant qui vient d'être créé : un bandeau en bas, une ligne, un texte court — valide d'emblée. */
export function defaultZone(index: number): StickerTextZone {
  return {
    slot: index === 0 ? 'texte' : `texte${index + 1}`,
    label: 'Texte',
    box: { x: 40, y: 392 - index * 110, width: 432, height: 96 },
    defaultText: 'Ton texte',
    maxLength: 16,
    maxLines: 1,
    minFontSize: STICKER_PACK_LIMITS.minFontSize,
    maxFontSize: 64,
    color: '#1c1941',
    weight: 'black',
    align: 'center',
  };
}

/** `null` : ce fichier n'est pas une image dont on puisse faire un sticker. */
export async function draftItemOf(file: File, taken: ReadonlySet<string>, id: string): Promise<DraftItem | null> {
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const mime = stickerMimeFromSignature(head);
  if (mime === null) return null;
  const bytes = mime === 'image/gif' ? new Uint8Array(await file.arrayBuffer()) : head;
  return { id, file, key: freshKey(file.name, taken), title: titleOf(file.name), emoji: '✨', animated: isStickerAnimated(bytes), instant: false, zones: [] };
}

export const kindOf = (item: Pick<DraftItem, 'animated' | 'instant'>): StickerKind => (item.instant ? 'instant' : item.animated ? 'cinematic' : 'static');

const EXTENSION: Readonly<Record<string, string>> = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/jpeg': 'jpg' };
const assetOf = (item: DraftItem): string => `${item.key}.${EXTENSION[item.file.type] ?? 'png'}`;

/** Le manifeste du brouillon et les fichiers à joindre, nommés comme le manifeste les désigne. */
export function manifestOf(draft: PackDraft): { readonly manifest: StickerPackManifest; readonly files: ReadonlyMap<string, Blob> } {
  return {
    manifest: {
      slug: slugOf(draft.name),
      name: draft.name.trim(),
      description: draft.description.trim(),
      author: draft.author.trim(),
      items: draft.items.map((item) => ({
        key: item.key,
        title: item.title.trim(),
        emoji: item.emoji.trim(),
        kind: kindOf(item),
        asset: assetOf(item),
        ...(item.instant ? { zones: item.zones } : {}),
      })),
    },
    files: new Map(draft.items.map((item) => [assetOf(item), item.file])),
  };
}

export const draftProblems = (draft: PackDraft): readonly StickerPackProblem[] => {
  const result = validateStickerPackManifest(manifestOf(draft).manifest);
  return result.ok ? [] : result.problems;
};

const PROBLEM_KEYS: Readonly<Record<StickerPackProblemCode, PlainStickerPacksKey>> = {
  invalid: 'stickerPacks.problem.invalid',
  'reserved-slug': 'stickerPacks.problem.reservedSlug',
  'duplicate-key': 'stickerPacks.problem.duplicate',
  'duplicate-asset': 'stickerPacks.problem.duplicate',
  'duplicate-slot': 'stickerPacks.problem.duplicateSlot',
  'zones-required': 'stickerPacks.problem.zonesRequired',
  'zones-forbidden': 'stickerPacks.problem.invalid',
  'zone-outside': 'stickerPacks.problem.zoneOutside',
  'zones-overlap': 'stickerPacks.problem.zonesOverlap',
  'font-range': 'stickerPacks.problem.invalid',
  'default-too-long': 'stickerPacks.problem.defaultTooLong',
  'default-overflows': 'stickerPacks.problem.defaultOverflows',
  'longest-overflows': 'stickerPacks.problem.longestOverflows',
};

export const problemKey = (problem: StickerPackProblem): PlainStickerPacksKey => {
  if (problem.code !== 'invalid') return PROBLEM_KEYS[problem.code];
  if (problem.path === 'items') return 'stickerPacks.problem.count';
  if (['name', 'description', 'author', 'slug'].includes(problem.path)) return 'stickerPacks.problem.packField';
  return PROBLEM_KEYS.invalid;
};

/** L'indice du sticker qu'un problème vise (`items.3.zones…` → 3), `null` pour le pack. */
export const problemItem = (problem: StickerPackProblem): number | null => {
  const match = /^items\.(\d+)/.exec(problem.path);
  return match === null ? null : Number(match[1]);
};

/** Un rectangle tracé à la souris ou au doigt, ramené dans le carré de 512 et à une taille utile. */
export function boxFromDrag(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }, scale: number): StickerTextBox {
  const C = STICKER_PACK_LIMITS.canvas;
  const min = STICKER_PACK_LIMITS.minZoneEdge;
  const clamp = (v: number) => Math.max(0, Math.min(C, Math.round(v * scale)));
  const x0 = clamp(Math.min(a.x, b.x));
  const y0 = clamp(Math.min(a.y, b.y));
  const width = Math.max(min, clamp(Math.max(a.x, b.x)) - x0);
  const height = Math.max(min, clamp(Math.max(a.y, b.y)) - y0);
  return { x: Math.min(x0, C - width), y: Math.min(y0, C - height), width, height };
}
