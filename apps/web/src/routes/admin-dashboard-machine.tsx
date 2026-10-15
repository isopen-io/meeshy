import { useQuery } from '@tanstack/react-query';

import { AdminLink } from '@/components/admin/entity-chip';
import { EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { latestGauges } from '@/lib/admin/host-metrics';
import { formatBytes, formatPercent } from '@/lib/admin/interpret/numbers';
import { ADMIN_OPS_METRICS_KEY, loadHostMetrics } from '@/lib/api/admin-ops';
import { unwrap } from '@/lib/api/client';
import { translateAdmin } from '@/lib/i18n-admin-catalog';

import type { DashContext } from './admin-dashboard-parts';

/**
 * **LA MACHINE, EN TÊTE DU TABLEAU DE BORD** (#10396) — trois jauges (processeur,
 * mémoire, disque) de la dernière mesure de l'hôte, et le chemin vers l'écran des
 * opérations. Rang d'administration seulement ; une lecture qui échoue ne dessine
 * RIEN (le tableau de bord ne se bloque pas sur la machine). La même clé de cache que
 * l'écran des opérations : l'ouvrir ensuite est immédiat.
 */
export function MachineBand({ language, deps }: DashContext) {
  const query = useQuery({
    queryKey: ADMIN_OPS_METRICS_KEY,
    queryFn: async ({ signal }) => unwrap(await loadHostMetrics({ ...deps, signal })),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const gauges = query.data === undefined ? null : latestGauges(query.data);
  if (gauges === null) return null;
  const pct = (value: number) => formatPercent(value, 'hundred', language);
  const cells = [
    { id: 'cpu', label: translateAdmin(language, 'admin.ops.gauge.cpu'), value: pct(gauges.cpuPercent) },
    { id: 'memory', label: translateAdmin(language, 'admin.ops.gauge.memory'), value: pct(gauges.memoryPercent) },
    { id: 'disk', label: translateAdmin(language, 'admin.ops.gauge.disk'), value: `${pct(gauges.diskPercent)} · ${formatBytes(gauges.diskFreeBytes, language)}` },
  ];
  return (
    <section data-admin-dash-machine aria-label={translateAdmin(language, 'admin.ops.dash.title')} className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card px-4 py-3" style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}>
      <span className="text-body font-semibold" style={{ color: INK }}>
        {translateAdmin(language, 'admin.ops.dash.title')}
      </span>
      {cells.map((cell) => (
        <span key={cell.id} data-admin-dash-gauge={cell.id} className="inline-flex items-baseline gap-2 text-body tabular-nums">
          <span className="text-caption" style={{ color: INK2 }}>
            {cell.label}
          </span>
          <span style={{ color: INK }}>{cell.value}</span>
        </span>
      ))}
      <AdminLink target={{ kind: 'section', section: 'operations' }} anchor="dash-machine-more" className="ms-auto inline-flex items-center rounded-chip px-3 text-caption font-medium" style={{ minHeight: 44, color: 'var(--color-ios-brand)' }}>
        {translateAdmin(language, 'admin.ops.dash.more')}
      </AdminLink>
    </section>
  );
}
