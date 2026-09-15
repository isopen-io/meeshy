import type { Attachment, Message } from './types';
import { amina, attachmentDefaults, dayAt, kwame, message } from './fixtures-base';

/**
 * LE CORPUS DE LA GRILLE 2/3/4+ (#6221, § 5 étape 7 de la spécification
 * « grille de médias ») — cinq messages NEUFS de `c-medias`, entre `media-5`
 * (09:20) et `media-7` (09:30, `lastMessage` — INCHANGÉ) : `media-15`
 * (vidéo SEULE, 09:22), `media-11` (2 images, 09:26), `media-12` (2 images +
 * 1 vidéo, 09:27), `media-13` (4 images, alt EN traduit fr/de, 09:28),
 * `media-14` (6 images, la 3ᵉ `isBlurred`, 09:29).
 *
 * FICHIER SÉPARÉ (jamais empilé dans `fixtures-media.ts`, 504 lignes déjà) :
 * `fixtures-media.ts` les CONCATÈNE dans `MEDIA_MESSAGES`, à leur place
 * CHRONOLOGIQUE — l'array n'est jamais trié, son ORDRE EST l'ordre affiché.
 *
 * `MEDIA_CONVERSATION_ID`/`MEDIA_IMAGE_DATA_URI` NE SONT PAS IMPORTÉS de
 * `fixtures-media.ts` : ce fichier EST importé PAR lui (`MEDIA_MESSAGES`),
 * et l'import inverse fermerait un CYCLE — au chargement, `fixtures-media
 * -grid.ts` lirait `MEDIA_CONVERSATION_ID` avant que `fixtures-media.ts` ne
 * l'ait assigné (zone morte temporelle d'un `const`). Le littéral `'c-
 * medias'` et le pixel indigo sont donc REPRIS ici à l'identique — même
 * régime que le WAV de `wavDataUri()`, généré plutôt que partagé.
 */
const GRID_CONVERSATION_ID = 'c-medias';

/** Le MÊME pixel indigo que `MEDIA_IMAGE_DATA_URI` (`fixtures-media.ts:52-53`) — recette identique, dupliqué pour éviter le cycle ci-dessus. */
const GRID_IMAGE_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNITvsIAALqAbsneUV/AAAAAElFTkSuQmCC';

const mediaMessage = (partial: Parameters<typeof message>[0]): Message =>
  message({ ...partial, conversationId: GRID_CONVERSATION_ID });

/**
 * `pPMBAAA=` — un en-tête ThumbHash `(L=36, P=14, Q=31)` dont la couleur
 * moyenne (`averageColorOfThumbHash`, `lib/media/thumbhash.ts`) vaut
 * `#6065f0`, à 3 unités de l'indigo `#6366f1` de `MEDIA_IMAGE_DATA_URI` —
 * calculé ce jour, vérifié par `media-grid.test.ts` (T6).
 */
const GRID_THUMB_HASH = 'pPMBAAA=';

/**
 * `MEDIA_VIDEO_DATA_URI` — un littéral WebM VP8 valide de 929 octets
 * (`160×90`, 7 s à 2 i/s), produit par :
 * ```
 * ffmpeg -f lavfi -i color=c=0x6366f1:s=160x90:d=7:r=2 -c:v libvpx -b:v 8k -an mv.webm
 * ```
 * et vérifié par `ffprobe -show_entries stream=codec_name,width,height
 * -show_entries format=duration mv.webm` : `codec_name=vp8`, `width=160`,
 * `height=90`, `duration=7.000000`. ZÉRO octet binaire au dépôt (Q6) — même
 * régime que `MEDIA_IMAGE_DATA_URI` (`fixtures-media.ts:52-53`) et
 * `wavDataUri()` : un littéral, élagué des builds `VITE_DATA_SOURCE=gateway`
 * par `vite.config.ts` § `FIXTURE_MODULE`.
 */
export const MEDIA_VIDEO_DATA_URI =
  'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAANxEU2bdLpNu4tTq4QV' +
  'SalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggNb7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDBXQYxMYXZmNjEuNy4xMDBEiYhAu1gAAAAAABZU' +
  'rmvIrgEAAAAAAAA/14EBc8WI/NoO+Y1FpHicgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QdzWUA4JCwgaC6gVqagQJVsIRVuYEBElTDZ/tzc59j' +
  'wIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYxLjcuMTAwc3PWY8CLY8WI/NoO+Y1FpHhnyKFFo4dFTkNPREVSRIeUTGF2YzYxLjE5LjEwMSBsaWJ2cHhn' +
  'yKFFo4hEVVJBVElPTkSHkzAwOjAwOjA3LjAwMDAwMDAwMAAfQ7Z1QVvngQCj04EAAICwBQCdASqgAFoAAEcIhYWIhYSIAgICdaoCBnmVphqqTXcQ' +
  '6qk13EOqpNdxDqqTXcQ6qk13EN4A/u9RL/94C//eAv/3gL/7wF/8Buvi2XwAo5iBAfQAEQIAARAQABgAGFgv9AAIgIEAAACjmIED6AARAgABEBAA' +
  'GAAYWC/0AAiAgQAAAKOYgQXcABECAAEQEAAYABhYL/QACICBAAAAo5iBB9AAEQIAARAQABgAGFgv9AAIgIEAAACjmIEJxAARAgABEBAAGAAYWC/0' +
  'AAiAgQAAAKOYgQu4ABECAAEQEAAYABhYL/QACICBAAAAo5eBDawA8QEAARAQFGAAYWC/0AAiAgQAAKOYgQ+gABECAAEQEAAYABhYL/QACICBAAAA' +
  'o5iBEZQAEQIAARAQABgAGFgv9AAIgIEAAACjmIETiAARAgABEBAAGAAYWC/0AAiAgQAAAB9DtnXS54IVfKOYgQAAABECAAEQEAAYABhYL/QACICB' +
  'AAAAo5iBAfQAEQIAARAQABgAGFgv9AAIgIEAAACjmIED6AARAgABEBAAGAAYWC/0AAiAgQAAABxTu2uRu4+zgQC3iveBAfGCAaPwgQM=';

/** Une pièce IMAGE du corpus grille — extension de `imageAttachment()` (D4 : `imageVariants`, `thumbHash`). */
const gridImage = (params: {
  readonly id: string;
  readonly createdAt: Date;
  readonly alt: string;
  readonly translations?: Attachment['translations'];
  readonly isBlurred?: boolean;
}): Attachment => ({
  ...attachmentDefaults,
  id: params.id,
  messageId: params.id.split('-a')[0]!,
  fileName: 'photo.png',
  originalName: 'photo.png',
  mimeType: 'image/png',
  fileSize: 96,
  fileUrl: GRID_IMAGE_DATA_URI,
  thumbnailUrl: GRID_IMAGE_DATA_URI,
  thumbHash: GRID_THUMB_HASH,
  width: 640,
  height: 427,
  imageVariants: [{ width: 640, height: 427, url: GRID_IMAGE_DATA_URI, size: 96, format: 'webp' }],
  alt: params.alt,
  uploadedBy: 'u-amina',
  createdAt: params.createdAt.toISOString(),
  transcription: { type: 'image', text: params.alt, language: 'fr', confidence: 1, source: 'vision' },
  translations: params.translations ?? {},
  ...(params.isBlurred === true ? { isBlurred: true } : {}),
});

/** La pièce VIDÉO du corpus grille — même régime que `gridImage`, `duration` en MILLISECONDES. */
const gridVideo = (id: string, createdAt: Date): Attachment => ({
  ...attachmentDefaults,
  id: `${id}-v1`,
  messageId: id,
  fileName: 'clip.webm',
  originalName: 'clip-marina.webm',
  mimeType: 'video/webm',
  fileSize: 929,
  fileUrl: MEDIA_VIDEO_DATA_URI,
  thumbnailUrl: GRID_IMAGE_DATA_URI,
  thumbHash: GRID_THUMB_HASH,
  width: 160,
  height: 90,
  duration: 7_000,
  uploadedBy: 'u-amina',
  createdAt: createdAt.toISOString(),
});

// ===== media-15 — LA VIDÉO SEULE (09:22) =====
export const MEDIA_SOLO_VIDEO_WITNESS_ID = 'media-15';
const media15CreatedAt = dayAt(0, 9, 22);
const media15 = mediaMessage({
  id: MEDIA_SOLO_VIDEO_WITNESS_ID,
  senderId: 'u-amina',
  sender: amina,
  content: '',
  originalLanguage: 'fr',
  messageType: 'video',
  translations: [],
  createdAt: media15CreatedAt,
  attachments: [gridVideo(MEDIA_SOLO_VIDEO_WITNESS_ID, media15CreatedAt)],
});

// ===== media-11 — DEUX IMAGES (09:26) =====
export const MEDIA_GRID_PAIR_WITNESS_ID = 'media-11';
const media11CreatedAt = dayAt(0, 9, 26);
const media11 = mediaMessage({
  id: MEDIA_GRID_PAIR_WITNESS_ID,
  senderId: 'u-kwame',
  sender: kwame,
  content: '',
  originalLanguage: 'fr',
  messageType: 'image',
  translations: [],
  createdAt: media11CreatedAt,
  attachments: [
    gridImage({ id: `${MEDIA_GRID_PAIR_WITNESS_ID}-a1`, createdAt: media11CreatedAt, alt: 'Vue du port au matin' }),
    gridImage({ id: `${MEDIA_GRID_PAIR_WITNESS_ID}-a2`, createdAt: media11CreatedAt, alt: 'Les voiliers amarrés' }),
  ],
});

// ===== media-12 — DEUX IMAGES + UNE VIDÉO (09:27) =====
export const MEDIA_GRID_TRIPLE_WITNESS_ID = 'media-12';
const media12CreatedAt = dayAt(0, 9, 27);
const media12 = mediaMessage({
  id: MEDIA_GRID_TRIPLE_WITNESS_ID,
  senderId: 'u-amina',
  sender: amina,
  content: '',
  originalLanguage: 'fr',
  messageType: 'video',
  translations: [],
  createdAt: media12CreatedAt,
  attachments: [
    gridImage({ id: `${MEDIA_GRID_TRIPLE_WITNESS_ID}-a1`, createdAt: media12CreatedAt, alt: 'Le quai au lever du jour' }),
    gridImage({ id: `${MEDIA_GRID_TRIPLE_WITNESS_ID}-a2`, createdAt: media12CreatedAt, alt: 'Les mouettes sur le môle' }),
    gridVideo(MEDIA_GRID_TRIPLE_WITNESS_ID, media12CreatedAt),
  ],
});

/**
 * ===== media-13 — QUATRE IMAGES (09:28), alt EN d'origine, traduit fr/de =====
 * Le témoin de RANG (T7) : prisme `['de','fr']` doit servir l'ALLEMAND sur
 * CHAQUE case, pas seulement la première (leçon 261 — un témoin de rang ne
 * s'écrit jamais sur le rang 1).
 */
export const MEDIA_GRID_QUAD_WITNESS_ID = 'media-13';
const media13CreatedAt = dayAt(0, 9, 28);
const marinaTranslations = (n: number): Attachment['translations'] => ({
  fr: { type: 'image', transcription: `Cliché ${n} de la marina`, createdAt: media13CreatedAt.toISOString() },
  de: { type: 'image', transcription: `Aufnahme ${n} vom Yachthafen`, createdAt: media13CreatedAt.toISOString() },
});
const media13 = mediaMessage({
  id: MEDIA_GRID_QUAD_WITNESS_ID,
  senderId: 'u-kwame',
  sender: kwame,
  content: '',
  originalLanguage: 'en',
  messageType: 'image',
  translations: [],
  createdAt: media13CreatedAt,
  attachments: [1, 2, 3, 4].map((n) =>
    gridImage({
      id: `${MEDIA_GRID_QUAD_WITNESS_ID}-a${n}`,
      createdAt: media13CreatedAt,
      alt: `Marina shot ${n}`,
      translations: marinaTranslations(n),
    }),
  ),
});

/**
 * ===== media-14 — SIX IMAGES (09:29), la 3ᵉ `isBlurred` =====
 * `visibleCount(6) = 4` : le badge `+2` porte sur la 4ᵉ case ; la 3ᵉ pièce
 * (index 2) reste dans `visual` À SA POSITION (D-41) mais ne rend aucun
 * média — `MaskedAttachment` REMPLIT sa case.
 */
export const MEDIA_GRID_OVERFLOW_WITNESS_ID = 'media-14';
const media14CreatedAt = dayAt(0, 9, 29);
const media14 = mediaMessage({
  id: MEDIA_GRID_OVERFLOW_WITNESS_ID,
  senderId: 'u-amina',
  sender: amina,
  content: '',
  originalLanguage: 'fr',
  messageType: 'image',
  translations: [],
  createdAt: media14CreatedAt,
  attachments: [1, 2, 3, 4, 5, 6].map((n) =>
    gridImage({
      id: `${MEDIA_GRID_OVERFLOW_WITNESS_ID}-a${n}`,
      createdAt: media14CreatedAt,
      alt: `Photo ${n} du voyage`,
      isBlurred: n === 3,
    }),
  ),
});

/** ORDRE CHRONOLOGIQUE, concaténé par `fixtures-media.ts` entre `media-6` (09:25) et `media-7` (09:30). */
export const MEDIA_GRID_MESSAGES: readonly Message[] = [media11, media12, media13, media14];

/** `media-15` est ANTÉRIEUR à `media-6` (09:22 < 09:25) — exporté à part pour que `fixtures-media.ts` l'insère à SA place. */
export const MEDIA_SOLO_VIDEO_MESSAGE: Message = media15;
