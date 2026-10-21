import { useCallback, useMemo, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';

import { apiDeps } from '@/lib/api/deps';
import { performMessageEdit, type MessageEditOutcome } from '@/lib/api/edit-message';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import type { Message } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { isMessagePiecesCatalogLoaded, translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * LE MODE ÉDITION DU COMPOSEUR (#10581) — miroir de `beginEdit` /
 * `submitEdit` / `cancelEdit` (`apps/ios/Meeshy/Features/Main/Views/
 * ConversationView+ComposerBanners.swift`).
 *
 * `begin` arme le mode sur le texte D'ORIGINE du message, jamais sur sa
 * traduction servie : c'est ce texte que l'auteur a écrit et qu'il réécrit.
 *
 * `submit` suit iOS : un texte vide ne fait rien (le mode reste armé), un
 * texte inchangé referme sans rien envoyer, un texte neuf referme AUSSITÔT —
 * la rangée porte déjà le nouveau texte (`performMessageEdit`, optimiste) — et
 * l'issue se dit dans la région vivante du fil.
 *
 * Le brouillon en cours n'est pas l'affaire de ce hook : le composeur reste
 * monté sous le champ d'édition (`MessageEditDock`), son état avec lui.
 */
export type MessageEditState = {
  readonly editing: { readonly messageId: string; readonly original: string } | null;
  readonly begin: (messageId: string) => void;
  readonly cancel: () => void;
  readonly submit: (text: string) => void;
};

type Transport = { readonly request: <T>(request: HttpRequest) => Promise<ApiResult<T>> };

const noticeOf = (outcome: Exclude<MessageEditOutcome, 'unchanged'>): string | null => {
  const language = currentInterfaceLanguage();
  if (outcome === 'offline') return translate(language, 'media.viewer.offline');
  if (!isMessagePiecesCatalogLoaded(language)) return null;
  return translateMessagePieces(language, outcome === 'ok' ? 'message.edit.done' : 'message.edit.failed');
};

export function useMessageEdit(params: {
  readonly conversationId: string | undefined;
  readonly messages: readonly Message[];
  readonly announce?: ((message: string) => void) | undefined;
  /** INJECTABLES pour les témoins — le cache et le transport de l'application par défaut. */
  readonly queryClient?: QueryClient;
  readonly transport?: Transport;
}): MessageEditState {
  const { conversationId, messages, announce } = params;
  const queryClient = params.queryClient ?? appQueryClient;
  const transport = params.transport ?? apiDeps.transport;
  const [editingId, setEditingId] = useState<string | null>(null);

  /* Le message édité peut quitter le fil (supprimé, purgé) : le mode suit, il
     ne reste jamais armé sur une rangée disparue. */
  const edited = editingId === null ? undefined : messages.find((m) => m.id === editingId);
  const editing = useMemo(
    () => (edited === undefined ? null : { messageId: edited.id, original: edited.content }),
    [edited?.id, edited?.content],
  );

  const begin = useCallback(
    (messageId: string) => {
      if (conversationId !== undefined && messages.some((m) => m.id === messageId)) setEditingId(messageId);
    },
    [conversationId, messages],
  );

  const cancel = useCallback(() => setEditingId(null), []);

  const submit = useCallback(
    (text: string) => {
      if (edited === undefined || conversationId === undefined) return;
      const content = text.trim();
      if (content === '') return;
      setEditingId(null);
      if (content === edited.content.trim()) return;
      void performMessageEdit({ queryClient, conversationId, message: edited, content, transport }).then((outcome) => {
        if (outcome === 'unchanged') return;
        const notice = noticeOf(outcome);
        if (notice !== null) announce?.(notice);
      });
    },
    [edited, conversationId, queryClient, transport, announce],
  );

  return useMemo(() => ({ editing, begin, cancel, submit }), [editing, begin, cancel, submit]);
}
