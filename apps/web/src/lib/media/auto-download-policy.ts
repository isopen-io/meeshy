import { isSmallMediaAutoDownload } from '@meeshy/shared/utils/small-media-auto-download';

import type { NetworkConnection } from '@/lib/device/capability-tier';

/**
 * **LE TÉLÉCHARGEMENT AUTOMATIQUE DES MÉDIAS** (#6333) — miroir de
 * `MediaDownloadPolicyEngine` et `MediaDownloadPreferences`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Networking/`) : une politique par
 * type, les défauts d'iOS (images « Wi-Fi + bon cellulaire », vidéos « Wi-Fi
 * uniquement »), le hors-ligne qui retient tout, et le petit média
 * (< 102 400 octets, `@meeshy/shared`) qui part toujours seul. Une taille
 * absente ou nulle ne prouve rien : la politique décide.
 */
export type AutoDownloadPolicy = 'always' | 'wifiAndGoodCellular' | 'wifiOnly' | 'never';

export const AUTO_DOWNLOAD_POLICIES: readonly AutoDownloadPolicy[] = ['always', 'wifiAndGoodCellular', 'wifiOnly', 'never'];

export type AutoDownloadKind = 'image' | 'video';

export type MediaDownloadPreferences = Readonly<Record<AutoDownloadKind, AutoDownloadPolicy>>;

export const DEFAULT_MEDIA_DOWNLOAD_PREFERENCES: MediaDownloadPreferences = { image: 'wifiAndGoodCellular', video: 'wifiOnly' };

export type NetworkCondition = 'wifi' | 'goodCellular' | 'poorCellular' | 'offline';

const UNMETERED = new Set(['wifi', 'ethernet']);
const SLOW = new Set(['slow-2g', '2g', '3g']);

/**
 * Sans indice de type (Safari, Firefox, la plupart des ordinateurs), le réseau
 * se lit « bon cellulaire » : les défauts y gardent ce que le fil faisait déjà
 * — les images arrivent, les vidéos attendent le ▶︎.
 */
export function networkConditionOf({ online, connection }: { readonly online: boolean; readonly connection?: NetworkConnection }): NetworkCondition {
  if (!online) return 'offline';
  if (connection?.saveData === true) return 'poorCellular';
  if (connection?.type !== undefined && UNMETERED.has(connection.type)) return 'wifi';
  if (connection?.effectiveType !== undefined && SLOW.has(connection.effectiveType)) return 'poorCellular';
  return 'goodCellular';
}

export function shouldAutoDownload(params: {
  readonly kind: AutoDownloadKind;
  readonly condition: NetworkCondition;
  readonly preferences: MediaDownloadPreferences;
  readonly sizeBytes: number | undefined;
}): boolean {
  const { kind, condition, preferences, sizeBytes } = params;
  if (condition === 'offline') return false;
  if (isSmallMediaAutoDownload({ sizeBytes: sizeBytes ?? 0, online: true })) return true;
  const policy = preferences[kind];
  if (policy === 'always') return true;
  if (policy === 'never') return false;
  if (policy === 'wifiOnly') return condition === 'wifi';
  return condition === 'wifi' || condition === 'goodCellular';
}
