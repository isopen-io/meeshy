import type { EffectiveConnectionType, PreloadNetwork } from './preload-window';

/**
 * CE QUE L'APPAREIL DIT DE SA CONTRAINTE (#9702) — lu par la fenêtre de
 * préchargement, jamais réglé par l'utilisateur. Chaque API est optionnelle
 * (Safari ne sert ni `connection` ni `deviceMemory`, la WebView Android les
 * sert) : un signal absent ne plafonne rien, la fenêtre garde alors sa
 * cadence et son plancher.
 */
export type PreloadSignals = {
  readonly network: PreloadNetwork;
  readonly deviceMemoryGb?: number;
  readonly lowPower?: boolean;
};

type NetworkInformationLike = { readonly effectiveType?: string; readonly saveData?: boolean };

export type NavigatorLike = {
  readonly connection?: NetworkInformationLike;
  readonly deviceMemory?: number;
};

type BatteryLike = { readonly level: number; readonly charging: boolean };

const LOW_BATTERY_LEVEL = 0.2;

const EFFECTIVE_TYPES: readonly EffectiveConnectionType[] = ['slow-2g', '2g', '3g', '4g'];

const isEffectiveType = (value: string | undefined): value is EffectiveConnectionType =>
  value !== undefined && (EFFECTIVE_TYPES as readonly string[]).includes(value);

export function lowPowerOf(battery: BatteryLike | undefined): boolean | undefined {
  return battery === undefined ? undefined : !battery.charging && battery.level <= LOW_BATTERY_LEVEL;
}

export function preloadSignalsOf(params: { readonly navigator: NavigatorLike | undefined; readonly battery?: BatteryLike }): PreloadSignals {
  const connection = params.navigator?.connection;
  const effectiveType = connection?.effectiveType;
  const network: PreloadNetwork = {
    ...(isEffectiveType(effectiveType) ? { effectiveType } : {}),
    ...(connection?.saveData !== undefined ? { saveData: connection.saveData } : {}),
  };
  const deviceMemoryGb = params.navigator?.deviceMemory;
  const lowPower = lowPowerOf(params.battery);
  return {
    network,
    ...(deviceMemoryGb !== undefined ? { deviceMemoryGb } : {}),
    ...(lowPower !== undefined ? { lowPower } : {}),
  };
}
