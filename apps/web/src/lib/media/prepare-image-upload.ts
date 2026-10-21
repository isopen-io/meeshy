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
 * position GPS d'une photo prise au téléphone. C'est pourquoi une image qui
 * PORTE des métadonnées part TOUJOURS ré-encodée, même si le résultat pèse
 * davantage : un JPEG (présumé), un PNG à bloc `eXIf`, un WebP dont l'en-tête
 * `VP8X` lève le drapeau EXIF. Un PNG ou un WebP SANS métadonnées qui ne
 * rétrécit pas part tel quel : jamais pire que l'original.
 *
 * **Jamais un échec d'envoi.** Worker absent, image illisible, worker en
 * erreur ou muet (`IMAGE_JOB_WATCHDOG_MS`) : l'original part.
 *
 * **Repli Safari.** Safari 16.4+ a `OffscreenCanvas` mais n'ÉCRIT pas le WebP :
 * `convertToBlob` y rend un PNG, ce qui se lit au type du résultat et retombe
 * sur le JPEG 0,85 (`encodeEfficient`). Avant 16.4, pas de worker : l'image
 * part telle quelle, EXIF compris — exactement le comportement d'avant ce lot,
 * jamais une recompression sur le fil principal, qui figerait l'interface. Une même pièce n'est préparée qu'UNE fois
 * (`WeakMap`) : « Réessayer » ne ré-encode pas.
 */

/** Rend `undefined` quand il n'y a pas de worker, `null` quand l'image est illisible. */
export type ImagePort = (job: ImageJob) => Promise<Blob | null> | undefined;

const PREPARABLE: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

const QUALITY = 0.85;

/** L'en-tête suffit : `acTL` (APNG) précède les données, et le drapeau d'animation d'un WebP est dans `VP8X`. */
const HEAD_BYTES = 65_536;

const codes = (text: string): readonly number[] => Array.from(text, (char) => char.charCodeAt(0));

const ASCII = (bytes: Uint8Array, at: number, expected: readonly number[]): boolean => expected.every((code, index) => bytes[at + index] === code);

const AC_TL = codes('acTL');

const EX_IF = codes('eXIf');

const contains = (bytes: Uint8Array, expected: readonly number[]): boolean => bytes.some((byte, at) => byte === expected[0] && ASCII(bytes, at, expected));

/** Les drapeaux de l'en-tête étendu d'un WebP (`VP8X`), `0` s'il n'en a pas. */
const webpFlags = (bytes: Uint8Array): number =>
  ASCII(bytes, 0, codes('RIFF')) && ASCII(bytes, 8, codes('WEBP')) && ASCII(bytes, 12, codes('VP8X')) ? (bytes[20] ?? 0) : 0;

const WEBP_ANIMATION = 0x02;

const WEBP_EXIF = 0x08;

function isAnimated(bytes: Uint8Array, type: string): boolean {
  if (type === 'image/png') return contains(bytes, AC_TL);
  return (webpFlags(bytes) & WEBP_ANIMATION) !== 0;
}

/** L'image porte-t-elle des métadonnées (EXIF, dont le GPS) ? Un JPEG est présumé en porter ; un PNG le dit par `eXIf`, un WebP par son drapeau `VP8X`. */
function carriesMetadata(bytes: Uint8Array, type: string): boolean {
  if (type === 'image/jpeg') return true;
  if (type === 'image/png') return contains(bytes, EX_IF);
  return (webpFlags(bytes) & WEBP_EXIF) !== 0;
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
  if (!carriesMetadata(head, file.type) && blob.size >= file.size) return file;
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

/** Le préparateur du navigateur (le worker d'image) — le défaut de tout site d'envoi, qui l'accepte INJECTÉ pour ses témoins. */
export const browserImagePreparer: ImagePreparer = createImagePreparer((job) => imageJobClient.run(job));

export const prepareImageForUpload = browserImagePreparer.prepare;

export const prepareUploads = browserImagePreparer.prepareUploads;
