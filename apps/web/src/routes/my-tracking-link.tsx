import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand/react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { apiDeps } from '@/lib/api/deps';
import { performDeleteTrackingLink, performSetTrackingLinkActive, type LinkFamilyOutcome, type TrackingActionDeps } from '@/lib/api/link-family-actions';
import {
  trackingDisplayNameOf,
  trackingLinkClicksQueryOptions,
  trackingLinksQueryOptions,
  trackingLinkStatsQueryOptions,
  trackingLinkUrl,
  type MyTrackingLink,
  type TrackingClick,
  type TrackingLinksPage,
} from '@/lib/api/my-tracking-links';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { translateLinkFamilies, type PlainLinkFamiliesKey } from '@/lib/i18n-link-families-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useUrlSharing } from '@/lib/links/use-url-sharing';
import { shareLinkDetailState } from '@/lib/links/view';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { useTapGate } from '@/lib/view/tap-gate';
import {
  BreakdownCard,
  DetailActions,
  DetailHero,
  DetailSkeleton,
  FamilyRefused,
  FamilySection,
  FamilyStats,
  InfoList,
  TRACKING_TINT,
  type InfoRow,
} from '@/routes/link-families-parts';
import { LinksAnnouncement, LinksGlyph, LinksHeader, LinksLoadError, LinksOfflineNotice, statusLabel } from '@/routes/links-parts';
import { href, navigate } from '@/routes/route-table';

/**
 * **LE DÉTAIL D'UN LIEN DE SUIVI** (#6408) — miroir `TrackingLinkDetailView.swift` :
 * carte d'en-tête (nom, adresse, puces UTM, état écrit), barre d'actions
 * (copier, partager, désactiver, supprimer), statistiques, ventilations,
 * derniers clics, configuration UTM.
 *
 * **Le lien se lit dans la liste de SES liens** : ouvert depuis la liste, il se
 * peint sans attendre ; par une adresse directe, les pages se chargent jusqu'à
 * trouver son jeton. Un lien d'un autre compte n'est dans aucune page : il rend
 * le refus, et ses mesures ne sont jamais demandées.
 *
 * **Désactiver et supprimer sont optimistes**, avec retour arrière
 * (`link-family-actions.ts`) ; l'écran attend la réponse avant de se fermer
 * sur une suppression, pour pouvoir DIRE un refus. iOS n'offre que supprimer : la passerelle sert
 * aussi la bascule (`PATCH /tracking-links/:token`), comme pour les liens de
 * partage — même geste, même place.
 */

const DEVICE_LABEL: Readonly<Record<string, PlainLinkFamiliesKey>> = {
  mobile: 'linkFamilies.tracking.device.mobile',
  desktop: 'linkFamilies.tracking.device.desktop',
  tablet: 'linkFamilies.tracking.device.tablet',
};

const REDIRECT_LABEL: Readonly<Record<TrackingClick['redirectStatus'], PlainLinkFamiliesKey>> = {
  confirmed: 'linkFamilies.tracking.redirect.confirmed',
  failed: 'linkFamilies.tracking.redirect.failed',
  pending: 'linkFamilies.tracking.redirect.pending',
};

export const deviceLabel = (language: InterfaceLanguage, device: string): string => {
  const key = DEVICE_LABEL[device.toLowerCase()];
  return key === undefined ? device : translateLinkFamilies(language, key);
};

const deviceGlyph = (device: string | null) => {
  const kind = device?.toLowerCase();
  if (kind === 'desktop') return <LinksGlyph name="desktop" size={16} />;
  if (kind === 'tablet') return <LinksGlyph name="deviceTablet" size={16} />;
  return <LinksGlyph name="deviceMobile" size={16} />;
};

const formatDate = (language: InterfaceLanguage, iso: string): string =>
  new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

const findTrackingLink = (data: { readonly pages: readonly TrackingLinksPage[] } | undefined, token: string): MyTrackingLink | undefined =>
  data?.pages.flatMap((page) => page.links).find((link) => link.token === token);

export function RecentClicks({ language, clicks }: { readonly language: InterfaceLanguage; readonly clicks: readonly TrackingClick[] }) {
  return (
    <ul data-recent-clicks className="grid divide-y overflow-hidden rounded-card" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      {clicks.map((click) => {
        const place = [click.city, click.country].filter((part): part is string => part !== null).join(', ');
        const detail = [click.device === null ? null : deviceLabel(language, click.device), click.browser, click.socialSource].filter((part): part is string => part !== null).join(' · ');
        return (
          <li key={click.id} data-recent-click={click.redirectStatus} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderColor: 'color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)' }}>
            <span aria-hidden="true" style={{ color: TRACKING_TINT }}>
              {deviceGlyph(click.device)}
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-caption font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
                {place === '' ? translateLinkFamilies(language, 'linkFamilies.tracking.unknownPlace') : place}
              </span>
              <span className="truncate text-chip" style={{ color: 'var(--color-ios-ink-2)' }}>
                {detail === '' ? formatDate(language, click.clickedAt) : `${detail} · ${formatDate(language, click.clickedAt)}`}
              </span>
            </span>
            <span className="shrink-0 text-chip font-medium" style={{ color: click.redirectStatus === 'failed' ? 'var(--color-error)' : 'var(--color-ios-ink-2)' }}>
              {translateLinkFamilies(language, REDIRECT_LABEL[click.redirectStatus])}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function utmRows(language: InterfaceLanguage, link: MyTrackingLink): readonly InfoRow[] {
  return [
    ...(link.campaign === null ? [] : [{ key: 'campaign', label: translateLinkFamilies(language, 'linkFamilies.tracking.campaign'), value: link.campaign }]),
    ...(link.source === null ? [] : [{ key: 'source', label: translateLinkFamilies(language, 'linkFamilies.tracking.source'), value: link.source }]),
    ...(link.medium === null ? [] : [{ key: 'medium', label: translateLinkFamilies(language, 'linkFamilies.tracking.medium'), value: link.medium }]),
    { key: 'destination', label: translateLinkFamilies(language, 'linkFamilies.tracking.destination'), value: link.originalUrl, ltr: true },
    { key: 'createdAt', label: translate(language, 'links.detail.createdAt'), value: formatDate(language, link.createdAt) },
    ...(link.expiresAt === null ? [] : [{ key: 'expiresAt', label: translate(language, 'links.detail.expiresAt'), value: formatDate(language, link.expiresAt) }]),
  ];
}

const TOGGLE_FAILURE: Readonly<Record<Exclude<LinkFamilyOutcome, 'done' | 'busy'>, InterfaceCatalogKey>> = {
  offline: 'links.announce.offline',
  failed: 'links.announce.toggleFailed',
};

export default function MyTrackingLinkScreen() {
  const { token } = useParams<'/links/tracking/$token'>();
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const enabled = apiDeps.source === 'fixtures' || signedIn;
  const list = useInfiniteQuery({ ...trackingLinksQueryOptions(apiDeps), enabled }, appQueryClient);
  const link = findTrackingLink(list.data, token);
  const owned = link !== undefined;
  const stats = useQuery({ ...trackingLinkStatsQueryOptions(apiDeps, token), enabled: enabled && owned }, appQueryClient);
  const clicks = useQuery({ ...trackingLinkClicksQueryOptions(apiDeps, token), enabled: enabled && owned }, appQueryClient);
  const sharing = useUrlSharing(language);
  const { announce } = sharing.announcer;
  const state = shareLinkDetailState({
    found: owned,
    loaded: list.data !== undefined,
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    isError: list.isError,
  });

  const { fetchNextPage } = list;
  useEffect(() => {
    if (state === 'searching') void fetchNextPage();
  }, [state, fetchNextPage]);

  const deps: TrackingActionDeps = useMemo(() => ({ ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine }), []);
  const admitTap = useTapGate();
  const toggle = useCallback(
    (current: MyTrackingLink) => {
      if (!admitTap()) return;
      const next = !current.isActive;
      void performSetTrackingLinkActive({ link: current, isActive: next, deps }).then((outcome) => {
        if (outcome === 'busy') return;
        announce(translate(language, outcome === 'done' ? (next ? 'links.announce.activated' : 'links.announce.disabled') : TOGGLE_FAILURE[outcome]));
      });
    },
    [admitTap, announce, deps, language],
  );

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useCallback(
    async (current: MyTrackingLink) => {
      setDeleting(true);
      const outcome = await performDeleteTrackingLink({ link: current, deps });
      setDeleting(false);
      setConfirming(false);
      if (outcome === 'done') {
        navigate(href('myTrackingLinks'), true);
        return;
      }
      announce(outcome === 'offline' ? translate(language, 'links.announce.offline') : translateLinkFamilies(language, 'linkFamilies.announce.deleteFailed'), 'error');
    },
    [announce, deps, language],
  );

  const title = link === undefined ? translateLinkFamilies(language, 'links.hub.tracking.title') : trackingDisplayNameOf(link);
  const served = stats.data ?? null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <LinksHeader language={language} back="myTrackingLinks" backLabel={translateLinkFamilies(language, 'linkFamilies.tracking.back')} title={title} />
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe">
        <div className="mx-auto grid max-w-xl gap-5 pb-24 pt-2">
          {online ? null : <LinksOfflineNotice language={language} />}
          {link !== undefined ? (
            <>
              <DetailHero
                tint={TRACKING_TINT}
                active={link.isActive}
                glyph={<LinksGlyph name="chartLine" size={26} />}
                title={trackingDisplayNameOf(link)}
                address={trackingLinkUrl(sharing.origin, link.token).replace(/^https?:\/\//u, '')}
                chips={[link.campaign, link.source, link.medium].filter((chip): chip is string => chip !== null)}
                status={statusLabel(language, link.isActive)}
              />
              <DetailActions
                actions={[
                  {
                    name: 'copy',
                    label: translate(language, sharing.copiedId === link.token ? 'links.detail.copied' : 'links.detail.copy'),
                    glyph: <LinksGlyph name="copy" size={20} />,
                    tint: sharing.copiedId === link.token ? 'var(--color-success)' : TRACKING_TINT,
                    onClick: () => sharing.copy(link.token, trackingLinkUrl(sharing.origin, link.token)),
                  },
                  {
                    name: 'share',
                    label: translate(language, 'links.detail.share'),
                    glyph: <LinksGlyph name="export" size={20} />,
                    tint: TRACKING_TINT,
                    onClick: () => sharing.share(trackingDisplayNameOf(link), trackingLinkUrl(sharing.origin, link.token)),
                  },
                  {
                    name: 'toggle',
                    label: translate(language, link.isActive ? 'links.detail.disable' : 'links.detail.activate'),
                    glyph: <LinksGlyph name={link.isActive ? 'pauseCircle' : 'playCircle'} size={20} />,
                    tint: link.isActive ? 'var(--color-warning)' : 'var(--color-success)',
                    onClick: () => toggle(link),
                    disabled: !online,
                  },
                  {
                    name: 'delete',
                    label: translateLinkFamilies(language, 'linkFamilies.delete'),
                    glyph: <LinksGlyph name="trash" size={20} />,
                    tint: 'var(--color-error)',
                    onClick: () => setConfirming(true),
                    disabled: !online,
                  },
                ]}
              />
              <FamilySection id="tracking-stats-title" title={translate(language, 'links.detail.stats')}>
                <FamilyStats
                  language={language}
                  tint={TRACKING_TINT}
                  items={[
                    { stat: 'total', glyph: <LinksGlyph name="cursorClick" size={20} />, value: served?.totalClicks ?? link.totalClicks, label: translateLinkFamilies(language, 'linkFamilies.tracking.totalClicks') },
                    { stat: 'unique', glyph: <LinksGlyph name="userCheck" size={20} />, value: served?.uniqueClicks ?? link.uniqueClicks, label: translateLinkFamilies(language, 'linkFamilies.tracking.uniqueClicks') },
                  ]}
                />
                <p data-tracking-last-click className="ps-1 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                  {link.lastClickedAt === null
                    ? translateLinkFamilies(language, 'linkFamilies.tracking.noClick')
                    : translateLinkFamilies(language, 'linkFamilies.tracking.lastClick', { date: formatDate(language, link.lastClickedAt) })}
                </p>
              </FamilySection>
              {served === null || served.totalClicks === 0 ? null : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <BreakdownCard language={language} name="countries" title={translateLinkFamilies(language, 'linkFamilies.tracking.countries')} glyph={<LinksGlyph name="globe" size={13} />} tint="var(--ios-indigo-400)" items={served.countries} />
                  <BreakdownCard
                    language={language}
                    name="devices"
                    title={translateLinkFamilies(language, 'linkFamilies.tracking.devices')}
                    glyph={<LinksGlyph name="deviceMobile" size={13} />}
                    tint={TRACKING_TINT}
                    items={served.devices}
                    labelOf={(device) => deviceLabel(language, device)}
                  />
                  <BreakdownCard language={language} name="browsers" title={translateLinkFamilies(language, 'linkFamilies.tracking.browsers')} glyph={<LinksGlyph name="browser" size={13} />} tint="var(--color-success)" items={served.browsers} />
                  {served.socialSources.length === 0 ? null : (
                    <BreakdownCard language={language} name="social" title={translateLinkFamilies(language, 'linkFamilies.tracking.social')} glyph={<LinksGlyph name="shareNetwork" size={13} />} tint="var(--color-warning)" items={served.socialSources} />
                  )}
                </div>
              )}
              {clicks.data === undefined || clicks.data.length === 0 ? null : (
                <FamilySection id="tracking-recent-title" title={translateLinkFamilies(language, 'linkFamilies.tracking.recent')}>
                  <RecentClicks language={language} clicks={clicks.data} />
                </FamilySection>
              )}
              <FamilySection id="tracking-utm-title" title={translateLinkFamilies(language, 'linkFamilies.tracking.utm')}>
                <InfoList rows={utmRows(language, link)} />
              </FamilySection>
              {confirming ? (
                <ConfirmDialog
                  name="deleteTrackingLink"
                  title={translateLinkFamilies(language, 'linkFamilies.tracking.delete.title')}
                  body={translateLinkFamilies(language, 'linkFamilies.tracking.delete.body')}
                  cancelLabel={translateLinkFamilies(language, 'linkFamilies.cancel')}
                  confirmLabel={translateLinkFamilies(language, 'linkFamilies.delete')}
                  tone="destructive"
                  busy={deleting}
                  onConfirm={() => void remove(link)}
                  onCancel={() => setConfirming(false)}
                />
              ) : null}
            </>
          ) : state === 'refused' ? (
            <FamilyRefused language={language} back={{ to: 'myTrackingLinks', label: translateLinkFamilies(language, 'linkFamilies.tracking.back') }} />
          ) : state === 'error' ? (
            <LinksLoadError language={language} onRetry={() => void (list.data === undefined ? list.refetch() : list.fetchNextPage())} />
          ) : (
            <DetailSkeleton label={translate(language, 'links.detail.loading')} />
          )}
        </div>
      </main>
      <LinksAnnouncement text={sharing.announcer.text} />
    </div>
  );
}
