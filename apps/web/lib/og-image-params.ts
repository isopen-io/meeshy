/**
 * Ce qu'une URL publique a le droit de demander à l'image sociale (#4338).
 *
 * Quatre pages composent une balise `og:image` vers `/api/og-image-dynamic`
 * — l'invitation d'un lien de conversation, le parrainage, le profil public,
 * la conversation partagée. La route n'existait pas : mesuré `404` sur
 * staging le 2026-08-30, donc **toute prévisualisation de lien Meeshy était
 * sans image** sur les quatre surfaces, partout où on colle un lien.
 *
 * La règle vit ici, séparée du rendu, parce que c'est elle qu'un témoin peut
 * atteindre : `ImageResponse` compose par Satori et un rasteriseur wasm, et
 * l'exercer sous jest atteste le rendu, jamais ce que la route ACCEPTE.
 */

/** Les quatre gabarits, dérivés des quatre pages qui les composent. */
export const OG_TYPES = ['invitation', 'affiliate', 'profile', 'conversation'] as const;

export type OgImageType = (typeof OG_TYPES)[number];

/**
 * Les bornes, parce que cette adresse est PUBLIQUE et non authentifiée :
 * n'importe qui peut y demander un titre de dix mille caractères. Elles
 * protègent la mise en page autant que le coût de rendu.
 */
export const OG_LIMITES = {
  title: 90,
  subtitle: 70,
  userName: 40,
  message: 160,
} as const;

export type OgImageParams = {
  readonly type: OgImageType;
  readonly title: string;
  readonly subtitle: string;
  readonly userName: string;
  readonly message: string;
};

/**
 * Le gabarit servi quand rien n'est demandé, ou quand ce qui l'est n'existe
 * pas. Voir `parseOgImageParams` pour le sens de la panne.
 */
const TYPE_PAR_DEFAUT: OgImageType = 'conversation';

const estUnType = (valeur: string | null): valeur is OgImageType =>
  valeur !== null && (OG_TYPES as readonly string[]).includes(valeur);

/**
 * Une ligne de texte destinée à une image : les blancs sont normalisés, sans
 * quoi un retour à la ligne collé dans un titre casse la mise en page d'une
 * vignette que personne ne relira.
 */
const ligne = (valeur: string | null, limite: number): string =>
  (valeur ?? '').replace(/\s+/g, ' ').trim().slice(0, limite);

/**
 * Lit ce que l'URL demande, et ne refuse JAMAIS.
 *
 * Le sens de la panne est ici l'inverse de celui d'une surface de données :
 * cette image est lue par des robots tiers qu'on ne contrôle pas, et un refus
 * leur rend une vignette VIDE — c'est-à-dire exactement le symptôme que #4338
 * corrige. Un type inconnu retombe donc sur un gabarit neutre plutôt que de
 * rendre un `400` que personne ne lira jamais.
 */
export function parseOgImageParams(searchParams: URLSearchParams): OgImageParams {
  const type = searchParams.get('type');
  return {
    type: estUnType(type) ? type : TYPE_PAR_DEFAUT,
    title: ligne(searchParams.get('title'), OG_LIMITES.title),
    subtitle: ligne(searchParams.get('subtitle'), OG_LIMITES.subtitle),
    userName: ligne(searchParams.get('userName'), OG_LIMITES.userName),
    message: ligne(searchParams.get('message'), OG_LIMITES.message),
  };
}
