/**
 * **LA VOIX QUE JE DEMANDE** (#8697) — les paramètres `fmtp` d'Opus dans la
 * description que J'ENVOIE : ils disent au pair comment encoder ce que je
 * reçois (RFC 7587). Voix mono (`stereo=0`), silence sans paquets
 * (`usedtx=1`), correction d'erreurs dans le flux (`useinbandfec=1`) et débit
 * moyen borné par le profil (`call-data-profile.ts`) — le même réglage qu'iOS.
 *
 * Seule la ligne `fmtp` d'Opus change : aucun codec n'est ajouté ni retiré
 * (RED injecté dans le SDP avait rendu l'audio muet — ADR-4 iOS), et la
 * description locale reste celle du navigateur.
 */

export type OpusShape = { readonly maxAverageBitrate: number; readonly maxPlaybackRate?: number };

const OPUS_RTPMAP = /^a=rtpmap:(\d+) opus\/48000/i;

type Wanted = ReadonlyArray<readonly [string, string]>;

function withParameters(existing: string, wanted: Wanted): string {
  const pairs = existing.split(';').map((pair) => pair.trim()).filter((pair) => pair !== '');
  const keyOf = (pair: string): string => (pair.split('=')[0] ?? '').toLowerCase();
  const present = new Set(pairs.map(keyOf));
  const kept = pairs.map((pair) => {
    const found = wanted.find(([key]) => key === keyOf(pair));
    return found === undefined ? pair : `${found[0]}=${found[1]}`;
  });
  return [...kept, ...wanted.filter(([key]) => !present.has(key)).map(([key, value]) => `${key}=${value}`)].join(';');
}

function sectionsOf(lines: readonly string[]): readonly (readonly string[])[] {
  return lines.reduce<readonly (readonly string[])[]>((sections, line) => {
    if (line.startsWith('m=') || sections.length === 0) return [...sections, [line]];
    return [...sections.slice(0, -1), [...(sections.at(-1) ?? []), line]];
  }, []);
}

/** Les numéros de charge ne valent que dans LEUR section `m=` : une vidéo peut réutiliser celui d'Opus. */
function shapeSection(lines: readonly string[], wanted: Wanted): readonly string[] {
  const payloads = lines.map((line) => OPUS_RTPMAP.exec(line)?.[1]).filter((payload): payload is string => payload !== undefined);
  if (payloads.length === 0) return lines;
  const hasFmtp = (payload: string): boolean => lines.some((line) => line.startsWith(`a=fmtp:${payload} `));
  return lines.flatMap((line) => {
    const fmtp = payloads.find((payload) => line.startsWith(`a=fmtp:${payload} `));
    if (fmtp !== undefined) return [`a=fmtp:${fmtp} ${withParameters(line.slice(`a=fmtp:${fmtp} `.length), wanted)}`];
    const rtpmap = OPUS_RTPMAP.exec(line)?.[1];
    return rtpmap !== undefined && !hasFmtp(rtpmap) ? [line, `a=fmtp:${rtpmap} ${withParameters('', wanted)}`] : [line];
  });
}

export function shapeOpusSdp(sdp: string, shape: OpusShape): string {
  const newline = sdp.includes('\r\n') ? '\r\n' : '\n';
  const wanted: Wanted = [
    ['maxaveragebitrate', String(shape.maxAverageBitrate)],
    ['usedtx', '1'],
    ['useinbandfec', '1'],
    ['stereo', '0'],
    ['sprop-stereo', '0'],
    ...(shape.maxPlaybackRate === undefined ? [] : ([['maxplaybackrate', String(shape.maxPlaybackRate)]] as const)),
  ];
  return sectionsOf(sdp.split(newline))
    .flatMap((section) => shapeSection(section, wanted))
    .join(newline);
}
