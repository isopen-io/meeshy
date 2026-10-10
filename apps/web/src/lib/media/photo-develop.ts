/**
 * **LE DÉVELOPPEMENT D'UNE PHOTO** (#8695) — le SEUL traitement d'une prise de
 * vue, réutilisé par toutes : la caméra du composer d'une conversation, le
 * studio (story, réel), les captures d'un appel. Chaque photo :
 *
 * - est bornée à `PHOTO_MAX_EDGE` sur son grand côté (jamais agrandie) — une
 *   photo de 12 Mpx ne part pas telle quelle sur un réseau mobile ;
 * - reçoit un look léger (`PHOTO_LOOK`) : un peu de lumière, de contraste, de
 *   couleur, et une netteté douce par convolution 3 × 3 ;
 * - garde son orientation (appliquée au décodage, `imageOrientation`) ;
 * - n'est JAMAIS en miroir (`cameraMirrored`, rôle `capture`) ;
 * - part en JPEG de qualité bornée (`PHOTO_QUALITY`) — sans ses métadonnées
 *   EXIF, que le canevas ne recopie pas.
 *
 * Le flux vidéo d'un appel reçoit le même look, en filtre de canevas
 * (`lookFilter`), là où il est déjà repeint (`video-effects-pipeline.ts`).
 *
 * Aucun autre site n'encode une prise de vue : `photo-develop-guard.test.ts`
 * le garde. Le navigateur est INJECTÉ (`PhotoEnv`) : `bun test` n'a pas de
 * canevas.
 */

export type PhotoSize = { readonly width: number; readonly height: number };

export type PhotoCrop = PhotoSize & { readonly x: number; readonly y: number };

export type PhotoLook = { readonly brightness: number; readonly contrast: number; readonly saturation: number; readonly sharpness: number };

export const PHOTO_LOOK: PhotoLook = { brightness: 1.03, contrast: 1.05, saturation: 1.06, sharpness: 0.25 };

export const PHOTO_MAX_EDGE = 2560;

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

export type PhotoEnv = { readonly surface: (size: PhotoSize) => PhotoSurface | null };

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

export const browserPhotoEnv: PhotoEnv = { surface: browserSurface };

export async function developPhoto(source: PhotoSource, env: PhotoEnv = browserPhotoEnv): Promise<Blob | null> {
  const crop = source.crop ?? { x: 0, y: 0, width: source.size.width, height: source.size.height };
  if (crop.width <= 0 || crop.height <= 0) return null;
  const size = developedSize(crop);
  const surface = env.surface(size);
  if (surface === null) return null;
  surface.paint(source.image, crop, size);
  const pixels = surface.pixels();
  if (pixels !== null) surface.put(developPixels(pixels, size));
  return surface.encode(PHOTO_MIME, PHOTO_QUALITY);
}

export type DecodedPhoto = { readonly image: CanvasImageSource; readonly size: PhotoSize; readonly close: () => void };

export type PhotoFileEnv = PhotoEnv & { readonly decode: (file: Blob) => Promise<DecodedPhoto> };

export const browserPhotoFileEnv: PhotoFileEnv = {
  ...browserPhotoEnv,
  decode: async (file) => {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { image: bitmap, size: { width: bitmap.width, height: bitmap.height }, close: () => bitmap.close() };
  },
};

const jpegName = (name: string): string => `${name.replace(/\.[^./]+$/, '') || 'photo'}.jpg`;

/** Une photo prise par la caméra du système (`<input capture>`) : développée, sinon rendue telle quelle. */
export async function developPhotoFile(file: File, env: PhotoFileEnv = browserPhotoFileEnv): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const decoded = await env.decode(file);
    try {
      const blob = await developPhoto({ image: decoded.image, size: decoded.size }, env);
      return blob === null ? file : new File([blob], jpegName(file.name), { type: blob.type || PHOTO_MIME, lastModified: file.lastModified });
    } finally {
      decoded.close();
    }
  } catch {
    return file;
  }
}
