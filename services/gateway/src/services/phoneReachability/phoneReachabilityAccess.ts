/**
 * QUI REÇOIT L'INJOIGNABILITÉ du téléphone de qui (#18737) — la loi commune des états d'appareil
 * (`relations/emitterFeatureAccess.ts`) appliquée à `device.unreachable`, avec la coupure globale
 * `User.unreachableSharingDisabledAt` (le fantôme). Les candidats sont ceux de la batterie : les
 * Proches et les Sangs, plus les collègues pour un compte de l'équipe.
 */
import { emitterFeatureAllowedAmong, type EmitterFeatureDb, type EmitterFeatureParams } from '../relations/emitterFeatureAccess';

export type PhoneReachabilityDb = EmitterFeatureDb;

/** Les personnes parmi `otherIds` à qui la loi ET l'émetteur ouvrent l'injoignabilité. */
export function phoneReachabilityAllowedAmong(prisma: PhoneReachabilityDb, params: EmitterFeatureParams): Promise<ReadonlySet<string>> {
  return emitterFeatureAllowedAmong(prisma, { feature: 'device.unreachable', disabledColumn: 'unreachableSharingDisabledAt' }, params);
}
