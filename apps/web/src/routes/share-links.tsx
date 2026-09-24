import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { useStore } from 'zustand/react';

import { LensPaginationFooter } from '@/components/lens-pagination-footer';
import { PullIndicator } from '@/components/pull-indicator';
import { apiDeps } from '@/lib/api/deps';
import { SHARE_LINKS_PAGE_SIZE, shareLinksQueryOptions } from '@/lib/api/links';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { loadMoreRootMargin, paginationStateOf, showsAllLoadedHint } from '@/lib/lens/pagination';
import { useLinkSharing } from '@/lib/links/use-link-sharing';
import { useOnline } from '@/lib/net/online';
import { PULL_THRESHOLD, pullTransform } from '@/lib/view/pull-to-refresh';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { usePullToRefresh } from '@/lib/view/use-pull-to-refresh';
import {
  LinksAnnouncement,
  LinksHeader,
  LinksLoadError,
  LinksOfflineNotice,
  SECTION_TITLE_CLASS,
  SHARE_LINK_ROW_HEIGHT,
  ShareLinkRow,
  ShareLinksEmpty,
  ShareLinksSkeleton,
  ShareLinksStats,
} from '@/routes/links-parts';

/**
 * **SES LIENS DE PARTAGE** (#6361) — miroir `ShareLinksView.swift` : en-tête avec
 * retour et « + », les trois agrégats (liens, actifs, rejoints), puis ses liens,
 * chacun copiable et ouvrant son détail. Tirer pour rafraîchir, comme
 * `.refreshable`.
 *
 * **Cache d'abord.** La liste est persistée (`query-client.ts`) : elle se peint
 * au premier rendu et se revalide en fond ; le squelette ne vient que sur un
 * cache vide (iOS pose un `ProgressView` quand son cache est expiré ET vide).
 * Les agrégats viennent de la MÊME réponse (`?include=summary`) — jamais d'un
 * second appel à `/links/stats`, déprécié.
 *
 * **Défilement par pages de 50**, comme `listMyLinks(limit: 50)` — iOS s'arrête à
 * la première ; ici le bas de liste charge la suivante.
 */
export default function ShareLinksScreen() {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const list = useInfiniteQuery({ ...shareLinksQueryOptions(apiDeps), enabled: apiDeps.source === 'fixtures' || signedIn }, appQueryClient);
  const sharing = useLinkSharing(language);
  const frame = useRef<HTMLDivElement | null>(null);

  const { refetch } = list;
  const onRefresh = useCallback(() => refetch().then(() => undefined), [refetch]);
  const pull = usePullToRefresh({ root: frame, onRefresh, threshold: PULL_THRESHOLD });

  const links = list.data?.pages.flatMap((page) => page.links) ?? null;
  const summary = list.data?.pages[0]?.summary ?? null;
  const paginationState = paginationStateOf(list);
  const { observe } = useLoadMoreSentinel({
    root: frame,
    rootMargin: loadMoreRootMargin(SHARE_LINK_ROW_HEIGHT),
    enabled: paginationState === 'idle' && links !== null && links.length > 0,
    onReach: () => void list.fetchNextPage(),
  });

  const body =
    links === null ? (
      <li>{list.isError ? <LinksLoadError language={language} onRetry={() => void list.refetch()} /> : <ShareLinksSkeleton language={language} />}</li>
    ) : links.length === 0 ? (
      <li>
        <ShareLinksEmpty language={language} />
      </li>
    ) : (
      <>
        {links.map((link) => (
          <ShareLinkRow key={link.linkId} language={language} link={link} copied={sharing.copiedId === link.linkId} onCopy={() => sharing.copy(link)} />
        ))}
        <LensPaginationFooter
          state={paginationState}
          showsAllLoadedHint={showsAllLoadedHint(links.length, SHARE_LINKS_PAGE_SIZE)}
          exhaustedLabel={translate(language, 'links.share.allLoaded')}
          onRetry={() => void list.fetchNextPage()}
          sentinelRef={observe}
        />
      </>
    );

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden pt-safe">
      <LinksHeader
        language={language}
        back="links"
        backLabel={translate(language, 'links.share.back')}
        title={translate(language, 'links.hub.share.title')}
        createLabel={translate(language, 'links.hub.share.create')}
      />
      <PullIndicator phase={pull.phase} offsetPx={pull.offsetPx} reducedMotion={pull.reducedMotion} />
      <div
        ref={frame}
        id="contenu"
        className="scrollbar-none overscroll-contain flex-1 overflow-y-auto px-4 pb-safe"
        style={pullTransform(pull.phase, pull.offsetPx)}
        {...(links === null && !list.isError ? { 'aria-busy': true } : {})}
      >
        <div className="mx-auto grid max-w-xl gap-5 pb-24 pt-2">
          {online ? null : <LinksOfflineNotice language={language} />}
          {summary === null ? null : <ShareLinksStats language={language} summary={summary} />}
          <section aria-labelledby="share-links-title" className="grid gap-2">
            <h2 id="share-links-title" className={SECTION_TITLE_CLASS} style={{ color: 'var(--color-ios-ink-2)' }}>
              {translate(language, 'root.menu.links')}
            </h2>
            <ul data-share-links className="grid gap-2">
              {body}
            </ul>
          </section>
        </div>
      </div>
      <LinksAnnouncement text={sharing.announcer.text} />
    </main>
  );
}
