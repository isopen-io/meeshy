import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminOfflineNotice } from '@/components/admin/states';
import { AdminTabs, useAdminTab } from '@/components/admin/tabs';
import { MONITORING_TABS } from '@/lib/admin/monitoring-state';
import type { AdminDeps } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { MonitoringHealth } from './admin-monitoring-health';
import { MonitoringRoutes } from './admin-monitoring-routes';

/**
 * **LA SUPERVISION** (#8876, #6734) — deux onglets dans l'adresse (`?tab=health|routes`) :
 *
 * - **Santé** : la plateforme en une lecture, relue toutes les trente secondes tant que
 *   l'écran est visible ;
 * - **Usage des routes** : qui appelle quelles adresses — la mesure qui décide d'un retrait.
 *
 * La section exige `canViewAnalytics` ET le rang d'administration : ce que l'écran rend
 * est une carte du fonctionnement interne du service (mémoire, coupe-circuits, latences),
 * pas de la donnée produit — la passerelle le garde pareil, route par route. Une seule
 * requête part, celle de l'onglet ouvert : l'autre n'est pas montée.
 */
const defaultNow = (): Date => new Date();

type MonitoringPanelProps = {
  readonly language: AdminLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
  /** La cadence de relecture de la santé, en ms — injectable pour les témoins. */
  readonly refreshMs?: number;
};

export function AdminMonitoringPanel({ language, deps = apiDeps, now = defaultNow, refreshMs }: MonitoringPanelProps) {
  const [tab, setTab] = useAdminTab(MONITORING_TABS, 'health');
  const tabLabel = translateAdmin(language, tab === 'health' ? 'admin.monitoring.tab.health' : 'admin.monitoring.tab.routes');

  return (
    <div className="grid gap-6" data-admin-monitoring>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.monitoring')}
        subtitle={translateAdmin(language, 'admin.monitoring.subtitle')}
        crumbs={[{ label: translateAdmin(language, 'admin.group.platform') }, { label: translateAdmin(language, 'admin.nav.monitoring') }]}
      />
      <AdminOfflineNotice language={language} />
      <AdminTabs
        label={translateAdmin(language, 'admin.monitoring.tabs.label')}
        tabs={[
          { id: 'health', label: translateAdmin(language, 'admin.monitoring.tab.health') },
          { id: 'routes', label: translateAdmin(language, 'admin.monitoring.tab.routes') },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div role="tabpanel" aria-label={tabLabel} data-admin-monitoring-panel={tab}>
        {tab === 'health' ? (
          <MonitoringHealth language={language} deps={deps} now={now} {...(refreshMs === undefined ? {} : { refreshMs })} />
        ) : (
          <MonitoringRoutes language={language} deps={deps} now={now} />
        )}
      </div>
    </div>
  );
}

export default function AdminMonitoringScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);

  return (
    <AdminSectionScreen section="monitoring" language={language} title={translateAdmin(language, 'admin.nav.monitoring')}>
      {() => <AdminMonitoringPanel language={language} />}
    </AdminSectionScreen>
  );
}
