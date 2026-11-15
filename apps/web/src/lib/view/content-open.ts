import { isOpenOrigin, type OpenOrigin, type ViewProvenance } from '@meeshy/shared/types/content-reach';
import type { ContentSurface } from '@meeshy/shared/types/content-surfaces';

/**
 * **D'OÙ UN CONTENU EST OUVERT, PAR OÙ SON ÉCRAN EST ARRIVÉ** (#10483, demande
 * du porteur 2026-10-13) — les lois PURES du tap et de la vue.
 *
 * - Le TAP sur un contenu d'un listing envoie l'engagement `open` avec son
 *   ORIGINE (le listing), et l'adresse qu'il ouvre la porte : `?from=<origine>`.
 * - L'ÉCRAN DÉTAIL (fiche, lecteur de réels, lecteur de story) compte une vue
 *   qui porte sa PROVENANCE, lue de son adresse et du référent.
 *
 * `?from=` est le SEUL marqueur : `notification` (posé par la rangée de
 * notification), `tracking_link` (posé par `/l/<jeton>`, `sharedContentPath`),
 * ou une origine de listing. Une valeur inconnue ne s'invente jamais en
 * origine : la loi continue comme si elle était absente.
 */
export const OPENED_FROM_PARAM = 'from';

export type ViewAttribution =
  | { readonly provenance: 'listing'; readonly origin: OpenOrigin }
  | { readonly provenance: 'notification' | 'shared_link' | 'tracking_link' | 'external' | 'direct' };

/** Les réels atteints par BALAYAGE dans le lecteur : un listing, celui des réels. */
export const SWIPED_REEL: ViewAttribution = { provenance: 'listing', origin: 'reels' };

/** Les stories atteintes en AVANÇANT dans le lecteur : la pile du rail. */
export const ADVANCED_STORY: ViewAttribution = { provenance: 'listing', origin: 'story_rail' };

/**
 * L'attribution d'un LECTEUR qui enchaîne les contenus (réels, stories) : le
 * PREMIER contenu affiché porte la provenance d'entrée de l'écran, tout autre
 * contenu celle de l'enchaînement (`next`).
 */
export function entryAttribution(entry: ViewAttribution, next: ViewAttribution): (postId: string) => ViewAttribution {
  let first: string | null = null;
  return (postId) => {
    first ??= postId;
    return postId === first ? entry : next;
  };
}

function isForeignReferrer(referrer: string, ownOrigins: readonly string[]): boolean {
  if (referrer === '') return false;
  try {
    return !ownOrigins.includes(new URL(referrer).origin);
  } catch {
    return false;
  }
}

/**
 * La provenance d'une vue d'écran détail. `referrer` n'est à fournir que pour
 * l'écran d'ATTERRISSAGE (`document.referrer` est celui du chargement de la
 * page, jamais d'une navigation dans l'application). `ownOrigins` : les
 * origines de Meeshy (publique et celle de la page) — un référent qui en vient
 * n'est pas « ailleurs ».
 */
export function viewProvenanceOf(search: URLSearchParams, referrer: string, ownOrigins: readonly string[]): ViewAttribution {
  const from = search.get(OPENED_FROM_PARAM);
  if (from === 'notification') return { provenance: 'notification' };
  if (from === 'tracking_link') return { provenance: 'tracking_link' };
  if (isOpenOrigin(from)) return { provenance: 'listing', origin: from };
  if ((search.get('via') ?? '') !== '') return { provenance: 'shared_link' };
  if (isForeignReferrer(referrer, ownOrigins)) return { provenance: 'external' };
  return { provenance: 'direct' };
}

/** Les champs que la vue porte sur le fil : l'origine ne voyage qu'avec `listing`. */
export function viewFieldsOf(attribution: ViewAttribution): { readonly provenance: ViewProvenance; readonly origin?: OpenOrigin } {
  return attribution.provenance === 'listing'
    ? { provenance: 'listing', origin: attribution.origin }
    : { provenance: attribution.provenance };
}

/** Le listing qu'une surface d'impression désigne — `null` pour un écran plein cadre. */
export function openOriginOfSurface(surface: ContentSurface): OpenOrigin | null {
  return isOpenOrigin(surface) ? surface : null;
}

/** La requête de l'adresse qu'un tap ouvre : `?from=<origine>`, ou rien. */
export function openLinkSearch(origin: OpenOrigin | null): Readonly<Record<string, string>> {
  return origin === null ? {} : { [OPENED_FROM_PARAM]: origin };
}
