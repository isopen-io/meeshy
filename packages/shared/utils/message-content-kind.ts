/**
 * LE TYPE DE CONTENU D'UN MESSAGE (#11205), dérivé en UN site — ce que le
 * message EST ; ce qu'un lecteur en FAIT est `messageActionsFor`. Ordre de
 * lecture : supprimé, système (dont l'appel), formes de la métadonnée
 * (sticker, lieu — écrit en `text` par le serveur, #7590 —, sondage), pièces
 * jointes, texte.
 */

import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags.js';
import { messageTypeFromMimeTypes } from './attachment-message-type.js';
import { CAPTURE_NOTICE_KIND } from './capture-notice.js';
import { isContactCardAttachment } from './vcard.js';

export type MessageContentKind =
  | 'text' | 'link' | 'image' | 'video' | 'audio' | 'file' | 'location'
  | 'contact' | 'poll' | 'sticker' | 'call' | 'system' | 'deleted' | 'multi';

export type MessageContentFlags = {
  readonly viewOnce: boolean;
  readonly blurred: boolean;
  /** Chiffré de bout en bout, ou chiffré sous un régime non déclaré : le serveur ne lit pas le clair (fermé par défaut). */
  readonly encrypted: boolean;
  readonly ephemeral: boolean;
  /** Identifiant client `cid_…` : le serveur ne connaît pas encore ce message. */
  readonly optimistic: boolean;
  readonly failed: boolean;
  readonly captureNotice: boolean;
};

export type MessageContentShape = { readonly kind: MessageContentKind; readonly flags: MessageContentFlags };

type Instant = Date | string | number;

export type MessageContentPiece = {
  readonly mimeType?: string | null;
  readonly originalName?: string | null;
  readonly fileName?: string | null;
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  readonly effectFlags?: number | null;
};

export type MessageContentSubject = {
  readonly id: string;
  readonly content?: string | null;
  readonly messageType?: string | null;
  readonly deletedAt?: Instant | null;
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  readonly isEncrypted?: boolean | null;
  readonly encryptionMode?: string | null;
  readonly effectFlags?: number | null;
  /** Même forme que `ContentExitSubject.expiresAt` : la loi de sortie la lit telle quelle. */
  readonly expiresAt?: Date | string | null;
  readonly ephemeralDuration?: number | null;
  readonly metadata?: unknown;
  readonly attachments?: ReadonlyArray<MessageContentPiece | null | undefined> | null;
  /** L'envoi a échoué — posé par le client qui l'a tenté. */
  readonly failed?: boolean | null;
};

const { EPHEMERAL, BLURRED, VIEW_ONCE, EPHEMERAL_AFTER_READ } = MESSAGE_EFFECT_FLAGS;
const CALL_KINDS: ReadonlySet<unknown> = new Set(['call', 'call-live']);
const SERVER_READABLE_MODES: ReadonlySet<string> = new Set(['server', 'hybrid']);
const WEB_ADDRESS = /(?<![@\w])https?:\/\/\S/i;

const recordOf = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const piecesOf = (message: MessageContentSubject): readonly MessageContentPiece[] =>
  (message.attachments ?? []).filter((piece): piece is MessageContentPiece => piece != null);

const present = (value: unknown): boolean => value !== undefined && value !== null;

function pieceKind(piece: MessageContentPiece): MessageContentKind {
  const fileName = piece.originalName ?? piece.fileName ?? null;
  if (isContactCardAttachment({ mimeType: piece.mimeType, fileName })) return 'contact';
  return messageTypeFromMimeTypes([piece.mimeType ?? '']) ?? 'file';
}

function kindOf(message: MessageContentSubject, metadata: Readonly<Record<string, unknown>>): MessageContentKind {
  if (present(message.deletedAt)) return 'deleted';
  if (message.messageType === 'system') return CALL_KINDS.has(metadata.kind) ? 'call' : 'system';
  if (message.messageType === 'sticker' || present(metadata.sticker)) return 'sticker';
  if (message.messageType === 'location' || present(metadata.location)) return 'location';
  if (present(metadata.poll)) return 'poll';
  const pieces = piecesOf(message);
  const [only] = pieces;
  if (pieces.length > 1) return 'multi';
  if (only) return pieceKind(only);
  return WEB_ADDRESS.test(message.content ?? '') ? 'link' : 'text';
}

function flagsOf(message: MessageContentSubject, metadata: Readonly<Record<string, unknown>>): MessageContentFlags {
  const pieces = piecesOf(message);
  const bits = pieces.reduce((acc, piece) => acc | (piece.effectFlags ?? 0), message.effectFlags ?? 0);
  const duration = message.ephemeralDuration ?? 0;
  return {
    viewOnce: message.isViewOnce === true || pieces.some((piece) => piece.isViewOnce === true) || (bits & VIEW_ONCE) !== 0,
    blurred: message.isBlurred === true || pieces.some((piece) => piece.isBlurred === true) || (bits & BLURRED) !== 0,
    encrypted: message.encryptionMode === 'e2ee' || (message.isEncrypted === true && !SERVER_READABLE_MODES.has(message.encryptionMode ?? '')),
    ephemeral: present(message.expiresAt) || duration > 0 || (bits & (EPHEMERAL | EPHEMERAL_AFTER_READ)) !== 0,
    optimistic: message.id.startsWith('cid_'),
    failed: message.failed === true,
    captureNotice: message.messageType === 'system' && metadata.kind === CAPTURE_NOTICE_KIND,
  };
}

export function messageContentKind(message: MessageContentSubject): MessageContentShape {
  const metadata = recordOf(message.metadata);
  return { kind: kindOf(message, metadata), flags: flagsOf(message, metadata) };
}
