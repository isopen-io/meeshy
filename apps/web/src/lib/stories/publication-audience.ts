import type { PostVisibility } from '@meeshy/shared/types/post';
import { repostVisibilityInheritsAudienceList } from '@meeshy/shared/utils/repost-audience';

import type { PublicationKind } from '@/lib/stories/publication-kind';

/**
 * Des unions ÉTROITES, jamais `InterfaceCatalogKey` (le catalogue ENTIER) :
 * `translate()` calcule ses paramètres nommés en distribuant sur TOUTE la
 * largeur de `K` (`Placeholders<FrenchCatalog[K]>`, `i18n-catalog.ts`) — élargi
 * à `InterfaceCatalogKey`, il croiserait une clé à paramètre ailleurs dans le
 * catalogue (`announce.selectionCap`) et exigerait un troisième argument que
 * ces six clés n'ont jamais.
 */
export type AudienceLabelKey =
  | 'story.studio.audience.public'
  | 'story.studio.audience.community'
  | 'story.studio.audience.friends'
  | 'story.studio.audience.except'
  | 'story.studio.audience.only'
  | 'story.studio.audience.private';

export type AudienceRefusalKey = 'story.studio.audience.refusal.people';

/**
 * **L'AUDIENCE DU STUDIO** (#7683, première tranche du registre #7463 —
 * ligne « audience ») — le miroir web de `PostVisibility.swift:6-13/48-50`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Story/PostVisibility.swift`) : les
 * SIX audiences, dans l'ORDRE du composeur iOS.
 *
 * Ce module ne connaît AUCUN état ni réseau — c'est la loi PURE que
 * `story-compose.tsx` (orchestration) et `story-compose-audience.tsx`
 * (présentation) appellent, jamais une seconde table écrite à la main.
 */
export const STUDIO_AUDIENCES: readonly PostVisibility[] = ['PUBLIC', 'COMMUNITY', 'FRIENDS', 'EXCEPT', 'ONLY', 'PRIVATE'];

/**
 * **CE QUE LE STUDIO OFFRE** — la loi D-100 importée telle quelle
 * (`repostVisibilityInheritsAudienceList`, `@meeshy/shared/utils/repost-audience`,
 * `ComposerAudienceOffer.offered(for:)` iOS,
 * `Composer/ComposerSurfaceRules.swift:845-857`) : une REPUBLICATION retire
 * `EXCEPT` et `ONLY`, dont la portée est la liste de l'ORIGINAL, jamais
 * celle du republieur. Le studio web n'a pas encore de flux de republication
 * (`repostOfId` reste `null` en pratique) — la loi est importée maintenant
 * pour que le jour où il en a un, aucune réécriture ne soit nécessaire ici.
 */
export function offeredAudiences(params: { readonly repostOfId: string | null }): readonly PostVisibility[] {
  if (params.repostOfId === null) return STUDIO_AUDIENCES;
  return STUDIO_AUDIENCES.filter((visibility) => !repostVisibilityInheritsAudienceList(visibility));
}

/** Les audiences que le studio sait CHOISIR aujourd'hui — toutes sauf les
 * deux modes NOMINATIFS, faute de sélecteur de personnes. */
export type ChoosableAudience = Exclude<PostVisibility, 'EXCEPT' | 'ONLY'>;

/** Un type SOMME : choisissable (et alors l'audience est RÉTRÉCIE au type
 * qui le prouve), ou refusée AVEC la clé de sa raison. */
export type AudienceAvailability =
  | { readonly choosable: true; readonly audience: ChoosableAudience }
  | { readonly choosable: false; readonly reasonKey: AudienceRefusalKey };

/**
 * **GRISÉ AVEC SA RAISON, JAMAIS ABSENT** (loi 4 + `ComposerFormatAvailability`,
 * `Composer/ComposerFormatAvailability.swift:16-60`) — `ONLY` et `EXCEPT`
 * demandent un sélecteur de personnes que le web n'a pas encore (#7463, ligne
 * « audience », seconde tranche) : ils restent AU MENU, non choisissables,
 * avec leur raison dite.
 */
export function audienceAvailability(visibility: PostVisibility): AudienceAvailability {
  if (visibility === 'EXCEPT' || visibility === 'ONLY') return { choosable: false, reasonKey: 'story.studio.audience.refusal.people' };
  return { choosable: true, audience: visibility };
}

/**
 * **JAMAIS `EXCEPT`/`ONLY` EN MÉMOIRE** — miroir de
 * `StoryVisibilityPreferenceStore.isRememberable`
 * (`apps/ios/Meeshy/Features/Main/Services/StoryVisibilityPreferenceStore.swift:23-26`) :
 * leur portée est une liste que le studio ne peut pas reproduire au prochain
 * écran, et les proposer à nouveau élargirait silencieusement l'audience.
 * `false` sur toute valeur qui n'est pas l'une des six (donnée corrompue).
 */
export function isRememberableAudience(value: unknown): value is ChoosableAudience {
  return typeof value === 'string' && STUDIO_AUDIENCES.includes(value as PostVisibility) && value !== 'EXCEPT' && value !== 'ONLY';
}

/**
 * **LE DÉFAUT DE LA PASSERELLE, ÉPINGLÉ** — celui que pose
 * `services/gateway/src/routes/posts/core.ts:421`
 * (`visibility: parsed.data.visibility ?? (parsed.data.type === 'STORY' ? 'FRIENDS' : 'PUBLIC')`)
 * quand le corps ne porte pas `visibility` (D-111, § 0). Ce n'est PAS ce que
 * le studio ENVOIE — le corps reste sans le champ tant que rien n'est choisi
 * (loi 1) — c'est ce que la PASTILLE affiche pour dire à l'auteur ce qui
 * PARTIRA par défaut. Il contredit `DEFAULT_PUBLICATION_VISIBILITY`
 * (`packages/shared/types/post.ts:28`, « PUBLIC, stories confondues ») : le
 * web suit la passerelle qui TOURNE, et l'unification est l'issue #7695.
 */
export function defaultAudienceOf(kind: PublicationKind): ChoosableAudience {
  return kind === 'STORY' ? 'FRIENDS' : 'PUBLIC';
}

/**
 * **LA GRAINE DE L'AUDIENCE** — rang 1 le brouillon persisté (un choix déjà
 * fait pour CETTE publication), rang 2 l'audience demandée par l'adresse
 * (`requestedAudienceFromSearch`, #7729), rang 3 la mémoire du dernier choix
 * (`StudioDraftStore.lastAudience`), sinon `null` : rien n'est choisi, la
 * pastille affichera le défaut de la passerelle (`defaultAudienceOf`).
 * Jamais un mode NOMINATIF, À AUCUN DES DEUX RANGS : le studio ne sait pas
 * les choisir, donc un brouillon qui en porte un (écrit par une version
 * antérieure, ou altéré) partirait sans `visibilityUserIds` et la passerelle
 * le refuserait (`types.ts:319-323`, 400 `VALIDATION_ERROR`) — le rang
 * suivant sert alors, comme si le brouillon n'avait rien dit.
 */
export function seededAudience(params: {
  readonly draftVisibility: PostVisibility | null;
  readonly requestedVisibility?: ChoosableAudience | null;
  readonly memoryVisibility: PostVisibility | null;
}): ChoosableAudience | null {
  if (isRememberableAudience(params.draftVisibility)) return params.draftVisibility;
  if (params.requestedVisibility !== undefined && params.requestedVisibility !== null) return params.requestedVisibility;
  return isRememberableAudience(params.memoryVisibility) ? params.memoryVisibility : null;
}

const REQUESTABLE: Readonly<Record<string, ChoosableAudience>> = { public: 'PUBLIC', friends: 'FRIENDS' };

/**
 * **L'AUDIENCE DEMANDÉE PAR L'ADRESSE** (#7729) — `?audience=friends|public`,
 * posée par l'accueil post-inscription depuis la visibilité par défaut que le
 * SERVEUR sert (`storyDefaultVisibility` : « amis » pour un mineur ou un âge
 * inconnu). Elle se range entre le brouillon et la mémoire : un choix déjà
 * fait pour CETTE publication garde la main, un souvenir d'un autre jour ne
 * l'emporte pas sur la règle du régime protégé. Deux valeurs seulement : une
 * adresse ne peut pas ouvrir un mode nominatif, ni « privé » par surprise.
 */
export function requestedAudienceFromSearch(search: URLSearchParams): ChoosableAudience | null {
  return REQUESTABLE[search.get('audience') ?? ''] ?? null;
}

const AUDIENCE_LABEL_KEY: Readonly<Record<PostVisibility, AudienceLabelKey>> = {
  PUBLIC: 'story.studio.audience.public',
  COMMUNITY: 'story.studio.audience.community',
  FRIENDS: 'story.studio.audience.friends',
  EXCEPT: 'story.studio.audience.except',
  ONLY: 'story.studio.audience.only',
  PRIVATE: 'story.studio.audience.private',
};

export const audienceLabelKey = (visibility: PostVisibility): AudienceLabelKey => AUDIENCE_LABEL_KEY[visibility];
