import type { PostVisibility } from '@meeshy/shared/types/post';
import { repostVisibilityInheritsAudienceList } from '@meeshy/shared/utils/repost-audience';

import type { PublicationKind } from '@/lib/stories/publication-kind';

import type { StoryAudienceGlyphName } from '@/components/glyphs-story-audience';

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

export type AudienceSubtitleKey =
  | 'story.studio.audience.subtitle.public'
  | 'story.studio.audience.subtitle.community'
  | 'story.studio.audience.subtitle.friends'
  | 'story.studio.audience.subtitle.except'
  | 'story.studio.audience.subtitle.only'
  | 'story.studio.audience.subtitle.private';

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

export type AudienceAvailability = { readonly choosable: true } | { readonly choosable: false; readonly reasonKey: AudienceRefusalKey };

/**
 * **GRISÉ AVEC SA RAISON, JAMAIS ABSENT** (loi 4 + `ComposerFormatAvailability`,
 * `Composer/ComposerFormatAvailability.swift:16-60`) — `ONLY` et `EXCEPT`
 * demandent un sélecteur de personnes que le web n'a pas encore (#7463, ligne
 * « audience », seconde tranche) : ils restent AU MENU, non choisissables,
 * avec leur raison dite.
 */
export function audienceAvailability(visibility: PostVisibility): AudienceAvailability {
  if (visibility === 'EXCEPT' || visibility === 'ONLY') return { choosable: false, reasonKey: 'story.studio.audience.refusal.people' };
  return { choosable: true };
}

/**
 * **JAMAIS `EXCEPT`/`ONLY` EN MÉMOIRE** — miroir de
 * `StoryVisibilityPreferenceStore.isRememberable`
 * (`apps/ios/Meeshy/Features/Main/Services/StoryVisibilityPreferenceStore.swift:23-26`) :
 * leur portée est une liste que le studio ne peut pas reproduire au prochain
 * écran, et les proposer à nouveau élargirait silencieusement l'audience.
 * `false` sur toute valeur qui n'est pas l'une des six (donnée corrompue).
 */
export function isRememberableAudience(value: unknown): value is PostVisibility {
  return typeof value === 'string' && STUDIO_AUDIENCES.includes(value as PostVisibility) && value !== 'EXCEPT' && value !== 'ONLY';
}

/**
 * **LE DÉFAUT DE LA PASSERELLE, ÉPINGLÉ** — celui que pose
 * `services/gateway/src/routes/posts/core.ts:421`
 * (`visibility: parsed.data.visibility ?? (parsed.data.type === 'STORY' ? 'FRIENDS' : 'PUBLIC')`)
 * quand le corps ne porte pas `visibility` (D-111, § 0). Ce n'est PAS ce que
 * le studio ENVOIE — le corps reste sans le champ tant que rien n'est choisi
 * (loi 1) — c'est ce que la PASTILLE affiche pour dire à l'auteur ce qui
 * PARTIRA par défaut.
 */
export function defaultAudienceOf(kind: PublicationKind): PostVisibility {
  return kind === 'STORY' ? 'FRIENDS' : 'PUBLIC';
}

/**
 * **LA GRAINE DE L'AUDIENCE** — rang 1 le brouillon persisté (un choix déjà
 * fait pour CETTE publication), rang 2 la mémoire du dernier choix
 * (`StudioDraftStore.lastAudience`), sinon `null` : rien n'est choisi, la
 * pastille affichera le défaut de la passerelle (`defaultAudienceOf`).
 * Jamais un mode NOMINATIF depuis la mémoire — {@link isRememberableAudience}
 * l'a déjà exclu à l'écriture, cette fonction le revérifie à la lecture pour
 * une mémoire écrite par une version antérieure ou corrompue.
 */
export function seededAudience(params: {
  readonly draftVisibility: PostVisibility | null;
  readonly memoryVisibility: PostVisibility | null;
}): PostVisibility | null {
  if (params.draftVisibility !== null) return params.draftVisibility;
  return isRememberableAudience(params.memoryVisibility) ? params.memoryVisibility : null;
}

const AUDIENCE_GLYPH: Readonly<Record<PostVisibility, StoryAudienceGlyphName>> = {
  PUBLIC: 'globe',
  COMMUNITY: 'usersThree',
  FRIENDS: 'users',
  EXCEPT: 'userMinus',
  ONLY: 'userCheck',
  PRIVATE: 'lock',
};

export const audienceGlyph = (visibility: PostVisibility): StoryAudienceGlyphName => AUDIENCE_GLYPH[visibility];

const AUDIENCE_LABEL_KEY: Readonly<Record<PostVisibility, AudienceLabelKey>> = {
  PUBLIC: 'story.studio.audience.public',
  COMMUNITY: 'story.studio.audience.community',
  FRIENDS: 'story.studio.audience.friends',
  EXCEPT: 'story.studio.audience.except',
  ONLY: 'story.studio.audience.only',
  PRIVATE: 'story.studio.audience.private',
};

export const audienceLabelKey = (visibility: PostVisibility): AudienceLabelKey => AUDIENCE_LABEL_KEY[visibility];

const AUDIENCE_SUBTITLE_KEY: Readonly<Record<PostVisibility, AudienceSubtitleKey>> = {
  PUBLIC: 'story.studio.audience.subtitle.public',
  COMMUNITY: 'story.studio.audience.subtitle.community',
  FRIENDS: 'story.studio.audience.subtitle.friends',
  EXCEPT: 'story.studio.audience.subtitle.except',
  ONLY: 'story.studio.audience.subtitle.only',
  PRIVATE: 'story.studio.audience.subtitle.private',
};

export const audienceSubtitleKey = (visibility: PostVisibility): AudienceSubtitleKey => AUDIENCE_SUBTITLE_KEY[visibility];
