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

/**
 * **LES QUATRE RACINES DES PACKS** (#20438) — déclarées parce que
 * `CATCH_UP_FAMILIES` (`socket.ts`) doit périmer les quatre à chaque
 * (ré)authentification, et que les clés ci-dessous en DÉRIVENT : une racine
 * qu'on recopierait dans la liste du rattrapage divergerait en silence du jour
 * où un domaine change de place.
 *
 * Elles sont QUATRE et non deux parce que les stickers gardent leurs clés
 * historiques (ci-dessus) : `['me','packs']` ne les préfixe pas.
 */
export const PACKS_QUERY_ROOT = ['me', 'packs'] as const;
export const STICKER_PACKS_QUERY_ROOT = ['me', 'sticker-packs'] as const;
export const PACK_DETAIL_QUERY_ROOT = ['pack'] as const;
export const STICKER_PACK_DETAIL_QUERY_ROOT = ['sticker-pack'] as const;

/** Ce que le rattrapage du socket doit périmer pour qu'un pack acheté, GAGNÉ ou
 * retiré ailleurs pendant une coupure ne reste pas invisible cinq minutes. */
export const PACK_CATCH_UP_ROOTS = [
  PACKS_QUERY_ROOT,
  STICKER_PACKS_QUERY_ROOT,
  PACK_DETAIL_QUERY_ROOT,
  STICKER_PACK_DETAIL_QUERY_ROOT,
] as const;

const STICKER_KEYS: PackQueryKeys = {
  catalogue: [...STICKER_PACKS_QUERY_ROOT, 'catalogue'],
  installed: [...STICKER_PACKS_QUERY_ROOT, 'installed'],
  detail: (slug) => [...STICKER_PACK_DETAIL_QUERY_ROOT, slug],
};

/**
 * **LA VITRINE UNIFIÉE** — `['me','packs','shop', <filtre>]`, une entrée par
 * filtre sous cette racine.
 *
 * Déclarée ICI, et non chez l'écran qui la sert (`unified-shop.tsx`), pour la
 * même raison que `me-keys.ts` existe (#18914, #20349) : le temps réel doit
 * NOMMER cette requête pour la périmer, et importer le composant la tirerait,
 * avec ses ports et ses décodeurs, dans le morceau `realtime`
 * (`budgets.json › realtime`). Ce module n'importe qu'un TYPE.
 *
 * Le SOLDE (`['me','packs','balance']`) n'est pas ici, et c'est une décision :
 * sa requête est inerte (`enabled: false`, `staleTime: Infinity`) — la périmer
 * ne déclencherait rien. C'est `loadCatalogue` qui l'écrit, à chaque relecture
 * de la vitrine ; périmer la vitrine suffit donc à rafraîchir le solde après
 * un achat fait ailleurs.
 */
export const PACK_SHOP_QUERY_ROOT = [...PACKS_QUERY_ROOT, 'shop'] as const;

export const packQueryKeys = (domain: PackDomain): PackQueryKeys =>
  domain === 'sticker'
    ? STICKER_KEYS
    : {
        catalogue: [...PACKS_QUERY_ROOT, domain, 'catalogue'],
        installed: [...PACKS_QUERY_ROOT, domain, 'installed'],
        detail: (slug) => [...PACK_DETAIL_QUERY_ROOT, domain, slug],
      };
