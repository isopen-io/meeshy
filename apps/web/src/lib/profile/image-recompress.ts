import type { ProfileImageKind } from '@/lib/api/profile';

/**
 * **RECOMPRESSER AVANT D'ENVOYER** (#5562, #6289) — miroir de
 * `ImageCompressor.compressOffMain` (iOS, `ProfileView.swift:929`, 500 Ko pour
 * l'avatar, 800 Ko pour la bannière), porté au navigateur.
 *
 * Une photo de téléphone pèse 3 à 8 Mo. Sur le profil réseau que ce dépôt
 * budgète (Fast 3G, 86 kbit/s en montée, `budgets.json § network`), l'envoyer
 * telle quelle coûte PLUSIEURS MINUTES — pour une image affichée en 96 px. La
 * complexité se paie ici, jamais chez l'utilisateur (dimension 12).
 *
 * **Le format.** WebP d'abord (la passerelle l'accepte,
 * `packages/shared/types/attachment.ts § IMAGE`) ; un navigateur qui ne sait
 * pas l'ÉCRIRE rend un PNG à la place (`HTMLCanvasElement.toBlob` retombe sur
 * PNG sans erreur) — ce qui se détecte au TYPE du résultat, et retombe sur le
 * JPEG.
 *
 * **Jamais pire que l'original.** Une image déjà petite, dans ses bornes et
 * dans un format accepté, part telle quelle si la recompression pèse davantage.
 *
 * **Ce que le ré-encodage retire en passant** : les métadonnées EXIF, dont la
 * position GPS d'une photo prise au téléphone — le canvas ne les recopie pas.
 * L'orientation, elle, est APPLIQUÉE au décodage (`imageOrientation:
 * 'from-image'`), jamais perdue.
 *
 * Le codec est INJECTÉ : `bun test` n'a pas de canvas, et la loi à prouver est
 * celle des bornes, du format et du repli — le navigateur, lui, est mesuré par
 * `scripts/check-profile.mjs`.
 */

export type ImageSize = { readonly width: number; readonly height: number };

export type ImageBound = { readonly maxWidth: number; readonly maxHeight: number };

export type ImageTarget = ImageBound & { readonly quality: number };

/** L'avatar s'affiche au plus en 96 px CSS (trois fois sur un écran dense) ;
 * la bannière couvre la largeur d'un téléphone sur 120 px de haut. */
export const IMAGE_TARGETS: Readonly<Record<ProfileImageKind, ImageTarget>> = {
  avatar: { maxWidth: 512, maxHeight: 512, quality: 0.85 },
  banner: { maxWidth: 1500, maxHeight: 1500, quality: 0.82 },
};

export type DecodedImage = ImageSize & {
  readonly source: unknown;
  close(): void;
};

export type ImageCodec = {
  decode(file: Blob): Promise<DecodedImage>;
  encode(params: {
    readonly source: unknown;
    readonly size: ImageSize;
    readonly mime: string;
    readonly quality: number;
  }): Promise<Blob | null>;
};

const ACCEPTED_ORIGINALS: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function fitWithin(size: ImageSize, bound: ImageBound): ImageSize {
  const scale = Math.min(1, bound.maxWidth / size.width, bound.maxHeight / size.height);
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

async function encodePreferringWebp(
  codec: ImageCodec,
  params: { readonly source: unknown; readonly size: ImageSize; readonly quality: number },
): Promise<Blob> {
  const webp = await codec.encode({ ...params, mime: 'image/webp' });
  if (webp !== null && webp.type === 'image/webp') return webp;
  const jpeg = await codec.encode({ ...params, mime: 'image/jpeg' });
  if (jpeg === null) throw new Error('Image impossible à encoder');
  return jpeg;
}

export const browserImageCodec: ImageCodec = {
  decode: async (file) => {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
  },
  encode: async ({ source, size, mime, quality }) => {
    if (!(source instanceof ImageBitmap)) return null;
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (context === null) return null;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, size.width, size.height);
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
  },
};

export async function recompressImage(
  file: Blob,
  kind: ProfileImageKind,
  codec: ImageCodec = browserImageCodec,
): Promise<Blob> {
  const target = IMAGE_TARGETS[kind];
  const decoded = await codec.decode(file);
  try {
    const size = fitWithin(decoded, target);
    const encoded = await encodePreferringWebp(codec, { source: decoded.source, size, quality: target.quality });
    const originalFits = size.width === decoded.width && size.height === decoded.height && ACCEPTED_ORIGINALS.has(file.type);
    return originalFits && encoded.size >= file.size ? file : encoded;
  } finally {
    decoded.close();
  }
}
