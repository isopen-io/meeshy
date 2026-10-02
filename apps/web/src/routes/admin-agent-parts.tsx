import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminStatCard, AdminStatGrid } from '@/components/admin/stat-card';
import { AdminOfflineNotice } from '@/components/admin/states';
import { formatCount } from '@/lib/admin/interpret/numbers';
import type { AdminDeps } from '@/lib/api/admin';
import { agentOverviewQueryKey, loadAgentOverview } from '@/lib/api/admin-agent';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { AdminAnnouncement } from '@/routes/admin-parts';

import { AgentLogDetailSheet, AgentLogList, AgentTrackedList } from './admin-agent-lists';

export { AgentConversationControl, AgentRelaunchControl } from './admin-agent-controls';

/**
 * **LA SECTION AGENT DE L'ADMINISTRATION** (#6733, #8876) — le panneau : trois
 * chiffres (conversations pilotées, membres pilotés, messages publiés), les
 * conversations suivies avec leur pilotage en ligne, et le journal des scans.
 *
 * Le périmètre est celui que le porteur a tranché : vue d'ensemble, conversations
 * suivies, relance / arrêt, journal. Les onglets LLM, sujets, rôles et file de
 * livraison sont un second lot — et AUCUNE remise à zéro ni modification du
 * modèle n'est exposée ici : ces deux gestes ne sont pas audités côté passerelle.
 *
 * ## Le panneau est monté SANS routeur par un témoin
 *
 * Séparé de l'écran routé pour qu'un témoin puisse le monter avec son propre
 * transport : un écran qui lit `apiDeps` au niveau du module n'est mesurable que
 * par un gate au navigateur. C'est le motif de `AdminConversationsPanel`.
 *
 * ## CACHE-FIRST, ET UNE COUPURE SE DIT
 *
 * Aucun squelette sur un cache non vide : les données déjà connues restent peintes
 * pendant le rafraîchissement. Une coupure certaine (`navigator.onLine === false`)
 * s'annonce, et désactive les gestes — elle ne se substitue pas à un échec de
 * requête, elle explique une absence que rien d'autre n'expliquerait.
 */
const defaultNow = (): Date => new Date();

export function AdminAgentPanel({
  language,
  deps = apiDeps,
  now = defaultNow,
}: {
  readonly language: AdminLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
}) {
  const announcer = useLiveAnnouncer();
  const [openLog, setOpenLog] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: agentOverviewQueryKey(),
    queryFn: async ({ signal }) => unwrap(await loadAgentOverview({ ...deps, signal })),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });

  const data = overview.data;
  const state = data === undefined ? (overview.isPending ? 'loading' : 'error') : 'ready';
  const retry = () => void overview.refetch();

  return (
    <div className="grid gap-6" data-admin-agent-panel>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.agent.title')}
        subtitle={translateAdmin(language, 'admin.agentPanel.subtitle')}
        crumbs={[{ label: translateAdmin(language, 'admin.group.platform') }, { label: translateAdmin(language, 'admin.nav.agent') }]}
      />
      <AdminOfflineNotice language={language} />

      <AdminStatGrid columns={3}>
        <AdminStatCard
          language={language}
          anchor="tracked"
          label={translateAdmin(language, 'admin.agentPanel.stat.tracked')}
          value={formatCount(data?.activeConfigs, language)}
          {...(data === undefined ? {} : { caption: translateAdmin(language, 'admin.agentPanel.stat.trackedCaption', { total: formatCount(data.totalConfigs, language) }) })}
          state={state}
          onRetry={retry}
        />
        <AdminStatCard
          language={language}
          anchor="users"
          label={translateAdmin(language, 'admin.agentPanel.stat.users')}
          value={formatCount(data?.totalControlledUsers, language)}
          state={state}
          onRetry={retry}
        />
        <AdminStatCard
          language={language}
          anchor="messages"
          label={translateAdmin(language, 'admin.agentPanel.stat.messages')}
          value={formatCount(data?.totalMessagesSent, language)}
          state={state}
          onRetry={retry}
        />
      </AdminStatGrid>

      <AdminFicheSection id="tracked" title={translateAdmin(language, 'admin.agent.tracked')}>
        <AgentTrackedList language={language} deps={deps} now={now} announce={announcer.announce} />
      </AdminFicheSection>

      <AdminFicheSection id="logs" title={translateAdmin(language, 'admin.agent.logs')}>
        <AgentLogList language={language} deps={deps} now={now} onOpen={setOpenLog} />
      </AdminFicheSection>

      {openLog === null ? null : <AgentLogDetailSheet logId={openLog} language={language} deps={deps} now={now} onClose={() => setOpenLog(null)} />}

      <AdminAnnouncement text={announcer.text} />
    </div>
  );
}
