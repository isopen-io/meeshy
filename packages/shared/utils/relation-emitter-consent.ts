/**
 * LE CONSENTEMENT DE L'ÉMETTEUR, RÉSOLU DEPUIS LA PAIRE (#14147, #20361).
 *
 * La loi (`relation-access.ts`) reçoit le consentement en ENTRÉE et ne lit aucune
 * table. Ce module traduit ce que la paire a STOCKÉ (`RelationFeatureSetting`, une
 * colonne par partage) en cette entrée :
 *
 * - `true` ⇒ accordé ; `false` ⇒ refusé ;
 * - nul, absent ou illisible ⇒ le DÉFAUT DU NIVEAU EFFECTIF : accordé si la feature
 *   figure dans `RELATION_LEVEL_DEFAULT_ON` et que le niveau l'atteint (la batterie dès
 *   Proche), refusé sinon ;
 * - la coupure globale de l'émetteur ferme tout ;
 * - SAUF entre Sangs, une fois l'accord au palier donné (`bloodBundleAccepted`) : ni le refus
 *   stocké ni la coupure globale ne ferment une feature du verrou
 *   (`RELATION_BLOOD_LOCKED_FEATURES`). Avant cet accord, un refus explicite déjà donné reste
 *   appliqué (décision par défaut B, #20367) : on ne présume pas d'accord depuis un refus.
 *
 * Le niveau effectif est celui de la LOI (équipe comprise, #16623) : un premier appel
 * le lit, un second juge avec le consentement résolu. La loi étant pure, l'appel
 * double ne coûte rien et garde UNE seule boucle de niveaux.
 */
import { relationLevelIfAtLeast, type RelationLevel } from '../types/relation.js';
import { resolveRelationAccess, type RelationAccess, type RelationAccessInput, type RelationConsent } from './relation-access.js';
import { RELATION_BLOOD_LOCKED_FEATURES, RELATION_LEVEL_DEFAULT_ON, type RelationFeature } from './relation-levels.js';

export type StoredEmitterConsent = boolean | null | undefined;

/** La feature est-elle verrouillée ouverte à ce niveau effectif (le Sang, équipe comprise) ? */
export const relationBloodLocked = (params: { readonly feature: RelationFeature; readonly effectiveLevel: RelationLevel }): boolean =>
  params.effectiveLevel === 'BLOOD' && RELATION_BLOOD_LOCKED_FEATURES.has(params.feature);

const unlockedByBundle = (params: { readonly feature: RelationFeature; readonly effectiveLevel: RelationLevel; readonly bloodBundleAccepted?: boolean }): boolean =>
  params.bloodBundleAccepted === true && relationBloodLocked(params);

export const resolveEmitterConsent = (params: {
  readonly feature: RelationFeature;
  readonly stored: StoredEmitterConsent;
  readonly effectiveLevel: RelationLevel;
  readonly globallyDisabled?: boolean;
  /** L'émetteur a donné l'accord au palier Sang pour CETTE personne (#20362). */
  readonly bloodBundleAccepted?: boolean;
}): Exclude<RelationConsent, 'unknown'> => {
  if (unlockedByBundle(params)) return 'granted';
  if (params.globallyDisabled === true || params.stored === false) return 'refused';
  if (params.stored === true) return 'granted';
  const floor = RELATION_LEVEL_DEFAULT_ON[params.feature];
  return floor !== undefined && relationLevelIfAtLeast(params.effectiveLevel, floor) !== null ? 'granted' : 'refused';
};

/**
 * LA PRÉFÉRENCE DE RÉCEPTION du destinataire (Bring, talkie, Ensemble) : active par défaut,
 * `cut` quand il l'a coupée pour cette personne ou pour tous. Entre Sangs, après son accord au
 * palier, une coupure ne ferme plus (#20361) ; avant, elle reste appliquée (décision B).
 */
export const resolveReceptionPreference = (params: {
  readonly feature: RelationFeature;
  readonly cut: boolean;
  readonly effectiveLevel: RelationLevel;
  readonly bloodBundleAccepted?: boolean;
}): Exclude<RelationConsent, 'unknown'> => (unlockedByBundle(params) || !params.cut ? 'granted' : 'refused');

export type RelationAccessWithStoredConsentInput = Omit<RelationAccessInput, 'consent'> & {
  readonly storedConsent: StoredEmitterConsent;
  readonly globallyDisabled?: boolean;
  readonly bloodBundleAccepted?: boolean;
};

export const resolveRelationAccessWithStoredConsent = (input: RelationAccessWithStoredConsentInput): RelationAccess => {
  const { storedConsent, globallyDisabled, bloodBundleAccepted, ...law } = input;
  const probe = resolveRelationAccess({ ...law, consent: 'unknown' });
  if (!probe.requiresConsent) return probe;
  const consent = resolveEmitterConsent({ feature: law.feature, stored: storedConsent, effectiveLevel: probe.effectiveLevel, globallyDisabled, bloodBundleAccepted });
  return resolveRelationAccess({ ...law, consent });
};

export type RelationAccessWithReceptionInput = Omit<RelationAccessInput, 'consent'> & {
  readonly cut: boolean;
  readonly bloodBundleAccepted?: boolean;
};

/** La loi pour une préférence de RÉCEPTION (Bring, talkie) : le niveau effectif lu d'abord, la préférence jugée ensuite. */
export const resolveRelationAccessWithReception = (input: RelationAccessWithReceptionInput): RelationAccess => {
  const { cut, bloodBundleAccepted, ...law } = input;
  const probe = resolveRelationAccess({ ...law, consent: 'unknown' });
  if (!probe.requiresConsent) return probe;
  return resolveRelationAccess({ ...law, consent: resolveReceptionPreference({ feature: law.feature, cut, effectiveLevel: probe.effectiveLevel, bloodBundleAccepted }) });
};
