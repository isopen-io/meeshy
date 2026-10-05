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
} from '@/lib/api/calls';
import { performClearCallHistory, performHideCall } from '@/lib/api/call-history-actions';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import {
  CALL_FILTER_PARAM,
  CALL_TYPE_PARAM,
  callFilterFromSearch,
  callTypeFromSearch,
  refinedCallHistory,
  searchCallRecords,
  seededCallHistory,
  type CallHistoryData,
} from '@/lib/calls/view';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { loadMoreRootMargin, paginationStateOf, showsAllLoadedHint } from '@/lib/lens/pagination';
import { useOnline } from '@/lib/net/online';
import { useSearch } from '@/lib/router';
import { coldStateOf } from '@/lib/view/cold-state';
import { PULL_THRESHOLD, pullTransform } from '@/lib/view/pull-to-refresh';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { useDebouncedValue } from '@/lib/view/use-media-hub-index';
import { useMinute } from '@/lib/view/use-minute';
import { usePullToRefresh } from '@/lib/view/use-pull-to-refresh';
import { useScrollportMemory } from '@/lib/view/use-scrollport-memory';
import {
  CALL_ROW_HEIGHT,
  CALLS_TOP_RESERVE,
  CallFilterRail,
  CallRow,
  CallsClearAll,
  CallsEmpty,
  CallsEraseFailed,
  CallsError,
  CallsHeader,
  CallsOfflineNotice,
  CallsSearchEmpty,
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
 * **Ce que la ligne n'offre pas.** iOS pose un bouton « Rappeler » au bout de
 * chaque ligne ; le web n'a aucune pile d'appel, et un bouton sans effet est un
 * contrôle qui ment (loi 4). Il ne s'affiche pas — l'appel depuis le web est
 * suivi par son issue (D-61). La ligne ouvre le FIL de la conversation.
 *
 * **Effacer et chercher (#8066).** « Modifier » passe les lignes en mode
 * édition (une corbeille au lieu du rappel) et ouvre « Tout effacer », qui
 * demande confirmation. Les deux gestes sont optimistes et effacent pour SOI
 * seul (`call-history-actions.ts`).
 *
 * **Chercher et filtrer « vidéo » (#8203)** se font côté PASSERELLE, en une
 * requête (`?q=`, `?type=`). En attendant sa réponse, les lignes déjà en
 * cache qui correspondent se peignent (`refinedCallHistory`), et la frappe
 * filtre ce qui est affiché sans attendre la fin de la temporisation. Le
 * type vit dans l'ADRESSE (`?type=video`), comme le filtre.
 *
 * **Le couloir des disques flottants.** En-tête (64) et filtre (52) finissent
 * au-dessus du couloir 126 → 178 ; la première ligne commence SOUS lui au repos
 * (`CALLS_TOP_RESERVE`). `scripts/check-calls.mjs` le mesure.
 */
/** La temporisation de la recherche — celle d'iOS (`CallsTab.searchDebounceNanoseconds`). */
const SEARCH_DEBOUNCE_MS = 250;

export default function CallsScreen() {
  const language = currentInterfaceLanguage();
  const [search, setSearch] = useSearch();
  const filter = callFilterFromSearch(search.get(CALL_FILTER_PARAM));
  const frame = useRef<HTMLUListElement | null>(null);
  useScrollportMemory(frame);
  const online = useOnline();
  const minute = useMinute();
  const now = useMemo(() => new Date(), [minute]);
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');

  const type = callTypeFromSearch(search.get(CALL_TYPE_PARAM));
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const refine = useMemo(() => ({ type, q: debouncedQuery }), [type, debouncedQuery]);
  const unknownName = translate(language, 'calls.unknown');

  const history = useInfiniteQuery(
    {
      ...callHistoryQueryOptions(apiDeps, filter, refine),
      enabled: apiDeps.source === 'fixtures' || signedIn,
      placeholderData: () => {
        const seeded = seededCallHistory(appQueryClient.getQueryData<CallHistoryData>(callHistoryQueryKey('all')), filter);
        const base = appQueryClient.getQueryData<CallHistoryData>(callHistoryQueryKey(filter)) ?? seeded;
        return refinedCallHistory(base, refine, unknownName) ?? seeded;
      },
    },
    appQueryClient,
  );

  const [editing, setEditing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [eraseFailed, setEraseFailed] = useState(false);

  const loaded = history.data?.pages.flatMap((page) => page.records) ?? null;
  const records = useMemo(() => (loaded === null ? null : searchCallRecords(loaded, query, unknownName)), [loaded, query, unknownName]);
  const searching = query.trim() !== '';
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
  const actionDeps = useMemo(() => ({ ...apiDeps, queryClient: appQueryClient }), []);
  const onHide = useCallback(
    (callId: string) => {
      setEraseFailed(false);
      void performHideCall({ callId, deps: actionDeps }).then((done) => setEraseFailed(!done));
    },
    [actionDeps],
  );
  const onClear = useCallback(() => {
    setConfirmingClear(false);
    setEditing(false);
    setEraseFailed(false);
    void performClearCallHistory({ deps: actionDeps }).then((done) => setEraseFailed(!done));
  }, [actionDeps]);
  const onToggleEdit = useCallback(() => {
    setEditing((value) => !value);
    setConfirmingClear(false);
  }, []);

  const onToggleVideo = useCallback(() => {
    const kept = [...search.entries()].filter(([name]) => name !== CALL_TYPE_PARAM);
    setSearch(new URLSearchParams(type === 'video' ? kept : [...kept, [CALL_TYPE_PARAM, 'video']]), true);
  }, [search, setSearch, type]);

  const onRefresh = useCallback(() => refreshCallHistory(appQueryClient, apiDeps, filter, refine), [filter, refine]);
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
      searching ? (
        <CallsSearchEmpty language={language} query={query} />
      ) : (
        <CallsEmpty language={language} filter={filter} />
      )
    ) : (
      <>
        {online ? null : <CallsOfflineNotice language={language} cold={false} />}
        {editing ? (
          <CallsClearAll
            language={language}
            confirming={confirmingClear}
            onAsk={() => setConfirmingClear(true)}
            onConfirm={onClear}
            onCancel={() => setConfirmingClear(false)}
          />
        ) : null}
        {records.map((record) => (
          <CallRow key={record.callId} language={language} record={record} now={now} {...(editing ? { onHide } : {})} />
        ))}
        <LensPaginationFooter
          state={paginationState}
          showsAllLoadedHint={showsAllLoadedHint(loaded?.length ?? 0, CALL_HISTORY_PAGE_SIZE)}
          exhaustedLabel={translate(language, 'calls.allLoaded')}
          onRetry={() => void history.fetchNextPage()}
          sentinelRef={observeTail}
        />
      </>
    );

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden pt-safe">
      <CallsHeader
        language={language}
        {...((loaded?.length ?? 0) > 0 || editing ? { edit: { editing, onToggle: onToggleEdit } } : {})}
      />
      <CallFilterRail
        language={language}
        selected={filter}
        onSelect={onSelect}
        search={{ value: query, onChange: setQuery }}
        video={{ pressed: type === 'video', onToggle: onToggleVideo }}
      />
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
        {eraseFailed ? <CallsEraseFailed language={language} /> : null}
        {body}
      </ul>
    </main>
  );
}
