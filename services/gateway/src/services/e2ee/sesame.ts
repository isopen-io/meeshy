/**
 * Sesame (M. Marlinspike, T. Perrin, *The Sesame Algorithm*, rév. 2, § 3) :
 * l'ensemble des appareils auxquels un envoi s'adresse doit être EXACTEMENT
 * celui que l'annuaire connaît — chaque appareil actif de chaque participant,
 * sauf l'appareil émetteur et ceux de SES appareils qu'il n'a pas approuvés
 * (spec § 3.5). Tout écart rend un 409 que le client sait résoudre : supprimer
 * les sessions périmées, chercher les bundles manquants, rechiffrer.
 *
 * Fonction pure : la passerelle lit l'annuaire, cette fonction ne lit rien.
 */
import type { E2EEDeviceRef, E2EEDevicesMismatch } from '@meeshy/shared/types/e2ee-directory';

export type DirectoryDevice = E2EEDeviceRef & { readonly registrationId: number };

export type DeviceSetComparison = {
  readonly directory: readonly DirectoryDevice[];
  readonly sender: E2EEDeviceRef;
  readonly addressed: readonly DirectoryDevice[];
  readonly excludedOwnDevices: readonly number[];
};

const keyOf = (ref: E2EEDeviceRef): string => `${ref.userId}:${ref.deviceId}`;

const refOf = (device: E2EEDeviceRef): E2EEDeviceRef => ({ userId: device.userId, deviceId: device.deviceId });

const isExpectedRecipient = (comparison: DeviceSetComparison) => (device: DirectoryDevice): boolean => {
  const isSender = device.userId === comparison.sender.userId;
  if (isSender && device.deviceId === comparison.sender.deviceId) return false;
  return !(isSender && comparison.excludedOwnDevices.includes(device.deviceId));
};

export function compareDeviceSets(comparison: DeviceSetComparison): E2EEDevicesMismatch {
  const expected = new Map(comparison.directory.filter(isExpectedRecipient(comparison)).map((device) => [keyOf(device), device]));
  const seen = new Set<string>();

  const extra: E2EEDeviceRef[] = [];
  const stale: E2EEDeviceRef[] = [];
  comparison.addressed.forEach((device) => {
    const key = keyOf(device);
    const known = expected.get(key);
    if (!known || seen.has(key)) {
      extra.push(refOf(device));
      return;
    }
    seen.add(key);
    if (known.registrationId !== device.registrationId) stale.push(refOf(device));
  });

  const missing = [...expected.values()].filter((device) => !seen.has(keyOf(device))).map(refOf);
  return { missing, extra, stale };
}

export const isDeviceSetExact = (mismatch: E2EEDevicesMismatch): boolean =>
  mismatch.missing.length === 0 && mismatch.extra.length === 0 && mismatch.stale.length === 0;
