import type { CallsWindow, KpiPeriod, MessageTypesPeriod } from '@/lib/api/admin-analytics';
import type { LanguagesPeriod, LanguagesTimelinePeriod } from '@/lib/api/admin-languages';
import type { EngagementPeriod, MessagesPeriod } from '@/lib/api/admin-message-stats';

/**
 * **LES FENÊTRES DES STATISTIQUES** (#8876, #6728) — la passerelle ne comprend
 * pas les mêmes périodes d'une route à l'autre : les indicateurs veulent 7, 30
 * ou 90 jours, les types de messages 24 h, 7 ou 30 jours, l'engagement 7 ou 30
 * jours, les appels un nombre de jours.
 *
 * L'écran n'offre qu'UNE période par onglet (`?period=`, dans l'adresse). Un
 * bloc dont la route n'a pas cette fenêtre prend la plus proche qu'elle sert, et
 * l'écran écrit la fenêtre RÉELLEMENT servie dans son titre (« Période : 30
 * derniers jours ») : une mesure ne change jamais de fenêtre en silence.
 */
export const ACTIVITY_PERIODS = ['7d', '30d', '90d'] as const satisfies readonly KpiPeriod[];
export const MESSAGES_PERIODS = ['24h', '7d', '30d', '90d'] as const satisfies readonly MessagesPeriod[];
export const CALLS_PERIODS = ['7d', '30d', '90d'] as const satisfies readonly KpiPeriod[];
export const LANGUAGES_PERIODS = ['7d', '30d', '90d'] as const satisfies readonly LanguagesPeriod[];

export const ACTIVITY_DEFAULT: KpiPeriod = '30d';
export const MESSAGES_DEFAULT: MessagesPeriod = '30d';
export const CALLS_DEFAULT: KpiPeriod = '7d';
export const LANGUAGES_DEFAULT: LanguagesPeriod = '30d';

/** Les types de messages n'existent pas sur 90 jours : les 30 jours sont la fenêtre servie la plus proche. */
export const typesPeriodOf = (period: KpiPeriod): MessageTypesPeriod => (period === '90d' ? '30d' : period);

/** L'engagement n'existe que sur 7 et 30 jours : 24 h retombe sur 7 jours, 90 jours sur 30 jours. */
export const engagementPeriodOf = (period: MessagesPeriod): EngagementPeriod => (period === '24h' ? '7d' : period === '90d' ? '30d' : period);

export const callsWindowOf = (period: KpiPeriod): CallsWindow => (period === '7d' ? 7 : period === '30d' ? 30 : 90);

/** La chronologie des langues n'existe que sur 7 et 30 jours. */
export const timelinePeriodOf = (period: LanguagesPeriod): LanguagesTimelinePeriod => (period === '90d' ? '30d' : period);
