import type { AttachmentMessageType } from '@meeshy/shared/utils/attachment-message-type';

/**
 * **LE GLYPHE CENTRAL D'UNE PIÈCE EN ATTENTE** (#9119, miroir
 * `ComposerPendingTileGlyph`, `AttachmentTypeGlyph.swift`) — toucher la
 * vignette l'ÉDITE, son centre le dit. `null` ⇒ rien d'éditable, aucun
 * glyphe promis : un GIF ne s'offre pas à la retouche (la scène le figerait),
 * un fichier n'a pas d'éditeur.
 */
export type PendingTileGlyph = 'edit' | null;

export function pendingTileGlyph({
  kind,
  mimeType,
}: {
  readonly kind: AttachmentMessageType;
  readonly mimeType: string;
}): PendingTileGlyph {
  if (kind === 'image') return mimeType.toLowerCase() === 'image/gif' ? null : 'edit';
  if (kind === 'video' || kind === 'audio') return 'edit';
  return null;
}
