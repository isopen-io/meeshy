import type { MediaRendition } from '@meeshy/shared/types/attachment';

import { attachmentSrc } from '@/lib/api/media-url';
import { currentDeviceTier, type DeviceTier } from '@/lib/device/capability-tier';

import { electVideoSource } from './video-rendition';

/**
 * **L'ADRESSE DE LA VIDÉO JOUÉE** (W12, #11318) — le pont entre la loi pure
 * (`electVideoSource`) et ce que le navigateur sait : décoder le HEVC, et le
 * tier de W10. La tuile vidéo et la page plein écran l'appellent une fois par
 * pièce montée, jamais à chaque rendu : un tier qui change en cours de lecture
 * ne doit pas recharger la vidéo.
 */
export type VideoServingEnv = { readonly decodesHevc: () => boolean; readonly tier: () => DeviceTier };

/** Un profil HEVC Main de niveau 9.3, celui d'une vidéo d'iPhone. */
const HEVC_PROBE = 'video/mp4; codecs="hvc1.1.6.L93.B0"';

type HevcProbe = { readonly canPlayType: (type: string) => string };

export function decodesHevcWith(probe: HevcProbe | undefined): boolean {
  if (probe === undefined) return false;
  try {
    return probe.canPlayType(HEVC_PROBE) !== '';
  } catch {
    return false;
  }
}

const probeElement = (): HevcProbe | undefined =>
  typeof document === 'object' && typeof document.createElement === 'function' ? document.createElement('video') : undefined;

const decodesHevcOnce = ((): (() => boolean) => {
  const memo: { value?: boolean } = {};
  return () => {
    memo.value ??= decodesHevcWith(probeElement());
    return memo.value;
  };
})();

export const browserVideoServingEnv: VideoServingEnv = { decodesHevc: decodesHevcOnce, tier: currentDeviceTier };

export function servedVideoSrc(
  attachment: { readonly fileUrl: string; readonly fileSize?: number; readonly renditions?: readonly MediaRendition[] },
  env: VideoServingEnv = browserVideoServingEnv,
): string {
  if (attachment.fileUrl === '') return '';
  const choice = electVideoSource({
    fileUrl: attachment.fileUrl,
    fileSize: attachment.fileSize,
    renditions: attachment.renditions,
    decodesHevc: env.decodesHevc(),
    tier: env.tier(),
  });
  return attachmentSrc(choice.url);
}
