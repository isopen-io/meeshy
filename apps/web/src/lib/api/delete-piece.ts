import type { QueryClient } from '@tanstack/react-query';
import * as attachmentsEndpoints from '@meeshy/shared/api/endpoints/attachments';

import type { HttpRequest, ApiResult } from '@/lib/api/http';
import { patchMediaHubMessages } from '@/lib/api/media-hub-cache';
import { patchThreadMessages } from '@/lib/api/messages';
import type { Message } from '@/lib/api/types';
import { withPieceRestored, withoutPiece } from '@/lib/view/message-piece';

/**
 * SUPPRIMER UNE PIÈCE APRÈS L'ENVOI (#9906, #9908) — `DELETE` sur
 * `attachments.byAttachmentId` (`services/gateway/src/routes/attachments
 * /metadata.ts`), que la passerelle n'accorde qu'à qui a téléversé la pièce
 * (ou à un administrateur) ; le menu ne l'offre qu'à l'auteur
 * (`pieceDeletable`).
 *
 * La pièce supprimée est CELLE que l'utilisateur a visée, par son identifiant,
 * jamais « la première du message » (le défaut iOS que #9906 ferme).
 *
 * Optimiste : la pièce quitte le fil et l'écran des médias AVANT l'accusé ; un
 * refus ou une coupure la REMET à son rang (`withPieceRestored`), sans écraser
 * ce que le cache a appris entre-temps sur le reste du message.
 */
export type PieceDeleteOutcome = 'ok' | 'offline' | 'refused';

export async function performPieceDelete(params: {
  readonly queryClient: QueryClient;
  readonly conversationId: string;
  readonly message: Message;
  readonly attachmentId: string;
  readonly transport: { readonly request: <T>(request: HttpRequest) => Promise<ApiResult<T>> };
}): Promise<PieceDeleteOutcome> {
  const { queryClient, conversationId, message, attachmentId, transport } = params;
  const index = (message.attachments ?? []).findIndex((piece) => piece.id === attachmentId);
  const piece = message.attachments?.[index];
  if (piece === undefined) return 'refused';
  const onMessage = (change: (m: Message) => Message) => (messages: readonly Message[]): readonly Message[] =>
    messages.map((m) => (m.id === message.id ? change(m) : m));
  const apply = (change: (m: Message) => Message): void => {
    patchThreadMessages(queryClient, conversationId, onMessage(change));
    patchMediaHubMessages(queryClient, conversationId, onMessage(change));
  };
  apply((m) => withoutPiece(m, attachmentId));
  const result = await transport.request<unknown>({ method: 'DELETE', path: attachmentsEndpoints.byAttachmentId(attachmentId) });
  if (result.ok) return 'ok';
  apply((m) => withPieceRestored(m, piece, index));
  return result.status === 0 ? 'offline' : 'refused';
}
