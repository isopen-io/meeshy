import { agentStats, healthAlerts, healthStats, moderationStats, nowStats, platformStats, usageStats } from '@/lib/admin/dashboard-cards';
import { useDashBlock } from '@/lib/admin/dashboard-block';
import { loadAdminDashboard } from '@/lib/api/admin-dashboard';
import { loadAdminKpis, loadAdminRealtime } from '@/lib/api/admin-overview';
import { loadAdminAgentDigest, loadAdminMonitoring, loadAdminReportsQueue } from '@/lib/api/admin-overview-queue';
import { AdminInlineNotice } from '@/components/admin/states';

import { DashStats, type DashContext } from './admin-dashboard-parts';

/**
 * **LES BLOCS DE CARTES DU TABLEAU DE BORD** (#8876, § 4) — chaque bloc lit SA
 * route (`useDashBlock`), dit ses valeurs par `dashboard-cards.ts` et laisse
 * `DashStats` dessiner l'état : squelette, cartes, erreur avec « Réessayer »,
 * refus. Un bloc qui échoue n'empêche jamais celui d'à côté.
 *
 * Fraîcheurs : le temps réel se relit toutes les minutes (seulement si l'onglet
 * est visible, `visibleInterval`) ; les totaux de la plateforme sont servis
 * depuis un cache serveur de dix minutes, inutile de les relire plus souvent
 * qu'une minute ; les taux (cinq minutes) et la santé (trente secondes) se
 * relisent au remontage de l'écran quand ils sont périmés — jamais en faisant
 * disparaître ce qui est déjà affiché.
 */
const MINUTE = 60_000;

export function NowBlock({ language, deps }: DashContext) {
  const block = useDashBlock({
    key: ['realtime'],
    load: (signal) => loadAdminRealtime({ ...deps, signal }),
    staleTime: 30_000,
    refetchEvery: () => MINUTE,
  });
  return <DashStats language={language} id="realtime" block={block} stats={nowStats(block.status === 'ready' ? block.data : null, language)} columns={3} />;
}

export function PlatformBlock({ language, deps }: DashContext) {
  const block = useDashBlock({
    key: ['platform'],
    load: (signal) => loadAdminDashboard({ ...deps, signal }),
    staleTime: MINUTE,
  });
  return <DashStats language={language} id="platform" block={block} stats={platformStats(block.status === 'ready' ? block.data : null, language)} columns={4} />;
}

export function UsageBlock({ language, deps }: DashContext) {
  const block = useDashBlock({
    key: ['kpis'],
    load: (signal) => loadAdminKpis({ ...deps, signal }),
    staleTime: 5 * MINUTE,
  });
  return <DashStats language={language} id="kpis" block={block} stats={usageStats(block.status === 'ready' ? block.data : null, language)} columns={4} />;
}

export function ModerationStatsBlock({ language, deps }: DashContext) {
  const block = useDashBlock({
    key: ['reports-stats'],
    load: (signal) => loadAdminReportsQueue({ ...deps, signal }),
    staleTime: MINUTE,
  });
  return <DashStats language={language} id="reports-stats" block={block} stats={moderationStats(block.status === 'ready' ? block.data : null, language)} columns={3} />;
}

export function HealthBlock({ language, deps }: DashContext) {
  const block = useDashBlock({
    key: ['monitoring'],
    load: (signal) => loadAdminMonitoring({ ...deps, signal }),
    staleTime: 30_000,
  });
  const alerts = block.status === 'ready' ? healthAlerts(block.data, language) : [];
  return (
    <div className="grid gap-3">
      {alerts.length === 0 ? null : <AdminInlineNotice tone="danger" text={alerts.join(' ')} />}
      <DashStats language={language} id="monitoring" block={block} stats={healthStats(block.status === 'ready' ? block.data : null, language)} columns={4} />
    </div>
  );
}

export function AgentBlock({ language, deps, now }: DashContext) {
  const block = useDashBlock({
    key: ['agent'],
    load: (signal) => loadAdminAgentDigest({ ...deps, signal }),
    staleTime: MINUTE,
  });
  return <DashStats language={language} id="agent" block={block} stats={agentStats(block.status === 'ready' ? block.data : null, now, language)} columns={3} />;
}
