/**
 * **LE CODEC ENCODÉ EN MATÉRIEL** (#19777) — `mediaCapabilities.encodingInfo`
 * (type `webrtc`) dit, pour chaque codec que l'appel peut négocier, si
 * l'appareil l'encode efficacement (`powerEfficient` : un encodeur matériel,
 * en pratique). `orderVideoCodecs` (`peer-link.ts`) s'en sert pour ranger les
 * codecs, H264 restant en tête dès qu'il est offert : les pairs natifs iOS et
 * Android l'encodent en matériel.
 *
 * Une sonde par page, bornée dans le temps : un appel ne l'attend JAMAIS, il
 * prend le résultat s'il est là et l'ordre statique sinon. AV1 n'est pas
 * sondé — l'appel l'exclut (iOS `P2PWebRTCClient+CodecPreferences.swift` :
 * support matériel inégal entre iOS, Chrome et Safari).
 */

export type VideoCodecFamily = 'h264-high' | 'h264-main' | 'h264-baseline' | 'vp8' | 'vp9';

export type EncodingInfoQuery = {
  readonly type: 'webrtc';
  readonly video: { readonly contentType: string; readonly width: number; readonly height: number; readonly bitrate: number; readonly framerate: number };
};

export type EncodingInfo = (query: EncodingInfoQuery) => Promise<{ readonly supported: boolean; readonly powerEfficient: boolean }>;

export const PROBED_VIDEO_CODECS: readonly { readonly family: VideoCodecFamily; readonly contentType: string }[] = [
  { family: 'h264-high', contentType: 'video/H264;profile-level-id=640c1f;packetization-mode=1' },
  { family: 'h264-main', contentType: 'video/H264;profile-level-id=4d001f;packetization-mode=1' },
  { family: 'h264-baseline', contentType: 'video/H264;profile-level-id=42e01f;packetization-mode=1' },
  { family: 'vp9', contentType: 'video/VP9' },
  { family: 'vp8', contentType: 'video/VP8' },
];

export const CODEC_PROBE_TIMEOUT_MS = 1_500;

const PROBE_FORMAT = { width: 1280, height: 720, bitrate: 2_500_000, framerate: 30 } as const;

export type VideoCodecProbe = {
  /** Lance la sonde, une fois par page ; ne bloque rien. */
  readonly prime: () => void;
  /** Les familles encodées efficacement ; `null` tant que la sonde n'a pas conclu. */
  readonly current: () => ReadonlySet<VideoCodecFamily> | null;
};

export type VideoCodecProbeDeps = {
  readonly encodingInfo: () => EncodingInfo | null;
  readonly delay?: (ms: number) => Promise<void>;
};

const defaultDelay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createVideoCodecProbe(deps: VideoCodecProbeDeps): VideoCodecProbe {
  const delay = deps.delay ?? defaultDelay;
  let started = false;
  let result: ReadonlySet<VideoCodecFamily> | null = null;

  const efficient = (info: EncodingInfo, contentType: string): Promise<boolean> =>
    Promise.race([
      info({ type: 'webrtc', video: { contentType, ...PROBE_FORMAT } }).then((answer) => answer.supported && answer.powerEfficient),
      delay(CODEC_PROBE_TIMEOUT_MS).then(() => false),
    ]).catch(() => false);

  return {
    prime: () => {
      if (started) return;
      started = true;
      const info = deps.encodingInfo();
      if (info === null) {
        result = new Set();
        return;
      }
      void Promise.all(PROBED_VIDEO_CODECS.map(async (probed) => ((await efficient(info, probed.contentType)) ? [probed.family] : []))).then((found) => {
        result = new Set(found.flat());
      });
    },
    current: () => result,
  };
}

function browserEncodingInfo(): EncodingInfo | null {
  if (typeof navigator !== 'object' || typeof navigator.mediaCapabilities?.encodingInfo !== 'function') return null;
  const capabilities = navigator.mediaCapabilities;
  return (query) => capabilities.encodingInfo(query);
}

/** La sonde de CETTE page. */
export const videoCodecProbe: VideoCodecProbe = createVideoCodecProbe({ encodingInfo: browserEncodingInfo });
