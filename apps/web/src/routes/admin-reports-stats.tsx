import { useQuery } from '@tanstack/react-query';

import { AdminShareChart } from '@/components/admin/charts/share-chart';
import { AdminStatCard, AdminStatGrid } from '@/components/admin/stat-card';
import { interpretReportStatus, interpretReportType, interpretReportedEntity } from '@/lib/admin/interpret/enums';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { formatDuration } from '@/lib/admin/interpret/time';
import type { AdminDeps } from '@/lib/api/admin';
import { unwrap } from '@/lib/api/client';
import {
  ADMIN_REPORTS_STATS_KEY,
  loadAdminReportStats,
  type AdminReportCount,
  type AdminReportStats,
} from '@/lib/api/admin-reports';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE BANDEAU DE LA FILE DE MODÉRATION** (#8876, #6726) — `GET /admin/reports/stats`.
 *
 * Les cinq cartes d'état POSENT LE FILTRE de la liste (un clic = un statut) ;
 * la sixième dit le délai moyen de résolution **hors dossiers classés sans
 * suite** — ceux-ci n'ont pas de date de résolution, et la carte le dit plutôt
 * que de laisser croire que la moyenne les compte. Dessous, deux répartitions
 * (motifs, genres de contenu) quand il y a de quoi répartir.
 *
 * Trois états par carte, sans saut de mise en page : prête, squelette, erreur
 * avec « Réessayer » — l'échec des statistiques ne vide jamais la liste.
 */
type StatusCard = { readonly status: string; readonly count: (stats: AdminReportStats) => number };

const STATUS_CARDS: readonly StatusCard[] = [
  { status: 'pending', count: (stats) => stats.pending },
  { status: 'under_review', count: (stats) => stats.underReview },
  { status: 'resolved', count: (stats) => stats.resolved },
  { status: 'rejected', count: (stats) => stats.rejected },
  { status: 'dismissed', count: (stats) => stats.dismissed },
];

const INK = 'var(--color-ios-ink)';

function shareData(counts: readonly AdminReportCount[], labelOf: (key: string) => string) {
  return counts.map((entry) => ({ key: entry.key, label: labelOf(entry.key), value: entry.count }));
}

export function AdminReportsStats({ language, deps }: { readonly language: InterfaceLanguage; readonly deps: AdminDeps }) {
  const query = useQuery({
    queryKey: ADMIN_REPORTS_STATS_KEY,
    queryFn: async ({ signal }) => unwrap(await loadAdminReportStats({ ...deps, signal })),
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const stats = query.data;
  const state = stats !== undefined ? 'ready' : query.isPending ? 'loading' : 'error';
  const retry = () => void query.refetch();
  const closedWithDate = stats === undefined ? 0 : stats.resolved + stats.rejected;
  const topOf = (counts: readonly AdminReportCount[], labelOf: (key: string) => string): string => {
    const first = counts[0];
    return first === undefined
      ? ''
      : translateAdmin(language, 'admin.moderation.stats.top', { label: labelOf(first.key), count: formatCount(first.count, language) });
  };
  const typeLabel = (key: string) => interpretReportType(key, language).label;
  const kindLabel = (key: string) => interpretReportedEntity(key, language).label;

  return (
    <section aria-labelledby="admin-moderation-stats" data-admin-moderation-stats className="grid gap-3">
      <h2 id="admin-moderation-stats" className="text-title font-semibold" style={{ color: INK }}>
        {translateAdmin(language, 'admin.moderation.stats.heading')}
      </h2>
      <AdminStatGrid columns={3}>
        {STATUS_CARDS.map((card) => (
          <AdminStatCard
            key={card.status}
            language={language}
            anchor={card.status}
            label={interpretReportStatus(card.status, language).label}
            value={stats === undefined ? '' : formatCount(card.count(stats), language)}
            {...(stats === undefined
              ? {}
              : { caption: translateAdmin(language, 'admin.moderation.stats.ofTotal', { total: formatCount(stats.total, language) }) })}
            target={{ kind: 'section', section: 'reports', search: { status: card.status } }}
            state={state}
            onRetry={retry}
          />
        ))}
        <AdminStatCard
          language={language}
          anchor="average"
          label={translateAdmin(language, 'admin.moderation.stats.average')}
          value={stats === undefined || closedWithDate === 0 ? '—' : formatDuration(stats.averageResolutionHours * 3600, 's', language)}
          caption={translateAdmin(language, closedWithDate === 0 && stats !== undefined ? 'admin.moderation.stats.averageNone' : 'admin.moderation.stats.averageNote')}
          state={state}
          onRetry={retry}
        />
      </AdminStatGrid>
      {stats === undefined || stats.total === 0 ? null : (
        <div className="grid gap-3 md:grid-cols-2 md:gap-4">
          <AdminShareChart
            language={language}
            id="reasons"
            title={translateAdmin(language, 'admin.moderation.stats.byType')}
            data={shareData(stats.byType, typeLabel)}
            format={(value) => formatCount(value, language)}
            summary={topOf(stats.byType, typeLabel)}
          />
          <AdminShareChart
            language={language}
            id="kinds"
            title={translateAdmin(language, 'admin.moderation.stats.byKind')}
            data={shareData(stats.byReportedType, kindLabel)}
            format={(value) => formatCount(value, language)}
            summary={topOf(stats.byReportedType, kindLabel)}
          />
        </div>
      )}
    </section>
  );
}
