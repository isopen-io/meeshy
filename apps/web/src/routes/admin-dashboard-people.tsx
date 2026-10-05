import { AdminBarChart } from '@/components/admin/charts/bar-chart';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { useDashBlock } from '@/lib/admin/dashboard-block';
import { recentMemberRows } from '@/lib/admin/dashboard-rows';
import { rankedConversationsView, rankedMembersView } from '@/lib/admin/dashboard-series';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { loadAdminRankedConversations, loadAdminRankedMembers, loadAdminRecentMembers } from '@/lib/api/admin-overview-queue';
import { translateAdmin } from '@/lib/i18n-admin-catalog';

import { chartStateOf, DashBody, DashChartFrame, DashEmptyLine, DashListCard, DashMore, DashSection, retryOf, type DashContext } from './admin-dashboard-parts';

/**
 * **LA ZONE « PERSONNES ET ÉCHANGES »** (#8876, § 4) — les cinq derniers
 * inscrits et les deux classements de la semaine (conversations, membres).
 * Partout des NOMS : un inscrit est son nom affiché et son @pseudo, une
 * conversation son titre, un membre classé son nom — chacun ouvre sa fiche si
 * le lecteur peut l'ouvrir (le lien d'une conversation exige le rang
 * d'administration : `AdminBarChart` le rend en simple étiquette sinon).
 *
 * Les derniers inscrits se relisent au plus toutes les cinq minutes : chaque
 * lecture de la liste des comptes écrit une trace d'audit (`VIEW_USER_LIST`),
 * et un tableau de bord qui en écrirait une à chaque retour sur l'écran
 * noierait le journal.
 */
const FIVE_MINUTES = 5 * 60_000;

export function MembersBlock({ language, deps, now }: DashContext) {
  const block = useDashBlock({
    key: ['members'],
    load: (signal) => loadAdminRecentMembers({ ...deps, signal }),
    staleTime: FIVE_MINUTES,
  });
  const title = translateAdmin(language, 'admin.dash.members.title');

  return (
    <DashSection id="members" title={title} busy={block.status === 'loading'}>
      <DashBody language={language} title={title} block={block} rows={4}>
        {(members) => {
          const rows = recentMemberRows(members, now, language);
          return (
            <DashListCard>
              {rows.length === 0 ? (
                <DashEmptyLine text={translateAdmin(language, 'admin.dash.members.empty')} />
              ) : (
                <ul className="grid">
                  {rows.map((row) => (
                    <li key={row.id} data-admin-row={row.id}>
                      <AdminEntityChip
                        language={language}
                        entity={{ kind: 'user', id: row.id, label: row.label, secondary: row.secondary, avatarUrl: row.avatar }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </DashListCard>
          );
        }}
      </DashBody>
      {block.status === 'ready' ? <DashMore language={language} target={{ kind: 'section', section: 'users' }} /> : null}
    </DashSection>
  );
}

export function RankedConversationsChart({ language, deps }: DashContext) {
  const block = useDashBlock({
    key: ['rank-conversations'],
    load: (signal) => loadAdminRankedConversations({ ...deps, signal }),
    staleTime: FIVE_MINUTES,
  });
  const view = block.status === 'ready' ? rankedConversationsView(block.data, language) : { data: [], summary: '' };
  const retry = retryOf(block);

  return (
    <DashChartFrame language={language} block={block} more={{ kind: 'section', section: 'conversations' }}>
      <AdminBarChart
        language={language}
        id="rank-conversations"
        title={translateAdmin(language, 'admin.dash.rank.conversations.title')}
        data={view.data}
        format={(value) => formatCount(value, language)}
        summary={view.summary}
        state={chartStateOf(block)}
        {...(retry === undefined ? {} : { onRetry: retry })}
      />
    </DashChartFrame>
  );
}

export function RankedMembersChart({ language, deps }: DashContext) {
  const block = useDashBlock({
    key: ['rank-members'],
    load: (signal) => loadAdminRankedMembers({ ...deps, signal }),
    staleTime: FIVE_MINUTES,
  });
  const view = block.status === 'ready' ? rankedMembersView(block.data, language) : { data: [], summary: '' };
  const retry = retryOf(block);

  return (
    <DashChartFrame language={language} block={block} more={{ kind: 'section', section: 'users' }}>
      <AdminBarChart
        language={language}
        id="rank-members"
        title={translateAdmin(language, 'admin.dash.rank.members.title')}
        data={view.data}
        format={(value) => formatCount(value, language)}
        summary={view.summary}
        state={chartStateOf(block)}
        {...(retry === undefined ? {} : { onRetry: retry })}
      />
    </DashChartFrame>
  );
}
