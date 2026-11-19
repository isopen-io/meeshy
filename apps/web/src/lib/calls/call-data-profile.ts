import type { ConnectionQualityLevel } from '@meeshy/shared/types/video-call';

import type { NetworkConnection } from '../device/capability-tier';

import type { OpusShape } from './call-opus-sdp';
import type { TierEncoding } from './call-quality';

/**
 * **CE QU'UN APPEL A LE DROIT DE DÉPENSER** (#8697) — une table pure : Opus
 * 32 kb/s en Wi-Fi, 24 en cellulaire, 16 en économie de données ou sur un lien
 * mauvais ; vidéo 2,5 Mb/s en Wi-Fi (le plafond d'Android, #19775), 600 kb/s,
 * 300 kb/s. Le profil vient de ce que l'appareil annonce (la connexion
 * annoncée : `type` et `saveData` — la coque Android la sert par sa WebView,
 * lue par `device/capability-tier.ts`) ; sans rien d'annoncé, c'est du Wi-Fi.
 * `effectiveType` n'en décide plus (#19775) : Chrome le déduit de la latence
 * HTTP, et un lien rapide mais lointain se disait « 3g » — la vidéo partait en
 * 240×180. C'est l'estimation de débit du lien qui fait descendre l'image
 * (`call-quality.ts` › `linkTier`). Le profil PLAFONNE le palier de qualité et
 * ne le relève jamais : un lien mauvais en Wi-Fi descend comme ailleurs.
 */

export type DataProfile = 'wifi' | 'cellular' | 'economy';

export type ConnectionInfo = NetworkConnection;

export type ProfileBudget = {
  readonly audioBitrate: number;
  readonly videoBitrate: number;
  readonly maxFramerate: number;
  readonly scaleResolutionDownBy: number;
  readonly degradationPreference: RTCDegradationPreference;
};

export const DEGRADED_AUDIO_BITRATE = 16_000;

export const DATA_PROFILES: Readonly<Record<DataProfile, ProfileBudget>> = {
  wifi: { audioBitrate: 32_000, videoBitrate: 2_500_000, maxFramerate: 30, scaleResolutionDownBy: 1, degradationPreference: 'balanced' },
  cellular: { audioBitrate: 24_000, videoBitrate: 600_000, maxFramerate: 24, scaleResolutionDownBy: 1, degradationPreference: 'balanced' },
  economy: { audioBitrate: DEGRADED_AUDIO_BITRATE, videoBitrate: 300_000, maxFramerate: 15, scaleResolutionDownBy: 1, degradationPreference: 'maintain-framerate' },
};

export function dataProfileOf(info: ConnectionInfo | null): DataProfile {
  if (info === null) return 'wifi';
  if (info.saveData === true) return 'economy';
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

export type CaptureShape = { readonly width: Bound; readonly height: Bound; readonly frameRate: Bound; readonly aspectRatio: { readonly ideal: number } };

const CAPTURE: Readonly<Record<DataProfile, readonly [number, number, number]>> = {
  wifi: [1280, 720, 30],
  cellular: [1280, 720, 30],
  economy: [640, 360, 24],
};

/**
 * La caméra ne capture jamais plus que ce que l'encodeur enverra : 720p au plus,
 * 24 à 30 images par seconde, en 16:9 (#19775). Le cellulaire capture comme le
 * Wi-Fi : c'est l'encodeur qui descend, et l'image remonte d'elle-même quand le
 * lien le permet, sans rouvrir la caméra. Une capture 4:3 remplissait la scène
 * en `cover`, recadrée puis agrandie : flou garanti.
 */
export function captureShape(profile: DataProfile): CaptureShape {
  const [width, height, frameRate] = CAPTURE[profile];
  return { width: { ideal: width, max: 1280 }, height: { ideal: height, max: 720 }, frameRate: { ideal: frameRate, max: 30 }, aspectRatio: { ideal: 16 / 9 } };
}

export { browserConnection } from '../device/capability-tier';
