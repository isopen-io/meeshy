/**
 * LA LOI D'ACCÈS DES CERCLES — ce qu'un viewer peut voir ou faire d'une
 * personne, selon le niveau qu'ils s'accordent l'un à l'autre (#13927).
 *
 * UNE fonction, PURE, sans I/O : l'orchestrateur gateway lit les accords, le
 * blocage, la communauté et l'âge, puis l'appelle. Aucun service ne réécrit la
 * boucle de niveaux (garde `relation-access-single-site-guard.test.ts`) — c'est
 * ce qui a fait diverger six copies de « amis acceptés ».
 *
 * ## L'ordre des verdicts
 *
 * 1. blocage dans un sens ou dans l'autre ⇒ RIEN, y compris pour ADMIN ;
 * 2. une identité absente (vide ou indéfinie) ⇒ RIEN : deux identités
 *    absentes ne sont pas « soi » (fail-closed) ;
 * 3. soi-même ⇒ tout, sauf les actions adressées à un autre ;
 * 4. ADMIN/BIGBOSS ⇒ la PRÉSENCE seulement (loi du 2026-08-25), sans lien ;
 * 5. Connaissance automatique ⇒ refusée entre un mineur DÉCLARÉ et quiconque
 *    ne l'est pas (majeur ou âge inconnu : fail-closed) ; face à un mineur
 *    déclaré, le bouclier (`RELATION_MINOR_TARGET_MIN_LEVEL`, RG-21) relève le
 *    minimum des features qu'il nomme, et son refus se dit `level` — jamais
 *    `minor`, qui apprendrait l'âge de la cible ;
 * 6. sinon, le niveau effectif atteint-il le minimum de la feature — ou, pour
 *    une feature d'entourage, le cran choisi par le propriétaire du contenu
 *    (`ownerAudience`, #13929 ; `NOBODY` ferme) ?
 * 7. une feature à consentement ne s'ouvre que si `consent` vaut `'granted'` :
 *    refusé, inconnu, absent ou illisible ⇒ `allowed: false, reason: 'consent'`.
 *
 * ## L'équipe (directive porteur du 2026-11-07, #16623)
 *
 * Entre deux comptes de l'équipe (`isPlatformTeam`, les DEUX rôles lus), le niveau
 * effectif d'un outil vaut Sang, sans lien, dans les deux sens. Seul le NIVEAU
 * s'ouvre : les verdicts 1 à 3, le consentement et `NOBODY` restent entiers, et
 * le refus d'un rôle de cible absent ou inconnu est celui d'un inconnu. La raison
 * reste `level`, jamais `role` : un modérateur lit la présence d'un collègue sous
 * ses préférences, comme un Sang. Une audience de contenu reste au lien réel
 * (`RELATION_TEAM_CLOSED_FEATURES`), et le bouclier des mineurs n'est pas franchi.
 *
 * ## Les mineurs (décision porteur, 2026-10-31)
 *
 * L'âge déclaré fait foi et n'ouvre AUCUN refus d'âge : Sang, position et Bring
 * sont ouverts à tous, derrière un consentement refusable — jamais
 * `reason: 'minor'` (réservé à la Connaissance automatique). Le client ne
 * décide jamais d'un accès : le miroir (Swift, Kotlin) sert à ne pas PROPOSER
 * ce que le serveur refusera.
 *
 * ## Le consentement est une ENTRÉE, pas un drapeau à côté du verdict
 *
 * `allowed` est le verdict COMPLET : un consommateur qui ne lit que lui ne
 * peut pas ouvrir la position, le Bring ou le talkie sans consentement.
 * L'orchestrateur résout `consent` depuis `RelationFeatureSetting` ; la loi
 * ne lit aucune table. `requiresConsent` dit seulement que le plafond est
 * atteint ET que la feature passe par un consentement — de quoi proposer
 * l'écran de consentement (`RELATION_CONSENT_REQUIRED`) quand `allowed` est faux.
 */

import {
  compareRelationLevel,
  maxRelationLevel,
  minRelationLevel,
  parseRelationLevel,
  type RelationLevel,
} from '../types/relation.js';
import { isGlobalAdmin, isPlatformTeam } from '../types/role-types.js';
import type { DeclaredAgeClass } from './age.js';
import {
  RELATION_CONSENT_FEATURES,
  RELATION_DIRECTED_FEATURES,
  RELATION_FEATURE_MIN_LEVEL,
  RELATION_MINOR_TARGET_MIN_LEVEL,
  RELATION_PRESENCE_FEATURES,
  RELATION_TEAM_CLOSED_FEATURES,
  RELATION_TUNABLE_FEATURES,
  isRelationAudienceChoice,
  type RelationAudienceChoice,
  type RelationFeature,
} from './relation-levels.js';

export type RelationAgeClass = DeclaredAgeClass;

export const RELATION_CONSENTS = ['granted', 'refused', 'unknown'] as const;
export type RelationConsent = (typeof RELATION_CONSENTS)[number];

export type RelationAccessInput = {
  readonly viewerId: string;
  readonly targetId: string;
  /** Niveau accordé par le viewer à la cible. */
  readonly grantedByViewer: RelationLevel;
  /** Niveau accordé par la cible au viewer. */
  readonly grantedByTarget: RelationLevel;
  readonly sharesCommunity: boolean;
  readonly blockedEitherWay: boolean;
  readonly viewerMinor: RelationAgeClass;
  readonly targetMinor: RelationAgeClass;
  /** `User.role` tel que lu : la loi replie la casse, et un rôle inconnu ne vaut rien. */
  readonly viewerRole?: string | null;
  /** `User.role` de la cible : absent ou inconnu, le privilège d'équipe reste fermé (#16623). */
  readonly targetRole?: string | null;
  readonly feature: RelationFeature;
  /** Consentement résolu pour une feature qui en exige un ; absent = `'unknown'` (fermé). */
  readonly consent?: RelationConsent;
  /**
   * Le cran choisi par le PROPRIÉTAIRE du contenu pour une feature d'entourage
   * (`RELATION_TUNABLE_FEATURES`, #13929). Absent ou illisible = le niveau de la
   * matrice (le défaut) ; `NOBODY` ferme. Il remplace le minimum de la matrice
   * et n'ouvre jamais plus que le niveau effectif. Ignoré pour toute autre feature.
   */
  readonly ownerAudience?: RelationAudienceChoice | string | null;
};

export type RelationAccessReason = 'level' | 'blocked' | 'minor' | 'self' | 'role' | 'consent';

export type RelationAccess = {
  readonly allowed: boolean;
  readonly effectiveLevel: RelationLevel;
  readonly reason: RelationAccessReason;
  readonly requiresConsent: boolean;
};

const verdict = (
  allowed: boolean,
  effectiveLevel: RelationLevel,
  reason: RelationAccessReason,
  requiresConsent = false,
): RelationAccess => ({ allowed, effectiveLevel, reason, requiresConsent });

/** Minimum des deux accords, relevé à COMMUNITY quand une communauté est partagée. */
export const effectiveRelationLevel = (input: {
  readonly grantedByViewer: RelationLevel;
  readonly grantedByTarget: RelationLevel;
  readonly sharesCommunity: boolean;
}): RelationLevel => {
  const granted = minRelationLevel(parseRelationLevel(input.grantedByViewer), parseRelationLevel(input.grantedByTarget));
  return granted === 'PUBLIC' && input.sharesCommunity ? 'COMMUNITY' : granted;
};

/** Le niveau à atteindre, ou `null` quand le propriétaire a fermé la feature (`NOBODY`). */
const minimumFor = (feature: RelationFeature, ownerAudience: unknown): RelationLevel | null => {
  if (!RELATION_TUNABLE_FEATURES.has(feature) || !isRelationAudienceChoice(ownerAudience)) {
    return RELATION_FEATURE_MIN_LEVEL[feature];
  }
  return ownerAudience === 'NOBODY' ? null : ownerAudience;
};

const declaresMinorApart = (a: RelationAgeClass, b: RelationAgeClass): boolean =>
  (a === 'minor') !== (b === 'minor');

type DeclaredAges = { readonly viewerMinor: RelationAgeClass; readonly targetMinor: RelationAgeClass };

/** Un viewer qui n'est pas mineur déclaré s'adresse à un mineur déclaré. */
const facesDeclaredMinor = (ages: DeclaredAges): boolean => ages.targetMinor === 'minor' && ages.viewerMinor !== 'minor';

/**
 * Le bouclier des mineurs (`RELATION_MINOR_TARGET_MIN_LEVEL`) : un viewer qui
 * n'est pas mineur déclaré, face à un mineur déclaré, doit atteindre le niveau
 * de la table. Il relève le minimum, ne l'abaisse jamais, et ne rouvre jamais
 * une feature fermée par son propriétaire (`NOBODY`).
 */
const shieldedMinimum = (feature: RelationFeature, minimum: RelationLevel | null, ages: DeclaredAges): RelationLevel | null => {
  const shield = RELATION_MINOR_TARGET_MIN_LEVEL[feature];
  if (minimum === null || !shield || !facesDeclaredMinor(ages)) return minimum;
  return maxRelationLevel(minimum, shield);
};

/** Le privilège d'équipe s'applique-t-il à cette paire, pour cette feature (#16623) ? */
const teamOpens = (input: RelationAccessInput): boolean =>
  isPlatformTeam(input.viewerRole) &&
  isPlatformTeam(input.targetRole) &&
  !RELATION_TEAM_CLOSED_FEATURES.has(input.feature) &&
  !facesDeclaredMinor(input);

export const resolveRelationAccess = (input: RelationAccessInput): RelationAccess => {
  const level = teamOpens(input) ? 'BLOOD' : effectiveRelationLevel(input);
  const { feature } = input;

  if (input.blockedEitherWay) return verdict(false, 'PUBLIC', 'blocked');

  if (!input.viewerId || !input.targetId) return verdict(false, 'PUBLIC', 'level');

  if (input.viewerId === input.targetId) {
    return RELATION_DIRECTED_FEATURES.has(feature) ? verdict(false, 'PUBLIC', 'self') : verdict(true, 'BLOOD', 'self');
  }

  if (isGlobalAdmin(input.viewerRole ?? 'USER') && RELATION_PRESENCE_FEATURES.has(feature)) {
    return verdict(true, level, 'role');
  }

  if (feature === 'acquaintance.auto' && declaresMinorApart(input.viewerMinor, input.targetMinor)) {
    return verdict(false, level, 'minor');
  }

  const minimum = shieldedMinimum(feature, minimumFor(feature, input.ownerAudience), input);
  const reached = minimum !== null && compareRelationLevel(level, minimum) >= 0;
  if (!reached || !RELATION_CONSENT_FEATURES.has(feature)) return verdict(reached, level, 'level');

  return input.consent === 'granted' ? verdict(true, level, 'level', true) : verdict(false, level, 'consent', true);
};

/**
 * Ce que l'orchestrateur doit LIRE pour que la loi juge `feature` juste : l'âge
 * déclaré quand la Connaissance automatique ou le bouclier des mineurs la vise,
 * la communauté quand un plancher possible de la feature (matrice, bouclier,
 * réglage d'entourage) s'atteint par elle, le rôle des deux côtés quand le
 * privilège d'équipe peut l'ouvrir — et alors l'âge aussi, car un mineur déclaré
 * éteint ce privilège. Ne rien lire d'autre est permis : une lecture épargnée ne
 * change aucun verdict.
 */
export const relationAccessReads = (
  feature: RelationFeature,
): { readonly age: boolean; readonly community: boolean; readonly role: boolean } => {
  const shield = RELATION_MINOR_TARGET_MIN_LEVEL[feature];
  const floors = [RELATION_FEATURE_MIN_LEVEL[feature], ...(shield ? [shield] : [])];
  const team = !RELATION_TEAM_CLOSED_FEATURES.has(feature);
  return {
    age: feature === 'acquaintance.auto' || Boolean(shield) || team,
    community: RELATION_TUNABLE_FEATURES.has(feature) || floors.some((floor) => compareRelationLevel(floor, 'COMMUNITY') <= 0),
    role: team,
  };
};
