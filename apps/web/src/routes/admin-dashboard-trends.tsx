import { AdminBarChart } from '@/components/admin/charts/bar-chart';
import { AdminShareChart } from '@/components/admin/charts/share-chart';
import { AdminTimelineChart } from '@/components/admin/charts/timeline-chart';
import { useDashBlock } from '@/lib/admin/dashboard-block';
import { engagementView, hourlyView, languagesView, typesView, volumeView } from '@/lib/admin/dashboard-series';
import { formatCount } from '@/lib/admin/interpret/numbers';
import {
  loadAdminHourlyActivity,
  loadAdminLanguageDistribution,
  loadAdminMessageTypes,
  loadAdminUserDistribution,
  loadAdminVolumeTimeline,
} from '@/lib/api/admin-overview';
import { translateAdmin } from '@/lib/i18n-admin-catalog';

import { chartStateOf, DashChartFrame, retryOf, type DashContext } from './admin-dashboard-parts';

/**
 * **LES CINQ GRAPHIQUES DES TENDANCES** (#8876, § 4) — le volume des messages
 * sur sept jours, l'activité par tranche de trois heures, l'engagement des
 * comptes, les langues, les types de messages. Chacun lit sa route, dit sa
 * série en mots (`dashboard-series.ts`) et se rend dans `AdminChartCard`, qui
 * porte déjà le squelette de même hauteur, l'erreur avec « Réessayer » et le
 * tableau de données accessible.
 *
 * Un refus (403) remplace le graphique par sa ligne de refus ; « Voir le détail »
 * n'est posé que si le lecteur peut ouvrir la section visée.
 */
const FIVE_MINUTES = 5 * 60_000;

export function VolumeChart({ language, deps, now }: DashContext) {
  const block = useDashBlock({
    key: ['volume'],
    load: (signal) => loadAdminVolumeTimeline({ ...deps, signal }),
    staleTime: FIVE_MINUTES,
  });
  const view = block.status === 'ready' ? volumeView(block.data, now, language) : { points: [], summary: '' };
  const retry = retryOf(block);

  return (
    <DashChartFrame language={language} block={block} more={{ kind: 'section', section: 'analytics', search: { tab: 'messages' } }}>
      <AdminTimelineChart
        language={language}
        id="volume"
        title={translateAdmin(language, 'admin.dash.volume.title')}
        series={[{ key: 'messages', label: translateAdmin(language, 'admin.dash.volume.series'), points: view.points }]}
        format={(value) => formatCount(value, language)}
        summary={view.summary}
        state={chartStateOf(block)}
        {...(retry === undefined ? {} : { onRetry: retry })}
      />
    </DashChartFrame>
  );
}

export function HourlyChart({ language, deps }: DashContext) {
  const block = useDashBlock({
    key: ['hourly'],
    load: (signal) => loadAdminHourlyActivity({ ...deps, signal }),
    staleTime: FIVE_MINUTES,
  });
  const view = block.status === 'ready' ? hourlyView(block.data, language) : { data: [], summary: '' };
  const retry = retryOf(block);

  return (
    <DashChartFrame language={language} block={block} more={{ kind: 'section', section: 'analytics' }}>
      <AdminBarChart
        language={language}
        id="hourly"
        title={translateAdmin(language, 'admin.dash.hourly.title')}
        data={view.data}
        orientation="vertical"
        format={(value) => formatCount(value, language)}
        summary={view.summary}
        state={chartStateOf(block)}
        {...(retry === undefined ? {} : { onRetry: retry })}
      />
    </DashChartFrame>
  );
}

export function EngagementChart({ language, deps }: DashContext) {
  const block = useDashBlock({
    key: ['distribution'],
    load: (signal) => loadAdminUserDistribution({ ...deps, signal }),
    staleTime: FIVE_MINUTES,
  });
  const view = block.status === 'ready' ? engagementView(block.data, language) : { data: [], summary: '' };
  const retry = retryOf(block);

  return (
    <DashChartFrame language={language} block={block} more={{ kind: 'section', section: 'analytics' }}>
      <AdminShareChart
        language={language}
        id="engagement"
        title={translateAdmin(language, 'admin.dash.engagement.title')}
        data={view.data}
        format={(value) => formatCount(value, language)}
        summary={view.summary}
        state={chartStateOf(block)}
        {...(retry === undefined ? {} : { onRetry: retry })}
      />
    </DashChartFrame>
  );
}

export function LanguagesChart({ language, deps }: DashContext) {
  const block = useDashBlock({
    key: ['languages'],
    load: (signal) => loadAdminLanguageDistribution({ ...deps, signal }),
    staleTime: FIVE_MINUTES,
  });
  const view = block.status === 'ready' ? languagesView(block.data, language) : { data: [], summary: '' };
  const retry = retryOf(block);

  return (
    <DashChartFrame language={language} block={block} more={{ kind: 'section', section: 'languages' }}>
      <AdminBarChart
        language={language}
        id="languages"
        title={translateAdmin(language, 'admin.dash.languages.title')}
        data={view.data}
        format={(value) => formatCount(value, language)}
        summary={view.summary}
        state={chartStateOf(block)}
        {...(retry === undefined ? {} : { onRetry: retry })}
      />
    </DashChartFrame>
  );
}

export function MessageTypesChart({ language, deps }: DashContext) {
  const block = useDashBlock({
    key: ['types'],
    load: (signal) => loadAdminMessageTypes({ ...deps, signal }),
    staleTime: FIVE_MINUTES,
  });
  const view = block.status === 'ready' ? typesView(block.data, language) : { data: [], summary: '' };
  const retry = retryOf(block);

  return (
    <DashChartFrame language={language} block={block} more={{ kind: 'section', section: 'analytics', search: { tab: 'messages' } }}>
      <AdminShareChart
        language={language}
        id="types"
        title={translateAdmin(language, 'admin.dash.types.title')}
        data={view.data}
        format={(value) => formatCount(value, language)}
        summary={view.summary}
        state={chartStateOf(block)}
        {...(retry === undefined ? {} : { onRetry: retry })}
      />
    </DashChartFrame>
  );
}
