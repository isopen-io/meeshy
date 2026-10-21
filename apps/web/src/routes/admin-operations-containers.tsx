import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { OpsContainer } from '@meeshy/shared/types/admin-ops-containers';

import { AdminBadge } from '@/components/admin/badges';
import { AdminDetailSheet } from '@/components/admin/detail-sheet';
import { AdminMetaPanel, AdminMetaRow } from '@/components/admin/meta';
import { AdminEmptyState, AdminErrorState, AdminSkeleton } from '@/components/admin/states';
import { BRAND, EDGE, INK, INK2, INK3, SURFACE } from '@/components/admin/tone';
import { formatBytes, formatPercent } from '@/lib/admin/interpret/numbers';
import { adminDate, adminMomentOf, formatDuration } from '@/lib/admin/interpret/time';
import type { AdminTone } from '@/lib/admin/interpret/types';
import type { AdminDeps } from '@/lib/api/admin';
import { ADMIN_OPS_CONTAINERS_KEY, loadOpsContainers } from '@/lib/api/admin-ops-containers';
import { unwrap } from '@/lib/api/client';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LES CONTENEURS DE L'ENVIRONNEMENT** (demande porteur 2026-10-21, #11441) — ce que le
 * runner de l'hôte relève chaque minute, en une carte par conteneur : son état et sa santé
 * dits en mots, son image et la DATE de cette image, et depuis combien de temps il tourne
 * (ou est arrêté). Toucher une carte ouvre sa modale : consommation (processeur, mémoire et
 * sa limite, réseau reçu et émis, disque lu et écrit, processus), les RÉSEAUX où il se
 * trouve avec son adresse, ses ports, et son cycle de vie (démarrage, redémarrages, code de
 * sortie, empreinte de l'image).
 *
 * Cache-first : la dernière relève s'affiche sans indicateur de chargement, la suivante est
 * relue toutes les minutes. Une relève absente se dit (le relais n'a encore rien publié),
 * jamais comme une panne.
 */
const REFRESH_MS = 60_000;

const STATE_TONE: Readonly<Record<OpsContainer['state'], AdminTone>> = {
  created: 'neutral',
  running: 'success',
  paused: 'warning',
  restarting: 'warning',
  removing: 'warning',
  exited: 'neutral',
  dead: 'danger',
};

const stateTone = (container: OpsContainer): AdminTone =>
  container.state === 'exited' && container.exitCode !== null && container.exitCode !== 0 ? 'danger' : STATE_TONE[container.state];

const sinceSeconds = (iso: string | null, now: Date): number | null => {
  if (iso === null) return null;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : Math.max(0, Math.round((now.getTime() - at) / 1000));
};

function lifeLine(container: OpsContainer, now: Date, language: AdminLanguage): string | null {
  const running = container.state === 'running';
  const seconds = sinceSeconds(running ? container.startedAt : container.finishedAt, now);
  if (seconds === null) return null;
  return translateAdmin(language, running ? 'admin.ops.container.upFor' : 'admin.ops.container.downFor', { duration: formatDuration(seconds, 's', language) });
}

const imageLine = (container: OpsContainer, language: AdminLanguage): string =>
  container.imageCreatedAt === null
    ? translateAdmin(language, 'admin.ops.container.imageUnknown')
    : translateAdmin(language, 'admin.ops.container.imageBuilt', { date: adminDate(container.imageCreatedAt, language) });

function StateBadges({ container, language }: { readonly container: OpsContainer; readonly language: AdminLanguage }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <AdminBadge tone={stateTone(container)}>{translateAdmin(language, `admin.ops.container.state.${container.state}`)}</AdminBadge>
      {container.health === 'none' ? null : (
        <AdminBadge tone={container.health === 'healthy' ? 'success' : container.health === 'unhealthy' ? 'danger' : 'info'} {...(container.health === 'healthy' ? { glyph: 'checkCircle' as const } : {})}>
          {translateAdmin(language, `admin.ops.container.health.${container.health}`)}
        </AdminBadge>
      )}
    </span>
  );
}

function ContainerCard({
  container,
  language,
  now,
  onOpen,
}: {
  readonly container: OpsContainer;
  readonly language: AdminLanguage;
  readonly now: Date;
  readonly onOpen: () => void;
}) {
  const life = lifeLine(container, now, language);
  const stats = container.stats;
  return (
    <li>
      <button
        type="button"
        data-admin-ops-container={container.name}
        data-admin-ops-container-state={container.state}
        aria-label={translateAdmin(language, 'admin.ops.container.open', { name: container.name })}
        onClick={onOpen}
        className="grid w-full gap-2 rounded-card p-4 text-start transition-colors hover:bg-[color-mix(in_srgb,var(--color-ios-brand)_6%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minHeight: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, outlineColor: BRAND }}
      >
        {/* Le nom prend TOUTE la ligne, les badges dessous (relu à 375 et 1280 px) : côte à côte,
            « database-staging » se coupait au milieu du mot. */}
        <span className="block break-words text-body font-semibold" style={{ color: INK }}>
          {container.service ?? container.name}
        </span>
        <StateBadges container={container} language={language} />
        <span className="block break-all text-caption" style={{ color: INK2 }}>
          {container.image}
        </span>
        <span className="block text-caption" style={{ color: INK2 }} data-admin-ops-container-image-date>
          {imageLine(container, language)}
        </span>
        {life === null ? null : (
          <span className="block text-caption font-medium" style={{ color: INK }} data-admin-ops-container-life>
            {life}
          </span>
        )}
        {stats === null ? null : (
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-caption tabular-nums" style={{ color: INK3 }}>
            <span>
              {translateAdmin(language, 'admin.ops.container.cpu')} {formatPercent(stats.cpuPercent, 'hundred', language)}
            </span>
            <span>
              {translateAdmin(language, 'admin.ops.container.memory')} {formatBytes(stats.memoryUsedBytes, language)}
            </span>
          </span>
        )}
      </button>
    </li>
  );
}

function ContainerDetail({ container, language, now }: { readonly container: OpsContainer; readonly language: AdminLanguage; readonly now: Date }) {
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const stats = container.stats;
  const memory =
    stats === null
      ? null
      : stats.memoryLimitBytes === null || stats.memoryLimitBytes === 0
        ? translateAdmin(language, 'admin.ops.container.memoryNoLimit', { used: formatBytes(stats.memoryUsedBytes, language) })
        : translateAdmin(language, 'admin.ops.container.memoryOf', {
            used: formatBytes(stats.memoryUsedBytes, language),
            limit: formatBytes(stats.memoryLimitBytes, language),
            share: formatPercent((stats.memoryUsedBytes / stats.memoryLimitBytes) * 100, 'hundred', language),
          });
  const moment = (iso: string | null) => {
    const at = adminMomentOf(iso, now, language);
    return at === null ? '—' : `${at.absolute} (${at.relative})`;
  };
  return (
    <div className="grid gap-4 @2xl:grid-cols-2" data-admin-ops-container-detail={container.name}>
      <div className="flex flex-wrap items-center gap-2 @2xl:col-span-2">
        <StateBadges container={container} language={language} />
        {lifeLine(container, now, language) === null ? null : (
          <span className="text-caption" style={{ color: INK2 }}>
            {lifeLine(container, now, language)}
          </span>
        )}
      </div>

      <AdminMetaPanel title={t('admin.ops.container.usage')}>
        {stats === null ? (
          <AdminMetaRow label={t('admin.ops.container.usage')} value={t('admin.ops.container.noUsage')} />
        ) : (
          <>
            <AdminMetaRow anchor="cpu" label={t('admin.ops.container.cpu')} value={formatPercent(stats.cpuPercent, 'hundred', language)} />
            <AdminMetaRow anchor="memory" label={t('admin.ops.container.memory')} value={memory} />
            <AdminMetaRow
              anchor="network"
              label={t('admin.ops.container.network')}
              value={translateAdmin(language, 'admin.ops.container.networkIo', { rx: formatBytes(stats.netRxBytes, language), tx: formatBytes(stats.netTxBytes, language) })}
            />
            <AdminMetaRow
              anchor="disk"
              label={t('admin.ops.container.disk')}
              value={translateAdmin(language, 'admin.ops.container.diskIo', { read: formatBytes(stats.blockReadBytes, language), write: formatBytes(stats.blockWriteBytes, language) })}
            />
            <AdminMetaRow anchor="pids" label={t('admin.ops.container.pids')} value={stats.pids.toLocaleString(language)} />
          </>
        )}
      </AdminMetaPanel>

      <AdminMetaPanel title={t('admin.ops.container.networks')}>
        {container.networks.length === 0 ? (
          <AdminMetaRow label={t('admin.ops.container.networks')} value={t('admin.ops.container.noNetworks')} />
        ) : (
          container.networks.map((network) => (
            <AdminMetaRow
              key={network.name}
              anchor={`network-${network.name}`}
              label={network.name}
              value={network.ipAddress === '' ? t('admin.ops.container.noAddress') : <span className="font-mono">{network.ipAddress}</span>}
            />
          ))
        )}
        <AdminMetaRow
          anchor="ports"
          label={t('admin.ops.container.ports')}
          value={
            container.ports.length === 0 ? (
              t('admin.ops.container.noPorts')
            ) : (
              <ul className="grid gap-1">
                {container.ports.map((port) => (
                  <li key={`${port.containerPort}/${port.protocol}/${port.hostPort ?? ''}`} className="font-mono text-caption" data-admin-ops-container-port={`${port.containerPort}/${port.protocol}`}>
                    {port.hostPort === null
                      ? translateAdmin(language, 'admin.ops.container.portInternal', { port: String(port.containerPort), protocol: port.protocol })
                      : translateAdmin(language, 'admin.ops.container.portPublished', {
                          port: String(port.containerPort),
                          protocol: port.protocol,
                          host: port.hostIp ?? '0.0.0.0',
                          hostPort: String(port.hostPort),
                        })}
                  </li>
                ))}
              </ul>
            )
          }
        />
      </AdminMetaPanel>

      <div className="@2xl:col-span-2">
        <AdminMetaPanel title={t('admin.ops.container.lifecycle')}>
          {container.service === null ? null : <AdminMetaRow anchor="service" label={t('admin.ops.container.service')} value={container.service} />}
          <AdminMetaRow anchor="image" label={t('admin.ops.container.image')} value={<span className="break-all">{container.image}</span>} explain={imageLine(container, language)} />
          {container.imageId === null ? null : <AdminMetaRow anchor="image-id" label={t('admin.ops.container.imageId')} value={<span className="font-mono">{container.imageId}</span>} />}
          <AdminMetaRow anchor="started" label={t('admin.ops.container.startedAt')} value={moment(container.startedAt)} />
          {container.finishedAt === null ? null : <AdminMetaRow anchor="finished" label={t('admin.ops.container.finishedAt')} value={moment(container.finishedAt)} />}
          <AdminMetaRow anchor="restarts" label={t('admin.ops.container.restarts')} value={container.restartCount.toLocaleString(language)} />
          {container.state === 'running' || container.exitCode === null ? null : (
            <AdminMetaRow anchor="exit-code" label={t('admin.ops.container.exitCode')} value={String(container.exitCode)} />
          )}
        </AdminMetaPanel>
      </div>
    </div>
  );
}

export function AdminOperationsContainers({
  language,
  deps,
  now = () => new Date(),
}: {
  readonly language: AdminLanguage;
  readonly deps: AdminDeps;
  readonly now?: () => Date;
}) {
  const view = useQuery({
    queryKey: ADMIN_OPS_CONTAINERS_KEY,
    queryFn: async ({ signal }) => unwrap(await loadOpsContainers({ ...deps, signal })),
    staleTime: REFRESH_MS / 2,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const [opened, setOpened] = useState<string | null>(null);
  const clock = now();
  const data = view.data;
  const containers = data?.containers ?? [];
  const selected = containers.find((container) => container.name === opened) ?? null;
  const running = containers.filter((container) => container.state === 'running').length;

  return (
    <section className="@container grid gap-3" data-admin-ops-containers aria-labelledby="admin-ops-containers-title">
      <div className="grid gap-1">
        <h2 id="admin-ops-containers-title" className="text-body font-semibold" style={{ color: INK }}>
          {translateAdmin(language, 'admin.ops.containers.title')}
        </h2>
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.ops.containers.subtitle')}
        </p>
        {data === undefined || data.measuredAt === null ? null : (
          <p className="text-caption" style={{ color: INK3 }} data-admin-ops-containers-summary>
            {translateAdmin(language, 'admin.ops.containers.summary', { running: running.toLocaleString(language), total: containers.length.toLocaleString(language) })}
            {' · '}
            {translateAdmin(language, 'admin.ops.containers.measuredAt', { when: adminMomentOf(data.measuredAt, clock, language)?.relative ?? '—' })}
          </p>
        )}
      </div>
      {data === undefined ? (
        view.isPending ? (
          <AdminSkeleton rows={3} />
        ) : (
          <AdminErrorState language={language} message={translateAdmin(language, 'admin.ops.containers.unavailable')} onRetry={() => void view.refetch()} />
        )
      ) : containers.length === 0 ? (
        <AdminEmptyState title={translateAdmin(language, 'admin.ops.containers.none')} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
          {containers.map((container) => (
            <ContainerCard key={container.name} container={container} language={language} now={clock} onOpen={() => setOpened(container.name)} />
          ))}
        </ul>
      )}
      <AdminDetailSheet language={language} id="ops-container" title={selected?.name ?? ''} open={selected !== null} onClose={() => setOpened(null)}>
        {selected === null ? null : <ContainerDetail container={selected} language={language} now={clock} />}
      </AdminDetailSheet>
    </section>
  );
}
