/**
 * **UNE IMAGE ANIMÉE DANS L'EXPORT** (#13880) — un sticker ou un média GIF /
 * WebP animé : le lecteur le pose en `<img>`, que le navigateur anime de
 * lui-même en boucle ; un canvas, lui, n'en peint que la première image. Le
 * décodeur est celui de la PLATEFORME (WebCodecs `ImageDecoder`), jamais un
 * second : chaque image décodée tient sa durée, et l'animation boucle depuis
 * le début de la slide. Sans décodeur, sur un format qu'il ne lit pas, ou
 * au-delà de `maxFrames` (la mémoire d'un export), l'image reste fixe — comme
 * avant ce lot. Les animations Lottie ne sont pas lues par le lecteur web pour
 * un sticker : elles n'ont rien à rendre ici.
 */
export type AnimatedImage = {
  readonly frames: readonly { readonly image: CanvasImageSource; readonly endMs: number }[];
  readonly totalMs: number;
  readonly close: () => void;
};

const DEFAULT_FRAME_MS = 100;
const DEFAULT_MAX_FRAMES = 240;

export function frameAt(animation: AnimatedImage, tMs: number): CanvasImageSource | null {
  if (animation.totalMs <= 0) return animation.frames[0]?.image ?? null;
  const at = ((Math.max(0, tMs) % animation.totalMs) + animation.totalMs) % animation.totalMs;
  return (animation.frames.find((frame) => at < frame.endMs) ?? animation.frames[animation.frames.length - 1])?.image ?? null;
}

const frameMs = (durationUs: number | null): number => (durationUs !== null && Number.isFinite(durationUs) && durationUs > 0 ? durationUs / 1000 : DEFAULT_FRAME_MS);

export async function decodeAnimatedImage(
  blob: Blob,
  Decoder: typeof ImageDecoder | undefined,
  options: { readonly maxFrames?: number } = {},
): Promise<AnimatedImage | null> {
  if (Decoder === undefined || blob.type === '' || !(await Decoder.isTypeSupported(blob.type).catch(() => false))) return null;
  const decoder = new Decoder({ data: await blob.arrayBuffer(), type: blob.type });
  try {
    await decoder.tracks.ready;
    const count = decoder.tracks.selectedTrack?.frameCount ?? 0;
    if (count < 2 || count > (options.maxFrames ?? DEFAULT_MAX_FRAMES)) return null;
    const decoded = await Promise.all(Array.from({ length: count }, (_, frameIndex) => decoder.decode({ frameIndex }).then((result) => result.image)));
    const ends = decoded.reduce<readonly number[]>((acc, frame) => [...acc, (acc[acc.length - 1] ?? 0) + frameMs(frame.duration)], []);
    return {
      frames: decoded.map((image, index) => ({ image, endMs: ends[index] ?? 0 })),
      totalMs: ends[ends.length - 1] ?? 0,
      close: () => {
        for (const frame of decoded) frame.close();
      },
    };
  } catch {
    return null;
  } finally {
    decoder.close();
  }
}
