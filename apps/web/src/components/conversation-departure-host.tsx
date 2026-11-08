import { useEffect } from 'react';
import { useStore } from 'zustand/react';

import { performDeparture, type DepartureDeps } from '@/lib/api/conversation-departure';
import { conversationQueryKey, findCachedConversation } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import type { Conversation } from '@/lib/api/types';
import { resolveViewer } from '@/lib/api/viewer';
import {
  cancelDeparture,
  departureStore,
  dismissDepartureFailure,
  failDeparture,
  markObsoleteRefused,
  type DepartureFailure,
  type DepartureKind,
  type DepartureRequest,
} from '@/lib/conversation-departure';
import { translate } from '@/lib/i18n-catalog';
import { translateConversationManage } from '@/lib/i18n-conversation-manage-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { navigate } from '@/lib/router';
import { titleOf } from '@/lib/view/conversation';
import { useConversationManageCatalog } from '@/lib/view/use-conversation-manage-catalog';
import { href } from '@/routes/route-table';

import { ConfirmDialog } from './confirm-dialog';
import { Glyph } from './glyph';

/**
 * **L'HÔTE DU DÉPART** (#7285, #7837) — monté par la coquille dès qu'une
 * demande ou un échec existe (`departureStore`), jamais deux fois : la liste et
 * le fil côte à côte partagent la même confirmation.
 *
 * La confirmation est celle d'iOS, et elle n'est pas la même pour les deux
 * gestes : supprimer nomme la conversation et dit que les autres la gardent
 * (`ConversationListView.swift`, `conversation.delete.confirm.*`) ; quitter dit
 * que l'historique reste lisible (`ConversationInfoSheet.swift`).
 *
 * Depuis le fil, confirmer ramène d'abord à la liste, puis la rangée part :
 * la conversation quittée n'a plus d'écran où rester. Un échec la ramène et
 * se dit en haut de l'écran, quelle que soit la route.
 */
const FAILURE_VISIBLE_MS = 6000;

const defaultDeps = (): DepartureDeps => ({ ...apiDeps, queryClient: appQueryClient });

export function ConversationDepartureHost({
  deps = defaultDeps(),
  isOnline = () => navigator.onLine,
  onReturnToList = () => navigate(href('list'), true),
}: {
  readonly deps?: DepartureDeps;
  readonly isOnline?: () => boolean;
  readonly onReturnToList?: () => void;
}) {
  const request = useStore(departureStore, (state) => state.request);
  const failure = useStore(departureStore, (state) => state.failure);
  const session = useStore(sessionStore, (state) => state.session);
  const language = currentInterfaceLanguage();
  /* RENDRE OBSOLÈTE (#14645) parle avec le catalogue de gestion, chargé à la demande. */
  const manageReady = useConversationManageCatalog(language);

  const confirm = async (pending: DepartureRequest): Promise<void> => {
    cancelDeparture();
    const online = isOnline();
    if (online && pending.returnToList) onReturnToList();
    const outcome = await performDeparture({ conversationId: pending.conversationId, kind: pending.kind, online, deps });
    if (outcome === 'refused') return refuse(pending);
    if (outcome !== 'departed') failDeparture({ kind: pending.kind, offline: outcome === 'offline' });
  };

  /* REFUSÉ (#14690) — le geste ne se repropose plus pour cette conversation ;
     sur un tête-à-tête, le refus a un seul motif à dire. */
  const refuse = (pending: DepartureRequest): void => {
    markObsoleteRefused(pending.conversationId);
    const direct = cachedConversation(deps, pending.conversationId)?.type === 'direct';
    failDeparture({ kind: pending.kind, offline: false, ...(direct ? { refusal: 'requestSender' as const } : {}) });
  };

  return (
    <>
      {request === null || (request.kind === 'obsolete' && !manageReady) ? null : (
        <DepartureConfirm
          request={request}
          language={language}
          title={titleOf(cachedConversation(deps, request.conversationId) ?? fallbackConversation, resolveViewer({ source: deps.source, session }).id ?? '')}
          onConfirm={() => void confirm(request)}
        />
      )}
      {failure === null || (failure.kind === 'obsolete' && !manageReady) ? null : <DepartureFailureNotice failure={failure} language={language} />}
    </>
  );
}

const fallbackConversation = { type: 'group', title: '', participants: [] } as unknown as Conversation;

const cachedConversation = (deps: DepartureDeps, conversationId: string): Conversation | undefined =>
  findCachedConversation(deps.queryClient, conversationId) ?? deps.queryClient.getQueryData<Conversation>(conversationQueryKey(conversationId));

function DepartureConfirm({
  request,
  language,
  title,
  onConfirm,
}: {
  readonly request: DepartureRequest;
  readonly language: InterfaceLanguage;
  readonly title: string;
  readonly onConfirm: () => void;
}) {
  const words = confirmWordsOf(request.kind, language, title);
  return (
    <ConfirmDialog
      name="conversation-departure"
      title={words.title}
      body={words.body}
      cancelLabel={translate(language, 'common.cancel')}
      confirmLabel={words.confirm}
      tone="destructive"
      onConfirm={onConfirm}
      onCancel={cancelDeparture}
    />
  );
}

type ConfirmWords = { readonly title: string; readonly body: string; readonly confirm: string };

/** Les mots de chaque geste ; RENDRE OBSOLÈTE (#14645) dit que TOUS la perdent, et que son contenu sera effacé. */
function confirmWordsOf(kind: DepartureKind, language: InterfaceLanguage, title: string): ConfirmWords {
  if (kind === 'leave') {
    return {
      title: translate(language, 'conversation.departure.leave.title'),
      body: translate(language, 'conversation.departure.leave.message'),
      confirm: translate(language, 'conversation.departure.leave'),
    };
  }
  if (kind === 'obsolete') {
    return {
      title: translateConversationManage(language, 'conversationManage.obsolete.title'),
      body: `${title} — ${translateConversationManage(language, 'conversationManage.obsolete.message')}`,
      confirm: translateConversationManage(language, 'conversationManage.obsolete'),
    };
  }
  return {
    title: translate(language, 'conversation.departure.delete.title'),
    body: translate(language, 'conversation.departure.delete.message', { title }),
    confirm: translate(language, 'rowActions.delete'),
  };
}

const failureTextOf = (failure: DepartureFailure, language: InterfaceLanguage): string => {
  const { kind } = failure;
  if (failure.refusal === 'requestSender') return translateConversationManage(language, 'conversationManage.obsolete.requestSender');
  if (kind === 'obsolete') return translateConversationManage(language, 'conversationManage.obsolete.error');
  return translate(language, kind === 'leave' ? 'conversation.departure.leave.error' : 'conversation.departure.delete.error');
};

function DepartureFailureNotice({ failure, language }: { readonly failure: DepartureFailure; readonly language: InterfaceLanguage }) {
  useEffect(() => {
    const timer = setTimeout(dismissDepartureFailure, FAILURE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [failure]);

  const message = failure.offline
    ? translate(language, 'conversation.departure.offline')
    : failureTextOf(failure, language);

  return (
    <div className="fixed inset-x-0 z-50 flex justify-center px-4" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}>
      <div
        role="alert"
        data-departure-failure=""
        className="flex w-full max-w-[520px] items-center gap-3 rounded-card py-1 ps-3 pe-1 shadow-lg"
        style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)', border: '1px solid var(--color-edge)' }}
      >
        <span className="shrink-0" style={{ color: 'var(--color-error)' }}>
          <Glyph name="warningCircle" size={20} />
        </span>
        <p className="min-w-0 flex-1 text-body">{message}</p>
        <button
          type="button"
          onClick={dismissDepartureFailure}
          aria-label={translate(language, 'common.close')}
          className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2"
          style={{ color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <Glyph name="x" size={16} />
        </button>
      </div>
    </div>
  );
}
