import type { ConnectionQualityLevel } from '@meeshy/shared/types/video-call';

import type { OpusShape } from './call-opus-sdp';
import type { TierEncoding } from './call-quality';

/**
 * **CE QU'UN APPEL A LE DROIT DE DÉPENSER** (#8697) — une table pure, le même
 * barème qu'iOS : Opus 32 kb/s en Wi-Fi, 24 en cellulaire, 16 en économie de
 * données ou sur un lien mauvais ; vidéo 1,2 Mb/s, 600 kb/s, 300 kb/s. Le
 * profil vient de ce que l'appareil annonce (`navigator.connection` :
 * `type`, `effectiveType`, `saveData` — la coque Android le sert par sa
 * WebView) ; sans rien d'annoncé, c'est du Wi-Fi. Le profil PLAFONNE le palier
 * de qualité (`call-quality.ts`) et ne le relève jamais : un lien mauvais en
 * Wi-Fi descend comme ailleurs.
 */

export type DataProfile = 'wifi' | 'cellular' | 'economy';

export type ConnectionInfo = { readonly type?: string; readonly effectiveType?: string; readonly saveData?: boolean };

export type ProfileBudget = {
  readonly audioBitrate: number;
  readonly videoBitrate: number;
  readonly maxFramerate: number;
  readonly scaleResolutionDownBy: number;
  readonly degradationPreference: RTCDegradationPreference;
};

export const DEGRADED_AUDIO_BITRATE = 16_000;

export const DATA_PROFILES: Readonly<Record<DataProfile, ProfileBudget>> = {
  wifi: { audioBitrate: 32_000, videoBitrate: 1_200_000, maxFramerate: 30, scaleResolutionDownBy: 1, degradationPreference: 'balanced' },
  cellular: { audioBitrate: 24_000, videoBitrate: 600_000, maxFramerate: 24, scaleResolutionDownBy: 1, degradationPreference: 'balanced' },
  economy: { audioBitrate: DEGRADED_AUDIO_BITRATE, videoBitrate: 300_000, maxFramerate: 15, scaleResolutionDownBy: 2, degradationPreference: 'maintain-framerate' },
};

const SLOW_NETWORKS: ReadonlySet<string> = new Set(['slow-2g', '2g', '3g']);

export function dataProfileOf(info: ConnectionInfo | null): DataProfile {
  if (info === null) return 'wifi';
  if (info.saveData === true || SLOW_NETWORKS.has(info.effectiveType ?? '')) return 'economy';
  return info.type === 'cellular' ? 'cellular' : 'wifi';
}

export function audioBitrateFor(profile: DataProfile, level: ConnectionQualityLevel): number {
  return level === 'poor' ? DEGRADED_AUDIO_BITRATE : DATA_PROFILES[profile].audioBitrate;
}

export function profiledEncoding(tier: TierEncoding, profile: DataProfile): TierEncoding {
  const budget = DATA_PROFILES[profile];
  return {
    active: tier.active,
    maxBitrate: Math.min(tier.maxBitrate, budget.videoBitrate),
    scaleResolutionDownBy: Math.max(tier.scaleResolutionDownBy, budget.scaleResolutionDownBy),
    maxFramerate: Math.min(tier.maxFramerate, budget.maxFramerate),
  };
}

export function opusShapeFor(profile: DataProfile): OpusShape {
  const maxAverageBitrate = DATA_PROFILES[profile].audioBitrate;
  return profile === 'economy' ? { maxAverageBitrate, maxPlaybackRate: 16_000 } : { maxAverageBitrate };
}

type Bound = { readonly ideal: number; readonly max: number };

export type CaptureShape = { readonly width: Bound; readonly height: Bound; readonly frameRate: Bound };

const CAPTURE: Readonly<Record<DataProfile, readonly [number, number, number]>> = {
  wifi: [1280, 720, 30],
  cellular: [640, 480, 24],
  economy: [480, 360, 24],
};

/** La caméra ne capture jamais plus que ce que l'encodeur enverra : 720p au plus, 24 à 30 images par seconde. */
export function captureShape(profile: DataProfile): CaptureShape {
  const [width, height, frameRate] = CAPTURE[profile];
  return { width: { ideal: width, max: 1280 }, height: { ideal: height, max: 720 }, frameRate: { ideal: frameRate, max: 30 } };
}

export function browserConnection(): ConnectionInfo | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { readonly connection?: ConnectionInfo }).connection ?? null;
}
