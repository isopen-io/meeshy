import type { DeviceTier } from '../device/capability-tier';

/**
 * **LE NOYAU DU DÉVELOPPEMENT D'UNE PHOTO** (#8695, #11310) — la taille, le
 * look, l'encodage : tout ce qu'un WORKER sait faire, sans rien connaître du
 * client qui le pilote (`photo-develop.ts` en est la façade, avec la route
 * hors du fil principal). Le worker (`image-job-worker.ts`) importe ce noyau,
 * jamais la façade : sinon le worker se référencerait lui-même.
 */

export type PhotoSize = { readonly width: number; readonly height: number };

export type PhotoCrop = PhotoSize & { readonly x: number; readonly y: number };

export type PhotoLook = { readonly brightness: number; readonly contrast: number; readonly saturation: number; readonly sharpness: number };

export const PHOTO_LOOK: PhotoLook = { brightness: 1.03, contrast: 1.05, saturation: 1.06, sharpness: 0.25 };

export const PHOTO_MAX_EDGE = 2560;

/** Le grand côté d'un look développé sur CET appareil (W10) : un appareil bas en tient moins (jumeau du plafond de décodage iOS, `DecodedBitmapStore.pixelCeiling`). Argumenté, non mesuré. */
export const photoMaxEdgeFor = (tier: DeviceTier): number => (tier === 'low' ? 1920 : PHOTO_MAX_EDGE);

export const PHOTO_MIME = 'image/jpeg';

export const PHOTO_QUALITY = 0.88;

export function developedSize(size: PhotoSize, maxEdge: number = PHOTO_MAX_EDGE): PhotoSize {
  const scale = Math.min(1, maxEdge / Math.max(size.width, size.height));
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}

export const lookFilter = (look: PhotoLook = PHOTO_LOOK): string => `brightness(${look.brightness}) contrast(${look.contrast}) saturate(${look.saturation})`;

function toned(pixels: Uint8ClampedArray, look: PhotoLook): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(pixels.length);
  const tone = (value: number): number => (value * look.brightness - 128) * look.contrast + 128;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = tone(pixels[i] ?? 0);
    const g = tone(pixels[i + 1] ?? 0);
    const b = tone(pixels[i + 2] ?? 0);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    out[i] = luma + (r - luma) * look.saturation;
    out[i + 1] = luma + (g - luma) * look.saturation;
    out[i + 2] = luma + (b - luma) * look.saturation;
    out[i + 3] = pixels[i + 3] ?? 255;
  }
  return out;
}

/**
 * Retouche des pixels RGBA, rendue dans un tableau NEUF : la source n'est
 * jamais touchée. Deux tableaux d'octets au plus (le ton, puis la netteté) :
 * une photo de 2560 px en coûte deux fois 20 Mo, jamais un tableau flottant
 * quatre fois plus lourd.
 */
export function developPixels(pixels: Uint8ClampedArray, size: PhotoSize, look: PhotoLook = PHOTO_LOOK): Uint8ClampedArray<ArrayBuffer> {
  const tone = toned(pixels, look);
  if (look.sharpness <= 0 || size.width < 3 || size.height < 3) return tone;
  const out = new Uint8ClampedArray(tone);
  const row = size.width * 4;
  const center = 1 + 4 * look.sharpness;
  for (let y = 1; y < size.height - 1; y += 1) {
    for (let x = 1; x < size.width - 1; x += 1) {
      const i = y * row + x * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const at = i + channel;
        const around = (tone[at - 4] ?? 0) + (tone[at + 4] ?? 0) + (tone[at - row] ?? 0) + (tone[at + row] ?? 0);
        out[at] = (tone[at] ?? 0) * center - around * look.sharpness;
      }
    }
  }
  return out;
}

export type PhotoSurface = {
  readonly paint: (image: CanvasImageSource, crop: PhotoCrop, size: PhotoSize) => void;
  /** `null` : pixels illisibles (canevas protégé, mémoire) — la photo part sans retouche. */
  readonly pixels: () => Uint8ClampedArray | null;
  readonly put: (pixels: Uint8ClampedArray<ArrayBuffer>) => void;
  readonly encode: (mime: string, quality: number) => Promise<Blob | null>;
};

/** Ce qu'une prise de vue devient à l'encodage : `jpeg` (le développement des prises), `efficient` (une pièce qui part sur le réseau : WebP, repli JPEG, PNG si elle est transparente). `opaque` : la source ne peut pas porter d'alpha (un JPEG), le balayage est épargné. */
export type PhotoOutput =
  | { readonly kind: 'jpeg'; readonly quality: number }
  | { readonly kind: 'efficient'; readonly quality: number; readonly opaque?: boolean };

/** Une image déjà prise, que l'environnement peut confier à un worker : `undefined` = pas de worker, `null` = le worker a échoué ; dans les deux cas le canevas courant fait le travail — une prise de vue ne se perd jamais. */
export type PhotoDevelopRequest = {
  readonly image: CanvasImageSource;
  readonly crop: PhotoCrop;
  readonly size: PhotoSize;
  readonly look: PhotoLook | null;
  readonly output: PhotoOutput;
};

export type PhotoEnv = {
  readonly surface: (size: PhotoSize) => PhotoSurface | null;
  readonly develop?: (request: PhotoDevelopRequest) => Promise<Blob | null> | undefined;
};

export type PhotoSource = { readonly image: CanvasImageSource; readonly size: PhotoSize; readonly crop?: PhotoCrop };

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const surfaceOf = (context: Context2D, size: PhotoSize, encode: PhotoSurface['encode']): PhotoSurface => ({
  paint: (image, crop, target) => {
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, target.width, target.height);
  },
  pixels: () => {
    try {
      return context.getImageData(0, 0, size.width, size.height).data;
    } catch {
      return null;
    }
  },
  put: (pixels) => context.putImageData(new ImageData(pixels, size.width, size.height), 0, 0),
  encode,
});

function browserSurface(size: PhotoSize): PhotoSurface | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext('2d');
    if (context !== null) return surfaceOf(context, size, (type, quality) => canvas.convertToBlob({ type, quality }).catch(() => null));
  }
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  return context === null ? null : surfaceOf(context, size, (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality)));
}

export const canvasPhotoEnv: PhotoEnv = { surface: browserSurface };

/** Ce qu'un usage règle autrement que la prise de vue : la borne, la qualité, le look (`null` : aucun, l'image telle quelle), le format (`output`, qui prime sur `quality`). */
export type DevelopOptions = {
  readonly maxEdge?: number;
  readonly quality?: number;
  readonly look?: PhotoLook | null;
  readonly output?: PhotoOutput;
};

const hasTransparency = (pixels: Uint8ClampedArray): boolean => {
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) return true;
  return false;
};

/**
 * Le format d'une pièce qui part sur le réseau : un PNG transparent reste un
 * PNG (l'alpha ne se perd jamais) ; le reste part en WebP, et un navigateur qui
 * ne sait pas l'ÉCRIRE rend un PNG à la place (`convertToBlob` retombe sans
 * erreur) — ce qui se lit au TYPE du résultat, et retombe sur le JPEG. Pixels
 * illisibles : transparence présumée, donc PNG sans perte.
 */
async function encodeEfficient(surface: PhotoSurface, quality: number, opaque: boolean): Promise<Blob | null> {
  const pixels = opaque ? null : surface.pixels();
  if (!opaque && (pixels === null || hasTransparency(pixels))) return surface.encode('image/png', quality);
  const webp = await surface.encode('image/webp', quality);
  return webp !== null && webp.type === 'image/webp' ? webp : surface.encode('image/jpeg', quality);
}

const encodeOutput = (surface: PhotoSurface, output: PhotoOutput): Promise<Blob | null> =>
  output.kind === 'jpeg' ? surface.encode(PHOTO_MIME, output.quality) : encodeEfficient(surface, output.quality, output.opaque === true);

export async function developPhoto(source: PhotoSource, env: PhotoEnv = canvasPhotoEnv, options: DevelopOptions = {}): Promise<Blob | null> {
  const crop = source.crop ?? { x: 0, y: 0, width: source.size.width, height: source.size.height };
  if (crop.width <= 0 || crop.height <= 0) return null;
  const size = developedSize(crop, options.maxEdge ?? PHOTO_MAX_EDGE);
  const look = options.look === undefined ? PHOTO_LOOK : options.look;
  const output = options.output ?? { kind: 'jpeg', quality: options.quality ?? PHOTO_QUALITY };
  const offloaded = await env.develop?.({ image: source.image, crop, size, look, output });
  if (offloaded !== undefined && offloaded !== null) return offloaded;
  const surface = env.surface(size);
  if (surface === null) return null;
  surface.paint(source.image, crop, size);
  const pixels = look === null ? null : surface.pixels();
  if (pixels !== null && look !== null) surface.put(developPixels(pixels, size, look));
  return encodeOutput(surface, output);
}

export type DecodedPhoto = { readonly image: CanvasImageSource; readonly size: PhotoSize; readonly close: () => void };

