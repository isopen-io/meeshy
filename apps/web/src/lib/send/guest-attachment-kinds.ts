/**
 * LES FAMILLES DE PIÈCES JOINTES D'UN INVITÉ, CÔTÉ WEB (#10001, #10003).
 *
 * JUMELLES GARDÉES de `@meeshy/shared/types/guest-attachment-kinds` et
 * `@meeshy/shared/types/world` : ces deux modules construisent au niveau module
 * des schémas Zod COMPLETS (`z.enum`, `z.object`), et les importer depuis la
 * session ou le composeur ferait entrer `zod` (et non `zod/mini`) dans le
 * socle et dans le chunk du fil pour quelques constantes — même raison que
 * `WORLD_IDENTIFIER` (`lib/lens/world-pin.ts`). `guest-attachment-kinds.test.ts`
 * rougit au premier écart entre chaque jumelle et sa source.
 */
export const GUEST_KINDS = ['text', 'audio', 'image', 'pdf'] as const;

export type GuestKind = (typeof GUEST_KINDS)[number];

/** Le plafond d'une pièce jointe d'invité sur un lien restreint — 25 Mio. */
export const GUEST_KIND_MAX_BYTES = 25 * 1024 * 1024;

export const GUEST_KIND_EXTENSIONS: Readonly<Record<GuestKind, readonly string[]>> = {
  text: ['txt'],
  audio: ['mp3', 'm4a', 'mp4', 'aac', 'ogg', 'oga', 'opus', 'webm', 'weba', 'wav'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  pdf: ['pdf'],
};

/** Les codes de refus que les chemins d'envoi rendent (`GUEST_ATTACHMENT_REFUSAL_CODES`). */
export const GUEST_KIND_REFUSAL_CODES = {
  KIND_NOT_ALLOWED: 'GUEST_ATTACHMENT_KIND_NOT_ALLOWED',
  TOO_LARGE: 'GUEST_ATTACHMENT_TOO_LARGE',
} as const;

/** La clé de jonction semée de World Wide — repli SEUL, jamais une adresse :
 * le parcours d'entrée lit la clé servie par `GET /world`. Elle sert ici à
 * reconnaître une session d'invité World Wide enregistrée avant que la
 * jonction ne serve ses familles. */
export const WORLD_LINK_IDENTIFIER = 'mshy_world';

/** Le plafond décidé sur World Wide : du texte `.txt` et de l'audio. */
export const WORLD_GUEST_KINDS: readonly GuestKind[] = ['text', 'audio'];

const RASTER_IMAGES: readonly string[] = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

/** La famille que DÉCLARE un type MIME — miroir de `guestAttachmentKindOfMimeType`. */
export function guestKindOfMimeType(mimeType: string | null | undefined): GuestKind | null {
  if (!mimeType) return null;
  const base = (mimeType.split(';')[0] ?? '').trim().toLowerCase();
  if (base === 'text/plain') return 'text';
  if (base.startsWith('audio/')) return 'audio';
  if (RASTER_IMAGES.includes(base)) return 'image';
  if (base === 'application/pdf') return 'pdf';
  return null;
}

const KNOWN: readonly string[] = GUEST_KINDS;

export function isGuestKind(value: unknown): value is GuestKind {
  return typeof value === 'string' && KNOWN.includes(value);
}
