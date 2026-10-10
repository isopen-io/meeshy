import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import { performPieceDelete, type PieceDeleteOutcome } from '@/lib/api/delete-piece';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import type { Attachment, Message } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { isMessagePiecesCatalogLoaded, translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { openSendSheet } from '@/lib/send/send-sheet-store';

import type { AttachmentReactionOutcome } from './attachment-reaction';
import { kindOf } from './message';
import { pieceDeletable, pieceMenuItems, targetedPieceOf, type PieceActionId, type PieceMenuItem } from './message-piece';
import { attachmentSendRequest, mediaPageOffers, type MediaPageOffers } from './viewer-page-offers';

/**
 * LE MENU D'UNE PIÈCE (#9908, #9910, #9906) — l'état et les effets de ce que
 * le menu de l'appui long fait quand il vise UNE pièce d'un message à
 * plusieurs pièces. Composé par `useMessageMenu`, qui garde la cible ; ce hook
 * n'ajoute aucune règle : les offres sont celles de la visionneuse
 * (`mediaPageOffers`), la réaction celle de la visionneuse
 * (`performAttachmentReaction`), la réponse celle de la visionneuse
 * (`setReplyToMedia` + `withAttachmentReply`), le transfert la feuille d'envoi
 * commune, la suppression `performPieceDelete`.
 *
 * Chaque issue se dit dans la région vivante du fil (`announce`) : une action
 * qui échoue en silence ressemble à un bouton inerte.
 */

/** Ce que le fil sait faire d'une pièce, depuis l'appui long. */
const THREAD_CAPABILITIES: MediaPageOffers = { save: true, react: true, reply: true, compose: false, share: true };

export type PieceMenuData = {
  readonly pieces: readonly Attachment[];
  readonly index: number;
  readonly items: readonly PieceMenuItem[];
  readonly canReact: boolean;
  /** « Photo 3 sur 7 » — le nom accessible de l'aperçu et du menu. */
  readonly positionLabel: string;
};

type Transport = { readonly request: <T>(request: HttpRequest) => Promise<ApiResult<T>> };

const REACTION_NOTICE = {
  limit: 'media.viewer.react_limit',
  offline: 'media.viewer.offline',
  refused: 'media.viewer.react_failed',
} as const satisfies Readonly<Record<Exclude<AttachmentReactionOutcome, 'ok'>, string>>;

const deleteNotice = (outcome: PieceDeleteOutcome): string => {
  const lang = currentInterfaceLanguage();
  if (outcome === 'offline') return translate(lang, 'media.viewer.offline');
  return translateMessagePieces(lang, outcome === 'ok' ? 'message.piece.deleted' : 'message.piece.deleteFailed');
};

/**
 * LA RÉACTION D'UNE PIÈCE ARRIVE AVEC LE MENU D'UNE PIÈCE — un `import()`
 * plutôt qu'un import statique : partagé par la visionneuse, le module rangé
 * dans le fil changeait le découpage des morceaux communs et faisait passer
 * la première peinture au-dessus de son plafond (`budgets.json`). Le menu le
 * réchauffe dès qu'il vise une pièce (`prewarmPieceReaction`) : au toucher
 * d'un émoji, il est là, et la pastille bouge avant l'accusé.
 */
const loadAttachmentReaction = () => import('./attachment-reaction');

export const prewarmPieceReaction = (): void => {
  void loadAttachmentReaction().catch(() => undefined);
};

export function piecePositionLabel(piece: Attachment, index: number, total: number): string {
  const lang = currentInterfaceLanguage();
  const format = new Intl.NumberFormat(lang);
  return translateMessagePieces(lang, 'message.piece.position', {
    kind: translate(lang, kindOf(piece) === 'video' ? 'attachment.kind.video' : 'attachment.kind.image'),
    index: format.format(index + 1),
    total: format.format(total),
  });
}

export function usePieceMenu(params: {
  readonly conversationId: string;
  readonly viewerId: string;
  readonly messageOf: (id: string) => Message | undefined;
  readonly onReplyToMedia: (messageId: string, attachmentId: string) => void;
  readonly announce: (message: string) => void;
  readonly queryClient: QueryClient;
  readonly transport: Transport;
}) {
  const { conversationId, viewerId, messageOf, onReplyToMedia, announce, queryClient, transport } = params;

  const pieceDataOf = useCallback(
    (messageId: string, pieceId: string | undefined): PieceMenuData | undefined => {
      const message = messageOf(messageId);
      /* Sans ses libellés, le menu d'une pièce n'existe pas : le message entier. */
      if (message === undefined || !isMessagePiecesCatalogLoaded(currentInterfaceLanguage())) return undefined;
      const target = targetedPieceOf(message, pieceId);
      if (target === null) return undefined;
      const piece = target.pieces[target.index]!;
      const now = Date.now();
      const offers = mediaPageOffers({ attachment: piece, message, capabilities: THREAD_CAPABILITIES, now });
      return {
        pieces: target.pieces,
        index: target.index,
        items: pieceMenuItems({ offers, deletable: pieceDeletable({ message, piece, viewerId }) }),
        canReact: offers.react,
        positionLabel: piecePositionLabel(piece, target.index, target.pieces.length),
      };
    },
    [messageOf, viewerId],
  );

  const pieceOf = useCallback(
    (messageId: string, pieceId: string): { readonly message: Message; readonly piece: Attachment } | undefined => {
      const message = messageOf(messageId);
      const piece = message?.attachments?.find((a) => a.id === pieceId);
      return message === undefined || piece === undefined ? undefined : { message, piece };
    },
    [messageOf],
  );

  const onPieceReact = useCallback(
    (messageId: string, pieceId: string, emoji: string) => {
      const found = pieceOf(messageId, pieceId);
      if (found === undefined) return;
      void loadAttachmentReaction()
        .then(({ performAttachmentReaction }) =>
          performAttachmentReaction({
            queryClient,
            conversationId,
            messageId,
            attachmentId: pieceId,
            emoji,
            mine: found.piece.currentUserReactions ?? [],
          }),
        )
        .then((outcome) => {
          if (outcome !== 'ok') announce(translate(currentInterfaceLanguage(), REACTION_NOTICE[outcome]));
        })
        .catch(() => announce(translate(currentInterfaceLanguage(), 'media.viewer.offline')));
    },
    [pieceOf, queryClient, conversationId, announce],
  );

  const onPieceAction = useCallback(
    (messageId: string, pieceId: string, id: Exclude<PieceActionId, 'wholeMessage'>) => {
      const found = pieceOf(messageId, pieceId);
      if (found === undefined) return;
      const { message, piece } = found;
      const lang = currentInterfaceLanguage();
      if (id === 'pieceReply') {
        onReplyToMedia(messageId, pieceId);
        return;
      }
      if (id === 'pieceForward') {
        openSendSheet(attachmentSendRequest({ attachment: piece, message, mine: message.senderId === viewerId, now: Date.now() }));
        return;
      }
      if (id === 'pieceSave') {
        void import('@/lib/media/save-piece')
          .then(({ savePiece }) => savePiece(piece))
          .then((key) => announce(translate(lang, key)))
          .catch(() => announce(translate(lang, 'media.viewer.offline')));
        return;
      }
      void performPieceDelete({ queryClient, conversationId, message, attachmentId: pieceId, transport }).then((outcome) =>
        announce(deleteNotice(outcome)),
      );
    },
    [pieceOf, onReplyToMedia, viewerId, announce, queryClient, conversationId, transport],
  );

  return { pieceDataOf, onPieceReact, onPieceAction };
}
