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
import { effectiveRelationLevel, resolveRelationAccess, type RelationAccess, type RelationAccessInput, type RelationConsent } from './relation-access.js';
import { RELATION_BLOOD_LOCKED_FEATURES, RELATION_BUNDLE_ONLY_FEATURES, RELATION_LEVEL_DEFAULT_ON, type RelationFeature } from './relation-levels.js';

export type StoredEmitterConsent = boolean | null | undefined;

/**
 * La feature est-elle verrouillée ouverte à ce niveau ? Le niveau à passer est celui du LIEN RÉEL
 * (`effectiveRelationLevel`), jamais le niveau d'équipe : entre collègues sans lien il n'y a ni accord
 * possible ni baisse possible, donc ni verrou (constat E de l'audit, 2026-11-23).
 */
export const relationBloodLocked = (params: { readonly feature: RelationFeature; readonly effectiveLevel: RelationLevel }): boolean =>
  params.effectiveLevel === 'BLOOD' && RELATION_BLOOD_LOCKED_FEATURES.has(params.feature);

/**
 * La chute (art. 9 RGPD) n'est PAS levée par l'accord au palier : tant que le texte « à tous tes
 * Sangs, présents et à venir » et sa version ne sont pas livrés (#20406), l'accord de santé couvre
 * « mes Sangs » tels qu'ils étaient montrés, et un refus pour un Sang précis reste appliqué
 * (constat B de l'audit, fail-closed).
 */
const FALL_REFUSAL_SURVIVES_BUNDLE: RelationFeature = 'health.fall';

const unlockedByBundle = (params: { readonly feature: RelationFeature; readonly effectiveLevel: RelationLevel; readonly realLevel?: RelationLevel; readonly bloodBundleAccepted?: boolean }): boolean =>
  params.bloodBundleAccepted === true
  && params.feature !== FALL_REFUSAL_SURVIVES_BUNDLE
  && relationBloodLocked({ feature: params.feature, effectiveLevel: params.realLevel ?? params.effectiveLevel });

export const resolveEmitterConsent = (params: {
  readonly feature: RelationFeature;
  readonly stored: StoredEmitterConsent;
  readonly effectiveLevel: RelationLevel;
  /** Le niveau du lien RÉEL de la paire (sans privilège d'équipe) : celui du verrou. Absent, `effectiveLevel`. */
  readonly realLevel?: RelationLevel;
  readonly globallyDisabled?: boolean;
  /** L'émetteur a donné l'accord au palier Sang pour CETTE personne (#20362). */
  readonly bloodBundleAccepted?: boolean;
  /**
   * Une garde LÉGALE ferme : l'accord de santé (art. 9 RGPD) absent ou périmé, l'âge minimum non
   * atteint. Jugée AVANT le verrou du Sang, que rien ne lui fait lever.
   */
  readonly legallyBlocked?: boolean;
  /** L'émetteur est mineur déclaré : les partages du rituel ne s'ouvrent que sur un accord stocké. */
  readonly emitterMinor?: boolean;
}): Exclude<RelationConsent, 'unknown'> => {
  // La chute (art. 9) exige que l'appelant DISE la garde légale : oubliée, elle ferme (fail-closed).
  if (params.legallyBlocked === true || (params.feature === 'health.fall' && params.legallyBlocked !== false)) return 'refused';
  const bundleOnly = RELATION_BUNDLE_ONLY_FEATURES.has(params.feature);
  if (bundleOnly && (params.emitterMinor === true || params.bloodBundleAccepted !== true)) return params.stored === true && params.globallyDisabled !== true ? 'granted' : 'refused';
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
  readonly realLevel?: RelationLevel;
  readonly bloodBundleAccepted?: boolean;
}): Exclude<RelationConsent, 'unknown'> => (unlockedByBundle(params) || !params.cut ? 'granted' : 'refused');

export type RelationAccessWithStoredConsentInput = Omit<RelationAccessInput, 'consent'> & {
  readonly storedConsent: StoredEmitterConsent;
  readonly globallyDisabled?: boolean;
  readonly bloodBundleAccepted?: boolean;
  readonly legallyBlocked?: boolean;
  readonly emitterMinor?: boolean;
};

export const resolveRelationAccessWithStoredConsent = (input: RelationAccessWithStoredConsentInput): RelationAccess => {
  const { storedConsent, globallyDisabled, bloodBundleAccepted, legallyBlocked, emitterMinor, ...law } = input;
  const probe = resolveRelationAccess({ ...law, consent: 'unknown' });
  if (!probe.requiresConsent) return probe;
  const consent = resolveEmitterConsent({ feature: law.feature, stored: storedConsent, effectiveLevel: probe.effectiveLevel, realLevel: effectiveRelationLevel(law), globallyDisabled, bloodBundleAccepted, legallyBlocked, emitterMinor });
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
  return resolveRelationAccess({ ...law, consent: resolveReceptionPreference({ feature: law.feature, cut, effectiveLevel: probe.effectiveLevel, realLevel: effectiveRelationLevel(law), bloodBundleAccepted }) });
};
