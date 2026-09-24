import { qualifiesAsReel, type ReelMediaLike } from '@meeshy/shared/utils/reel-composition';

import { studioPublishablePageCount, type StudioDraft } from './studio';
import type { StudioVisualAsset } from './studio-page';

/**
 * **CE QUE LE STUDIO PUBLIE** (#7497, directive porteur 2026-09-22) — un seul
 * composer pour la story, le post et le réel. Le format suit le POINT
 * D'ENTRÉE (le rail des stories ouvre une story, la porte du fil un post ou
 * un réel) ; le chevron de la capsule `[Publier la story | ▾]` en choisit un
 * autre. Sans ce geste, la publication part au format indiqué.
 *
 * Miroir de `ComposerPublishMenuRule` / `ComposerPublishMenuCopy.publishTitle`
 * (iOS, `ComposerPublishMenu.swift`).
 */
export type PublicationKind = 'STORY' | 'POST' | 'REEL';

/** L'ordre du menu — celui d'iOS pour une porte de story : story, post, réel. */
export const PUBLICATION_KINDS: readonly PublicationKind[] = ['STORY', 'POST', 'REEL'];

const SEARCH_VALUES: Readonly<Record<PublicationKind, string>> = { STORY: 'story', POST: 'post', REEL: 'reel' };

export const publicationSearchValue = (kind: PublicationKind): string => SEARCH_VALUES[kind];

/** `?type=` choisit le format ; toute autre valeur rend celui de l'entrée. */
export function publicationKindFromSearch(search: URLSearchParams, fallback: PublicationKind): PublicationKind {
  const value = search.get('type');
  return PUBLICATION_KINDS.find((kind) => SEARCH_VALUES[kind] === value) ?? fallback;
}

/**
 * **D'OÙ L'ON OUVRE LE STUDIO** (#7729) — `?from=onboarding` : l'accueil
 * post-inscription ouvre le studio pour la première story, et la fermeture
 * comme la publication y RAMÈNENT, au lieu de laisser le nouveau venu dans la
 * liste des stories, hors de son parcours. Une valeur fermée, jamais une
 * adresse de retour libre : rien d'autre qu'une route connue ne s'ouvre ainsi.
 */
export type StudioOrigin = 'onboarding';

export const studioOriginFromSearch = (search: URLSearchParams): StudioOrigin | null =>
  search.get('from') === 'onboarding' ? 'onboarding' : null;

export type PublicationRefusal = 'reel-without-qualifying-media' | 'story-with-several-pages';

const visualMedia = (asset: StudioVisualAsset | null): ReelMediaLike[] =>
  asset === null ? [] : [{ mimeType: `${asset.mediaType}/*`, duration: asset.durationMs ?? null }];

/** Les médias du plateau tels que la règle du réel les lit — la durée est
 * celle MESURÉE sur le fichier local, jamais supposée. **APLATIT TOUTES LES
 * PAGES** (#7684, directive porteur : « le réel d'images (≥ 2 pages) qualifie
 * par la règle serveur importée ») : deux pages d'UNE image chacune qualifient
 * exactement comme deux images sur la MÊME page — `qualifiesAsReel` ne
 * distingue pas leur provenance, seulement leur NATURE. */
export function studioReelMedia(draft: StudioDraft): ReelMediaLike[] {
  return draft.pages.flatMap((page) => [
    ...visualMedia(page.background),
    ...visualMedia(page.overlay),
    ...(page.sound === null ? [] : [{ mimeType: 'audio/*', duration: page.sound.durationMs ?? null }]),
  ]);
}

/**
 * LE RÉEL SE REFUSE, IL NE SE DÉGRADE PAS — `qualifiesAsReel` est la règle
 * SERVEUR (`packages/shared/utils/reel-composition.ts`) : sans elle côté
 * client, la passerelle rétrograderait le réel en post sans un mot.
 *
 * **UNE STORY DE PLUSIEURS PAGES SE REFUSE AUSSI** (#7684, question 9.4) :
 * iOS la publie en UN post PAR page (canal `.scene`,
 * `ComposerPublishChannel.swift:87`) ; ce canal n'est pas écrit côté web, et
 * le lecteur de story ne rend que la scène 0 (`routes/story.tsx`) — publier
 * le document entier perdrait les pages suivantes EN SILENCE.
 */
export function studioPublishRefusal(draft: StudioDraft, kind: PublicationKind): PublicationRefusal | null {
  if (kind === 'STORY') return studioPublishablePageCount(draft) > 1 ? 'story-with-several-pages' : null;
  if (kind !== 'REEL') return null;
  return qualifiesAsReel(studioReelMedia(draft)) ? null : 'reel-without-qualifying-media';
}
