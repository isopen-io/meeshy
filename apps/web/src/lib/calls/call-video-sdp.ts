import { DATA_PROFILES, type DataProfile } from './call-data-profile';
import { sectionsOf, withParameters, type Wanted } from './call-opus-sdp';

/**
 * **LE DÉBIT VIDÉO QUE JE DEMANDE** (#19775) — les paramètres `x-google-*`
 * des codecs vidéo dans la description que J'ENVOIE : le pair démarre ce qu'il
 * m'envoie au débit de départ du profil au lieu de ramper depuis 300 kb/s, et
 * reste entre 100 kb/s et le plafond du profil. Le même réglage qu'iOS
 * (`P2PWebRTCClient+SdpRules`). Seules les lignes `fmtp` des codecs vidéo
 * changent : la retransmission (rtx), RED et la correction d'erreurs n'ont pas
 * de débit à elles.
 */

export type VideoShape = { readonly startKbps: number; readonly minKbps: number; readonly maxKbps: number };

const START_KBPS: Readonly<Record<DataProfile, number>> = { wifi: 1500, cellular: 400, economy: 200 };
const MIN_KBPS = 100;

export function videoShapeFor(profile: DataProfile): VideoShape {
  return { startKbps: START_KBPS[profile], minKbps: MIN_KBPS, maxKbps: DATA_PROFILES[profile].videoBitrate / 1000 };
}

const VIDEO_RTPMAP = /^a=rtpmap:(\d+) (H264|VP8|VP9|AV1)\/90000/i;

function shapeSection(lines: readonly string[], wanted: Wanted): readonly string[] {
  if (!(lines[0] ?? '').startsWith('m=video')) return lines;
  const payloads = lines.map((line) => VIDEO_RTPMAP.exec(line)?.[1]).filter((payload): payload is string => payload !== undefined);
  const hasFmtp = (payload: string): boolean => lines.some((line) => line.startsWith(`a=fmtp:${payload} `));
  return lines.flatMap((line) => {
    const fmtp = payloads.find((payload) => line.startsWith(`a=fmtp:${payload} `));
    if (fmtp !== undefined) return [`a=fmtp:${fmtp} ${withParameters(line.slice(`a=fmtp:${fmtp} `.length), wanted)}`];
    const rtpmap = VIDEO_RTPMAP.exec(line)?.[1];
    return rtpmap !== undefined && !hasFmtp(rtpmap) ? [line, `a=fmtp:${rtpmap} ${withParameters('', wanted)}`] : [line];
  });
}

export function shapeVideoSdp(sdp: string, shape: VideoShape): string {
  const newline = sdp.includes('\r\n') ? '\r\n' : '\n';
  const wanted: Wanted = [
    ['x-google-start-bitrate', String(shape.startKbps)],
    ['x-google-min-bitrate', String(shape.minKbps)],
    ['x-google-max-bitrate', String(shape.maxKbps)],
  ];
  return sectionsOf(sdp.split(newline))
    .flatMap((section) => shapeSection(section, wanted))
    .join(newline);
}
