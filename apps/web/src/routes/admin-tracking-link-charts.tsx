import { AdminBarChart } from '@/components/admin/charts/bar-chart';
import { AdminShareChart } from '@/components/admin/charts/share-chart';
import { AdminTimelineChart } from '@/components/admin/charts/timeline-chart';
import { formatCount } from '@/lib/admin/interpret/numbers';
import {
  topDatum,
  trackingCountryData,
  trackingDaySeries,
  trackingDeviceData,
  trackingPlainData,
  trackingRedirectData,
  type TrackingDatum,
} from '@/lib/admin/tracking-link-model';
import type { AdminTrackingLink } from '@/lib/api/admin-tracking-links';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **CE QUE RAPPORTENT LES CLICS** (#8876, #6729) — la courbe des clics par jour et
 * sept répartitions nommées : pays, appareils, navigateurs, systèmes, sources sociales,
 * sites d'origine, redirections.
 *
 * Chaque graphique a sa phrase de synthèse calculée (« Le plus fréquent : France
 * (700) »), son tableau de données (le chemin clavier et lecteur d'écran) et son état
 * vide dit en mots. La courbe compte les jours SANS clic pour zéro. Les couleurs d'état
 * (réussie, en attente, échouée) ne servent qu'à la distribution des redirections, et
 * chaque état garde son mot.
 */
const MAX_BARS = 8;

export function TrackingCharts({ language, link }: { readonly language: AdminLanguage; readonly link: AdminTrackingLink }) {
  const { stats } = link;
  const count = (value: number) => formatCount(value, language);
  const series = trackingDaySeries(stats.clicksByDate, language);

  const summary = (data: readonly TrackingDatum[]): string => {
    const top = topDatum(data);
    return top === null
      ? translateAdmin(language, 'admin.tracking.chart.none')
      : translateAdmin(language, 'admin.tracking.chart.top', { label: top.label, count: count(top.value) });
  };

  const countries = trackingCountryData(stats.byCountry, language).slice(0, MAX_BARS);
  const devices = trackingDeviceData(stats.byDevice, language);
  const browsers = trackingPlainData(stats.byBrowser, language);
  const systems = trackingPlainData(stats.byOs, language);
  const social = trackingPlainData(stats.bySocialSource, language).slice(0, MAX_BARS);
  const referrers = stats.topReferrers.map((entry) => ({ key: entry.referrer, label: entry.referrer, value: entry.count }));
  const redirects = trackingRedirectData(stats.byRedirectStatus, language);

  const peak = series.peak;

  return (
    <section aria-labelledby="tracking-stats-title" data-admin-fiche-section="stats" className="grid gap-4">
      <h2 id="tracking-stats-title" className="text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translateAdmin(language, 'admin.tracking.section.stats')}
      </h2>
      <AdminTimelineChart
        language={language}
        id="tracking-days"
        title={translateAdmin(language, 'admin.tracking.chart.days')}
        series={[{ key: 'clicks', label: translateAdmin(language, 'admin.tracking.col.clicks'), points: series.points }]}
        format={count}
        summary={peak === null ? translateAdmin(language, 'admin.tracking.chart.days.quiet') : translateAdmin(language, 'admin.tracking.chart.days.summary', { day: peak.day, count: count(peak.count) })}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <AdminBarChart
          language={language}
          id="tracking-countries"
          title={translateAdmin(language, 'admin.tracking.chart.countries')}
          data={countries.map(({ key, label, value }) => ({ key, label, value }))}
          format={count}
          summary={summary(countries)}
        />
        <AdminShareChart
          language={language}
          id="tracking-devices"
          title={translateAdmin(language, 'admin.tracking.chart.devices')}
          data={devices}
          format={count}
          summary={summary(devices)}
        />
        <AdminShareChart
          language={language}
          id="tracking-browsers"
          title={translateAdmin(language, 'admin.tracking.chart.browsers')}
          data={browsers}
          format={count}
          summary={summary(browsers)}
        />
        <AdminShareChart
          language={language}
          id="tracking-systems"
          title={translateAdmin(language, 'admin.tracking.chart.systems')}
          data={systems}
          format={count}
          summary={summary(systems)}
        />
        <AdminBarChart
          language={language}
          id="tracking-social"
          title={translateAdmin(language, 'admin.tracking.chart.social')}
          data={social}
          format={count}
          summary={summary(social)}
        />
        <AdminBarChart
          language={language}
          id="tracking-referrers"
          title={translateAdmin(language, 'admin.tracking.chart.referrers')}
          data={referrers}
          format={count}
          summary={summary(referrers)}
        />
        <AdminShareChart
          language={language}
          id="tracking-redirects"
          title={translateAdmin(language, 'admin.tracking.chart.redirects')}
          data={redirects.data}
          format={count}
          summary={summary(redirects.data)}
          statusTones={redirects.tones}
        />
      </div>
    </section>
  );
}
