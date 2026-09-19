import { keepPreviousData, useInfiniteQuery, useQuery, type UseInfiniteQueryResult } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand/react';

import { LensPaginationFooter } from '@/components/lens-pagination-footer';
import { LiveAnnouncement } from '@/components/live-announcement';
import { PullIndicator } from '@/components/pull-indicator';
import { blockedUsersQueryOptions, flattenBlockedUsers } from '@/lib/api/blocks';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { performRespondToRequest, performSendRequest, performUnblock, type FriendActionDeps, type FriendActionOutcome } from '@/lib/api/friend-actions';
import {
  FRIEND_REQUESTS_PAGE_SIZE,
  flattenFriendRequests,
  friendRequestsQueryOptions,
  type FriendRequestRecord,
  type PersonSummary,
} from '@/lib/api/friend-requests';
import { performEmailInvitation } from '@/lib/api/invitations';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { searchUsers } from '@/lib/api/users-search';
import { resolveViewer } from '@/lib/api/viewer';
import {
  DISCOVER_TAB_PARAM,
  REQUEST_FILTER_PARAM,
  discoverTabFromSearch,
  personNameOf,
  relationshipIndexOf,
  relationshipOf,
  requestFilterFromSearch,
  type DiscoverTab,
  type RequestFilter,
} from '@/lib/discover/view';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { loadMoreRootMargin, paginationStateOf, showsAllLoadedHint } from '@/lib/lens/pagination';
import { useOnline } from '@/lib/net/online';
import { useSearch } from '@/lib/router';
import { coldStateOf } from '@/lib/view/cold-state';
import { PULL_THRESHOLD, pullTransform } from '@/lib/view/pull-to-refresh';
import { useTapGate } from '@/lib/view/tap-gate';
import { useExhaustPages } from '@/lib/view/use-exhaust-pages';
import { announcementToneOf } from '@/lib/view/announcement-tone';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { useMinute } from '@/lib/view/use-minute';
import { usePullToRefresh } from '@/lib/view/use-pull-to-refresh';
import { useScrollportMemory } from '@/lib/view/use-scrollport-memory';
import { useSettled } from '@/lib/view/use-settled';
import {
  BlockedPersonRow,
  DISCOVER_TOP_RESERVE,
  DiscoverEmpty,
  DiscoverError,
  DiscoverGlyph,
  DiscoverHeader,
  DiscoverOfflineNotice,
  DiscoverSearchField,
  DiscoverSkeleton,
  DiscoverTabBar,
  InviteCard,
  PERSON_ROW_HEIGHT,
  PersonResultRow,
  ReceivedRequestRow,
  RequestFilterRail,
  SentRequestRow,
  UnblockConfirm,
  type ConnectionHandlers,
  type InviteStatus,
} from '@/routes/discover-parts';

/**
 * **DÉCOUVRIR** (#6363) — quatrième barreau de l'échelle, miroir de
 * `PeopleDiscoveryView` (`apps/ios/Meeshy/Features/Contacts/`) : en-tête avec
 * retour, trois onglets soulignés — Découvrir, Demandes, Bloqués — et leur
 * contenu. Remplace l'écran d'attente de #6214.
 *
 * **L'onglet et le filtre vivent dans l'ADRESSE** (`?onglet=requests`,
 * `?demandes=sent`) : le profil peut ouvrir directement les demandes, et le
 * retour arrière rend l'onglet, comme la catégorie de la cloche (D-55).
 *
 * **Une source par fait.** Les demandes reçues de l'onglet, le compte de
 * l'onglet « Demandes », la pastille du barreau (#6321) et le compte du profil
 * lisent le MÊME panier (`friend-requests.ts`) ; l'état de chaque personne de la
 * recherche (Ajouter, En attente, Accepter/Refuser, Contact, Bloqué) se lit
 * dans ces mêmes paniers (`relationshipIndexOf`). Un geste les fait bouger
 * ensemble, au tap (`friend-actions.ts`).
 *
 * **Cache d'abord.** Les paniers sont persistés (`query-client.ts`) et se
 * peignent au premier rendu ; le squelette ne vient que sur un cache vide. Une
 * recherche garde les résultats précédents le temps que la suivante réponde.
 *
 * **Ce que l'écran n'offre pas**, parce que le web n'a pas de quoi le faire (loi
 * 4) : inviter par SMS et retrouver son carnet d'adresses (#6394), les
 * suggestions à requête vide que la passerelle ne sert pas (#6395), ouvrir le
 * profil d'une personne (#6396), la découverte à proximité (#6397). D-62.
 */

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;
const ANNOUNCE_MS = 4000;

type ListQuery = Pick<UseInfiniteQueryResult, 'data' | 'isError' | 'isPaused' | 'refetch' | 'fetchNextPage'>;

type AnnounceKey = Extract<InterfaceCatalogKey, `discover.announce.${string}`>;

export default function DiscoverScreen() {
  const language = currentInterfaceLanguage();
  const [search, setSearch] = useSearch();
  const tab = discoverTabFromSearch(search.get(DISCOVER_TAB_PARAM));
  const filter = requestFilterFromSearch(search.get(REQUEST_FILTER_PARAM));
  const frame = useRef<HTMLDivElement | null>(null);
  useScrollportMemory(frame);
  const online = useOnline();
  const minute = useMinute();
  const now = useMemo(() => new Date(), [minute]);
  const session = useStore(sessionStore, (state) => state.session);
  const enabled = apiDeps.source === 'fixtures' || session.status === 'authenticated';
  const viewerId = resolveViewer({ source: apiDeps.source, session }).id ?? null;

  const received = useInfiniteQuery({ ...friendRequestsQueryOptions(apiDeps, 'received'), enabled }, appQueryClient);
  const sent = useInfiniteQuery({ ...friendRequestsQueryOptions(apiDeps, 'sent'), enabled }, appQueryClient);
  const accepted = useInfiniteQuery({ ...friendRequestsQueryOptions(apiDeps, 'accepted'), enabled }, appQueryClient);
  const blocked = useInfiniteQuery({ ...blockedUsersQueryOptions(apiDeps), enabled }, appQueryClient);
  /* L'INDEX de relation (#6421) doit lire TOUS les contacts et TOUS les
     bloqués, pas seulement leur première page — `accepted` n'a aucune liste
     visible pour le faire défiler, et `blocked` ne défile que sous son
     propre onglet. */
  useExhaustPages(accepted, enabled);
  useExhaustPages(blocked, enabled);

  const receivedRows = useMemo(() => flattenFriendRequests(received.data), [received.data]);
  const sentRows = useMemo(() => flattenFriendRequests(sent.data), [sent.data]);
  const acceptedRows = useMemo(() => flattenFriendRequests(accepted.data), [accepted.data]);
  const blockedRows = useMemo(() => flattenBlockedUsers(blocked.data), [blocked.data]);
  const index = useMemo(
    () => relationshipIndexOf({ viewerId, received: receivedRows, sent: sentRows, accepted: acceptedRows, blocked: blockedRows }),
    [viewerId, receivedRows, sentRows, acceptedRows, blockedRows],
  );

  const announcer = useLiveAnnouncer(ANNOUNCE_MS);
  const { announce } = announcer;
  const deps: FriendActionDeps = useMemo(
    () => ({ ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine, viewerId: () => viewerId }),
    [viewerId],
  );
  /* L'ENCRE DIT LA NATURE (revue #7083) : un refus et un hors-ligne ne se
     lisent pas comme une réussite. Le ton voyage avec le texte, dans le même
     état — voir `use-live-announcer.ts`. */
  const report = useCallback(
    (outcome: FriendActionOutcome, done: AnnounceKey, failed: AnnounceKey) =>
      announce(
        translate(language, outcome === 'done' ? done : outcome === 'offline' ? 'discover.announce.offline' : failed),
        announcementToneOf(outcome),
      ),
    [announce, language],
  );

  /* Un geste REMPLACE ce qu'il touche : le second tap d'un double tap
     n'atteint ni la ligne qui remonte, ni le bouton qui a pris la place (#6417). */
  const admitTap = useTapGate();
  const onAccept = useCallback(
    (request: FriendRequestRecord) => {
      if (!admitTap()) return;
      void performRespondToRequest({ request, action: 'accept', deps }).then((o) => report(o, 'discover.announce.accepted', 'discover.announce.acceptFailed'));
    },
    [admitTap, deps, report],
  );
  const onReject = useCallback(
    (request: FriendRequestRecord) => {
      if (!admitTap()) return;
      void performRespondToRequest({ request, action: 'reject', deps }).then((o) => report(o, 'discover.announce.rejected', 'discover.announce.rejectFailed'));
    },
    [admitTap, deps, report],
  );
  const onCancel = useCallback(
    (request: FriendRequestRecord) => {
      if (!admitTap()) return;
      void performRespondToRequest({ request, action: 'cancel', deps }).then((o) => report(o, 'discover.announce.cancelled', 'discover.announce.cancelFailed'));
    },
    [admitTap, deps, report],
  );
  const onAdd = useCallback(
    (person: PersonSummary) => {
      if (!admitTap()) return;
      void performSendRequest({ person, deps }).then((o) => report(o, 'discover.announce.sent', 'discover.announce.sendFailed'));
    },
    [admitTap, deps, report],
  );
  const handlers: ConnectionHandlers = useMemo(() => ({ onAdd, onCancel, onAccept, onReject }), [onAdd, onCancel, onAccept, onReject]);

  /* Débloquer passe par une confirmation modale : un double tap n'y retire
     personne, il ne peut qu'ouvrir une confirmation — la porte n'y est pas. */
  const [unblockTarget, setUnblockTarget] = useState<PersonSummary | null>(null);
  const closeConfirm = useCallback(() => setUnblockTarget(null), []);
  const confirmUnblock = useCallback(() => {
    if (unblockTarget === null) return;
    setUnblockTarget(null);
    void performUnblock({ person: unblockTarget, deps }).then((o) => report(o, 'discover.announce.unblocked', 'discover.announce.unblockFailed'));
  }, [unblockTarget, deps, report]);

  const [typed, setTyped] = useState('');
  const query = useSettled(typed, SEARCH_DEBOUNCE_MS).trim();
  const results = useQuery(
    {
      queryKey: ['users', 'search', query],
      queryFn: async () => unwrap(await searchUsers(apiDeps, query)),
      enabled: enabled && tab === 'discover' && query.length >= MIN_QUERY_LENGTH,
      placeholderData: keepPreviousData,
    },
    appQueryClient,
  );

  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState<{ readonly status: InviteStatus; readonly sentTo: string }>({ status: 'idle', sentTo: '' });
  const submitInvite = useCallback(() => {
    if (invite.status === 'sending') return;
    const address = email.trim();
    setInvite({ status: 'sending', sentTo: '' });
    void performEmailInvitation({ email: address, deps }).then((status) => {
      setInvite({ status, sentTo: address });
      if (status === 'sent') setEmail('');
    });
  }, [invite.status, email, deps]);

  const replaceParams = useCallback(
    (updates: Readonly<Record<string, string | null>>) => {
      const kept = [...search.entries()].filter(([name]) => !(name in updates));
      const added = Object.entries(updates).flatMap(([name, value]) => (value === null ? [] : [[name, value] as [string, string]]));
      setSearch(new URLSearchParams([...kept, ...added]), true);
    },
    [search, setSearch],
  );
  const selectTab = useCallback(
    (next: DiscoverTab) => {
      replaceParams({ [DISCOVER_TAB_PARAM]: next === 'discover' ? null : next, [REQUEST_FILTER_PARAM]: null });
      frame.current?.scrollTo({ top: 0 });
    },
    [replaceParams],
  );
  const selectFilter = useCallback((next: RequestFilter) => replaceParams({ [REQUEST_FILTER_PARAM]: next === 'received' ? null : next }), [replaceParams]);

  const refreshTargets: readonly ListQuery[] = tab === 'blocked' ? [blocked] : tab === 'requests' ? [received, sent] : [received, sent, accepted, blocked];
  const onRefresh = useCallback(() => Promise.all(refreshTargets.map((target) => target.refetch())).then(() => undefined), [refreshTargets]);
  const pull = usePullToRefresh({ root: frame, onRefresh, threshold: PULL_THRESHOLD });

  const activeList = tab === 'blocked' ? blocked : tab === 'requests' ? (filter === 'sent' ? sent : received) : null;
  const activeCount = tab === 'blocked' ? blockedRows.length : filter === 'sent' ? sentRows.length : receivedRows.length;
  const paginationState = activeList === null ? 'exhausted' : paginationStateOf(activeList);
  const { observe: observeTail } = useLoadMoreSentinel({
    root: frame,
    rootMargin: loadMoreRootMargin(PERSON_ROW_HEIGHT),
    enabled: activeList !== null && activeList.data !== undefined && paginationState === 'idle',
    onReach: () => void activeList?.fetchNextPage(),
  });

  const listFooter = (pageSize: number) => (
    <LensPaginationFooter
      state={paginationState}
      showsAllLoadedHint={showsAllLoadedHint(activeCount, pageSize)}
      exhaustedLabel={translate(language, 'discover.allLoaded')}
      onRetry={() => void activeList?.fetchNextPage()}
      sentinelRef={observeTail}
    />
  );

  const listBody = (list: ListQuery, count: number, empty: ReactNode, rows: ReactNode) =>
    list.data === undefined ? (
      coldStateOf(list) === 'error' ? (
        <DiscoverError language={language} online={online} onRetry={() => void list.refetch()} />
      ) : coldStateOf(list) === 'offline' ? (
        <DiscoverOfflineNotice language={language} cold />
      ) : (
        <DiscoverSkeleton />
      )
    ) : count === 0 ? (
      empty
    ) : (
      <>
        {online ? null : <DiscoverOfflineNotice language={language} cold={false} />}
        {rows}
      </>
    );

  const searchBody =
    query.length < MIN_QUERY_LENGTH ? null : results.data === undefined ? (
      <p role={results.isError ? 'alert' : 'status'} data-discover-search-state={results.isError ? 'error' : 'searching'} className="py-6 text-center text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, results.isError ? 'discover.search.error' : 'discover.search.searching')}
      </p>
    ) : results.data.length === 0 && !results.isPlaceholderData ? (
      <p role="status" data-discover-search-state="empty" className="py-6 text-center text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'discover.search.empty', { query })}
      </p>
    ) : (
      <ul data-discover-results aria-busy={results.isPlaceholderData} className="flex flex-col">
        {results.data.map((person) => (
          <PersonResultRow key={person.id} language={language} person={person} relationship={relationshipOf(index, person.id)} handlers={handlers} />
        ))}
      </ul>
    );

  const panels: Readonly<Record<DiscoverTab, () => ReactNode>> = {
    discover: () => (
      <section data-discover-people className="flex flex-col gap-4 pb-8">
        <InviteCard language={language} email={email} sentTo={invite.sentTo} status={invite.status} onEmailChange={setEmail} onSubmit={submitInvite} />
        <div className="grid gap-2 px-4">
          <DiscoverSearchField language={language} value={typed} onChange={setTyped} />
          {searchBody}
        </div>
      </section>
    ),
    requests: () => (
      <section data-discover-requests={filter} className="flex flex-1 flex-col">
        <RequestFilterRail language={language} selected={filter} counts={{ received: receivedRows.length, sent: sentRows.length }} onSelect={selectFilter} />
        {filter === 'received'
          ? listBody(
              received,
              receivedRows.length,
              <DiscoverEmpty
                data="received"
                glyph={<DiscoverGlyph name="userCheck" size={44} />}
                title={translate(language, 'discover.requests.empty.received.title')}
                subtitle={translate(language, 'discover.requests.empty.received.subtitle')}
              />,
              <ul data-request-list="received" className="flex flex-col">
                {receivedRows.map((request) => (
                  <ReceivedRequestRow key={request.id} language={language} request={request} now={now} onAccept={onAccept} onReject={onReject} />
                ))}
                {listFooter(FRIEND_REQUESTS_PAGE_SIZE)}
              </ul>,
            )
          : listBody(
              sent,
              sentRows.length,
              <DiscoverEmpty
                data="sent"
                glyph={<DiscoverGlyph name="paperPlaneTilt" size={44} />}
                title={translate(language, 'discover.requests.empty.sent.title')}
                subtitle={translate(language, 'discover.requests.empty.sent.subtitle')}
              />,
              <ul data-request-list="sent" className="flex flex-col">
                {sentRows.map((request) => (
                  <SentRequestRow key={request.id} language={language} request={request} now={now} onCancel={onCancel} />
                ))}
                {listFooter(FRIEND_REQUESTS_PAGE_SIZE)}
              </ul>,
            )}
      </section>
    ),
    blocked: () => (
      <section data-discover-blocked className="flex flex-1 flex-col">
        {listBody(
          blocked,
          blockedRows.length,
          <DiscoverEmpty
            data="blocked"
            glyph={<DiscoverGlyph name="handPalm" size={44} />}
            title={translate(language, 'discover.blocked.empty.title')}
            subtitle={translate(language, 'discover.blocked.empty.subtitle')}
          />,
          <ul data-blocked-list className="flex flex-col">
            {blockedRows.map((person) => (
              <BlockedPersonRow key={person.id} language={language} person={person} onUnblock={setUnblockTarget} />
            ))}
            {listFooter(FRIEND_REQUESTS_PAGE_SIZE)}
          </ul>,
        )}
      </section>
    ),
  };

  const loading = activeList !== null && coldStateOf(activeList) === 'loading';

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden pt-safe">
      <DiscoverHeader language={language} />
      <DiscoverTabBar language={language} selected={tab} received={receivedRows.length} onSelect={selectTab} />
      <PullIndicator phase={pull.phase} offsetPx={pull.offsetPx} reducedMotion={pull.reducedMotion} />
      <div
        ref={frame}
        id="contenu"
        role="tabpanel"
        aria-labelledby={`discover-tab-${tab}`}
        data-discover-panel={tab}
        className="scrollbar-none overscroll-contain flex flex-1 flex-col overflow-y-auto pb-safe"
        style={pullTransform(pull.phase, pull.offsetPx)}
        {...(loading ? { 'aria-busy': true } : {})}
      >
        <div aria-hidden="true" className="shrink-0" style={{ height: DISCOVER_TOP_RESERVE }} />
        {panels[tab]()}
      </div>
      {/* LA PASTILLE D'ANNONCE VIT DANS `components/live-announcement.tsx`
          depuis la revue #7083 : elle était écrite ici et, en `sr-only`
          inconditionnel, une seconde fois sur `/u/` — mêmes clés, même hook,
          deux produits. Le motif que les 40 surfaces restantes vont copier n'a
          plus qu'un site. */}
      <LiveAnnouncement text={announcer.text} tone={announcer.tone} marker="discover" />
      {unblockTarget === null ? null : (
        <UnblockConfirm
          language={language}
          name={personNameOf(unblockTarget, translate(language, 'discover.unknown'))}
          onCancel={closeConfirm}
          onConfirm={confirmUnblock}
        />
      )}
    </main>
  );
}
