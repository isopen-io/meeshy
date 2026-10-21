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
 *
 * **HORS DU FIL PRINCIPAL** (#11310). La convolution et l'encodage d'une
 * photo de 12 Mpx coûtent des dizaines de millisecondes d'un seul tenant : le
 * développement d'un fichier (`developPhotoFile`) et celui d'une image déjà
 * capturée (`developPhoto`, par un cadre transféré) tournent dans un worker
 * (`image-job-worker.ts`), la réduction se faisant au décodage
 * (`createImageBitmap` + `resizeWidth`). Sans worker, le canevas courant fait
 * le travail comme avant. Le noyau (`photo-develop-core.ts`) est ce que le
 * worker importe : cette façade, qui pilote le worker, n'y entre jamais.
 */

import { currentDeviceTier } from '../device/capability-tier';

import { canvasPhotoEnv, developPhoto as developOnEnv, PHOTO_LOOK, photoMaxEdgeFor, PHOTO_MIME, PHOTO_QUALITY, type DecodedPhoto, type DevelopOptions, type PhotoEnv, type PhotoSource } from './photo-develop-core';
import { imageJobClient } from './image-job-client';

export {
  developedSize,
  developPixels,
  lookFilter,
  PHOTO_LOOK,
  PHOTO_MAX_EDGE,
  photoMaxEdgeFor,
  PHOTO_MIME,
  PHOTO_QUALITY,
  type DecodedPhoto,
  type DevelopOptions,
  type PhotoCrop,
  type PhotoDevelopRequest,
  type PhotoEnv,
  type PhotoLook,
  type PhotoOutput,
  type PhotoSize,
  type PhotoSource,
  type PhotoSurface,
} from './photo-develop-core';

/**
 * Une image déjà prise (un cadre de caméra) : recadrée et réduite par
 * `createImageBitmap` (asynchrone, hors canevas), puis TRANSFÉRÉE au worker
 * qui la retouche et l'encode. `undefined` : pas de worker.
 */
const developFrameOffMain: NonNullable<PhotoEnv['develop']> = (request) => {
  if (!imageJobClient.available) return undefined;
  const { crop, size } = request;
  return createImageBitmap(request.image, crop.x, crop.y, crop.width, crop.height, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' }).then(
    (bitmap) => imageJobClient.run({ input: { kind: 'frame', bitmap }, maxEdge: Math.max(size.width, size.height), look: request.look, output: request.output }) ?? null,
    () => null,
  );
};

export const browserPhotoEnv: PhotoEnv = { ...canvasPhotoEnv, develop: developFrameOffMain };

export const developPhoto = (source: PhotoSource, env: PhotoEnv = browserPhotoEnv, options: DevelopOptions = {}): Promise<Blob | null> => developOnEnv(source, env, options);

export type PhotoFileEnv = PhotoEnv & {
  readonly decode: (file: Blob) => Promise<DecodedPhoto>;
  /** Le fichier développé par un worker (décodage, réduction, look, JPEG) ; `undefined` (pas de worker) ou `null` (worker en panne, muet, ou image illisible) : le fil courant le fait. */
  readonly offMain?: (file: Blob) => Promise<Blob | null> | undefined;
  /** Le grand côté du fichier développé (`photoMaxEdgeFor`, W10) ; `PHOTO_MAX_EDGE` sans consigne. */
  readonly maxEdge?: number;
};

export const browserPhotoFileEnv: PhotoFileEnv = {
  ...browserPhotoEnv,
  maxEdge: photoMaxEdgeFor(currentDeviceTier()),
  decode: async (file) => {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { image: bitmap, size: { width: bitmap.width, height: bitmap.height }, close: () => bitmap.close() };
  },
  offMain: (file) =>
    imageJobClient.run({ input: { kind: 'file', blob: file }, maxEdge: photoMaxEdgeFor(currentDeviceTier()), look: PHOTO_LOOK, output: { kind: 'jpeg', quality: PHOTO_QUALITY } }),
};

const jpegName = (name: string): string => `${name.replace(/\.[^./]+$/, '') || 'photo'}.jpg`;

/** Le repli, sur le canevas courant SEULEMENT : sans `develop`, le cadre décodé ne repart pas vers un worker qui vient d'échouer. */
async function developOnMainThread(file: File, env: PhotoFileEnv): Promise<Blob | null> {
  const decoded = await env.decode(file);
  try {
    return await developOnEnv({ image: decoded.image, size: decoded.size }, { surface: env.surface }, env.maxEdge === undefined ? {} : { maxEdge: env.maxEdge });
  } finally {
    decoded.close();
  }
}

/** Une photo prise par la caméra du système (`<input capture>`) : développée, sinon rendue telle quelle. */
export async function developPhotoFile(file: File, env: PhotoFileEnv = browserPhotoFileEnv): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const blob = (await env.offMain?.(file)) ?? (await developOnMainThread(file, env));
    return blob === null ? file : new File([blob], jpegName(file.name), { type: blob.type || PHOTO_MIME, lastModified: file.lastModified });
  } catch {
    return file;
  }
}
