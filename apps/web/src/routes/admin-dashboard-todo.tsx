import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { INK2, TONE_COLOR } from '@/components/admin/tone';
import { useDashBlock } from '@/lib/admin/dashboard-block';
import { broadcastRows, recentReportRows } from '@/lib/admin/dashboard-rows';
import { formatPercent } from '@/lib/admin/interpret/numbers';
import { loadAdminRecentReports, loadAdminSendingBroadcasts } from '@/lib/api/admin-overview-queue';
import { translateAdmin } from '@/lib/i18n-admin-catalog';

import { ModerationStatsBlock } from './admin-dashboard-numbers';
import { DashBody, DashEmptyLine, DashListCard, DashMore, DashSection, type DashContext } from './admin-dashboard-parts';

/**
 * **LA ZONE « À TRAITER »** (#8876, § 4) — ce qui attend un geste : la file de
 * modération (deux compteurs, le délai, les signalements des dernières 24 h) et
 * les diffusions en cours d'envoi. Chaque bloc est gardé par la capacité de SA
 * route (`canModerateContent`, `canManageNotifications`) — c'est le panneau qui
 * le pose.
 *
 * Aucun texte signalé n'est lu ici : on NOMME ce qui est signalé (« Message de
 * Awa Diop »), le motif et le moment. Lire le contenu est un geste souverain
 * avec un motif écrit, ailleurs.
 */
const MINUTE = 60_000;

export function ModerationBlock(context: DashContext) {
  const { language, deps, now } = context;
  const block = useDashBlock({
    key: ['reports-recent'],
    load: (signal) => loadAdminRecentReports({ ...deps, signal }),
    staleTime: MINUTE,
  });
  const title = translateAdmin(language, 'admin.dash.moderation.recent');

  return (
    <DashSection id="moderation" title={translateAdmin(language, 'admin.dash.moderation.title')}>
      <ModerationStatsBlock {...context} />
      <h4 className="text-caption font-semibold" style={{ color: INK2 }}>
        {title}
      </h4>
      <DashBody language={language} title={title} block={block}>
        {(reports) => {
          const rows = recentReportRows(reports, now, language);
          return (
            <DashListCard>
              {rows.length === 0 ? (
                <DashEmptyLine text={translateAdmin(language, 'admin.dash.moderation.empty')} />
              ) : (
                <ul className="grid">
                  {rows.map((row) => (
                    <li key={row.id} data-admin-row={row.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <AdminEntityChip language={language} entity={{ kind: 'report', id: row.id, label: row.name, secondary: row.secondary }} />
                      </div>
                      <AdminInterpretedBadge value={row.status} />
                    </li>
                  ))}
                </ul>
              )}
            </DashListCard>
          );
        }}
      </DashBody>
      {block.status === 'ready' ? <DashMore language={language} target={{ kind: 'section', section: 'reports' }} /> : null}
    </DashSection>
  );
}

function ProgressBar({ percent, label }: { readonly percent: number; readonly label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-2 overflow-hidden rounded-full"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 14%, transparent)' }}
    >
      <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: 'var(--color-ios-brand)' }} />
    </div>
  );
}

export function BroadcastsBlock({ language, deps }: DashContext) {
  const block = useDashBlock({
    key: ['broadcasts-sending'],
    load: (signal) => loadAdminSendingBroadcasts({ ...deps, signal }),
    staleTime: 30_000,
    refetchEvery: (data) => (data !== undefined && data.rows.length > 0 ? 15_000 : false),
  });
  const title = translateAdmin(language, 'admin.dash.broadcasts.title');

  return (
    <DashSection id="broadcasts" title={title} busy={block.status === 'loading'}>
      <DashBody language={language} title={title} block={block} rows={2}>
        {(data) => {
          const { rows, more } = broadcastRows(data, language);
          return (
            <DashListCard>
              {rows.length === 0 ? (
                <DashEmptyLine text={translateAdmin(language, 'admin.dash.broadcasts.empty')} />
              ) : (
                <ul className="grid gap-4">
                  {rows.map((row) => (
                    <li key={row.id} data-admin-row={row.id} className="grid gap-2">
                      <AdminEntityChip language={language} entity={{ kind: 'broadcast', id: row.id, label: row.name, secondary: row.subject }} />
                      <ProgressBar
                        percent={row.percent}
                        label={translateAdmin(language, 'admin.dash.broadcasts.progressLabel', { name: row.name, percent: formatPercent(row.percent, 'hundred', language) })}
                      />
                      <p className="flex flex-wrap justify-between gap-x-3 text-caption" style={{ color: INK2 }}>
                        <span>{row.progress}</span>
                        {row.failed === null ? null : <span style={{ color: TONE_COLOR.danger }}>{row.failed}</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {more === null ? null : <DashEmptyLine text={more} />}
            </DashListCard>
          );
        }}
      </DashBody>
      {block.status === 'ready' ? <DashMore language={language} target={{ kind: 'section', section: 'broadcasts' }} /> : null}
    </DashSection>
  );
}
