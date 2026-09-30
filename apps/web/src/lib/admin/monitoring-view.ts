import type { AdminGlyphName } from '@/components/glyphs-admin';
import type { AdminMonitoring, AdminWatchedRoute, AdminRouteUsageEntry } from '@/lib/api/admin-monitoring';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { interpretCircuitState } from './interpret/enums';
import { platformLabel } from './interpret/language';
import { formatCount } from './interpret/numbers';
import type { AdminTone, Interpreted } from './interpret/types';

/**
 * **LA SUPERVISION, DITE EN MOTS** (#8876, #6734) — les verdicts que l'écran tire
 * des charges servies. Fonctions PURES : la langue est passée, jamais lue.
 *
 * Une donnée brute n'est jamais le libellé : un état de coupe-circuit, un verdict
 * de route, une plateforme, une version ou un angle mort se lisent par leur mot, et
 * le code ne vit que dans `raw`.
 */
export type HealthIssue = {
  readonly id: 'database' | 'redis' | 'translator' | 'breakersOpen' | 'breakersHalfOpen';
  readonly tone: AdminTone;
  readonly text: string;
};

const isDown = (status: string): boolean => status.trim().toLowerCase() !== 'up';

const issue = (id: HealthIssue['id'], tone: AdminTone, text: string): HealthIssue => ({ id, tone, text });

/** Ce qui ne va pas, dans l'ordre où un administrateur le traite : les données d'abord, les services ensuite. Vide = tout va bien. */
export function healthIssuesOf(monitoring: AdminMonitoring, language: AdminLanguage): readonly HealthIssue[] {
  const stateCount = (state: string): number => monitoring.circuitBreakers.filter((breaker) => breaker.state.toUpperCase() === state).length;
  const open = stateCount('OPEN');
  const halfOpen = stateCount('HALF_OPEN');

  return [
    ...(isDown(monitoring.database.status) ? [issue('database', 'danger', translateAdmin(language, 'admin.monitoring.health.issue.database'))] : []),
    ...(isDown(monitoring.redis.status) ? [issue('redis', 'danger', translateAdmin(language, 'admin.monitoring.health.issue.redis'))] : []),
    ...(monitoring.translator === null ? [issue('translator', 'warning', translateAdmin(language, 'admin.monitoring.health.issue.translator'))] : []),
    ...(open === 0
      ? []
      : [issue('breakersOpen', 'danger', translateAdmin(language, 'admin.monitoring.health.issue.breakersOpen', { count: formatCount(open, language) }))]),
    ...(halfOpen === 0
      ? []
      : [issue('breakersHalfOpen', 'warning', translateAdmin(language, 'admin.monitoring.health.issue.breakersHalfOpen', { count: formatCount(halfOpen, language) }))]),
  ];
}

/** Un coupe-circuit ouvert est en DANGER avec son mot (« Coupé ») ; l'explication dit ce que cela change. */
export const breakerStateOf = (state: string, language: AdminLanguage): Interpreted => interpretCircuitState(state, language);

const VERDICT_GLYPH: Readonly<Partial<Record<AdminTone, AdminGlyphName>>> = { success: 'checkCircle', warning: 'warning', info: 'info' };

type Verdict = {
  readonly raw: 'unmounted' | 'unchecked' | 'unused' | 'used';
  readonly tone: AdminTone;
  readonly label: AdminPlainCatalogKey;
  readonly explain: AdminPlainCatalogKey;
};

function verdictOf(route: AdminWatchedRoute): Verdict {
  if (route.matched === false) {
    return { raw: 'unmounted', tone: 'warning', label: 'admin.monitoring.routes.verdict.unmounted', explain: 'admin.monitoring.routes.verdict.unmounted.explain' };
  }
  if (route.matched === null) {
    return { raw: 'unchecked', tone: 'neutral', label: 'admin.monitoring.routes.verdict.unchecked', explain: 'admin.monitoring.routes.verdict.unchecked.explain' };
  }
  if (route.count === 0) {
    return { raw: 'unused', tone: 'success', label: 'admin.monitoring.routes.verdict.unused', explain: 'admin.monitoring.routes.verdict.unused.explain' };
  }
  return { raw: 'used', tone: 'warning', label: 'admin.monitoring.routes.verdict.used', explain: 'admin.monitoring.routes.verdict.used.explain' };
}

/**
 * **LE VERDICT D'UNE ROUTE SURVEILLÉE** — ce qu'un zéro vaut. Une adresse qui n'est
 * plus montée a un zéro qui ne prouve RIEN (`matched: false`) : jamais « retirable »
 * par un faux vert. Seule une adresse montée, observée et jamais appelée l'est.
 */
export function routeVerdictOf(route: AdminWatchedRoute, language: AdminLanguage): Interpreted {
  const verdict = verdictOf(route);
  const glyph = VERDICT_GLYPH[verdict.tone];
  return {
    label: translateAdmin(language, verdict.label),
    tone: verdict.tone,
    explain: translateAdmin(language, verdict.explain),
    ...(glyph === undefined ? {} : { glyph }),
    raw: verdict.raw,
  };
}

const PLATFORM_OWN: Readonly<Record<string, AdminPlainCatalogKey>> = {
  absent: 'admin.monitoring.routes.platform.absent',
  bot: 'admin.monitoring.routes.platform.bot',
  script: 'admin.monitoring.routes.platform.script',
  other: 'admin.monitoring.routes.platform.other',
};

/** Le seau TOTAL d'une route surveillée dit « toutes plateformes » ; une plateforme connue se nomme ; `absent`, `bot`, `script` ont leurs mots. */
export function routePlatformLabel(entry: Pick<AdminRouteUsageEntry, 'platform' | 'total'>, language: AdminLanguage): string {
  if (entry.total) return translateAdmin(language, 'admin.monitoring.routes.platform.all');
  const own = PLATFORM_OWN[entry.platform.trim().toLowerCase()];
  return own === undefined ? platformLabel(entry.platform, language) : translateAdmin(language, own);
}

/** `absent` et `invalid` sont des verdicts SERVIS, pas des trous : ils se disent. Une version lisible est écrite telle quelle (« 2.4.0 »). */
export function routeVersionLabel(entry: Pick<AdminRouteUsageEntry, 'version' | 'total'>, language: AdminLanguage): string {
  if (entry.total) return translateAdmin(language, 'admin.monitoring.routes.version.all');
  const version = entry.version.trim();
  if (version === '' || version === 'absent') return translateAdmin(language, 'admin.monitoring.routes.version.absent');
  if (version === 'invalid') return translateAdmin(language, 'admin.monitoring.routes.version.invalid');
  return version;
}

const BLIND_SPOTS: Readonly<Record<string, { readonly title: AdminPlainCatalogKey; readonly explain: AdminPlainCatalogKey }>> = {
  'web-et-android-ne-posent-aucun-en-tete-de-version': {
    title: 'admin.monitoring.routes.blind.noVersion',
    explain: 'admin.monitoring.routes.blind.noVersion.explain',
  },
  'agregat-en-memoire-et-par-instance': {
    title: 'admin.monitoring.routes.blind.instanceMemory',
    explain: 'admin.monitoring.routes.blind.instanceMemory.explain',
  },
  'cache-navigateur-et-service-worker': {
    title: 'admin.monitoring.routes.blind.clientCache',
    explain: 'admin.monitoring.routes.blind.clientCache.explain',
  },
  'trafic-socket-io': { title: 'admin.monitoring.routes.blind.socket', explain: 'admin.monitoring.routes.blind.socket.explain' },
  'routes-deja-retirees': { title: 'admin.monitoring.routes.blind.retired', explain: 'admin.monitoring.routes.blind.retired.explain' },
  'ventilation-sous-saturation': {
    title: 'admin.monitoring.routes.blind.saturation',
    explain: 'admin.monitoring.routes.blind.saturation.explain',
  },
};

const BLIND_SPOT_SEPARATOR = ' : ';

export type BlindSpotView = { readonly id: string; readonly title: string; readonly explain: string };

/**
 * **UN ANGLE MORT, TRADUIT** — la passerelle sert `code : phrase` en français sans
 * accents. Le code connu est traduit dans la langue d'interface (titre et phrase) ;
 * un code que cette version ne connaît pas garde la phrase servie, sous un titre
 * neutre : une limite nouvelle se lit quand même, elle n'est jamais masquée.
 */
export function blindSpotOf(served: string, language: AdminLanguage): BlindSpotView {
  const cut = served.indexOf(BLIND_SPOT_SEPARATOR);
  const code = (cut === -1 ? served : served.slice(0, cut)).trim();
  const known = BLIND_SPOTS[code];
  if (known !== undefined) {
    return { id: code, title: translateAdmin(language, known.title), explain: translateAdmin(language, known.explain) };
  }
  return { id: code, title: translateAdmin(language, 'admin.monitoring.routes.blind.other'), explain: served };
}

/** `memoryUsageMb` est servi en mégaoctets ; `formatBytes` parle octets. */
export const megabytesToBytes = (megabytes: number): number => megabytes * 1024 * 1024;
