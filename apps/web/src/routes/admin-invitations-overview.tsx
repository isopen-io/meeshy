import { useQuery } from '@tanstack/react-query';

import { AdminStatCard, AdminStatGrid } from '@/components/admin/stat-card';
import { AdminTimelineChart } from '@/components/admin/charts/timeline-chart';
import { formatCount, formatPercent } from '@/lib/admin/interpret/numbers';
import { invitationSeries } from '@/lib/admin/invitation-model';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_INVITATIONS_STATS_KEY,
  ADMIN_INVITATIONS_TIMELINE_KEY,
  loadAdminInvitationDays,
  loadAdminInvitationStats,
} from '@/lib/api/admin-invitations';
import { unwrap } from '@/lib/api/client';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE BANDEAU DES DEMANDES DE CONTACT** (#8876, #6729) — six chiffres et la courbe
 * des sept derniers jours, au-dessus de la liste. Chacun a son squelette, son
 * erreur avec « Réessayer », et ne bloque jamais l'autre ni la liste.
 *
 * Trois cartes mènent à la liste FILTRÉE sur leur statut. `byType` n'est pas
 * affiché : malgré son nom, c'est une répartition par statut, que les cartes
 * disent déjà. Le taux d'acceptation est servi sur 0–100 (`hundred`).
 */
export function InvitationsOverview({ language, deps }: { readonly language: InterfaceLanguage; readonly deps: AdminDeps }) {
  const stats = useQuery({
    queryKey: ADMIN_INVITATIONS_STATS_KEY,
    queryFn: async ({ signal }) => unwrap(await loadAdminInvitationStats({ ...deps, signal })),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const timeline = useQuery({
    queryKey: ADMIN_INVITATIONS_TIMELINE_KEY,
    queryFn: async ({ signal }) => unwrap(await loadAdminInvitationDays({ ...deps, signal })),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const cardState = stats.data !== undefined ? 'ready' : stats.isPending ? 'loading' : 'error';
  const retryStats = () => void stats.refetch();
  const value = stats.data;
  const card = (anchor: string, label: string, text: string, extra: { readonly caption?: string; readonly status?: 'pending' | 'accepted' | 'rejected' } = {}) => (
    <AdminStatCard
      key={anchor}
      language={language}
      anchor={anchor}
      label={label}
      value={text}
      state={cardState}
      onRetry={retryStats}
      {...(extra.caption === undefined ? {} : { caption: extra.caption })}
      {...(extra.status === undefined ? {} : { target: { kind: 'section' as const, section: 'invitations' as const, search: { status: extra.status } } })}
    />
  );

  const series = timeline.data === undefined ? null : invitationSeries(timeline.data, language);
  const chartState = timeline.data !== undefined ? 'ready' : timeline.isPending ? 'loading' : 'error';
  const peak = series === null ? null : series.peak;
  const summary =
    peak === null
      ? translateAdmin(language, 'admin.invitation.chart.quiet')
      : translateAdmin(language, 'admin.invitation.chart.summary', { day: peak.day, count: formatCount(peak.sent, language) });

  return (
    <div className="grid gap-4" data-admin-invitations-overview>
      <AdminStatGrid columns={3}>
        {card('total', translateAdmin(language, 'admin.invitation.stat.total'), formatCount(value?.total, language))}
        {card('pending', translateAdmin(language, 'admin.invitation.stat.pending'), formatCount(value?.pending, language), {
          caption: translateAdmin(language, 'admin.invitation.stat.pending.caption'),
          status: 'pending',
        })}
        {card('accepted', translateAdmin(language, 'admin.invitation.stat.accepted'), formatCount(value?.accepted, language), { status: 'accepted' })}
        {card('rejected', translateAdmin(language, 'admin.invitation.stat.rejected'), formatCount(value?.rejected, language), { status: 'rejected' })}
        {card('recent', translateAdmin(language, 'admin.invitation.stat.recent'), formatCount(value?.recent, language))}
        {card('rate', translateAdmin(language, 'admin.invitation.stat.rate'), formatPercent(value?.acceptanceRate, 'hundred', language), {
          caption: translateAdmin(language, 'admin.invitation.stat.rate.caption'),
        })}
      </AdminStatGrid>
      <AdminTimelineChart
        language={language}
        id="invitations-timeline"
        title={translateAdmin(language, 'admin.invitation.chart.title')}
        series={[
          { key: 'sent', label: translateAdmin(language, 'admin.invitation.chart.sent'), points: series?.sent ?? [] },
          { key: 'accepted', label: translateAdmin(language, 'admin.invitation.chart.accepted'), points: series?.accepted ?? [] },
          { key: 'rejected', label: translateAdmin(language, 'admin.invitation.chart.rejected'), points: series?.rejected ?? [] },
        ]}
        format={(count) => formatCount(count, language)}
        summary={summary}
        state={chartState}
        onRetry={() => void timeline.refetch()}
      />
    </div>
  );
}
