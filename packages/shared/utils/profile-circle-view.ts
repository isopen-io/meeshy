/**
 * LA FICHE PAR CERCLE — ce que le cercle du lecteur ouvre sur la fiche d'une
 * personne, ce qu'il ferme, et le cercle qui l'ouvrirait (#18861, chantier #18857).
 *
 * UNE fonction pure, sans I/O, qui NE réécrit AUCUNE règle : chaque état est le
 * verdict de `resolveRelationAccess` (la loi d'accès des cercles). L'orchestrateur
 * gateway lit les accords, le blocage, la communauté, l'âge et le rôle, puis
 * l'appelle ; « Voir comme » l'appelle avec un lecteur SYNTHÉTIQUE du cercle
 * demandé — jamais par une seconde boucle de niveaux.
 *
 * ## Ce qu'un état `locked` ne porte JAMAIS
 *
 * Un état est `{ state, circle, consentRequired }` : le cercle qui l'ouvre et un
 * booléen STATIQUE (la feature passe-t-elle par un consentement ?). Jamais la
 * valeur protégée, jamais un champ voisin (présence, position, batterie, jeu), et
 * jamais le CHOIX de la personne : un lecteur Sang d'une personne qui a refusé le
 * partage de sa position lit `open` + `consentRequired`, comme tout autre lecteur
 * Sang — la valeur, elle, ne part que par la route qui la sert, sous consentement.
 * `open` dit « ce niveau suffit », pas « la valeur existe ».
 *
 * ## Fuseau et pays d'inscription
 *
 * Ils ne sont pas des capacités mais des CHAMPS de la fiche : leur plancher est
 * celui d'une feature existante (`PROFILE_FIELD_FEATURE`), pour ne créer aucune
 * feature de la loi — donc aucun miroir Swift ou Kotlin de plus à tenir.
 */

import {
  RELATION_CONSENT_FEATURES,
  RELATION_FEATURE_MIN_LEVEL,
  type RelationFeature,
} from './relation-levels.js';
import { resolveRelationAccess, type RelationAgeClass } from './relation-access.js';
import { compareRelationLevel, parseRelationLevel, relationRungAfter, type RelationLevel, type RelationRequestLevel } from '../types/relation.js';

/**
 * Les capacités que la fiche annonce, dans l'ordre où elle les montre, et la
 * feature de la loi dont chacune est le verdict. Le nom est celui du client.
 */
export const PROFILE_CAPABILITY_FEATURE = {
  presence: 'presence.online',
  presenceDetailed: 'presence.detailed',
  game: 'game.basic',
  gameSparks: 'game.sparksGlory',
  directMessage: 'dm.direct',
  messageRequest: 'dm.request',
  ring: 'call.ring',
  talkie: 'talkie',
  together: 'together',
  bring: 'bring',
  listeningCategory: 'listening.category',
  listeningTitle: 'listening.title',
  locationTemporary: 'location.temporary',
  locationLive: 'location.live',
  locationHistory: 'location.history',
  locationProximity: 'location.proximity',
  battery: 'device.battery',
  batteryPull: 'device.battery.pull',
  unreachable: 'device.unreachable',
} as const satisfies Readonly<Record<string, RelationFeature>>;

export type ProfileCapabilityKey = keyof typeof PROFILE_CAPABILITY_FEATURE;

export const PROFILE_CAPABILITIES = Object.keys(PROFILE_CAPABILITY_FEATURE) as readonly ProfileCapabilityKey[];

/** Les champs de fiche gardés par un cercle : la feature dont le plancher les ouvre. */
export const PROFILE_FIELD_FEATURE = {
  country: 'presence.online',
  timezone: 'presence.detailed',
} as const satisfies Readonly<Record<string, RelationFeature>>;

export type ProfileGatedField = keyof typeof PROFILE_FIELD_FEATURE;

export type ProfileCapabilityState = {
  readonly state: 'open' | 'locked';
  /** Le cercle qui ouvre la capacité (le plancher de la matrice). */
  readonly circle: RelationLevel;
  /** La feature passe-t-elle par un consentement de la personne ? Statique : jamais son choix. */
  readonly consentRequired: boolean;
};

/** Ce qu'il faut pour monter d'un cran : lequel des deux accords manque. */
export type ProfileCircleMissing = {
  readonly level: RelationRequestLevel;
  readonly byViewer: boolean;
  readonly byTarget: boolean;
};

export type ProfileCircleView = {
  readonly isSelf: boolean;
  /** Le niveau commun tel que la loi le juge : le plus bas des deux accords, relevé par la communauté ou l'équipe. */
  readonly level: RelationLevel;
  readonly grantedByViewer: RelationLevel;
  readonly grantedByTarget: RelationLevel;
  readonly sharesCommunity: boolean;
  readonly missing: ProfileCircleMissing | null;
  /** Une clé absente = l'action ne s'adresse pas à soi-même. */
  readonly capabilities: Readonly<Partial<Record<ProfileCapabilityKey, ProfileCapabilityState>>>;
};

export type ProfileCircleViewInput = {
  readonly viewerId: string;
  readonly targetId: string;
  readonly grantedByViewer: RelationLevel;
  readonly grantedByTarget: RelationLevel;
  readonly sharesCommunity: boolean;
  readonly blockedEitherWay?: boolean;
  readonly viewerMinor: RelationAgeClass;
  readonly targetMinor: RelationAgeClass;
  readonly viewerRole?: string | null;
  readonly targetRole?: string | null;
};

const verdictOf = (input: ProfileCircleViewInput, feature: RelationFeature) =>
  resolveRelationAccess({
    viewerId: input.viewerId,
    targetId: input.targetId,
    grantedByViewer: input.grantedByViewer,
    grantedByTarget: input.grantedByTarget,
    sharesCommunity: input.sharesCommunity,
    blockedEitherWay: input.blockedEitherWay ?? false,
    viewerMinor: input.viewerMinor,
    targetMinor: input.targetMinor,
    viewerRole: input.viewerRole,
    targetRole: input.targetRole,
    feature,
    // La fiche dit ce que le CERCLE ouvre ; le consentement de la personne n'y est
    // jamais lu (voir l'en-tête) : la valeur protégée l'exige à sa propre porte.
    consent: 'granted',
  });

const stateOf = (allowed: boolean, feature: RelationFeature): ProfileCapabilityState => ({
  state: allowed ? 'open' : 'locked',
  circle: RELATION_FEATURE_MIN_LEVEL[feature],
  consentRequired: RELATION_CONSENT_FEATURES.has(feature),
});

const missingFor = (input: ProfileCircleViewInput, level: RelationLevel, isSelf: boolean): ProfileCircleMissing | null => {
  if (isSelf || input.blockedEitherWay) return null;
  const next = relationRungAfter(level);
  if (next === null) return null;
  const byViewer = compareRelationLevel(parseRelationLevel(input.grantedByViewer), next) < 0;
  const byTarget = compareRelationLevel(parseRelationLevel(input.grantedByTarget), next) < 0;
  return { level: next, byViewer, byTarget };
};

export const resolveProfileCircleView = (input: ProfileCircleViewInput): ProfileCircleView => {
  const isSelf = Boolean(input.viewerId) && input.viewerId === input.targetId;
  const level = verdictOf(input, 'presence.online').effectiveLevel;
  const capabilities = Object.fromEntries(
    PROFILE_CAPABILITIES.flatMap((key) => {
      const feature = PROFILE_CAPABILITY_FEATURE[key];
      const verdict = verdictOf(input, feature);
      const addressedToAnother = isSelf && !verdict.allowed && verdict.reason === 'self';
      return addressedToAnother ? [] : [[key, stateOf(verdict.allowed, feature)] as const];
    }),
  ) as ProfileCircleView['capabilities'];
  return {
    isSelf,
    level,
    grantedByViewer: parseRelationLevel(input.grantedByViewer),
    grantedByTarget: parseRelationLevel(input.grantedByTarget),
    sharesCommunity: input.sharesCommunity,
    missing: missingFor(input, level, isSelf),
    capabilities,
  };
};

/** Un champ gardé par un cercle est-il ouvert à ce lecteur ? */
export const profileFieldOpen = (view: ProfileCircleView, field: ProfileGatedField): boolean => {
  const capability = field === 'country' ? view.capabilities.presence : view.capabilities.presenceDetailed;
  return capability?.state === 'open';
};

const SYNTHETIC_VIEWER = 'viewer-as-circle';

/**
 * « Voir comme » : la fiche telle que la voit un lecteur ordinaire du cercle
 * `level`, résolue par la MÊME loi que pour un lecteur réel — un lecteur
 * synthétique, aux deux accords égaux, sans rôle ni âge connu.
 */
export const resolveProfileCircleViewAs = (params: { readonly level: RelationLevel; readonly targetId: string }): ProfileCircleView =>
  resolveProfileCircleView({
    viewerId: SYNTHETIC_VIEWER,
    targetId: params.targetId,
    grantedByViewer: params.level,
    grantedByTarget: params.level,
    sharesCommunity: false,
    viewerMinor: 'unknown',
    targetMinor: 'unknown',
    viewerRole: 'USER',
    targetRole: 'USER',
  });
