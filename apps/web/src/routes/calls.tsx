import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { LensPaginationFooter } from '@/components/lens-pagination-footer';
import { PullIndicator } from '@/components/pull-indicator';
import {
  CALL_HISTORY_PAGE_SIZE,
  callHistoryQueryKey,
  callHistoryQueryOptions,
  refreshCallHistory,
  type CallHistoryFilter,
  type CallRecord,
} from '@/lib/api/calls';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { CALL_FILTER_PARAM, callFilterFromSearch, seededCallHistory, type CallHistoryData } from '@/lib/calls/view';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { loadMoreRootMargin, paginationStateOf, showsAllLoadedHint } from '@/lib/lens/pagination';
import { useOnline } from '@/lib/net/online';
import { useSearch } from '@/lib/router';
import { coldStateOf } from '@/lib/view/cold-state';
import { PULL_THRESHOLD, pullTransform } from '@/lib/view/pull-to-refresh';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { useMinute } from '@/lib/view/use-minute';
import { usePullToRefresh } from '@/lib/view/use-pull-to-refresh';
import { useScrollportMemory } from '@/lib/view/use-scrollport-memory';
import { CallDetailSheet } from '@/routes/call-detail-sheet';
import {
  CALL_ROW_HEIGHT,
  CALLS_TOP_RESERVE,
  CallFilterRail,
  CallRow,
  CallsEmpty,
  CallsError,
  CallsHeader,
  CallsOfflineNotice,
  CallsSkeleton,
} from '@/routes/calls-parts';

/**
 * **LE JOURNAL D'APPELS** (#6362) — troisième barreau de l'échelle, miroir de
 * l'onglet `.calls` de `ContactsHubView` (`CallsTab.swift`) : en-tête avec
 * retour, filtre « Tous » / « Manqués », liste des appels terminés des trois
 * derniers mois, tirer pour rafraîchir. Remplace l'écran d'attente de #6214.
 * L'adresse reste `/calls`, un écran seul et non l'onglet d'un hub : D-61.
 *
 * **Le filtre vit dans l'ADRESSE** (`?filtre=missed`), comme la catégorie de la
 * cloche (D-55) : le retour arrière le rend, et la mémoire de défilement se
 * tient par filtre.
 *
 * **Cache d'abord.** Le journal est persisté (`query-client.ts`) et se peint au
 * premier rendu ; « Manqués » jamais ouvert se peint depuis « Tous » en cache
 * (`seededCallHistory`) ; le squelette ne vient que sur un cache vide.
 *
 * **Toucher une ligne ouvre la FICHE de l'appel** (`CallDetailSheet`, #6383),
 * comme iOS : rappel vocal ou vidéo, type, date, durée, et le fil de la
 * conversation. Le bouton au bout de la ligne rappelle directement (#6382).
 *
 * **Le couloir des disques flottants.** En-tête (64) et filtre (52) finissent
 * au-dessus du couloir 126 → 178 ; la première ligne commence SOUS lui au repos
 * (`CALLS_TOP_RESERVE`). `scripts/check-calls.mjs` le mesure.
 */
export default function CallsScreen() {
  const language = currentInterfaceLanguage();
  const [search, setSearch] = useSearch();
  const filter = callFilterFromSearch(search.get(CALL_FILTER_PARAM));
  const frame = useRef<HTMLUListElement | null>(null);
  useScrollportMemory(frame);
  const online = useOnline();
  const minute = useMinute();
  const now = useMemo(() => new Date(), [minute]);
  const [opened, setOpened] = useState<CallRecord | null>(null);
  const onOpen = useCallback((record: CallRecord) => setOpened(record), []);
  const onCloseDetail = useCallback(() => setOpened(null), []);
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');

  const history = useInfiniteQuery(
    {
      ...callHistoryQueryOptions(apiDeps, filter),
      enabled: apiDeps.source === 'fixtures' || signedIn,
      placeholderData: () => seededCallHistory(appQueryClient.getQueryData<CallHistoryData>(callHistoryQueryKey('all')), filter),
    },
    appQueryClient,
  );

  const records = history.data?.pages.flatMap((page) => page.records) ?? null;
  const cold = coldStateOf(history);
  const loading = cold === 'loading';
  const paginationState = paginationStateOf(history);

  const onSelect = useCallback(
    (next: CallHistoryFilter) => {
      const kept = [...search.entries()].filter(([name]) => name !== CALL_FILTER_PARAM);
      setSearch(new URLSearchParams(next === 'all' ? kept : [...kept, [CALL_FILTER_PARAM, next]]), true);
    },
    [search, setSearch],
  );
  const onRefresh = useCallback(() => refreshCallHistory(appQueryClient, apiDeps, filter), [filter]);
  const pull = usePullToRefresh({ root: frame, onRefresh, threshold: PULL_THRESHOLD });
  const { observe: observeTail } = useLoadMoreSentinel({
    root: frame,
    rootMargin: loadMoreRootMargin(CALL_ROW_HEIGHT),
    enabled: paginationState === 'idle' && records !== null && records.length > 0 && !history.isPlaceholderData,
    onReach: () => void history.fetchNextPage(),
  });

  const body =
    records === null ? (
      cold === 'error' ? (
        <CallsError language={language} online={online} onRetry={() => void history.refetch()} />
      ) : cold === 'offline' ? (
        <CallsOfflineNotice language={language} cold />
      ) : (
        <li>
          <CallsSkeleton />
        </li>
      )
    ) : records.length === 0 ? (
      <CallsEmpty language={language} filter={filter} />
    ) : (
      <>
        {online ? null : <CallsOfflineNotice language={language} cold={false} />}
        {records.map((record) => (
          <CallRow key={record.callId} language={language} record={record} now={now} onOpen={onOpen} />
        ))}
        <LensPaginationFooter
          state={paginationState}
          showsAllLoadedHint={showsAllLoadedHint(records.length, CALL_HISTORY_PAGE_SIZE)}
          exhaustedLabel={translate(language, 'calls.allLoaded')}
          onRetry={() => void history.fetchNextPage()}
          sentinelRef={observeTail}
        />
      </>
    );

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden pt-safe">
      <CallsHeader language={language} />
      <CallFilterRail language={language} selected={filter} onSelect={onSelect} />
      <PullIndicator phase={pull.phase} offsetPx={pull.offsetPx} reducedMotion={pull.reducedMotion} />
      <ul
        ref={frame}
        id="contenu"
        data-calls-filter={filter}
        className="scrollbar-none overscroll-contain flex flex-1 flex-col overflow-y-auto pb-safe"
        style={pullTransform(pull.phase, pull.offsetPx)}
        {...(loading ? { 'aria-busy': true, 'aria-label': translate(language, 'calls.loading') } : {})}
      >
        <li aria-hidden="true" className="shrink-0" style={{ height: CALLS_TOP_RESERVE }} />
        {body}
      </ul>
      {opened === null ? null : <CallDetailSheet language={language} record={opened} now={now} onClose={onCloseDetail} />}
    </main>
  );
}
