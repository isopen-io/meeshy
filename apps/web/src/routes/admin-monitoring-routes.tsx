import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminListToolbar, type AdminToolbarFilter } from '@/components/admin/list-toolbar';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState, AdminInlineNotice } from '@/components/admin/states';
import { AdminStatCard, AdminStatGrid } from '@/components/admin/stat-card';
import { BRAND, EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf, formatDuration } from '@/lib/admin/interpret/time';
import {
  DEFAULT_ROUTE_USAGE_STATE,
  ROUTE_USAGE_LIMITS,
  ROUTE_USAGE_SCOPES,
  isDefaultRouteUsageState,
  parseRouteUsageState,
  routeIssueUrl,
  serializeRouteUsageState,
  withLimit,
  withRoute,
  withScope,
  type RouteUsageState,
} from '@/lib/admin/monitoring-state';
import { blindSpotOf, routePlatformLabel, routeVerdictOf, routeVersionLabel } from '@/lib/admin/monitoring-view';
import type { AdminDeps } from '@/lib/api/admin';
import {
  adminRouteUsageKey,
  loadAdminRouteUsage,
  type AdminRouteUsage,
  type AdminRouteUsageEntry,
  type AdminWatchedRoute,
} from '@/lib/api/admin-monitoring';
import { ApiError, unwrap } from '@/lib/api/client';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useSearch } from '@/lib/router';
import type { AdminOption } from '@/routes/admin-table';

import { LastSeen, MethodText, MonitoringSection, RefreshButton, RouteText, UsageTable, type UsageColumn } from './admin-monitoring-parts';

/**
 * **L'USAGE DES ROUTES** (#8876, #6734) — qui appelle quelles adresses, par plateforme
 * et par version, sur la fenêtre glissante de l'instance (`GET /admin/route-usage`).
 *
 * C'est la mesure qui décide d'un RETRAIT : les routes surveillées sont les adresses en
 * voie de disparition, chacune avec son issue, son compte, et un VERDICT qui dit ce qu'un
 * zéro vaut (une adresse qui n'est plus montée a un zéro qui ne prouve rien). Le détail
 * par plateforme et version suit ; les angles morts de la mesure sont DITS, traduits, au
 * même endroit que le zéro qu'ils nuancent.
 *
 * Portée, filtre de route et taille du détail sont dans l'adresse. Si la mesure n'est
 * pas installée ou saturée, l'écran le dit avant tout chiffre.
 */
const defaultNow = (): Date => new Date();

const option = (value: string, label: string): AdminOption => ({ value, label });

type MonitoringRoutesProps = {
  readonly language: InterfaceLanguage;
  readonly deps: AdminDeps;
  readonly now?: () => Date;
};

export function MonitoringRoutes({ language, deps, now = defaultNow }: MonitoringRoutesProps) {
  const [search, setSearch] = useSearch();
  const state = parseRouteUsageState(search);
  const write = (next: RouteUsageState) => setSearch(serializeRouteUsageState(next, search), true);

  const [draft, setDraft] = useState(state.route);
  useEffect(() => {
    if (draft.trim() === state.route) return undefined;
    const timer = setTimeout(() => write(withRoute(state, draft)), 250);
    return () => clearTimeout(timer);
  });

  const query = useQuery<AdminRouteUsage>({
    queryKey: adminRouteUsageKey(state),
    queryFn: async ({ signal }) => unwrap(await loadAdminRouteUsage({ ...deps, state, signal })),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const filters: readonly AdminToolbarFilter[] = [
    {
      id: 'scope',
      label: translateAdmin(language, 'admin.monitoring.routes.scope.label'),
      value: state.scope,
      options: ROUTE_USAGE_SCOPES.map((scope) => option(scope, translateAdmin(language, `admin.monitoring.routes.scope.${scope}`))),
      onChange: (value) => write(withScope(state, value)),
    },
    {
      id: 'limit',
      label: translateAdmin(language, 'admin.monitoring.routes.limit.label'),
      value: String(state.limit),
      options: ROUTE_USAGE_LIMITS.map((limit) => option(String(limit), translateAdmin(language, 'admin.monitoring.routes.limit.option', { count: formatCount(limit, language) }))),
      onChange: (value) => write(withLimit(state, value)),
    },
  ];

  const reset = () => {
    setDraft('');
    write(DEFAULT_ROUTE_USAGE_STATE);
  };

  const usage = query.data;
  const clock = now();
  const never = translateAdmin(language, 'admin.monitoring.routes.neverSeen');

  const watchedColumns: readonly UsageColumn<AdminWatchedRoute>[] = [
    { id: 'route', header: translateAdmin(language, 'admin.monitoring.routes.col.route'), primary: true, cell: (row) => <RouteText route={row.route} /> },
    { id: 'method', header: translateAdmin(language, 'admin.monitoring.routes.col.method'), cell: (row) => <MethodText method={row.method} /> },
    {
      id: 'issue',
      header: translateAdmin(language, 'admin.monitoring.routes.col.issue'),
      cell: (row) =>
        row.issue === 0 ? (
          '—'
        ) : (
          <a
            href={routeIssueUrl(row.issue)}
            target="_blank"
            rel="noopener noreferrer"
            data-admin-issue-link={row.issue}
            className="inline-flex items-center gap-1 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
          >
            {translateAdmin(language, 'admin.monitoring.routes.issue', { issue: String(row.issue) })}
            <AdminGlyph name="arrowSquareOut" size={14} />
          </a>
        ),
    },
    {
      id: 'verdict',
      header: translateAdmin(language, 'admin.monitoring.routes.col.verdict'),
      cell: (row) => {
        const verdict = routeVerdictOf(row, language);
        return (
          <span className="grid justify-items-start gap-1">
            <AdminInterpretedBadge value={verdict} />
            {verdict.explain === null ? null : (
              <span className="text-caption" style={{ color: INK2 }}>
                {verdict.explain}
              </span>
            )}
          </span>
        );
      },
    },
    { id: 'calls', header: translateAdmin(language, 'admin.monitoring.routes.col.calls'), align: 'end', cell: (row) => formatCount(row.count, language) },
    {
      id: 'lastSeen',
      header: translateAdmin(language, 'admin.monitoring.routes.col.lastSeen'),
      cell: (row) => <LastSeen moment={adminMomentOf(row.lastSeenAt, clock, language)} never={never} />,
    },
  ];

  const entryColumns: readonly UsageColumn<AdminRouteUsageEntry>[] = [
    { id: 'route', header: translateAdmin(language, 'admin.monitoring.routes.col.route'), primary: true, cell: (row) => <RouteText route={row.route} /> },
    { id: 'method', header: translateAdmin(language, 'admin.monitoring.routes.col.method'), cell: (row) => <MethodText method={row.method} /> },
    { id: 'platform', header: translateAdmin(language, 'admin.monitoring.routes.col.platform'), cell: (row) => routePlatformLabel(row, language) },
    { id: 'version', header: translateAdmin(language, 'admin.monitoring.routes.col.version'), cell: (row) => routeVersionLabel(row, language) },
    { id: 'calls', header: translateAdmin(language, 'admin.monitoring.routes.col.calls'), align: 'end', cell: (row) => formatCount(row.count, language) },
    {
      id: 'lastSeen',
      header: translateAdmin(language, 'admin.monitoring.routes.col.lastSeen'),
      cell: (row) => <LastSeen moment={adminMomentOf(row.lastSeenAt, clock, language)} never={never} />,
    },
  ];

  const body = () => {
    if (usage === undefined) {
      if (query.isPending) {
        return (
          <div data-admin-monitoring-skeleton aria-busy="true" aria-label={translateAdmin(language, 'admin.kit.loading')} className="grid gap-3">
            {[0, 1, 2].map((slot) => (
              <div key={slot} aria-hidden="true" className="rounded-card" style={{ height: 96, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)' }} />
            ))}
          </div>
        );
      }
      return query.error instanceof ApiError && query.error.status === 403 ? (
        <AdminDeniedInline language={language} />
      ) : (
        <AdminErrorState language={language} onRetry={() => void query.refetch()} />
      );
    }

    const watched = usage.watched.filter((route) => state.route === '' || route.route.includes(state.route));
    const observedSince = adminMomentOf(usage.observingSince, clock, language);
    const dimmed = query.isPlaceholderData;

    return (
      <div className="grid gap-8" data-admin-route-usage>
        <div className="grid gap-2">
          {usage.instrumented ? null : <AdminInlineNotice tone="warning" text={translateAdmin(language, 'admin.monitoring.routes.notInstrumented')} />}
          {usage.saturated ? (
            <AdminInlineNotice tone="warning" text={translateAdmin(language, 'admin.monitoring.routes.saturated', { count: formatCount(usage.droppedSamples, language) })} />
          ) : null}
          {usage.entriesTruncated ? (
            <AdminInlineNotice
              tone="info"
              text={translateAdmin(language, 'admin.monitoring.routes.truncated', {
                shown: formatCount(usage.entries.length, language),
                total: formatCount(usage.entriesTotal, language),
              })}
            />
          ) : null}
        </div>

        <AdminStatGrid columns={3}>
          <AdminStatCard
            language={language}
            anchor="routes-observing-since"
            label={translateAdmin(language, 'admin.monitoring.routes.observingSince')}
            value={observedSince === null ? '—' : observedSince.date}
            {...(observedSince === null ? {} : { caption: observedSince.relative })}
          />
          <AdminStatCard
            language={language}
            anchor="routes-observed-for"
            label={translateAdmin(language, 'admin.monitoring.routes.observedFor')}
            value={formatDuration(usage.observedForMs, 'ms', language)}
          />
          <AdminStatCard
            language={language}
            anchor="routes-window"
            label={translateAdmin(language, 'admin.monitoring.routes.window')}
            value={formatDuration(usage.windowMs, 'ms', language)}
            caption={translateAdmin(language, 'admin.monitoring.routes.window.caption')}
          />
        </AdminStatGrid>

        <MonitoringSection id="watched" title={translateAdmin(language, 'admin.monitoring.routes.watched.title')} hint={translateAdmin(language, 'admin.monitoring.routes.watched.intro')}>
          {watched.length === 0 ? (
            <AdminEmptyState title={translateAdmin(language, 'admin.monitoring.routes.watched.empty')} glyph="funnel" />
          ) : (
            <UsageTable
              anchor="watched"
              caption={translateAdmin(language, 'admin.monitoring.routes.watched.caption')}
              columns={watchedColumns}
              rows={watched}
              rowKey={(row) => `${row.method} ${row.route}`}
              dimmed={dimmed}
            />
          )}
        </MonitoringSection>

        <MonitoringSection id="entries" title={translateAdmin(language, 'admin.monitoring.routes.entries.title')}>
          {usage.entries.length === 0 ? (
            <AdminEmptyState title={translateAdmin(language, 'admin.monitoring.routes.entries.empty')} glyph="table" />
          ) : (
            <UsageTable
              anchor="entries"
              caption={translateAdmin(language, 'admin.monitoring.routes.entries.caption')}
              columns={entryColumns}
              rows={usage.entries}
              rowKey={(row) => `${row.method} ${row.route} ${row.platform} ${row.version}`}
              dimmed={dimmed}
            />
          )}
        </MonitoringSection>

        <MonitoringSection id="blind" title={translateAdmin(language, 'admin.monitoring.routes.blind.title')} hint={translateAdmin(language, 'admin.monitoring.routes.blind.intro')}>
          <ul className="grid gap-3">
            {usage.blindSpots.map((served) => {
              const spot = blindSpotOf(served, language);
              return (
                <li key={served} data-admin-blind-spot={spot.id} className="grid gap-1 rounded-card p-4" style={{ border: `1px solid ${EDGE}`, backgroundColor: SURFACE }}>
                  <span className="text-body font-semibold" style={{ color: INK }}>
                    {spot.title}
                  </span>
                  <span className="text-caption" style={{ color: INK2 }}>
                    {spot.explain}
                  </span>
                </li>
              );
            })}
          </ul>
        </MonitoringSection>
      </div>
    );
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <AdminListToolbar
            language={language}
            search={{ label: translateAdmin(language, 'admin.monitoring.routes.search'), value: draft, onChange: setDraft }}
            filters={filters}
            {...(isDefaultRouteUsageState(state) && draft === '' ? {} : { onReset: reset })}
          />
        </div>
        <RefreshButton language={language} busy={query.isFetching} onRefresh={() => void query.refetch()} />
      </div>
      {usage !== undefined && query.isError ? (
        <AdminInlineNotice
          tone="warning"
          text={translateAdmin(language, 'admin.kit.cached')}
          action={
            <button
              type="button"
              data-admin-retry
              onClick={() => void query.refetch()}
              className="rounded-chip px-3 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
            >
              {translateAdmin(language, 'admin.kit.retry')}
            </button>
          }
        />
      ) : null}
      {body()}
    </div>
  );
}
