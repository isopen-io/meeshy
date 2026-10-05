import { useQuery } from '@tanstack/react-query';
import { useId, type ReactNode } from 'react';

import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminDetailSheet } from '@/components/admin/detail-sheet';
import { AdminLink } from '@/components/admin/entity-chip';
import { AdminFiche, AdminIdentityHeader, AdminStatStrip } from '@/components/admin/fiche';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState, AdminInlineNotice, AdminOfflineNotice } from '@/components/admin/states';
import { AdminSummaryCard, AdminSummaryGrid } from '@/components/admin/summary-card';
import { BROADCAST_POLL_MS, broadcastPollInterval, inAppStateOf, recipientsToReach } from '@/lib/admin/broadcast-gestures';
import { broadcastLabel } from '@/lib/admin/broadcast-labels';
import {
  ADMIN_BROADCAST_SECTION_GLYPHS,
  ADMIN_BROADCAST_SECTION_TITLES,
  ADMIN_BROADCAST_SECTIONS,
  broadcastSummaryOf,
  type AdminBroadcastSection,
} from '@/lib/admin/broadcast-summaries';
import { interpretBroadcastStatus } from '@/lib/admin/interpret/enums';
import { personLabel } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { useAdminOpen } from '@/lib/admin/use-admin-open';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { adminBroadcastKey, adminBroadcastPreviewKey, loadAdminBroadcast, type AdminBroadcast, type AdminBroadcastPreview } from '@/lib/api/admin-broadcasts';
import { ApiError, unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { AdminAnnouncement, AdminSkeleton } from '@/routes/admin-parts';
import { href, navigate } from '@/routes/route-table';

import { BroadcastGestures } from './admin-broadcast-gestures';
import { AudienceSection, BroadcastMeta, ContentSection, EmailSection, InAppSection, PeopleSection, TranslationsSection } from './admin-broadcast-sections';

/**
 * **LA FICHE D'UNE DIFFUSION** (#8876, #6731) — `/admin/broadcasts/$broadcast`.
 *
 * Tout ce qu'il faut pour DÉCIDER sans quitter la page : le contenu dans sa langue
 * d'écriture, ses traductions, à qui il part (en une phrase, puis — après la
 * préparation — par langue et par pays), où en est chaque canal de livraison, qui
 * l'a créée, envoyée, publiée. Puis les gestes que la passerelle sert pour l'état
 * où elle en est.
 *
 * **Elle se met à jour toute seule** tant qu'un envoi tourne (e-mail ou
 * publication dans l'application), toutes les dix secondes, sans jamais remplacer
 * ce qui est à l'écran par un spinner. Au repos, elle ne frappe pas la
 * passerelle.
 *
 * **Lue par sections** (spec 2026-10-04 § 3) : l'en-tête, les gestes, les avis
 * d'état et le bandeau restent visibles ; le contenu, les traductions,
 * l'audience, les deux canaux et les personnes sont des cartes résumées qui
 * ouvrent chacune sa modale (`?open=<id>`).
 *
 * Fail-closed comme la liste : `canManageNotifications` ; un 403 malgré tout se
 * rend comme un refus, un 404 comme « cette diffusion n'existe plus ».
 */
const defaultNow = (): Date => new Date();

type BroadcastPanelProps = {
  readonly language: AdminLanguage;
  readonly broadcastId: string;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
  /** L'intervalle de relecture d'une diffusion qui avance ; dix secondes en production, réglable pour les témoins. */
  readonly pollMs?: number;
};

const STARTED = ['SENDING', 'SENT', 'FAILED'];

export function AdminBroadcastPanel({ language, broadcastId, deps = apiDeps, now = defaultNow, pollMs = BROADCAST_POLL_MS }: BroadcastPanelProps) {
  const reach = useAdminReach();
  const online = useOnline();
  const announcer = useLiveAnnouncer();
  const sections = useAdminOpen(ADMIN_BROADCAST_SECTIONS);
  const cardsTitle = useId();

  const query = useQuery({
    queryKey: adminBroadcastKey(broadcastId),
    queryFn: async ({ signal }) => unwrap(await loadAdminBroadcast({ ...deps, broadcastId, signal })),
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (current) => broadcastPollInterval(current.state.data, pollMs),
  });
  const broadcast: AdminBroadcast | undefined = query.data;

  /* L'aperçu de préparation n'est jamais relu : il est POSÉ dans le cache par le geste qui le produit, et cette lecture ne fait que s'y abonner. */
  const prepared = useQuery<AdminBroadcastPreview>({
    queryKey: adminBroadcastPreviewKey(broadcastId),
    queryFn: () => Promise.reject(new Error('aperçu de préparation non relisible')),
    enabled: false,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const preview = prepared.data;

  const listTarget = { kind: 'section', section: 'broadcasts' } as const;

  if (broadcast === undefined) {
    if (query.isPending) {
      return (
        <div aria-busy="true" aria-label={translateAdmin(language, 'admin.broadcast.fiche.loading')} data-admin-broadcast-loading>
          <AdminSkeleton rows={4} />
        </div>
      );
    }
    const status = query.error instanceof ApiError ? query.error.status : 0;
    if (status === 403) return <AdminDeniedInline language={language} />;
    if (status === 404) {
      return (
        <AdminEmptyState
          glyph="megaphone"
          title={translateAdmin(language, 'admin.broadcast.fiche.notFound')}
          hint={translateAdmin(language, 'admin.broadcast.fiche.notFoundHint')}
          action={
            <AdminLink
              target={listTarget}
              anchor="back-to-list"
              className="inline-flex items-center rounded-chip px-5 text-body font-semibold text-ios-on-brand"
              style={{ minHeight: 44, backgroundColor: 'var(--color-ios-brand)' }}
            >
              {translateAdmin(language, 'admin.broadcast.fiche.back')}
            </AdminLink>
          }
        />
      );
    }
    return <AdminErrorState language={language} onRetry={() => void query.refetch()} />;
  }

  const clock = now();
  const title = broadcastLabel(broadcast, language);
  const status = interpretBroadcastStatus(broadcast.status, language);
  const created = adminMomentOf(broadcast.createdAt, clock, language);
  const when = created?.relative ?? '—';
  const started = STARTED.includes(broadcast.status);
  const inApp = inAppStateOf(broadcast);
  const recipients = recipientsToReach(broadcast, preview, 'email');
  /* Le compte in-app n'est connu qu'après une préparation servie par un serveur à jour (01402058e7). */
  const inAppRecipients = preview?.inAppRecipients ?? null;
  const inAppFailed = inApp === 'failed';
  const count = (value: number) => formatCount(value, language);
  const secondary =
    broadcast.createdBy === null
      ? translateAdmin(language, 'admin.broadcast.fiche.created', { when })
      : translateAdmin(language, 'admin.broadcast.fiche.createdBy', { when, author: personLabel(broadcast.createdBy, language) });

  const stats = [
    { id: 'recipients', label: translateAdmin(language, 'admin.broadcast.stat.recipients'), value: broadcast.status === 'DRAFT' ? '—' : count(recipients) },
    { id: 'sent', label: translateAdmin(language, 'admin.broadcast.stat.sent'), value: started ? count(broadcast.sentCount) : '—' },
    { id: 'failed', label: translateAdmin(language, 'admin.broadcast.stat.failed'), value: started ? count(broadcast.failedCount) : '—' },
    {
      id: 'inApp',
      label: translateAdmin(language, 'admin.broadcast.stat.inApp'),
      value: inApp === 'never' ? translateAdmin(language, 'admin.broadcast.inApp.never') : count(broadcast.inAppSentCount),
    },
  ];

  /** Le contenu de chaque modale : le bloc d'hier, tel quel — monté seulement à l'ouverture. */
  const detail = (section: AdminBroadcastSection): ReactNode => {
    switch (section) {
      case 'content':
        return <ContentSection language={language} broadcast={broadcast} />;
      case 'translations':
        return <TranslationsSection language={language} broadcast={broadcast} />;
      case 'audience':
        return <AudienceSection language={language} broadcast={broadcast} preview={preview} />;
      case 'email':
        return <EmailSection language={language} broadcast={broadcast} now={clock} />;
      case 'inApp':
        return <InAppSection language={language} broadcast={broadcast} now={clock} />;
      case 'people':
        return <PeopleSection language={language} broadcast={broadcast} />;
    }
  };

  return (
    <div className="grid gap-6" data-admin-broadcast-fiche>
      <AdminPageHeader
        language={language}
        title={title}
        crumbs={[
          { label: translateAdmin(language, 'admin.group.growth') },
          { label: translateAdmin(language, 'admin.nav.broadcasts'), target: listTarget },
          { label: title },
        ]}
      />
      <AdminOfflineNotice language={language} />
      {broadcast.status === 'FAILED' || inAppFailed ? (
        <AdminInlineNotice
          tone="danger"
          text={
            /* Un échec de la publication dans l'application passe aussi la diffusion à FAILED (01402058e7) : l'avis dit QUEL canal a échoué. */
            inAppFailed
              ? broadcast.errorMessage === null
                ? translateAdmin(language, 'admin.broadcast.notice.inAppFailedNoMessage')
                : translateAdmin(language, 'admin.broadcast.notice.inAppFailed', { message: broadcast.errorMessage })
              : broadcast.errorMessage === null
                ? translateAdmin(language, 'admin.broadcast.notice.failedNoMessage')
                : translateAdmin(language, 'admin.broadcast.notice.failed', { message: broadcast.errorMessage })
          }
        />
      ) : null}
      {broadcast.status === 'SENDING' ? <AdminInlineNotice tone="info" text={translateAdmin(language, 'admin.broadcast.notice.sending')} /> : null}
      {broadcast.status !== 'SENDING' && inApp === 'running' ? <AdminInlineNotice tone="info" text={translateAdmin(language, 'admin.broadcast.notice.inAppRunning')} /> : null}
      {broadcast.status === 'READY' && recipients === 0 ? (
        <AdminInlineNotice
          tone="warning"
          text={translateAdmin(language, inAppRecipients === 0 ? 'admin.broadcast.notice.noRecipients' : 'admin.broadcast.notice.noEmailRecipients')}
        />
      ) : null}
      <AdminFiche
        kind="broadcast"
        header={
          <AdminIdentityHeader
            language={language}
            title={title}
            secondary={secondary}
            glyph="megaphone"
            badges={<AdminInterpretedBadge value={status} />}
            actions={
              <BroadcastGestures
                language={language}
                broadcast={broadcast}
                preview={preview}
                deps={deps}
                online={online}
                now={now}
                announce={announcer.announce}
                onDeleted={() => navigate(href(reach.space === 'adm' ? 'admBroadcasts' : 'adminBroadcasts'))}
              />
            }
          />
        }
        stats={<AdminStatStrip items={stats} />}
        aside={<BroadcastMeta language={language} broadcast={broadcast} now={clock} onAnnounce={announcer.announce} />}
      >
        <section aria-labelledby={cardsTitle} className="@container grid gap-3" data-admin-broadcast-cards>
          <h2 id={cardsTitle} className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {translateAdmin(language, 'admin.broadcast.cards.title')}
          </h2>
          <AdminSummaryGrid>
            {ADMIN_BROADCAST_SECTIONS.map((section) => {
              const summary = broadcastSummaryOf(section, broadcast, preview, language);
              return (
                <AdminSummaryCard
                  key={section}
                  language={language}
                  id={section}
                  title={translateAdmin(language, ADMIN_BROADCAST_SECTION_TITLES[section])}
                  glyph={ADMIN_BROADCAST_SECTION_GLYPHS[section]}
                  values={summary.values}
                  sentence={summary.sentence}
                  onOpen={() => sections.open(section)}
                />
              );
            })}
          </AdminSummaryGrid>
        </section>
      </AdminFiche>
      {ADMIN_BROADCAST_SECTIONS.map((section) => (
        <AdminDetailSheet
          key={section}
          language={language}
          id={`broadcast-${section}`}
          title={translateAdmin(language, ADMIN_BROADCAST_SECTION_TITLES[section])}
          open={sections.active === section}
          onClose={sections.close}
          inAddress={sections.inAddress}
        >
          <div className="grid gap-6" data-admin-broadcast-panel={section}>
            {detail(section)}
          </div>
        </AdminDetailSheet>
      ))}
      <AdminAnnouncement text={announcer.text} />
    </div>
  );
}

export default function AdminBroadcastScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);
  const { broadcast: broadcastId } = useParams<'/admin/broadcasts/$broadcast'>();

  return (
    <AdminSectionScreen section="broadcasts" language={language} title={translateAdmin(language, 'admin.nav.broadcasts')}>
      {() => <AdminBroadcastPanel language={language} broadcastId={broadcastId} />}
    </AdminSectionScreen>
  );
}
