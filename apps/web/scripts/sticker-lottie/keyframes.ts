/**
 * LE MOUVEMENT D'UN STICKER MEE EN LOTTIE (#10639) — le navigateur joue le
 * CSS du sticker et rend, à chaque image, la matrice et l'opacité de chaque
 * pièce. On n'interprète jamais le CSS : on le MESURE, puis on garde le
 * minimum de keyframes linéaires qui retrace la mesure à la tolérance près.
 * C'est ce qui rend la parité avec le film du web vraie par construction.
 */

export type Affine = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export type LottieTransform = { readonly position: readonly [number, number]; readonly rotation: number; readonly scale: readonly [number, number] };

export type Keyframe = { readonly t: number; readonly s: readonly number[]; readonly o?: { readonly x: number; readonly y: number }; readonly i?: { readonly x: number; readonly y: number } };

export type AnimatedValue = { readonly a: 0; readonly k: number | readonly number[] } | { readonly a: 1; readonly k: readonly Keyframe[] };

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor + 0;
};

export function decomposeAffine([a, b, c, d, e, f]: Affine): LottieTransform {
  const sx = Math.hypot(a, b);
  const rotation = sx < 1e-9 ? 0 : (Math.atan2(b, a) * 180) / Math.PI;
  const sy = sx < 1e-9 ? Math.hypot(c, d) : (a * d - b * c) / sx;
  return { position: [e, f], rotation, scale: [sx * 100, sy * 100] };
}

export function unwrapDegrees(degrees: readonly number[]): readonly number[] {
  return degrees.reduce<number[]>((out, value, index) => {
    if (index === 0) return [value];
    const previous = out[index - 1] as number;
    const turns = Math.round((previous - value) / 360);
    return [...out, value + turns * 360];
  }, []);
}

const fits = (samples: readonly (readonly number[])[], from: number, to: number, epsilon: number): boolean => {
  const start = samples[from] as readonly number[];
  const end = samples[to] as readonly number[];
  for (let t = from + 1; t < to; t += 1) {
    const u = (t - from) / (to - from);
    const sample = samples[t] as readonly number[];
    if (sample.some((value, k) => Math.abs((start[k] as number) + ((end[k] as number) - (start[k] as number)) * u - value) > epsilon)) return false;
  }
  return true;
};

export function animatedValue(samples: readonly (readonly number[])[], o: { readonly epsilon: number; readonly loopFrames: number; readonly digits?: number }): AnimatedValue {
  const digits = o.digits ?? 2;
  const first = samples[0] as readonly number[];
  const constant = samples.every((sample) => sample.every((value, k) => Math.abs(value - (first[k] as number)) <= o.epsilon));
  if (constant) return { a: 0, k: first.length === 1 ? round(first[0] as number, digits) : first.map((value) => round(value, digits)) };
  const kept = [0];
  for (let i = 1; i < samples.length - 1; i += 1) {
    if (!fits(samples, kept.at(-1) as number, i + 1, o.epsilon)) kept.push(i);
  }
  kept.push(samples.length - 1);
  const linear = { o: { x: 0, y: 0 }, i: { x: 1, y: 1 } };
  const keys: Keyframe[] = kept.map((t) => ({ t, s: (samples[t] as readonly number[]).map((value) => round(value, digits)), ...linear }));
  return { a: 1, k: [...keys, { t: o.loopFrames, s: first.map((value) => round(value, digits)) }] };
}
