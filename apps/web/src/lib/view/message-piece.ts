import type { Attachment, Message } from '@/lib/api/types';
import type { MessagePiecesCatalogKey } from '@/lib/i18n-message-pieces-catalog';

import { partitionAttachments } from './media-grid-layout';
import type { MediaPageOffers } from './viewer-page-offers';

/**
 * CHAQUE PIÈCE D'UN MESSAGE SE VISE SEULE (#9907, #9908, directive porteur du
 * 2026-10-10) — l'appui long, le clic droit ou la touche Menu sur une tuile
 * d'un message à plusieurs pièces ouvre CETTE pièce, avec un défilement vers
 * les autres, et le menu agit sur la pièce visée. iOS est la référence de
 * comportement (`MessageOverlayMenu`, même milestone).
 *
 * Ce module est la LOI : quelles pièces le défilement parcourt, quelle tuile
 * l'appui a touchée, quelles actions une pièce offre. Il ne rend rien.
 */

/** L'attribut que chaque case de la grille porte (`media-grid.tsx`) : l'identifiant de SA pièce. */
export const PIECE_ATTRIBUTE = 'data-piece';

/**
 * LES PIÈCES QUE L'APERÇU PARCOURT — les pièces VISUELLES (photo, vidéo), dans
 * l'ordre de la grille, et seulement quand il y en a au moins deux : une pièce
 * seule EST le message, son aperçu reste celui du message.
 */
export function menuPiecesOf(message: Pick<Message, 'attachments'>): readonly Attachment[] {
  const { visual } = partitionAttachments(message.attachments ?? []);
  return visual.length >= 2 ? visual : [];
}

/**
 * LA TUILE QUE L'APPUI A TOUCHÉE — la case `[data-piece]` la plus proche de
 * l'origine du geste, à condition qu'elle vive dans la rangée pressée. Hors
 * tuile (texte, citation, pied), rien : le menu vise le message entier.
 */
export function pieceIdAt(origin: EventTarget | null | undefined, row: Element): string | undefined {
  if (origin === null || origin === undefined || !(origin instanceof Element)) return undefined;
  const cell = origin.closest(`[${PIECE_ATTRIBUTE}]`);
  if (cell === null || !row.contains(cell)) return undefined;
  const id = cell.getAttribute(PIECE_ATTRIBUTE);
  return id === null || id === '' ? undefined : id;
}

/** La pièce visée, si elle est encore l'une des pièces que l'aperçu parcourt. */
export function targetedPieceOf(
  message: Pick<Message, 'attachments'>,
  pieceId: string | undefined,
): { readonly pieces: readonly Attachment[]; readonly index: number } | null {
  if (pieceId === undefined) return null;
  const pieces = menuPiecesOf(message);
  const index = pieces.findIndex((piece) => piece.id === pieceId);
  return index === -1 ? null : { pieces, index };
}

export type PieceActionId = 'pieceReply' | 'pieceSave' | 'pieceForward' | 'pieceDelete' | 'wholeMessage';

export type PieceMenuGlyph = 'arrowUUpLeft' | 'downloadSimple' | 'arrowBendUpRight' | 'trash' | 'chatText';

const PIECE_LABEL_KEYS = {
  pieceReply: 'message.piece.reply',
  pieceSave: 'message.piece.save',
  pieceForward: 'message.piece.forward',
  pieceDelete: 'message.piece.delete',
  wholeMessage: 'message.piece.whole',
} as const satisfies Readonly<Record<PieceActionId, MessagePiecesCatalogKey>>;

export type PieceMenuItem = {
  readonly id: PieceActionId;
  readonly labelKey: (typeof PIECE_LABEL_KEYS)[PieceActionId];
  readonly glyph: PieceMenuGlyph;
};

const item = (id: PieceActionId, glyph: PieceMenuGlyph): PieceMenuItem => ({ id, labelKey: PIECE_LABEL_KEYS[id], glyph });

/**
 * LE MENU D'UNE PIÈCE (#9908) — répondre à elle, l'enregistrer, la
 * transférer, la supprimer, puis « Tout le message », qui rend le menu du
 * message entier. Réagir passe par le rail, au-dessus.
 *
 * Les offres sont celles de la visionneuse (`mediaPageOffers`) : une pièce
 * protégée n'offre ni enregistrement ni transfert, et le bouton n'existe pas
 * plutôt que de refuser après le geste (loi 4). La suppression n'est offerte
 * qu'à l'auteur (`pieceDeletable`), seule personne que la passerelle autorise
 * hors administration.
 */
export function pieceMenuItems(input: { readonly offers: MediaPageOffers; readonly deletable: boolean }): readonly PieceMenuItem[] {
  const { offers, deletable } = input;
  return [
    ...(offers.reply ? [item('pieceReply', 'arrowUUpLeft')] : []),
    ...(offers.save ? [item('pieceSave', 'downloadSimple')] : []),
    ...(offers.share ? [item('pieceForward', 'arrowBendUpRight')] : []),
    ...(deletable ? [item('pieceDelete', 'trash')] : []),
    item('wholeMessage', 'chatText'),
  ];
}

/**
 * QUI PEUT SUPPRIMER UNE PIÈCE APRÈS L'ENVOI (#9906) — l'auteur du message,
 * sur un message que la passerelle connaît (jamais un envoi encore local,
 * `cid_…`) et qui n'est pas déjà supprimé. La passerelle juge sur
 * `uploadedBy` (ou un rôle d'administration) : le client reste en deçà,
 * fail-closed, et ne propose rien qu'elle refuserait à l'auteur.
 */
export function pieceDeletable(params: {
  readonly message: Pick<Message, 'id' | 'senderId' | 'deletedAt'>;
  readonly piece: Pick<Attachment, 'uploadedBy'>;
  readonly viewerId: string;
}): boolean {
  const { message, piece, viewerId } = params;
  if (viewerId === '' || message.id.startsWith('cid_')) return false;
  if (message.deletedAt !== undefined && message.deletedAt !== null) return false;
  return message.senderId === viewerId && piece.uploadedBy === viewerId;
}

/** Le message SANS la pièce — la mise à jour optimiste de la suppression. */
export function withoutPiece(message: Message, attachmentId: string): Message {
  const attachments = message.attachments ?? [];
  if (!attachments.some((piece) => piece.id === attachmentId)) return message;
  return { ...message, attachments: attachments.filter((piece) => piece.id !== attachmentId) };
}

/** Le message AVEC la pièce, remise à son rang — le retour arrière d'une suppression refusée. */
export function withPieceRestored(message: Message, piece: Attachment, index: number): Message {
  const attachments = message.attachments ?? [];
  if (attachments.some((existing) => existing.id === piece.id)) return message;
  const at = Math.max(0, Math.min(index, attachments.length));
  return { ...message, attachments: [...attachments.slice(0, at), piece, ...attachments.slice(at)] };
}

/** La largeur la plus grande de l'aperçu d'une pièce, et la part de l'écran qu'il peut prendre en hauteur. */
export const PIECE_PREVIEW_MAX_WIDTH = 420;
export const PIECE_PREVIEW_MAX_HEIGHT_RATIO = 0.55;
const PIECE_PREVIEW_MIN_HEIGHT = 160;

/**
 * LA BOÎTE DE L'APERÇU D'UNE PIÈCE (#9907) — une seule boîte pour tout le
 * défilement, taillée sur la pièce la plus HAUTE du lot à la largeur offerte,
 * plafonnée à une part de l'écran : chaque pièce s'y pose à son rapport
 * d'aspect (`contain`), et la boîte ne change pas de taille pendant le
 * glissé — la liste d'actions dessous ne bouge pas d'un pixel. Une pièce sans
 * dimensions compte comme un carré.
 */
export function piecePreviewBox(params: {
  readonly pieces: readonly Pick<Attachment, 'width' | 'height'>[];
  readonly viewport: { readonly width: number; readonly height: number };
  readonly sidePadding: number;
}): { readonly width: number; readonly height: number } {
  const { pieces, viewport, sidePadding } = params;
  const width = Math.max(0, Math.min(PIECE_PREVIEW_MAX_WIDTH, viewport.width - 2 * sidePadding));
  const tallest = pieces.reduce((max, piece) => {
    const ratio = piece.width !== undefined && piece.height !== undefined && piece.width > 0 && piece.height > 0 ? piece.width / piece.height : 1;
    return Math.max(max, width / ratio);
  }, 0);
  const height = Math.min(viewport.height * PIECE_PREVIEW_MAX_HEIGHT_RATIO, Math.max(PIECE_PREVIEW_MIN_HEIGHT, tallest));
  return { width, height: Math.round(height) };
}
