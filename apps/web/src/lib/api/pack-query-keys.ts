import type { PackDomain } from '@meeshy/shared/types/content-pack';

/**
 * **LES CLÉS DE CACHE DES PACKS, PAR DOMAINE** (#10149, LP1) — une seule
 * feuille pour les stickers et les cadres. Les stickers gardent leurs clés
 * HISTORIQUES à l'identique (`['me', 'sticker-packs', …]`, `['sticker-pack', slug]`) :
 * le cache persisté d'un appareil déjà servi reste lu, aucun écran ne repart
 * à vide. Les autres domaines vivent sous `['me', 'packs', <domaine>, …]`.
 */
export type PackQueryKeys = {
  readonly catalogue: readonly unknown[];
  readonly installed: readonly unknown[];
  readonly detail: (slug: string) => readonly unknown[];
};

const STICKER_KEYS: PackQueryKeys = {
  catalogue: ['me', 'sticker-packs', 'catalogue'],
  installed: ['me', 'sticker-packs', 'installed'],
  detail: (slug) => ['sticker-pack', slug],
};

export const packQueryKeys = (domain: PackDomain): PackQueryKeys =>
  domain === 'sticker'
    ? STICKER_KEYS
    : {
        catalogue: ['me', 'packs', domain, 'catalogue'],
        installed: ['me', 'packs', domain, 'installed'],
        detail: (slug) => ['pack', domain, slug],
      };
