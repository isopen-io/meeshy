import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { useStore } from 'zustand/react';

import { LensPaginationFooter } from '@/components/lens-pagination-footer';
import { PullIndicator } from '@/components/pull-indicator';
import { apiDeps } from '@/lib/api/deps';
import { TRACKING_LINKS_PAGE_SIZE, trackingDisplayNameOf, trackingLinksQueryOptions, trackingLinksSummaryQueryOptions, trackingLinkUrl, type MyTrackingLink } from '@/lib/api/my-tracking-links';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { translateLinkFamilies } from '@/lib/i18n-link-families-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { loadMoreRootMargin, paginationStateOf, showsAllLoadedHint } from '@/lib/lens/pagination';
import { useUrlSharing } from '@/lib/links/use-url-sharing';
import { useOnline } from '@/lib/net/online';
import { PULL_THRESHOLD, pullTransform } from '@/lib/view/pull-to-refresh';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { usePullToRefresh } from '@/lib/view/use-pull-to-refresh';
import { CopyRowAction, FAMILY_ROW_HEIGHT, FamilyDisc, FamilyEmpty, FamilyRow, FamilySection, FamilySkeleton, FamilyStats, TRACKING_TINT, SEPARATOR } from '@/routes/link-families-parts';
import { LinksAnnouncement, LinksGlyph, LinksHeader, LinksLoadError, LinksOfflineNotice, statusLabel } from '@/routes/links-parts';

/**
 * **SES LIENS DE SUIVI** (#6408) — miroir `TrackingLinksView.swift` : en-tête
 * avec retour et « + », les quatre agrégats (liens, clics, uniques, actifs),
 * puis ses liens, chacun copiable et ouvrant son détail. Tirer pour
 * rafraîchir, comme `.refreshable`.
 *
 * **Cache d'abord.** Liste et agrégats sont persistés (`query-client.ts`) : ils
 * se peignent au premier rendu et se revalident en fond ; le squelette ne
 * vient que sur un cache vide. Défilement par pages de cinquante.
 */

export const clicksLabel = (language: InterfaceLanguage, count: number): string =>
  translateLinkFamilies(language, count === 1 ? 'linkFamilies.tracking.clicks.one' : 'linkFamilies.tracking.clicks.other', { count: new Intl.NumberFormat(language).format(count) });

export function TrackingLinkRow({ language, link, copied, onCopy }: { readonly language: InterfaceLanguage; readonly link: MyTrackingLink; readonly copied: boolean; readonly onCopy: () => void }) {
  const name = trackingDisplayNameOf(link);
  const clicks = clicksLabel(language, link.totalClicks);
  const uniques = translateLinkFamilies(language, link.uniqueClicks === 1 ? 'linkFamilies.tracking.uniques.one' : 'linkFamilies.tracking.uniques.other', {
    count: new Intl.NumberFormat(language).format(link.uniqueClicks),
  });
  const label = new Intl.ListFormat(language, {
    type: 'unit',
    style: 'short',
  }).format([name, statusLabel(language, link.isActive), clicks, uniques]);
  return (
    <FamilyRow
      rowId={link.token}
      target={{ to: 'myTrackingLink', params: { token: link.token } }}
      label={label}
      disc={<FamilyDisc tint={TRACKING_TINT} active={link.isActive} glyph={<LinksGlyph name="chartLine" size={17} />} size={40} />}
      title={name}
      meta={
        <>
          {link.isActive ? null : (
            <>
              <span className="whitespace-nowrap font-medium">{statusLabel(language, false)}</span>
              {SEPARATOR}
            </>
          )}
          <span data-tracking-clicks className="whitespace-nowrap font-medium" style={{ color: 'var(--color-ios-ink)' }}>
            {clicks}
          </span>
          {SEPARATOR}
          <span className="whitespace-nowrap">{uniques}</span>
        </>
      }
      actions={<CopyRowAction language={language} label={translateLinkFamilies(language, 'linkFamilies.tracking.copy')} tint={TRACKING_TINT} copied={copied} onCopy={onCopy} />}
    />
  );
}

export default function MyTrackingLinksScreen() {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const enabled = apiDeps.source === 'fixtures' || signedIn;
  const list = useInfiniteQuery({ ...trackingLinksQueryOptions(apiDeps), enabled }, appQueryClient);
  const summary = useQuery({ ...trackingLinksSummaryQueryOptions(apiDeps), enabled }, appQueryClient);
  const sharing = useUrlSharing(language);
  const frame = useRef<HTMLDivElement | null>(null);

  const { refetch } = list;
  const { refetch: refetchSummary } = summary;
  const onRefresh = useCallback(() => Promise.all([refetch(), refetchSummary()]).then(() => undefined), [refetch, refetchSummary]);
  const pull = usePullToRefresh({
    root: frame,
    onRefresh,
    threshold: PULL_THRESHOLD,
  });

  const links = list.data?.pages.flatMap((page) => page.links) ?? null;
  const paginationState = paginationStateOf(list);
  const { observe } = useLoadMoreSentinel({
    root: frame,
    rootMargin: loadMoreRootMargin(FAMILY_ROW_HEIGHT),
    enabled: paginationState === 'idle' && links !== null && links.length > 0,
    onReach: () => void list.fetchNextPage(),
  });

  const totals = summary.data ?? null;
  const body =
    links === null ? (
      <li>{list.isError ? <LinksLoadError language={language} onRetry={() => void list.refetch()} /> : <FamilySkeleton label={translate(language, 'links.share.loading')} />}</li>
    ) : links.length === 0 ? (
      <li>
        <FamilyEmpty
          family="tracking"
          glyph={<LinksGlyph name="chartLine" size={48} />}
          title={translateLinkFamilies(language, 'linkFamilies.tracking.empty.title')}
          subtitle={translateLinkFamilies(language, 'linkFamilies.tracking.empty.subtitle')}
          cta={{
            to: 'myTrackingLinkNew',
            label: translateLinkFamilies(language, 'links.hub.tracking.create'),
          }}
        />
      </li>
    ) : (
      <>
        {links.map((link) => {
          const url = trackingLinkUrl(sharing.origin, link.token);
          return <TrackingLinkRow key={link.token} language={language} link={link} copied={sharing.copiedId === link.token} onCopy={() => sharing.copy(link.token, url)} />;
        })}
        <LensPaginationFooter
          state={paginationState}
          showsAllLoadedHint={showsAllLoadedHint(links.length, TRACKING_LINKS_PAGE_SIZE)}
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
        title={translateLinkFamilies(language, 'links.hub.tracking.title')}
        createLabel={translateLinkFamilies(language, 'links.hub.tracking.create')}
        createTo="myTrackingLinkNew"
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
          {totals === null ? null : (
            <FamilyStats
              language={language}
              tint={TRACKING_TINT}
              items={[
                {
                  stat: 'links',
                  glyph: <LinksGlyph name="link" size={18} />,
                  value: totals.totalLinks,
                  label: translateLinkFamilies(language, 'linkFamilies.tracking.stats.links'),
                },
                {
                  stat: 'clicks',
                  glyph: <LinksGlyph name="cursorClick" size={18} />,
                  value: totals.totalClicks,
                  label: translateLinkFamilies(language, 'linkFamilies.tracking.stats.clicks'),
                },
                {
                  stat: 'uniques',
                  glyph: <LinksGlyph name="userCheck" size={18} />,
                  value: totals.uniqueClicks,
                  label: translateLinkFamilies(language, 'linkFamilies.tracking.stats.uniques'),
                },
                {
                  stat: 'active',
                  glyph: <LinksGlyph name="checkCircle" size={18} />,
                  value: totals.activeLinks,
                  label: translateLinkFamilies(language, 'linkFamilies.tracking.stats.active'),
                },
              ]}
            />
          )}
          <FamilySection id="tracking-links-title" title={translate(language, 'root.menu.links')}>
            <ul data-tracking-links className="grid gap-2">
              {body}
            </ul>
          </FamilySection>
        </div>
      </div>
      <LinksAnnouncement text={sharing.announcer.text} />
    </main>
  );
}
