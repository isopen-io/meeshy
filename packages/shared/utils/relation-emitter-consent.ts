/**
 * LE CONSENTEMENT DE L'ÉMETTEUR, RÉSOLU DEPUIS LA PAIRE (#14147).
 *
 * La loi (`relation-access.ts`) reçoit le consentement en ENTRÉE et ne lit aucune
 * table. Ce module traduit ce que la paire a STOCKÉ (`RelationFeatureSetting`, une
 * colonne par partage) en cette entrée :
 *
 * - `true` ⇒ accordé ; `false` ⇒ refusé ;
 * - nul, absent ou illisible ⇒ le DÉFAUT DU NIVEAU EFFECTIF : accordé si la feature
 *   figure dans `RELATION_EMITTER_CONSENT_DEFAULT_LEVEL` et que le niveau l'atteint
 *   (la batterie entre Sangs), refusé sinon ;
 * - la coupure globale de l'émetteur ferme tout.
 *
 * Le niveau effectif est celui de la LOI (équipe comprise, #16623) : un premier appel
 * le lit, un second juge avec le consentement résolu. La loi étant pure, l'appel
 * double ne coûte rien et garde UNE seule boucle de niveaux.
 */
import { compareRelationLevel, type RelationLevel } from '../types/relation.js';
import { resolveRelationAccess, type RelationAccess, type RelationAccessInput, type RelationConsent } from './relation-access.js';
import { RELATION_EMITTER_CONSENT_DEFAULT_LEVEL, type RelationFeature } from './relation-levels.js';

export type StoredEmitterConsent = boolean | null | undefined;

export const resolveEmitterConsent = (params: {
  readonly feature: RelationFeature;
  readonly stored: StoredEmitterConsent;
  readonly effectiveLevel: RelationLevel;
  readonly globallyDisabled?: boolean;
}): Exclude<RelationConsent, 'unknown'> => {
  if (params.globallyDisabled === true || params.stored === false) return 'refused';
  if (params.stored === true) return 'granted';
  const floor = RELATION_EMITTER_CONSENT_DEFAULT_LEVEL[params.feature];
  return floor !== undefined && compareRelationLevel(params.effectiveLevel, floor) >= 0 ? 'granted' : 'refused';
};

export type RelationAccessWithStoredConsentInput = Omit<RelationAccessInput, 'consent'> & {
  readonly storedConsent: StoredEmitterConsent;
  readonly globallyDisabled?: boolean;
};

export const resolveRelationAccessWithStoredConsent = (input: RelationAccessWithStoredConsentInput): RelationAccess => {
  const { storedConsent, globallyDisabled, ...law } = input;
  const probe = resolveRelationAccess({ ...law, consent: 'unknown' });
  if (!probe.requiresConsent) return probe;
  const consent = resolveEmitterConsent({ feature: law.feature, stored: storedConsent, effectiveLevel: probe.effectiveLevel, globallyDisabled });
  return resolveRelationAccess({ ...law, consent });
};
