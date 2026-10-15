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
  type DepartureFailure,
  type DepartureRequest,
} from '@/lib/conversation-departure';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { navigate } from '@/lib/router';
import { titleOf } from '@/lib/view/conversation';
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

  const confirm = async (pending: DepartureRequest): Promise<void> => {
    cancelDeparture();
    const online = isOnline();
    if (online && pending.returnToList) onReturnToList();
    const outcome = await performDeparture({ conversationId: pending.conversationId, kind: pending.kind, online, deps });
    if (outcome !== 'departed') failDeparture({ kind: pending.kind, offline: outcome === 'offline' });
  };

  return (
    <>
      {request === null ? null : (
        <DepartureConfirm
          request={request}
          language={language}
          title={titleOf(cachedConversation(deps, request.conversationId) ?? fallbackConversation, resolveViewer({ source: deps.source, session }).id ?? '')}
          onConfirm={() => void confirm(request)}
        />
      )}
      {failure === null ? null : <DepartureFailureNotice failure={failure} language={language} />}
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
  const leave = request.kind === 'leave';
  return (
    <ConfirmDialog
      name="conversation-departure"
      title={translate(language, leave ? 'conversation.departure.leave.title' : 'conversation.departure.delete.title')}
      body={leave ? translate(language, 'conversation.departure.leave.message') : translate(language, 'conversation.departure.delete.message', { title })}
      cancelLabel={translate(language, 'common.cancel')}
      confirmLabel={translate(language, leave ? 'conversation.departure.leave' : 'rowActions.delete')}
      tone="destructive"
      onConfirm={onConfirm}
      onCancel={cancelDeparture}
    />
  );
}

function DepartureFailureNotice({ failure, language }: { readonly failure: DepartureFailure; readonly language: InterfaceLanguage }) {
  useEffect(() => {
    const timer = setTimeout(dismissDepartureFailure, FAILURE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [failure]);

  const message = failure.offline
    ? translate(language, 'conversation.departure.offline')
    : translate(language, failure.kind === 'leave' ? 'conversation.departure.leave.error' : 'conversation.departure.delete.error');

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
