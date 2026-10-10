import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { LensPaginationFooter } from '@/components/lens-pagination-footer';
import { PullIndicator } from '@/components/pull-indicator';
import { AFFILIATE_TOKENS_PAGE_SIZE, affiliateLinkUrl, affiliateStatsQueryOptions, affiliateTokensQueryOptions, type AffiliateToken, type Referral } from '@/lib/api/affiliate-tokens';
import { apiDeps } from '@/lib/api/deps';
import { performDeleteAffiliateToken, type AffiliateActionDeps } from '@/lib/api/link-family-actions';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { translateLinkFamilies, type PlainLinkFamiliesKey } from '@/lib/i18n-link-families-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { loadMoreRootMargin, paginationStateOf, showsAllLoadedHint } from '@/lib/lens/pagination';
import { useUrlSharing } from '@/lib/links/use-url-sharing';
import { useOnline } from '@/lib/net/online';
import { PULL_THRESHOLD, pullTransform } from '@/lib/view/pull-to-refresh';
import { useLoadMoreSentinel } from '@/lib/view/use-load-more-sentinel';
import { usePullToRefresh } from '@/lib/view/use-pull-to-refresh';
import { AFFILIATE_TINT, CopyRowAction, FAMILY_ROW_HEIGHT, FamilyDisc, FamilyEmpty, FamilyRow, FamilySection, FamilySkeleton, FamilyStats, RowAction, SEPARATOR } from '@/routes/link-families-parts';
import { LinksAnnouncement, LinksGlyph, LinksHeader, LinksLoadError, LinksOfflineNotice, statusLabel } from '@/routes/links-parts';

/**
 * **SES LIENS DE PARRAINAGE** (#6409) — miroir `AffiliateView.swift` : en-tête
 * avec retour et « + », les agrégats (liens, inscrits, en attente), ses liens
 * — chacun copiable, partageable et supprimable, comme sur iOS où un jeton n'a
 * pas d'écran de détail —, puis ses filleuls.
 *
 * **Cache d'abord** (liste et agrégats persistés), **supprimer est optimiste**
 * avec retour arrière (`link-family-actions.ts`), et un refus se DIT.
 */

const REFERRAL_STATUS: Readonly<Record<Referral['status'], PlainLinkFamiliesKey>> = {
  completed: 'linkFamilies.affiliate.referral.completed',
  pending: 'linkFamilies.affiliate.referral.pending',
  expired: 'linkFamilies.affiliate.referral.expired',
};

export const signupsLabel = (language: InterfaceLanguage, count: number): string =>
  translateLinkFamilies(language, count === 1 ? 'linkFamilies.affiliate.signups.one' : 'linkFamilies.affiliate.signups.other', { count: new Intl.NumberFormat(language).format(count) });

export function AffiliateTokenRow({
  language,
  token,
  copied,
  onCopy,
  onShare,
  onDelete,
}: {
  readonly language: InterfaceLanguage;
  readonly token: AffiliateToken;
  readonly copied: boolean;
  readonly onCopy: () => void;
  readonly onShare: () => void;
  readonly onDelete: () => void;
}) {
  const format = new Intl.NumberFormat(language);
  const signups = signupsLabel(language, token.referrals);
  const uses =
    token.maxUses === null
      ? null
      : translateLinkFamilies(language, 'linkFamilies.affiliate.uses', {
          used: format.format(token.currentUses),
          max: format.format(token.maxUses),
        });
  const label = new Intl.ListFormat(language, {
    type: 'unit',
    style: 'short',
  }).format([token.name, statusLabel(language, token.isActive), signups, ...(uses === null ? [] : [uses])]);
  return (
    <FamilyRow
      rowId={token.id}
      target={null}
      label={label}
      disc={<FamilyDisc tint={AFFILIATE_TINT} active={token.isActive} glyph={<LinksGlyph name="gift" size={17} />} size={40} />}
      title={token.name}
      meta={
        <>
          {token.isActive ? null : (
            <>
              <span className="whitespace-nowrap font-medium">{statusLabel(language, false)}</span>
              {SEPARATOR}
            </>
          )}
          <span data-affiliate-signups className="whitespace-nowrap font-medium" style={{ color: 'var(--color-ios-ink)' }}>
            {signups}
          </span>
          {uses === null ? null : (
            <>
              {SEPARATOR}
              <span className="whitespace-nowrap">{uses}</span>
            </>
          )}
        </>
      }
      actions={
        <span className="flex shrink-0 items-center">
          <CopyRowAction language={language} label={translateLinkFamilies(language, 'linkFamilies.affiliate.copy')} tint={AFFILIATE_TINT} copied={copied} onCopy={onCopy} />
          <RowAction name="share" label={translateLinkFamilies(language, 'linkFamilies.affiliate.share')} tint={AFFILIATE_TINT} onClick={onShare}>
            <LinksGlyph name="export" size={18} />
          </RowAction>
          <RowAction name="delete" label={translateLinkFamilies(language, 'linkFamilies.affiliate.delete')} tint="var(--color-error)" onClick={onDelete}>
            <LinksGlyph name="trash" size={18} />
          </RowAction>
        </span>
      }
    />
  );
}

export function ReferralList({ language, referrals }: { readonly language: InterfaceLanguage; readonly referrals: readonly Referral[] }) {
  if (referrals.length === 0) {
    return (
      <p
        data-referrals-empty
        className="rounded-card px-3.5 py-4 text-center text-caption"
        style={{
          backgroundColor: 'var(--color-ios-card)',
          color: 'var(--color-ios-ink-2)',
        }}
      >
        {translateLinkFamilies(language, 'linkFamilies.affiliate.referrals.empty')}
      </p>
    );
  }
  const date = new Intl.DateTimeFormat(language, { dateStyle: 'medium' });
  return (
    <ul data-referrals className="grid divide-y overflow-hidden rounded-card" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      {referrals.map((referral) => (
        <li
          key={referral.id}
          data-referral={referral.status}
          className="flex items-center gap-3 px-3.5 py-2.5"
          style={{
            minHeight: 56,
            borderColor: 'color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              color: referral.status === 'completed' ? AFFILIATE_TINT : 'var(--color-ios-ink-3)',
            }}
          >
            <LinksGlyph name={referral.status === 'completed' ? 'userCheck' : 'hourglass'} size={18} />
          </span>
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="truncate text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
              {referral.name}
            </span>
            {referral.createdAt === null ? null : (
              <span className="text-chip" style={{ color: 'var(--color-ios-ink-2)' }}>
                {date.format(new Date(referral.createdAt))}
              </span>
            )}
          </span>
          <span className="shrink-0 text-chip font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translateLinkFamilies(language, REFERRAL_STATUS[referral.status])}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function AffiliateLinksScreen() {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const enabled = apiDeps.source === 'fixtures' || signedIn;
  const list = useInfiniteQuery({ ...affiliateTokensQueryOptions(apiDeps), enabled }, appQueryClient);
  const stats = useQuery({ ...affiliateStatsQueryOptions(apiDeps), enabled }, appQueryClient);
  const sharing = useUrlSharing(language);
  const { announce } = sharing.announcer;
  const frame = useRef<HTMLDivElement | null>(null);

  const { refetch } = list;
  const { refetch: refetchStats } = stats;
  const onRefresh = useCallback(() => Promise.all([refetch(), refetchStats()]).then(() => undefined), [refetch, refetchStats]);
  const pull = usePullToRefresh({
    root: frame,
    onRefresh,
    threshold: PULL_THRESHOLD,
  });

  const tokens = list.data?.pages.flatMap((page) => page.tokens) ?? null;
  const paginationState = paginationStateOf(list);
  const { observe } = useLoadMoreSentinel({
    root: frame,
    rootMargin: loadMoreRootMargin(FAMILY_ROW_HEIGHT),
    enabled: paginationState === 'idle' && tokens !== null && tokens.length > 0,
    onReach: () => void list.fetchNextPage(),
  });

  const deps: AffiliateActionDeps = useMemo(
    () => ({
      ...apiDeps,
      queryClient: appQueryClient,
      isOnline: () => navigator.onLine,
    }),
    [],
  );
  const [confirming, setConfirming] = useState<AffiliateToken | null>(null);
  const remove = useCallback(
    (token: AffiliateToken) => {
      setConfirming(null);
      void performDeleteAffiliateToken({ token, deps }).then((outcome) => {
        if (outcome === 'done') announce(translateLinkFamilies(language, 'linkFamilies.announce.deleted'));
        else announce(outcome === 'offline' ? translate(language, 'links.announce.offline') : translateLinkFamilies(language, 'linkFamilies.announce.deleteFailed'), 'error');
      });
    },
    [announce, deps, language],
  );

  const served = stats.data ?? null;
  const body =
    tokens === null ? (
      <li>{list.isError ? <LinksLoadError language={language} onRetry={() => void list.refetch()} /> : <FamilySkeleton label={translate(language, 'links.share.loading')} rows={2} />}</li>
    ) : tokens.length === 0 ? (
      <li>
        <FamilyEmpty
          family="affiliate"
          glyph={<LinksGlyph name="gift" size={48} />}
          title={translateLinkFamilies(language, 'linkFamilies.affiliate.empty.title')}
          subtitle={translateLinkFamilies(language, 'linkFamilies.affiliate.empty.subtitle')}
          cta={{
            to: 'affiliateLinkNew',
            label: translateLinkFamilies(language, 'links.hub.affiliate.create'),
          }}
        />
      </li>
    ) : (
      <>
        {tokens.map((token) => {
          const url = affiliateLinkUrl(sharing.origin, token.token);
          return (
            <AffiliateTokenRow
              key={token.id}
              language={language}
              token={token}
              copied={sharing.copiedId === token.id}
              onCopy={() => sharing.copy(token.id, url)}
              onShare={() => sharing.share(token.name, url)}
              onDelete={() => setConfirming(token)}
            />
          );
        })}
        <LensPaginationFooter
          state={paginationState}
          showsAllLoadedHint={showsAllLoadedHint(tokens.length, AFFILIATE_TOKENS_PAGE_SIZE)}
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
        title={translateLinkFamilies(language, 'linkFamilies.affiliate.title')}
        createLabel={translateLinkFamilies(language, 'links.hub.affiliate.create')}
        createTo="affiliateLinkNew"
      />
      <PullIndicator phase={pull.phase} offsetPx={pull.offsetPx} reducedMotion={pull.reducedMotion} />
      <div
        ref={frame}
        id="contenu"
        className="scrollbar-none overscroll-contain flex-1 overflow-y-auto px-4 pb-safe"
        style={pullTransform(pull.phase, pull.offsetPx)}
        {...(tokens === null && !list.isError ? { 'aria-busy': true } : {})}
      >
        <div className="mx-auto grid max-w-xl gap-5 pb-24 pt-2">
          {online ? null : <LinksOfflineNotice language={language} />}
          {served === null ? null : (
            <FamilyStats
              language={language}
              tint={AFFILIATE_TINT}
              items={[
                {
                  stat: 'links',
                  glyph: <LinksGlyph name="link" size={18} />,
                  value: served?.totalTokens ?? null,
                  label: translateLinkFamilies(language, 'linkFamilies.affiliate.stats.links'),
                },
                {
                  stat: 'signups',
                  glyph: <LinksGlyph name="userCheck" size={18} />,
                  value: served?.totalReferrals ?? null,
                  label: translateLinkFamilies(language, 'linkFamilies.affiliate.stats.signups'),
                },
                {
                  stat: 'pending',
                  glyph: <LinksGlyph name="hourglass" size={18} />,
                  value: served?.pendingReferrals ?? null,
                  label: translateLinkFamilies(language, 'linkFamilies.affiliate.stats.pending'),
                },
              ]}
            />
          )}
          <FamilySection id="affiliate-links-title" title={translate(language, 'root.menu.links')}>
            <ul data-affiliate-links className="grid gap-2">
              {body}
            </ul>
          </FamilySection>
          {served === null ? null : (
            <FamilySection id="affiliate-referrals-title" title={translateLinkFamilies(language, 'linkFamilies.affiliate.section.referrals')}>
              <ReferralList language={language} referrals={served.referrals} />
            </FamilySection>
          )}
        </div>
      </div>
      {confirming === null ? null : (
        <ConfirmDialog
          name="deleteAffiliateToken"
          title={translateLinkFamilies(language, 'linkFamilies.affiliate.delete.title')}
          body={translateLinkFamilies(language, 'linkFamilies.affiliate.delete.body')}
          cancelLabel={translateLinkFamilies(language, 'linkFamilies.cancel')}
          confirmLabel={translateLinkFamilies(language, 'linkFamilies.delete')}
          tone="destructive"
          onConfirm={() => remove(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
      <LinksAnnouncement text={sharing.announcer.text} />
    </main>
  );
}
