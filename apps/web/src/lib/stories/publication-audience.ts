import { POST_VISIBILITIES, type PostVisibility } from '@meeshy/shared/types/post';
import { repostVisibilityInheritsAudienceList } from '@meeshy/shared/utils/repost-audience';

import type { PublicationKind } from '@/lib/stories/publication-kind';

/**
 * Des unions ÉTROITES, jamais `InterfaceCatalogKey` (le catalogue ENTIER) :
 * `translate()` calcule ses paramètres nommés en distribuant sur TOUTE la
 * largeur de `K` (`Placeholders<FrenchCatalog[K]>`, `i18n-catalog.ts`) — élargi
 * à `InterfaceCatalogKey`, il croiserait une clé à paramètre ailleurs dans le
 * catalogue (`announce.selectionCap`) et exigerait un troisième argument que
 * ces clés n'ont jamais.
 */
export type AudienceLabelKey =
  | 'story.studio.audience.public'
  | 'story.studio.audience.community'
  | 'story.studio.audience.acquaintances'
  | 'story.studio.audience.friends'
  | 'story.studio.audience.close'
  | 'story.studio.audience.blood'
  | 'story.studio.audience.except'
  | 'story.studio.audience.only'
  | 'story.studio.audience.private';

export type AudienceRefusalKey = 'story.studio.audience.refusal.people';

/**
 * Les audiences que le studio OFFRE : toutes celles de l'union partagée, les
 * trois audiences de CERCLE comprises (`ACQUAINTANCES`, `CLOSE`, `BLOOD`,
 * #13931, #13939) — Connaissances et au-dessus, Proches et au-dessus, Sang
 * seul, au niveau EFFECTIF de l'auteur avec le lecteur.
 */
export type StudioAudience = PostVisibility;

/**
 * **L'AUDIENCE DU STUDIO** (#7683, première tranche du registre #7463 —
 * ligne « audience ») — le miroir web de `PostVisibility.composerSelectableCases`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Story/PostVisibility.swift`, #13939) :
 * l'échelle des cercles, du plus large au plus étroit (Public → Communauté →
 * Connaissances → Amis → Proches → Sang), puis les audiences nommées et le
 * privé — l'ORDRE du composeur iOS.
 *
 * Ce module ne connaît AUCUN état ni réseau — c'est la loi PURE que
 * `story-compose.tsx` (orchestration) et `story-compose-audience.tsx`
 * (présentation) appellent, jamais une seconde table écrite à la main.
 */
export const STUDIO_AUDIENCES = [
  'PUBLIC',
  'COMMUNITY',
  'ACQUAINTANCES',
  'FRIENDS',
  'CLOSE',
  'BLOOD',
  'EXCEPT',
  'ONLY',
  'PRIVATE',
] as const satisfies readonly StudioAudience[];

/**
 * **UNE AUDIENCE SERVIE SE LIT FAIL-CLOSED** (#13939, miroir de
 * `PostVisibility(served:)`) — une valeur que ce client ne connaît pas se lit
 * `RESTRICTED`, jamais `PUBLIC` : afficher « Public » une audience inconnue, puis
 * la réécrire en public à l'édition, est le risque que cette lecture referme.
 * iOS la lit `PRIVATE` ; le web la DIT « Restreinte » et ne la réécrit pas, ce
 * qui est le même verdict sans affirmer un mode que l'auteur n'a pas choisi.
 * Absente (`null`), elle reste absente.
 */
export type ServedAudience = PostVisibility | 'RESTRICTED';

export function servedAudience(value: unknown): ServedAudience | null {
  if (value === null || value === undefined) return null;
  const upper = typeof value === 'string' ? value.toUpperCase() : null;
  return POST_VISIBILITIES.find((known) => known === upper) ?? 'RESTRICTED';
}

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
export function offeredAudiences(params: { readonly repostOfId: string | null }): readonly StudioAudience[] {
  if (params.repostOfId === null) return STUDIO_AUDIENCES;
  return STUDIO_AUDIENCES.filter((visibility) => !repostVisibilityInheritsAudienceList(visibility));
}

/** Les audiences que le studio sait CHOISIR aujourd'hui — toutes sauf les
 * deux modes NOMINATIFS, faute de sélecteur de personnes. */
export type ChoosableAudience = Exclude<StudioAudience, 'EXCEPT' | 'ONLY'>;

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
export function audienceAvailability(visibility: StudioAudience): AudienceAvailability {
  if (visibility === 'EXCEPT' || visibility === 'ONLY') return { choosable: false, reasonKey: 'story.studio.audience.refusal.people' };
  return { choosable: true, audience: visibility };
}

/**
 * **JAMAIS `EXCEPT`/`ONLY` EN MÉMOIRE** — miroir de
 * `StoryVisibilityPreferenceStore.isRememberable`
 * (`apps/ios/Meeshy/Features/Stories/Services/StoryVisibilityPreferenceStore.swift:23-26`) :
 * leur portée est une liste que le studio ne peut pas reproduire au prochain
 * écran, et les proposer à nouveau élargirait silencieusement l'audience.
 * `false` sur toute valeur qui n'est pas l'une des neuf (donnée corrompue).
 */
export function isRememberableAudience(value: unknown): value is ChoosableAudience {
  return STUDIO_AUDIENCES.some((known) => known === value && known !== 'EXCEPT' && known !== 'ONLY');
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

const AUDIENCE_LABEL_KEY: Readonly<Record<StudioAudience, AudienceLabelKey>> = {
  PUBLIC: 'story.studio.audience.public',
  COMMUNITY: 'story.studio.audience.community',
  ACQUAINTANCES: 'story.studio.audience.acquaintances',
  FRIENDS: 'story.studio.audience.friends',
  CLOSE: 'story.studio.audience.close',
  BLOOD: 'story.studio.audience.blood',
  EXCEPT: 'story.studio.audience.except',
  ONLY: 'story.studio.audience.only',
  PRIVATE: 'story.studio.audience.private',
};

export const audienceLabelKey = (visibility: StudioAudience): AudienceLabelKey => AUDIENCE_LABEL_KEY[visibility];

/** D'où vient la valeur que la pastille affiche : l'auteur l'a CHOISIE, c'est
 * le défaut que la passerelle posera, ou c'est l'audience SERVIE d'une
 * publication rouverte que le studio ne sait pas choisir (inconnue, nominative). */
export type AudienceSource = 'chosen' | 'default' | 'served';

export type ShownAudience = { readonly value: StudioAudience | 'RESTRICTED'; readonly source: AudienceSource };

/**
 * **CE QUE LA PASTILLE DIT** (#13939) — le choix, sinon l'audience SERVIE d'une
 * publication rouverte, sinon le défaut de la passerelle. Sans le rang du milieu,
 * l'édition d'une publication à l'audience inconnue ou nominative affichait
 * « Public · par défaut » : un mensonge sur une audience que rien ne réécrit
 * (le plan d'édition n'envoie `visibility` que CHANGÉE).
 */
export function shownAudience(params: {
  readonly chosen: ChoosableAudience | null;
  readonly served: ServedAudience | null;
  readonly fallback: ChoosableAudience;
}): ShownAudience {
  if (params.chosen !== null) return { value: params.chosen, source: 'chosen' };
  if (params.served !== null) return { value: params.served, source: 'served' };
  return { value: params.fallback, source: 'default' };
}
