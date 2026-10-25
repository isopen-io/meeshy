import type { E2eeDevice } from '@/lib/api/e2ee-devices';
import type { SessionsText } from '@/lib/i18n-sessions-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { dateTime, sinceNow } from './sessions';

/**
 * **CE QUE « MES APPAREILS CHIFFRÉS » DIT D'UN APPAREIL** (#13013) — son nom
 * déclaré, sinon sa plateforme ; puis plateforme, numéro, activation et
 * dernière activité, chacun sous son libellé. Un champ non servi est TU. Le
 * numéro se lit de gauche à droite, même dans une interface arabe.
 */

export type E2eeDeviceFieldKey = 'platform' | 'number' | 'enrolled' | 'lastSeen';

export type E2eeDeviceField = { readonly key: E2eeDeviceFieldKey; readonly label: string; readonly value: string; readonly ltr: boolean };

const platformName = (device: E2eeDevice, t: SessionsText): string =>
  t(device.platform === null ? 'e2eeDevices.platform.other' : `e2eeDevices.platform.${device.platform}`);

export function e2eeDeviceTitle(device: E2eeDevice, t: SessionsText): string {
  return device.label ?? platformName(device, t);
}

export function e2eeDeviceFields(
  device: E2eeDevice,
  context: { readonly language: InterfaceLanguage; readonly now: Date; readonly t: SessionsText },
): readonly E2eeDeviceField[] {
  const { language, now, t } = context;
  const rows: readonly (readonly [E2eeDeviceFieldKey, string | null])[] = [
    ['platform', platformName(device, t)],
    ['number', String(device.deviceId)],
    ['enrolled', dateTime(device.createdAt, language)],
    ['lastSeen', sinceNow(device.lastSeenAt, language, now)],
  ];
  return rows.flatMap(([key, value]) =>
    value === null ? [] : [{ key, label: t(`e2eeDevices.field.${key}`), value, ltr: key === 'number' }],
  );
}
