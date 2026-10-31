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
 *    ne l'est pas (majeur ou âge inconnu : fail-closed) ;
 * 6. sinon, le niveau effectif atteint-il le minimum de la feature ?
 * 7. une feature à consentement ne s'ouvre que si `consent` vaut `'granted'` :
 *    refusé, inconnu, absent ou illisible ⇒ `allowed: false, reason: 'consent'`.
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
  minRelationLevel,
  parseRelationLevel,
  type RelationLevel,
} from '../types/relation.js';
import { isGlobalAdmin } from '../types/role-types.js';
import type { GlobalUserRoleType } from '../types/role-types.js';
import type { DeclaredAgeClass } from './age.js';
import {
  RELATION_CONSENT_FEATURES,
  RELATION_DIRECTED_FEATURES,
  RELATION_FEATURE_MIN_LEVEL,
  RELATION_PRESENCE_FEATURES,
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
  readonly viewerRole?: GlobalUserRoleType | null;
  readonly feature: RelationFeature;
  /** Consentement résolu pour une feature qui en exige un ; absent = `'unknown'` (fermé). */
  readonly consent?: RelationConsent;
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

const declaresMinorApart = (a: RelationAgeClass, b: RelationAgeClass): boolean =>
  (a === 'minor') !== (b === 'minor');

export const resolveRelationAccess = (input: RelationAccessInput): RelationAccess => {
  const level = effectiveRelationLevel(input);
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

  const reached = compareRelationLevel(level, RELATION_FEATURE_MIN_LEVEL[feature]) >= 0;
  if (!reached || !RELATION_CONSENT_FEATURES.has(feature)) return verdict(reached, level, 'level');

  return input.consent === 'granted' ? verdict(true, level, 'level', true) : verdict(false, level, 'consent', true);
};
