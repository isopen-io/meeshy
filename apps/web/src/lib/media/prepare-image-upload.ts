import type { PendingUpload } from '@/lib/api/attachments';

import type { ImageJob } from './image-job';
import { imageJobClient } from './image-job-client';
import { PHOTO_MAX_EDGE } from './photo-develop-core';

/**
 * **RECOMPRESSER AVANT D'ENVOYER** (#11310) — une photo de téléphone pèse 3 à
 * 8 Mo ; sur le profil réseau que ce dépôt budgète (Fast 3G), l'envoyer telle
 * quelle coûte des minutes, pour une image affichée en 400 px. Elle part donc
 * bornée à 2560 px, en WebP à 0,85 (repli JPEG, PNG si elle est transparente),
 * par un worker : ni le décodage, ni la réduction, ni l'encodage ne passent
 * par le fil principal. Miroir de `ImageCompressor.compressOffMain` (iOS).
 * Le profil (avatar, bannière) garde sa recompression à bornes propres
 * (`profile/image-recompress.ts`) ; tout le reste — pièces d'un message et
 * médias de posts, de commentaires et de stories — passe ici.
 *
 * **Ce qui ne se touche pas** : tout ce qui n'est ni JPEG, ni PNG, ni WebP (GIF,
 * SVG, HEIC…, que le navigateur ne sait pas ré-écrire sans perte de sens) et
 * les images ANIMÉES (APNG, WebP animé), dont l'encodage ne garderait qu'une
 * image.
 *
 * **Ce que l'encodage retire en passant** : les métadonnées EXIF — dont la
 * position GPS d'une photo prise au téléphone. C'est pourquoi un JPEG part
 * TOUJOURS ré-encodé, même si le résultat pèse davantage : le poids n'est pas
 * la seule raison de passer ici. Un PNG ou un WebP qui ne rétrécit pas part
 * tel quel (ils ne portent quasi jamais de position), jamais pire que l'original.
 *
 * **Jamais un échec d'envoi.** Worker absent, image illisible, worker en
 * erreur : l'original part. Une même pièce n'est préparée qu'UNE fois
 * (`WeakMap`) : « Réessayer » ne ré-encode pas.
 */

/** Rend `undefined` quand il n'y a pas de worker, `null` quand l'image est illisible. */
export type ImagePort = (job: ImageJob) => Promise<Blob | null> | undefined;

const PREPARABLE: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

const QUALITY = 0.85;

/** L'en-tête suffit : `acTL` (APNG) précède les données, et le drapeau d'animation d'un WebP est dans `VP8X`. */
const HEAD_BYTES = 65_536;

const ASCII = (bytes: Uint8Array, at: number, text: string): boolean => [...text].every((char, index) => bytes[at + index] === char.charCodeAt(0));

function isAnimated(bytes: Uint8Array, type: string): boolean {
  if (type === 'image/png') return bytes.some((_, at) => ASCII(bytes, at, 'acTL'));
  const extended = ASCII(bytes, 0, 'RIFF') && ASCII(bytes, 8, 'WEBP') && ASCII(bytes, 12, 'VP8X');
  return extended && ((bytes[20] ?? 0) & 0x02) !== 0;
}

const EXTENSIONS: Readonly<Record<string, string>> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

const renamed = (name: string, type: string): string => `${name.replace(/\.[^./]+$/, '') || 'photo'}.${EXTENSIONS[type] ?? 'jpg'}`;

async function prepared(file: File, port: ImagePort): Promise<File> {
  if (!PREPARABLE.has(file.type)) return file;
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  if (isAnimated(head, file.type)) return file;
  const opaque = file.type === 'image/jpeg';
  const blob = await port({
    input: { kind: 'file', blob: file },
    maxEdge: PHOTO_MAX_EDGE,
    look: null,
    output: { kind: 'efficient', quality: QUALITY, ...(opaque ? { opaque } : {}) },
  });
  if (blob === undefined || blob === null) return file;
  if (!opaque && blob.size >= file.size) return file;
  return new File([blob], renamed(file.name, blob.type), { type: blob.type, lastModified: file.lastModified });
}

export type ImagePreparer = {
  readonly prepare: (file: File) => Promise<File>;
  readonly prepareUploads: (pending: readonly PendingUpload[]) => Promise<readonly PendingUpload[]>;
};

export function createImagePreparer(port: ImagePort): ImagePreparer {
  const memo = new WeakMap<File, Promise<File>>();
  const prepare = (file: File): Promise<File> => {
    const known = memo.get(file);
    if (known !== undefined) return known;
    const result = prepared(file, port).catch(() => file);
    memo.set(file, result);
    return result;
  };
  return {
    prepare,
    prepareUploads: (pending) => Promise.all(pending.map(async (piece) => ({ ...piece, file: await prepare(piece.file) }))),
  };
}

const browserPreparer = createImagePreparer((job) => imageJobClient.run(job));

export const prepareImageForUpload = browserPreparer.prepare;

export const prepareUploads = browserPreparer.prepareUploads;
