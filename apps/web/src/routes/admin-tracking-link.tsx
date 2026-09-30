import { useQuery } from '@tanstack/react-query';

import { AdminLink } from '@/components/admin/entity-chip';
import { AdminFiche, AdminIdentityHeader, AdminStatStrip } from '@/components/admin/fiche';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState, AdminOfflineNotice } from '@/components/admin/states';
import { trackingLinkLabel } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import type { AdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { adminTrackingLinkKey, loadAdminTrackingLink } from '@/lib/api/admin-tracking-links';
import { ApiError, unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { AdminAnnouncement, AdminSkeleton } from '@/routes/admin-parts';

import { TrackingCharts } from './admin-tracking-link-charts';
import { TrackingLinkGestures } from './admin-tracking-link-gestures';
import { TrackingStateBadge } from './admin-tracking-link-parts';
import { CampaignSection, DestinationSection, RecentClicksSection, TargetSection, TrackingMeta } from './admin-tracking-link-sections';

/**
 * **LA FICHE D'UN LIEN DE SUIVI** (#8876, #6729) — `/admin/tracking-links/$link`.
 *
 * Tout ce qu'il faut pour juger une campagne sans quitter la page : la destination et
 * l'adresse courte (en texte, avec copie), la campagne, la cible NOMMÉE, ce que les
 * clics rapportent (courbe par jour, pays nommés, appareils, navigateurs, systèmes,
 * sources sociales, sites d'origine, redirections réussies / en attente / échouées) et
 * les vingt derniers clics — **sans IP, sans agent utilisateur, sans empreinte**. Puis
 * le geste : désactiver ou réactiver, au rang d'administration.
 *
 * Fail-closed comme la liste (`canViewAnalytics`) ; un 403 malgré tout se rend comme un
 * refus, un 404 comme « ce lien n'existe plus » — jamais comme une panne.
 */
const defaultNow = (): Date => new Date();

type TrackingLinkPanelProps = {
  readonly language: InterfaceLanguage;
  readonly linkId: string;
  readonly reach: AdminReach;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
};

export function AdminTrackingLinkPanel({ language, linkId, reach, deps = apiDeps, now = defaultNow }: TrackingLinkPanelProps) {
  const online = useOnline();
  const announcer = useLiveAnnouncer();

  const query = useQuery({
    queryKey: adminTrackingLinkKey(linkId),
    queryFn: async ({ signal }) => unwrap(await loadAdminTrackingLink({ ...deps, linkId, signal })),
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const link = query.data;
  const listTarget = { kind: 'section', section: 'trackingLinks' } as const;

  if (link === undefined) {
    if (query.isPending) {
      return (
        <div aria-busy="true" aria-label={translateAdmin(language, 'admin.tracking.fiche.loading')} data-admin-tracking-link-loading>
          <AdminSkeleton rows={4} />
        </div>
      );
    }
    const status = query.error instanceof ApiError ? query.error.status : 0;
    if (status === 403) return <AdminDeniedInline language={language} />;
    if (status === 404) {
      return (
        <AdminEmptyState
          glyph="target"
          title={translateAdmin(language, 'admin.tracking.fiche.notFound')}
          hint={translateAdmin(language, 'admin.tracking.fiche.notFoundHint')}
          action={
            <AdminLink
              target={listTarget}
              anchor="back-to-list"
              className="inline-flex items-center rounded-chip px-5 text-body font-semibold text-ios-on-brand"
              style={{ minHeight: 44, backgroundColor: 'var(--color-ios-brand)' }}
            >
              {translateAdmin(language, 'admin.tracking.fiche.back')}
            </AdminLink>
          }
        />
      );
    }
    return <AdminErrorState language={language} onRetry={() => void query.refetch()} />;
  }

  const clock = now();
  const title = trackingLinkLabel(link, language);
  const lastClick = adminMomentOf(link.lastClickedAt, clock, language);

  return (
    <div className="grid gap-6" data-admin-tracking-link-fiche>
      <AdminPageHeader
        language={language}
        title={title}
        crumbs={[
          { label: translateAdmin(language, 'admin.group.growth') },
          { label: translateAdmin(language, 'admin.nav.trackingLinks'), target: listTarget },
          { label: title },
        ]}
      />
      <AdminOfflineNotice language={language} />
      <AdminFiche
        kind="trackingLink"
        header={
          <AdminIdentityHeader
            language={language}
            title={title}
            {...(link.shortUrl === '' ? {} : { secondary: link.shortUrl })}
            glyph="target"
            badges={<TrackingStateBadge language={language} link={link} now={clock} />}
            actions={<TrackingLinkGestures language={language} link={link} reach={reach} deps={deps} online={online} announce={announcer.announce} />}
          />
        }
        stats={
          <AdminStatStrip
            items={[
              { id: 'clicks', label: translateAdmin(language, 'admin.tracking.strip.clicks'), value: formatCount(link.totalClicks, language) },
              { id: 'unique', label: translateAdmin(language, 'admin.tracking.strip.unique'), value: formatCount(link.uniqueClicks, language) },
              { id: 'confirmed', label: translateAdmin(language, 'admin.tracking.strip.confirmed'), value: formatCount(link.stats.confirmedClicks, language) },
              {
                id: 'lastClick',
                label: translateAdmin(language, 'admin.tracking.strip.lastClick'),
                value: lastClick === null ? translateAdmin(language, 'admin.tracking.lastClick.never') : lastClick.relative,
              },
            ]}
          />
        }
        aside={<TrackingMeta language={language} link={link} now={clock} onAnnounce={announcer.announce} />}
      >
        <DestinationSection language={language} link={link} onAnnounce={announcer.announce} />
        <CampaignSection language={language} link={link} />
        <TargetSection language={language} link={link} />
        <TrackingCharts language={language} link={link} />
        <RecentClicksSection language={language} link={link} now={clock} />
      </AdminFiche>
      <AdminAnnouncement text={announcer.text} />
    </div>
  );
}

export default function AdminTrackingLinkScreen() {
  const language = currentInterfaceLanguage();
  const { link: linkId } = useParams<'/admin/tracking-links/$link'>();

  return (
    <AdminSectionScreen section="trackingLinks" language={language} title={translateAdmin(language, 'admin.nav.trackingLinks')}>
      {(reach) => <AdminTrackingLinkPanel language={language} linkId={linkId} reach={reach} />}
    </AdminSectionScreen>
  );
}
