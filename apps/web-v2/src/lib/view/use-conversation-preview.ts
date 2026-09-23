import { useLayoutEffect, useState } from 'react';

import { composeConversationPreview, type ConversationPreview } from '@meeshy/shared/utils/conversation-preview';

import type { Conversation } from '@/lib/api/types';
import { readingModeScopeOf } from '@/lib/reading-mode/scope';
import { draftStore, type DraftStore } from '@/lib/send/draft-store';

import { previewInputOf } from './conversation-preview-input';
import { noteEphemeralReception, receptionOf, servedDeadlineOf } from './ephemeral-reception';
import { secondClock, type IntervalClock } from './interval-clock';
import { useDraftLine } from './use-draft-line';
import { useLiveNow } from './use-live-now';

const isMine = (conversation: Conversation, viewerId: string): boolean => {
  const last = conversation.lastMessage;
  if (last === undefined || last === null || viewerId === '') return false;
  return last.senderId === viewerId || last.sender?.userId === viewerId;
};

/**
 * LA LIGNE 2, COMPOSÉE (#7547) — la valeur que `composeConversationPreview`
 * (#7546) rend pour cette conversation, à cet instant, pour ce lecteur.
 *
 * Ce hook RASSEMBLE et ne décide rien :
 *  - le brouillon, relu en direct (`useDraftLine`) ;
 *  - la réception d'un éphémère, posée au premier rendu comme le fait le fil
 *    (`resolveEphemeralDeadline` : la première fois qu'un client PEINT un
 *    message est sa réception au sens du contrat #7451) ;
 *  - l'instant : figé tant que la valeur n'annonce aucune échéance, rafraîchi
 *    à la seconde par `useLiveNow` tant qu'elle en annonce une (`live`) — c'est
 *    ce qui fait passer SEULE « 🔥 4 min » à « ⏱ Message expiré », et
 *    seule cette ligne tique.
 */
export function useConversationPreview(params: {
  readonly conversation: Conversation;
  readonly viewerId: string;
  readonly languages: readonly string[];
  readonly typists?: readonly string[] | undefined;
  readonly interfaceLanguage: string;
  readonly now?: (() => number) | undefined;
  readonly clock?: IntervalClock | undefined;
  readonly drafts?: DraftStore | undefined;
}): ConversationPreview {
  const { conversation, viewerId, languages, typists, interfaceLanguage } = params;
  const clockNow = params.now ?? Date.now;
  const draft = useDraftLine({
    store: params.drafts ?? draftStore,
    scope: readingModeScopeOf({ id: viewerId === '' ? null : viewerId }),
    conversationId: conversation.id,
  });

  const [deadline, setDeadline] = useState<number | undefined>(undefined);
  const tick = useLiveNow(deadline, params.clock ?? secondClock, clockNow);
  const now = deadline === undefined ? clockNow() : tick;

  const last = conversation.lastMessage;
  const duration = last?.ephemeralDuration;
  if (last !== undefined && last !== null && typeof duration === 'number' && duration > 0 && !isMine(conversation, viewerId)) {
    noteEphemeralReception(last.id, now);
  }

  const preview = composeConversationPreview(
    previewInputOf(conversation, {
      viewerId,
      language: interfaceLanguage,
      preferredLanguages: languages,
      now,
      receivedAt: last === undefined || last === null ? null : receptionOf(last.id),
      servedDeadline: last === undefined || last === null ? null : servedDeadlineOf(last.id),
      typing: typists ?? null,
      draft,
    }),
  );

  const liveUntil = preview.live?.expiresAt;
  useLayoutEffect(() => {
    if (liveUntil !== deadline) setDeadline(liveUntil);
  }, [liveUntil, deadline]);

  return preview;
}
