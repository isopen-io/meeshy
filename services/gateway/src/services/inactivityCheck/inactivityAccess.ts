/**
 * QUI REÇOIT L'ALERTE D'INACTIVITÉ de qui (#18738) — la loi commune des états d'appareil
 * (`relations/emitterFeatureAccess.ts`) appliquée à `safety.inactivity` (Sang, ou équipe #16623),
 * avec la coupure globale `User.inactivityCheckDisabledAt`. Les candidats sont ceux de la batterie.
 */
import { emitterFeatureAllowedAmong, type EmitterFeatureDb, type EmitterFeatureParams } from '../relations/emitterFeatureAccess';

export type InactivityDb = EmitterFeatureDb;

export function inactivityAllowedAmong(prisma: InactivityDb, params: EmitterFeatureParams): Promise<ReadonlySet<string>> {
  return emitterFeatureAllowedAmong(prisma, { feature: 'safety.inactivity', disabledColumn: 'inactivityCheckDisabledAt' }, params);
}
