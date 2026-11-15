import { agentStats, healthAlerts, healthStats, moderationStats, nowStats, platformStats, usageStats } from '@/lib/admin/dashboard-cards';
import { useDashBlock } from '@/lib/admin/dashboard-block';
import { agentRead, kpisRead, monitoringRead, platformRead, realtimeRead, reportsQueueRead } from '@/lib/admin/dashboard-reads';
import { AdminInlineNotice } from '@/components/admin/states';

import { DashStats, type DashContext } from './admin-dashboard-parts';

/**
 * **LES BLOCS DE CARTES DU TABLEAU DE BORD** (#8876, § 4) — chaque bloc lit SA
 * route (`useDashBlock`, sur la lecture PARTAGÉE avec sa carte résumée du hub :
 * `dashboard-reads.ts`), dit ses valeurs par `dashboard-cards.ts` et laisse
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
export function NowBlock({ language, deps }: DashContext) {
  const block = useDashBlock(realtimeRead(deps));
  return <DashStats language={language} id="realtime" block={block} stats={nowStats(block.status === 'ready' ? block.data : null, language)} columns={3} />;
}

export function PlatformBlock({ language, deps }: DashContext) {
  const block = useDashBlock(platformRead(deps));
  return <DashStats language={language} id="platform" block={block} stats={platformStats(block.status === 'ready' ? block.data : null, language)} columns={4} />;
}

export function UsageBlock({ language, deps }: DashContext) {
  const block = useDashBlock(kpisRead(deps));
  return <DashStats language={language} id="kpis" block={block} stats={usageStats(block.status === 'ready' ? block.data : null, language)} columns={4} />;
}

export function ModerationStatsBlock({ language, deps }: DashContext) {
  const block = useDashBlock(reportsQueueRead(deps));
  return <DashStats language={language} id="reports-stats" block={block} stats={moderationStats(block.status === 'ready' ? block.data : null, language)} columns={3} />;
}

export function HealthBlock({ language, deps }: DashContext) {
  const block = useDashBlock(monitoringRead(deps));
  const alerts = block.status === 'ready' ? healthAlerts(block.data, language) : [];
  return (
    <div className="grid gap-3">
      {alerts.length === 0 ? null : <AdminInlineNotice tone="danger" text={alerts.join(' ')} />}
      <DashStats language={language} id="monitoring" block={block} stats={healthStats(block.status === 'ready' ? block.data : null, language)} columns={4} />
    </div>
  );
}

export function AgentBlock({ language, deps, now }: DashContext) {
  const block = useDashBlock(agentRead(deps));
  return <DashStats language={language} id="agent" block={block} stats={agentStats(block.status === 'ready' ? block.data : null, now, language)} columns={3} />;
}
