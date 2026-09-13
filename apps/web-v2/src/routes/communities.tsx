import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { Field } from '@/components/field';
import { communitiesQueryKey, communitiesQueryOptions, searchTermOf, type CommunityPage } from '@/lib/api/communities';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { cachedSearchPlaceholder } from '@/lib/communities/view';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { useSettled } from '@/lib/view/use-settled';
import {
  COMMUNITIES_SEARCH_HEIGHT,
  COMMUNITIES_TOP_RESERVE,
  CommunitiesEmpty,
  CommunitiesHeader,
  CommunitiesLoadError,
  CommunitiesOfflineNotice,
  CommunitiesSearchEmpty,
  CommunityCard,
  CommunityGridSkeleton,
  ScreenGlyph,
} from '@/routes/communities-parts';

/**
 * **SES COMMUNAUTÉS** (#6364) — cinquième barreau de l'échelle, miroir
 * `CommunityListView.swift` : en-tête avec retour et « + », recherche, grille de
 * cartes à deux colonnes, défilement infini. Remplace l'écran d'attente de
 * #6214.
 *
 * **Cache d'abord.** La liste est persistée (`query-client.ts`) : elle se
 * peint au premier rendu, et le squelette ne vient que sur un cache vide. Une
 * recherche se peint AUSSITÔT depuis la liste en cache filtrée comme la
 * passerelle filtre (`cachedSearchPlaceholder`), puis la réponse complète ce
 * que la première page ne portait pas — iOS vide la grille le temps de la
 * requête. La recherche part après 350 ms sans frappe, comme iOS, et à partir
 * de deux caractères, comme la route l'exige.
 *
 * **Le couloir des disques flottants.** En-tête (64) et recherche (56) finissent
 * au-dessus du couloir 126 → 178 ; la première carte commence SOUS lui au repos
 * (`COMMUNITIES_TOP_RESERVE`). `scripts/check-communities.mjs` le mesure.
 */

const SEARCH_DEBOUNCE_MS = 350;
const EMPTY_SEARCH = '';


export default function CommunitiesScreen() {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const enabled = apiDeps.source === 'fixtures' || signedIn;

  const [typed, setTyped] = useState(EMPTY_SEARCH);
  const [searchFocused, setSearchFocused] = useState(false);
  const search = searchTermOf(useSettled(typed, SEARCH_DEBOUNCE_MS));

  const list = useInfiniteQuery(
    {
      ...communitiesQueryOptions(apiDeps, search),
      enabled,
      placeholderData: (previous: InfiniteData<CommunityPage, number> | undefined) =>
        cachedSearchPlaceholder(appQueryClient.getQueryData<InfiniteData<CommunityPage, number>>(communitiesQueryKey(EMPTY_SEARCH)), search) ?? previous,
    },
    appQueryClient,
  );

  const scroller = useRef<HTMLElement | null>(null);
  const communities = list.data?.pages.flatMap((page) => page.communities) ?? null;
  const sentinel = useLoadMoreSentinel({
    root: scroller,
    rootMargin: '0px 0px 360px 0px',
    enabled: list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError && !list.isPlaceholderData,
    onReach: () => void list.fetchNextPage(),
  });

  const body =
    communities === null ? (
      list.isError ? (
        <CommunitiesLoadError language={language} title="community.error.title" onRetry={() => void list.refetch()} />
      ) : (
        <CommunityGridSkeleton language={language} />
      )
    ) : communities.length === 0 ? (
      search === EMPTY_SEARCH ? (
        <CommunitiesEmpty language={language} />
      ) : (
        <CommunitiesSearchEmpty language={language} query={search} />
      )
    ) : (
      <>
        <ul data-community-grid className="grid grid-cols-2 gap-3.5">
          {communities.map((community) => (
            <li key={community.id}>
              <CommunityCard language={language} community={community} />
            </li>
          ))}
        </ul>
        {list.hasNextPage ? <div ref={sentinel.observe} aria-hidden="true" style={{ height: 1 }} /> : null}
        {list.isFetchingNextPage ? <CommunityGridSkeleton language={language} count={2} /> : null}
        {list.isFetchNextPageError ? (
          <CommunitiesLoadError language={language} title="community.error.title" onRetry={() => void list.fetchNextPage()} />
        ) : null}
      </>
    );

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <CommunitiesHeader language={language} />
      <div className="shrink-0 px-4" style={{ height: COMMUNITIES_SEARCH_HEIGHT }}>
        <Field id="community-search" icon="magnifyingGlass" tint="var(--color-ios-brand)" focused={searchFocused}>
          {({ id, describedBy }) => (
            <>
              <input
                id={id}
                type="text"
                role="searchbox"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                data-community-search
                aria-describedby={describedBy}
                aria-label={translate(language, 'community.list.search.placeholder')}
                placeholder={translate(language, 'community.list.search.placeholder')}
                value={typed}
                onChange={(event) => setTyped(event.currentTarget.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="min-w-0 flex-1 bg-transparent text-body outline-none"
                style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
              />
              {typed === EMPTY_SEARCH ? null : (
                <button
                  type="button"
                  data-community-search-clear
                  aria-label={translate(language, 'community.list.search.clear')}
                  onClick={() => setTyped(EMPTY_SEARCH)}
                  className="-me-3 grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2"
                  style={{ color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
                >
                  <ScreenGlyph name="xCircle" size={18} />
                </button>
              )}
            </>
          )}
        </Field>
      </div>
      <main id="contenu" ref={scroller} className="flex-1 overflow-y-auto px-4 pb-safe">
        <div className="mx-auto grid max-w-xl gap-4 pb-24" style={{ paddingTop: COMMUNITIES_TOP_RESERVE }}>
          {online ? null : <CommunitiesOfflineNotice language={language} />}
          {body}
        </div>
      </main>
    </div>
  );
}
