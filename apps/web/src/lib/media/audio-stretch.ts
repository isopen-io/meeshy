/**
 * **CHANGER LA VITESSE D'UN AUDIO SANS CHANGER LA VOIX** (#9163, miroir
 * d'`AudioEditEngine` iOS, qui rééchelonne la piste et garde la hauteur par
 * `audioTimePitchAlgorithm = .spectral`) — ici par WSOLA : des fenêtres de
 * Hann à 50 % de recouvrement, prélevées au pas de la vitesse et recollées au
 * pas d'origine, chacune calée à ±8 ms sur la continuité de la précédente pour
 * que les ondes se recouvrent en phase. La durée se divise par la vitesse ; la
 * période de l'onde, donc la hauteur, ne bouge pas.
 */

/** Les paliers de `MeeshyAudioEditorView.speedPanel`. */
export const AUDIO_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** La borne du moteur iOS (`renderPlan` : 0,25…3). */
const SPEED_MIN = 0.25;
const SPEED_MAX = 3;
const IDENTITY = 0.001;
const FRAME_SECONDS = 0.03;
const TOLERANCE_SECONDS = 0.008;
/** Le calage se cherche sur un guide ramené vers 6 kHz : la voix y garde sa forme. */
const GUIDE_RATE = 6000;

export function speedLabel(speed: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(speed)}×`;
}

/** Le guide de calage : la moyenne des canaux, décimée, bordée de silence. */
const guideOf = (channels: readonly Float32Array[], decimation: number, padding: number): Float32Array => {
  const length = Math.ceil((channels[0]?.length ?? 0) / decimation);
  const guide = new Float32Array(length + padding);
  for (let index = 0; index < length; index += 1) {
    let sum = 0;
    for (const samples of channels) sum += samples[index * decimation]!;
    guide[index] = sum / channels.length;
  }
  return guide;
};

type Search = { readonly guide: Float32Array; readonly decimation: number; readonly span: number; readonly tolerance: number; readonly last: number };

const bestStart = ({ guide, decimation, span, tolerance, last }: Search, nominal: number, natural: number): number => {
  const from = Math.max(0, Math.round(nominal / decimation) - tolerance);
  const to = Math.min(Math.floor(last / decimation), Math.round(nominal / decimation) + tolerance);
  const anchor = Math.round(natural / decimation);
  let best = Math.min(Math.max(0, nominal), last);
  let score = Number.NEGATIVE_INFINITY;
  for (let candidate = from; candidate <= to; candidate += 1) {
    let sum = 0;
    for (let index = 0; index < span; index += 1) sum += guide[candidate + index]! * guide[anchor + index]!;
    if (sum > score) {
      score = sum;
      best = candidate * decimation;
    }
  }
  return Math.min(best, last);
};

export function stretched(channels: readonly Float32Array[], speed: number, sampleRate: number): Float32Array[] {
  const rate = Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed));
  if (Math.abs(rate - 1) < IDENTITY) return channels.map((samples) => samples.slice());
  const input = channels[0]?.length ?? 0;
  const output = Math.round(input / rate);
  const half = Math.max(1, Math.round((FRAME_SECONDS * sampleRate) / 2));
  const frame = half * 2;
  const decimation = Math.max(1, Math.round(sampleRate / GUIDE_RATE));
  const window = Float32Array.from({ length: frame }, (_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / frame));
  const last = Math.max(0, input - frame);
  const search: Search = {
    guide: guideOf(channels, decimation, frame),
    decimation,
    span: Math.max(1, Math.round(half / decimation)),
    tolerance: Math.round((TOLERANCE_SECONDS * sampleRate) / decimation),
    last,
  };
  const mixed = channels.map(() => new Float32Array(output + frame));
  const weight = new Float32Array(output + frame);
  let previous = 0;
  for (let synthesis = 0; synthesis < output; synthesis += half) {
    const nominal = Math.round(synthesis * rate);
    const start = synthesis === 0 ? 0 : bestStart(search, nominal, previous + half);
    const reach = Math.min(frame, input - start);
    for (let index = 0; index < frame; index += 1) weight[synthesis + index] = weight[synthesis + index]! + window[index]!;
    channels.forEach((samples, channel) => {
      const target = mixed[channel]!;
      for (let index = 0; index < reach; index += 1) target[synthesis + index] = target[synthesis + index]! + samples[start + index]! * window[index]!;
    });
    previous = start;
  }
  return mixed.map((samples) => {
    const result = samples.subarray(0, output);
    for (let index = 0; index < output; index += 1) {
      const total = weight[index]!;
      if (total > IDENTITY) result[index] = result[index]! / total;
    }
    return result.slice();
  });
}
