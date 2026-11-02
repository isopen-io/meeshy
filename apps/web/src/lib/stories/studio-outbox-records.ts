import { idbDeviceRecords, type DeviceRecords } from '@/lib/send/device-records';

export const studioOutboxFilesKey = (viewerId: string): string => `studio-outbox.${viewerId}.files`;
export const studioOutboxMetaKey = (viewerId: string): string => `studio-outbox.${viewerId}.meta`;

/**
 * La fin d'un compte efface ses publications non envoyées (#13416) sans
 * charger le studio : ce module ne tire que la base de l'appareil, pour que
 * la déconnexion — servie dès la première peinture — n'en paie pas le poids.
 */
export async function eraseStudioOutbox(viewerId: string, records: DeviceRecords = idbDeviceRecords()): Promise<void> {
  await records.save(studioOutboxFilesKey(viewerId), undefined);
  await records.save(studioOutboxMetaKey(viewerId), undefined);
}
