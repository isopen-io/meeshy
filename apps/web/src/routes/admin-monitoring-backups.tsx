import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminStatCard, AdminStatGrid } from '@/components/admin/stat-card';
import { EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { formatBytes, formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf, formatDuration } from '@/lib/admin/interpret/time';
import type { AdminMoment } from '@/lib/admin/interpret/types';
import { backupStateOf } from '@/lib/admin/monitoring-view';
import type { AdminBackups } from '@/lib/api/admin-monitoring';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { MonitoringSection } from './admin-monitoring-parts';

/**
 * **LES SAUVEGARDES** (#9668) — la sauvegarde nocturne de la production, telle que
 * la passerelle lit son verdict : l'état en MOT (réussie, en échec avec sa raison,
 * trop ancienne), l'âge de la dernière réussite, la prochaine échéance (minuit,
 * heure de Paris), et ce que la dernière réussite contient. Sans verdict lu, la
 * passerelle sert `null` et ce bloc n'est pas dessiné : « inconnu » n'est pas zéro.
 */
const momentCaption = (moment: AdminMoment | null): { readonly caption?: string } => (moment === null ? {} : { caption: moment.absolute });

export function BackupsSection({ language, backups, now }: { readonly language: AdminLanguage; readonly backups: AdminBackups; readonly now: Date }) {
  const t = (key: AdminPlainCatalogKey): string => translateAdmin(language, key);
  const state = backupStateOf(backups, language);
  const last = adminMomentOf(backups.lastSuccessAt, now, language);
  const next = adminMomentOf(backups.nextRunAt, now, language);
  const contents = backups.lastSuccess;

  return (
    <MonitoringSection id="backups" title={t('admin.monitoring.backups.title')} hint={t('admin.monitoring.backups.hint')}>
      <div data-admin-backups data-admin-backups-state={state.raw} className="grid gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <AdminInterpretedBadge value={state} />
          {state.explain === null ? null : (
            <span data-admin-backups-explain className="min-w-0 break-words text-caption" style={{ color: INK2 }}>
              {state.explain}
            </span>
          )}
        </span>

        <AdminStatGrid columns={contents === null ? 2 : 4}>
          <AdminStatCard
            language={language}
            anchor="backups-last"
            label={t('admin.monitoring.backups.last')}
            value={last === null ? t('admin.monitoring.backups.never') : last.relative}
            {...momentCaption(last)}
          />
          <AdminStatCard language={language} anchor="backups-next" label={t('admin.monitoring.backups.next')} value={next === null ? '—' : next.relative} {...momentCaption(next)} />
          {contents === null ? null : (
            <>
              <AdminStatCard
                language={language}
                anchor="backups-documents"
                label={t('admin.monitoring.backups.documents')}
                value={formatCount(contents.documents, language)}
                caption={translateAdmin(language, 'admin.monitoring.backups.documents.caption', {
                  collections: formatCount(contents.collections, language),
                  indexes: formatCount(contents.indexes, language),
                  mismatches: formatCount(contents.mismatches, language),
                })}
              />
              <AdminStatCard
                language={language}
                anchor="backups-archive"
                label={t('admin.monitoring.backups.archive')}
                value={formatBytes(contents.archiveBytes, language)}
                caption={translateAdmin(language, 'admin.monitoring.backups.archive.caption', { duration: formatDuration(contents.durationSeconds, 's', language) })}
              />
            </>
          )}
        </AdminStatGrid>

        {contents === null || contents.volumes.length === 0 ? null : (
          <div className="grid gap-2 rounded-card p-4 md:p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}>
            <h3 className="text-caption" style={{ color: INK2 }}>
              {t('admin.monitoring.backups.volumes')}
            </h3>
            <dl data-admin-backup-volumes className="grid gap-x-6 gap-y-1 @lg:grid-cols-[minmax(0,1fr)_auto]">
              {contents.volumes.map((volume) => (
                <div key={volume.name} data-admin-backup-volume={volume.name} className="contents">
                  <dt className="min-w-0 break-words font-mono text-body" style={{ color: INK }}>
                    {volume.name}
                  </dt>
                  <dd className="text-body tabular-nums" style={{ color: INK }}>
                    {formatBytes(volume.bytes, language)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </MonitoringSection>
  );
}
