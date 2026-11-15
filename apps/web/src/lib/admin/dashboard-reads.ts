import { loadAdminDashboard, type AdminDashboard } from '@/lib/api/admin-dashboard';
import type { AdminDeps } from '@/lib/api/admin';
import { loadAdminKpis, loadAdminRealtime, type AdminKpis, type AdminRealtime } from '@/lib/api/admin-overview';
import {
  loadAdminAgentDigest,
  loadAdminMonitoring,
  loadAdminReportsQueue,
  loadAdminSendingBroadcasts,
  type AdminAgentDigest,
  type AdminMonitoring,
  type AdminReportsQueue,
  type AdminSendingBroadcasts,
} from '@/lib/api/admin-overview-queue';

import type { DashRead } from './dashboard-block';

/**
 * **LES LECTURES LÉGÈRES DU HUB** (spec 2026-10-04 § 2) — celles dont les cartes
 * résumées tirent leurs chiffres, écrites UNE fois : la carte du hub et le bloc de
 * sa modale lisent la MÊME clé, donc un seul aller-retour, et la modale s'ouvre sur
 * des chiffres déjà là. Les lectures LOURDES (graphiques, classements, listes) ne
 * sont pas ici : elles ne partent qu'à l'ouverture de leur modale.
 *
 * Fraîcheurs : le temps réel se relit chaque minute (onglet visible) ; les totaux
 * de la plateforme viennent d'un cache serveur de dix minutes ; les taux valent
 * cinq minutes ; la santé trente secondes ; les diffusions en cours se relisent
 * toutes les quinze secondes tant qu'il y en a.
 */
const MINUTE = 60_000;

export const realtimeRead = (deps: AdminDeps): DashRead<AdminRealtime> => ({
  key: ['realtime'],
  load: (signal) => loadAdminRealtime({ ...deps, signal }),
  staleTime: 30_000,
  refetchEvery: () => MINUTE,
});

export const platformRead = (deps: AdminDeps): DashRead<AdminDashboard> => ({
  key: ['platform'],
  load: (signal) => loadAdminDashboard({ ...deps, signal }),
  staleTime: MINUTE,
});

export const kpisRead = (deps: AdminDeps): DashRead<AdminKpis> => ({
  key: ['kpis'],
  load: (signal) => loadAdminKpis({ ...deps, signal }),
  staleTime: 5 * MINUTE,
});

export const reportsQueueRead = (deps: AdminDeps): DashRead<AdminReportsQueue> => ({
  key: ['reports-stats'],
  load: (signal) => loadAdminReportsQueue({ ...deps, signal }),
  staleTime: MINUTE,
});

export const sendingBroadcastsRead = (deps: AdminDeps): DashRead<AdminSendingBroadcasts> => ({
  key: ['broadcasts-sending'],
  load: (signal) => loadAdminSendingBroadcasts({ ...deps, signal }),
  staleTime: 30_000,
  refetchEvery: (data) => (data !== undefined && data.rows.length > 0 ? 15_000 : false),
});

export const monitoringRead = (deps: AdminDeps): DashRead<AdminMonitoring> => ({
  key: ['monitoring'],
  load: (signal) => loadAdminMonitoring({ ...deps, signal }),
  staleTime: 30_000,
});

export const agentRead = (deps: AdminDeps): DashRead<AdminAgentDigest> => ({
  key: ['agent'],
  load: (signal) => loadAdminAgentDigest({ ...deps, signal }),
  staleTime: MINUTE,
});
