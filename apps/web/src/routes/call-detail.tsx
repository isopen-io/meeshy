import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand/react';

import { callSessionQueryKey, loadCallSession } from '@/lib/api/call-sessions';
import { callHistoryQueryKey } from '@/lib/api/calls';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { callActions } from '@/lib/calls/call-actions';
import { callDetailFromRecord, callDetailFromSession, deepLinkPlan, findCachedRecord, type CallDetail } from '@/lib/calls/call-detail';
import { callIdentityOf } from '@/lib/calls/call-notice';
import type { CallMedia } from '@/lib/calls/call-store';
import type { CallHistoryData } from '@/lib/calls/view';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useParams } from '@/lib/router';
import { coldStateOf } from '@/lib/view/cold-state';
import { useMinute } from '@/lib/view/use-minute';
import { CallDetailCard, CallDetailHeader, CallDetailSkeleton, CallDetailState } from '@/routes/call-detail-parts';
import { href, navigate } from '@/routes/route-table';

/**
 * **`/call/:callId` — LA FICHE D'UN APPEL, OU L'APPEL LUI-MÊME** (#6383, A12).
 *
 * - **Depuis le journal** (chemin nominal) : la ligne est déjà dans le cache
 *   persisté du journal, la fiche se peint au premier rendu et AUCUNE requête
 *   ne part — un appel terminé ne change plus.
 * - **Lien profond sans cache** : `GET /calls/:callId`. Un appel VIVANT s'y
 *   REJOINT (le fil de sa conversation s'ouvre à sa place, l'écran d'appel
 *   par-dessus) ; un appel fini s'y lit ; un appel introuvable ou interdit
 *   se dit « introuvable », sans distinguer les deux.
 *
 * Le rappel part de la conversation de l'appel, du type choisi (iOS :
 * `CallStarter.start`).
 */
export default function CallDetailScreen() {
  const language = currentInterfaceLanguage();
  const { callId } = useParams<'/call/$callId'>();
  const session = useStore(sessionStore, (state) => state.session);
  const signedIn = session.status === 'authenticated' || apiDeps.source === 'fixtures';
  const minute = useMinute();
  const now = useMemo(() => new Date(), [minute]);

  const cached = useMemo(
    () =>
      findCachedRecord(
        [appQueryClient.getQueryData<CallHistoryData>(callHistoryQueryKey('all')), appQueryClient.getQueryData<CallHistoryData>(callHistoryQueryKey('missed'))],
        callId,
      ),
    [callId],
  );

  const served = useQuery(
    {
      queryKey: callSessionQueryKey(callId),
      queryFn: async ({ signal }) => unwrap(await loadCallSession(apiDeps, callId, signal)),
      enabled: signedIn && cached === null,
      staleTime: 0,
      retry: false,
    },
    appQueryClient,
  );

  const viewerId = resolveViewer({ source: apiDeps.source, session }).id ?? '';
  const unknown = translate(language, 'calls.unknown');
  const plan = cached !== null ? 'detail' : served.data === undefined ? null : deepLinkPlan(served.data);
  const detail: CallDetail | null =
    cached !== null
      ? callDetailFromRecord(cached, unknown)
      : served.data === undefined || served.data === null
        ? null
        : callDetailFromSession(served.data, { viewerId, unknown, identity: callIdentityOf(served.data.conversationId) });

  const joined = useRef(false);
  useEffect(() => {
    if (plan !== 'join' || detail === null || joined.current) return;
    joined.current = true;
    navigate(href('thread', { conversation: detail.conversationId }), true);
    callActions.join({ conversationId: detail.conversationId, callId: detail.callId, media: detail.media, title: detail.name, avatar: detail.avatar, isGroup: detail.isGroup });
  }, [plan, detail]);

  const onCall = useCallback(
    (media: CallMedia) => {
      if (detail === null) return;
      callActions.start({ conversationId: detail.conversationId, media, title: detail.name, avatar: detail.avatar, isGroup: detail.isGroup });
    },
    [detail],
  );

  const cold = coldStateOf(served);
  const body =
    plan === 'join' ? (
      <CallDetailState language={language} kind="joining" />
    ) : plan === 'not-found' ? (
      <CallDetailState language={language} kind="not-found" />
    ) : detail !== null ? (
      <CallDetailCard language={language} detail={detail} now={now} onCall={onCall} />
    ) : cold === 'error' ? (
      <CallDetailState language={language} kind="error" onRetry={() => void served.refetch()} />
    ) : cold === 'offline' ? (
      <CallDetailState language={language} kind="offline" />
    ) : (
      <CallDetailSkeleton language={language} />
    );

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden pt-safe">
      <CallDetailHeader language={language} />
      <div id="contenu" className="scrollbar-none flex flex-1 flex-col overflow-y-auto overscroll-contain pb-safe">
        {body}
      </div>
    </main>
  );
}
