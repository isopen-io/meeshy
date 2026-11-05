import type { PackDomain } from '@meeshy/shared/types/content-pack';

/**
 * **LES DOMAINES DE DÉCOR, SANS LEURS CATALOGUES** (#16267) — ce que la
 * boutique lit pour décider qu'un pack s'ouvre sur sa fiche et son plein
 * écran, et la clé de cache de ses éléments. Module LÉGER : la boutique
 * l'importe statiquement, alors que les catalogues embarqués (`decor-items.ts`)
 * n'arrivent qu'avec la fiche ou le plein écran, par `import()`.
 */

export const DECOR_DOMAINS = ['avatar-ring', 'banner', 'banner-frame', 'wallpaper'] as const satisfies readonly PackDomain[];

export type DecorDomain = (typeof DECOR_DOMAINS)[number];

export const isDecorDomain = (value: string): value is DecorDomain => (DECOR_DOMAINS as readonly string[]).includes(value);

export const packItemsQueryKey = (domain: DecorDomain, slug: string): readonly unknown[] => ['pack', domain, slug, 'items'];
