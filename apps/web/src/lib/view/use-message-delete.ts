import { useCallback, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import { performDeleteForEveryone, performDeleteForMe, type MessageDeleteResult } from '@/lib/api/delete-message';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import type { Message } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { isMessagePiecesCatalogLoaded, translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { moderationReasonOf } from './content-removal';
import type { ActionScope } from './message-action-scope';
import { deleteOfferOf, offersDeletion, removalOfferOf, type DeleteOffer } from './message-deletion';

/**
 * LA SUPPRESSION D'UN OU PLUSIEURS MESSAGES (#10582) — l'état du dialogue et
 * ses effets, composés par `useMessageMenu` (qui tient la cible et la
 * sélection). Ce hook n'ajoute aucune règle : l'offre est `deleteOfferOf`, les
 * routes sont celles de `delete-message.ts`.
 *
 * Le dialogue se REFERME à la confirmation — la suppression est déjà visible
 * (optimiste) — et l'issue se dit dans la région vivante du fil : entière,
 * refusée, hors ligne, ou PARTIELLE avec le compte de ce qui reste.
 *
 * Un mode que la règle n'offre pas ne part pas, même demandé : le dialogue ne
 * le rend pas, cette garde vaut pour toute autre porte.
 */
export type MessageDeleteMode = 'everyone' | 'me' | 'remove';

export type MessageDeleteRequest = { readonly messageIds: readonly string[]; readonly offer: DeleteOffer };

type Transport = { readonly request: <T>(request: HttpRequest) => Promise<ApiResult<T>> };

const offered = (offer: DeleteOffer, mode: MessageDeleteMode): boolean =>
  mode === 'everyone' ? offer.forEveryone : mode === 'remove' ? offer.remove : offer.forMe;

const noticeOf = (result: MessageDeleteResult): string | null => {
  const language = currentInterfaceLanguage();
  if (result.offline) return translate(language, 'media.viewer.offline');
  if (!isMessagePiecesCatalogLoaded(language)) return null;
  const total = result.deleted + result.failed;
  const format = (value: number): string => new Intl.NumberFormat(language).format(value);
  if (result.failed === 0) {
    return total === 1
      ? translateMessagePieces(language, 'message.delete.done')
      : translateMessagePieces(language, 'message.delete.doneMany', { count: format(total) });
  }
  if (result.deleted === 0) return translateMessagePieces(language, total === 1 ? 'message.delete.failed' : 'message.delete.failedMany');
  return result.failed === 1
    ? translateMessagePieces(language, 'message.delete.partialOne', { count: format(total) })
    : translateMessagePieces(language, 'message.delete.partial', { failed: format(result.failed), count: format(total) });
};

export function useMessageDelete(params: {
  readonly conversationId: string;
  readonly messageOf: (id: string) => Message | undefined;
  readonly scope: ActionScope;
  readonly announce: (message: string) => void;
  readonly queryClient: QueryClient;
  readonly transport: Transport;
  /** Le geste est parti : l'hôte referme ce qui l'a ouvert (la sélection). */
  readonly onConfirmed: () => void;
}) {
  const { conversationId, messageOf, scope, announce, queryClient, transport, onConfirmed } = params;
  const [request, setRequest] = useState<MessageDeleteRequest | null>(null);

  /** L'offre pour ces messages — `null` : rien ne s'offre (ou le catalogue du fil n'est pas chargé, et le dialogue n'aurait pas ses mots). */
  const offerOf = useCallback(
    (ids: readonly string[]): MessageDeleteRequest | null => {
      if (!isMessagePiecesCatalogLoaded(currentInterfaceLanguage())) return null;
      const messages = ids.map(messageOf).filter((m): m is Message => m !== undefined);
      if (messages.length !== ids.length) return null;
      const offer = deleteOfferOf(messages, scope, { now: Date.now() });
      return offersDeletion(offer) ? { messageIds: ids, offer } : null;
    },
    [messageOf, scope],
  );

  const ask = useCallback((ids: readonly string[]) => setRequest(offerOf(ids)), [offerOf]);

  /** « RETIRER » DU MENU RAPIDE (#11210) — la demande ne porte que le retrait : le dialogue s'ouvre sur le motif. */
  const askRemove = useCallback((ids: readonly string[]) => {
    const asked = offerOf(ids);
    const removal = asked === null ? null : removalOfferOf(asked.offer);
    setRequest(asked === null || removal === null ? null : { messageIds: asked.messageIds, offer: removal });
  }, [offerOf]);

  const dismiss = useCallback(() => setRequest(null), []);

  const confirm = useCallback(
    (mode: MessageDeleteMode, motive?: string) => {
      if (request === null) return;
      setRequest(null);
      const reason = mode === 'remove' && motive !== undefined ? moderationReasonOf(motive) : null;
      if (!offered(request.offer, mode) || (mode === 'remove' && reason === null)) return;
      const messages = request.messageIds.map(messageOf).filter((m): m is Message => m !== undefined);
      if (messages.length === 0) return;
      onConfirmed();
      const params = { queryClient, conversationId, messages, transport };
      const performed =
        mode === 'me' ? performDeleteForMe(params) : performDeleteForEveryone({ ...params, ...(reason === null ? {} : { reason }) });
      void performed.then((result) => {
        const notice = noticeOf(result);
        if (notice !== null) announce(notice);
      });
    },
    [request, messageOf, onConfirmed, queryClient, conversationId, transport, announce],
  );

  return { request, offerOf, ask, askRemove, dismiss, confirm };
}
