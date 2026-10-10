import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { ApiError } from '@/lib/api/client';
import { seedArrivalsFromStats, shareLinkArrivalsQueryOptions } from '@/lib/api/link-arrivals';
import { shareLinkStatsQueryOptions } from '@/lib/api/link-stats';
import { shareLinksQueryOptions } from '@/lib/api/links';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { translateInvite } from '@/lib/i18n-invite-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { displayNameOf, findShareLink } from '@/lib/links/view';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { LinksHeader, LinksLoadError, LinksOfflineNotice, ShareLinkRefused } from '@/routes/links-parts';
import {
  arrivalsFooterState,
  arrivalsScreenState,
  ArrivalsFooter,
  ArrivalsList,
  ArrivalsSkeleton,
  flattenArrivals,
} from '@/routes/share-link-arrivals-parts';

/**
 * **TOUTES LES ARRIVÉES D'UN LIEN D'INVITATION** (#7813) — atteinte depuis
 * « Voir les N arrivées » de la page du lien (`share-link.tsx`), miroir de
 * `ShareLinkArrivalsListView` (iOS).
 *
 * **Cache d'abord** : la liste persistée se peint d'abord ; à la toute première
 * ouverture, les arrivées récentes des statistiques déjà en main en tiennent
 * lieu (`placeholderData`) — jamais de squelette quand on a quelque chose à
 * montrer. La suite se charge au défilement (sentinelle) ou par le bouton du
 * pied de liste, et son échec ne retire rien de ce qui est affiché.
 *
 * Responsive : une colonne lisible, centrée sur le bureau.
 */

const SENTINEL_MARGIN = '0px 0px 600px 0px';

export default function ShareLinkArrivalsScreen() {
  const { link: linkId } = useParams<'/links/share/$link/arrivals'>();
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const enabled = apiDeps.source === 'fixtures' || signedIn;

  const stats = useQuery({ ...shareLinkStatsQueryOptions(apiDeps, linkId), enabled }, appQueryClient);
  const links = useInfiniteQuery({ ...shareLinksQueryOptions(apiDeps), enabled: false }, appQueryClient);
  const seed = seedArrivalsFromStats(stats.data);
  const arrivalsQuery = useInfiniteQuery(
    {
      ...shareLinkArrivalsQueryOptions(apiDeps, linkId),
      enabled,
      ...(seed === null || seed.arrivals.length === 0 ? {} : { placeholderData: { pages: [{ ...seed, nextCursor: null }], pageParams: [null] } }),
    },
    appQueryClient,
  );

  const arrivals = flattenArrivals(arrivalsQuery.data);
  const error = arrivalsQuery.error;
  const screen = arrivalsScreenState({
    arrivals,
    isError: arrivalsQuery.isError,
    errorStatus: error instanceof ApiError ? error.status : null,
  });
  const footer = arrivalsFooterState({
    hasNextPage: !arrivalsQuery.isPlaceholderData && arrivalsQuery.hasNextPage,
    isFetchingNextPage: arrivalsQuery.isFetchingNextPage,
    isFetchNextPageError: arrivalsQuery.isFetchNextPageError,
  });

  const { fetchNextPage, refetch } = arrivalsQuery;
  const loadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  const scroller = useRef<HTMLElement | null>(null);
  const { observe } = useLoadMoreSentinel({ root: scroller, rootMargin: SENTINEL_MARGIN, enabled: footer === 'more' && online, onReach: loadMore });

  const link = findShareLink(links.data, linkId);
  const total = stats.data?.arrivals ?? null;
  const now = new Date();

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <LinksHeader
        language={language}
        back={{ shareLink: linkId }}
        backLabel={translateInvite(language, 'linkArrivals.back')}
        title={total === null ? translateInvite(language, 'linkArrivals.title') : `${translateInvite(language, 'linkArrivals.title')} · ${new Intl.NumberFormat(language).format(total)}`}
      />
      <main id="contenu" ref={scroller} className="flex-1 overflow-y-auto px-4 pb-safe md:px-10">
        <div className="mx-auto grid max-w-xl gap-4 pb-24 pt-2 md:pt-6">
          {link === undefined ? null : (
            <p data-link-arrivals-link className="truncate text-center text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {displayNameOf(link)}
            </p>
          )}
          {online ? null : <LinksOfflineNotice language={language} />}
          {screen === 'list' && arrivals !== undefined ? (
            <>
              <ArrivalsList language={language} arrivals={arrivals} now={now} />
              {footer === 'more' ? <span ref={observe} aria-hidden="true" className="block h-px" /> : null}
              <ArrivalsFooter language={language} state={footer} onMore={loadMore} />
            </>
          ) : screen === 'empty' ? (
            <p data-link-arrivals-empty className="rounded-hero px-4 py-8 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
              {translateInvite(language, 'linkDetail.recent.empty')}
            </p>
          ) : screen === 'refused' ? (
            <ShareLinkRefused language={language} />
          ) : screen === 'error' ? (
            <LinksLoadError language={language} onRetry={() => void refetch()} />
          ) : (
            <ArrivalsSkeleton language={language} />
          )}
        </div>
      </main>
    </div>
  );
}
