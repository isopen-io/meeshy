/**
 * Formatage « temps écoulé » pour les composants d'administration Agent.
 *
 * Avant cette itération, l'algorithme de bucketing (`< 1 min`, `< 60 min`,
 * `< 24 h`, sinon jours) était réimplémenté à l'identique dans au moins cinq
 * composants (`AgentOverviewTab`, `AgentConversationsTab`, `AgentMessagesModal`,
 * `AgentLiveTab`, `ScanLogTable`), à des variantes de clés i18n et de gestion du
 * `null` près. Ces deux helpers routent tous ces sites vers la **source unique**
 * `classifyRelativeTime` (`@meeshy/shared/utils/relative-time`) ; seule la
 * présentation (clés i18n) reste ici.
 *
 * Deux familles de rendu coexistent dans l'UI Agent :
 * - **verbeuse** (« il y a 5 minutes ») : clés `agent.overview.timeAgo.*`,
 *   gabarit `{{count}}` — {@link formatAgentTimeAgo}.
 * - **compacte** (« 5min ») : clés `timeAgo.*`, valeur concaténée au libellé —
 *   {@link formatAgentTimeAgoShort}.
 *
 * `beyondDays: Infinity` : les composants Agent n'affichent jamais de date
 * absolue au-delà de 7 jours, le bucket reste toujours `days`. L'identité
 * `floor(floor(diff/60000)/60) === floor(diff/3600000)` (vraie pour des ms
 * entières) garantit que le passage par `classifyRelativeTime` reproduit
 * **exactement** les valeurs des anciennes implémentations manuelles.
 */

import { classifyRelativeTime } from '@meeshy/shared/utils/relative-time';

type TranslateFn = (key: string) => string;

type AgentTimeAgoOptions = {
  /** Libellé rendu quand la date est absente/vide (défaut : `agent.overview.timeAgo.never`). */
  readonly nullLabel?: string;
};

/**
 * Rendu verbeux (« il y a 5 minutes ») via les clés `agent.overview.timeAgo.*`.
 * Reproduit `t('agent.overview.timeAgo.minutes').replace('{{count}}', String(n))`.
 */
export function formatAgentTimeAgo(
  dateStr: string | null | undefined,
  t: TranslateFn,
  options: AgentTimeAgoOptions = {}
): string {
  if (!dateStr) return options.nullLabel ?? t('agent.overview.timeAgo.never');

  const bucket = classifyRelativeTime(new Date(dateStr).getTime(), Date.now(), {
    beyondDays: Infinity,
  });

  switch (bucket.unit) {
    case 'now':
      return t('agent.overview.timeAgo.justNow');
    case 'minutes':
      return t('agent.overview.timeAgo.minutes').replace('{{count}}', String(bucket.value));
    case 'hours':
      return t('agent.overview.timeAgo.hours').replace('{{count}}', String(bucket.value));
    case 'days':
      return t('agent.overview.timeAgo.days').replace('{{count}}', String(bucket.value));
    default:
      return options.nullLabel ?? t('agent.overview.timeAgo.never');
  }
}

/**
 * Rendu compact (« 5min ») via les clés `timeAgo.*`, valeur concaténée au libellé.
 */
export function formatAgentTimeAgoShort(
  dateStr: string | null | undefined,
  t: TranslateFn,
  options: AgentTimeAgoOptions = {}
): string {
  if (!dateStr) return options.nullLabel ?? t('agent.overview.timeAgo.never');

  const bucket = classifyRelativeTime(new Date(dateStr).getTime(), Date.now(), {
    beyondDays: Infinity,
  });

  switch (bucket.unit) {
    case 'minutes':
      return `${bucket.value}${t('timeAgo.minutes')}`;
    case 'hours':
      return `${bucket.value}${t('timeAgo.hours')}`;
    case 'days':
      return `${bucket.value}${t('timeAgo.days')}`;
    default:
      return t('timeAgo.now');
  }
}
