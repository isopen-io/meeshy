import { batteryIsLow, connectionOf, deviceMemoryOf, deviceTierOf, type DeviceBattery, type DeviceNavigator, type DeviceTier } from '../device/capability-tier';

import type { EffectiveConnectionType, PreloadNetwork } from './preload-window';

/**
 * CE QUE L'APPAREIL DIT DE SA CONTRAINTE (#9702) — lu par la fenêtre de
 * préchargement, jamais réglé par l'utilisateur. Chaque API est optionnelle
 * (Safari ne sert ni la connexion ni la mémoire, la WebView Android les
 * sert) : un signal absent ne plafonne rien, la fenêtre garde alors sa
 * cadence et son plancher.
 *
 * `tier` est le tier de capacité de l'appareil (`device/capability-tier.ts`,
 * W10), la loi unique que la fenêtre applique EN DERNIER.
 */
export type PreloadSignals = {
  readonly network: PreloadNetwork;
  readonly deviceMemoryGb?: number;
  readonly lowPower?: boolean;
  readonly tier: DeviceTier;
};

export type NavigatorLike = DeviceNavigator;

type BatteryLike = DeviceBattery;

const EFFECTIVE_TYPES: readonly EffectiveConnectionType[] = ['slow-2g', '2g', '3g', '4g'];

const isEffectiveType = (value: string | undefined): value is EffectiveConnectionType =>
  value !== undefined && (EFFECTIVE_TYPES as readonly string[]).includes(value);

export const lowPowerOf = batteryIsLow;

export function preloadSignalsOf(params: { readonly navigator: NavigatorLike | undefined; readonly battery?: BatteryLike }): PreloadSignals {
  const connection = connectionOf(params.navigator);
  const effectiveType = connection.effectiveType;
  const network: PreloadNetwork = {
    ...(isEffectiveType(effectiveType) ? { effectiveType } : {}),
    ...(connection.saveData !== undefined ? { saveData: connection.saveData } : {}),
  };
  const deviceMemoryGb = deviceMemoryOf(params.navigator);
  const lowPower = lowPowerOf(params.battery);
  return {
    network,
    ...(deviceMemoryGb !== undefined ? { deviceMemoryGb } : {}),
    ...(lowPower !== undefined ? { lowPower } : {}),
    tier: deviceTierOf({ navigator: params.navigator, battery: params.battery }),
  };
}
