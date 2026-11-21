/**
 * QUI VOIT « EN APPEL » de qui (#18753) — la loi commune des états d'appareil
 * (`relations/emitterFeatureAccess.ts`) appliquée à `device.call` (Sang, ou équipe #16623), avec la
 * coupure globale `User.callSharingDisabledAt`. Les candidats sont ceux de la batterie.
 */
import { emitterFeatureAllowedAmong, type EmitterFeatureDb, type EmitterFeatureParams } from '../relations/emitterFeatureAccess';

export type PhoneCallDb = EmitterFeatureDb;

export function phoneCallAllowedAmong(prisma: PhoneCallDb, params: EmitterFeatureParams): Promise<ReadonlySet<string>> {
  return emitterFeatureAllowedAmong(prisma, { feature: 'device.call', disabledColumn: 'callSharingDisabledAt' }, params);
}
