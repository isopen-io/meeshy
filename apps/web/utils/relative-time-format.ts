import { classifyRelativeTime } from '@meeshy/shared/utils/relative-time';

/**
 * Présentation i18n partagée du « temps relatif » du tableau de bord agent.
 *
 * La **classification** (maintenant / minutes / heures / jours) est déléguée au
 * SSOT `classifyRelativeTime` (`packages/shared/utils/relative-time.ts`) ; ce
 * module ne porte plus que la **présentation** (clés i18n, style d'affichage).
 * Avant, cinq sites du dashboard agent (`AgentOverviewTab`, `AgentConversationsTab`,
 * `AgentMessagesModal`, `ScanLogTable`, `AgentLiveTab`) réimplémentaient chacun la
 * même échelle `Math.floor(diff / …)` ; seul `AgentLiveTab` avait convergé.
 *
 * `beyondDays: Infinity` : les dates anciennes ne débordent jamais vers une date
 * absolue — le bucket reste `days` (« 400d »), conforme au comportement historique
 * du dashboard (aucun de ces sites ne rendait de date absolue).
 *
 * Le « maintenant » est injecté (`nowMs`) plutôt que lu via `Date.now()`, rendant
 * les deux fonctions pures et déterministes (testables sans horloge figée).
 */

export type TranslateKey = (key: string) => string;

/**
 * Style « phrasé » : « Just now » / « 5min ago » / « 3h ago » / « 2d ago ».
 * Clés `<prefix>.{justNow,minutes,hours,days}` avec interpolation manuelle de
 * `{{count}}` (le `t` de ces vues ne prend pas de paramètres).
 */
export function formatPhrasedTimeAgo(
  targetMs: number,
  nowMs: number,
  t: TranslateKey,
  prefix: string
): string {
  const bucket = classifyRelativeTime(targetMs, nowMs, { beyondDays: Infinity });
  switch (bucket.unit) {
    case 'minutes':
      return t(`${prefix}.minutes`).replace('{{count}}', String(bucket.value));
    case 'hours':
      return t(`${prefix}.hours`).replace('{{count}}', String(bucket.value));
    case 'days':
      return t(`${prefix}.days`).replace('{{count}}', String(bucket.value));
    default:
      return t(`${prefix}.justNow`);
  }
}

/**
 * Style « compact » : « just now » / « 5min » / « 3h » / « 2d ».
 * Clés `<prefix>.{now,minutes,hours,days}` rendues en suffixe d'unité.
 */
export function formatCompactTimeAgo(
  targetMs: number,
  nowMs: number,
  t: TranslateKey,
  prefix: string
): string {
  const bucket = classifyRelativeTime(targetMs, nowMs, { beyondDays: Infinity });
  switch (bucket.unit) {
    case 'minutes':
      return `${bucket.value}${t(`${prefix}.minutes`)}`;
    case 'hours':
      return `${bucket.value}${t(`${prefix}.hours`)}`;
    case 'days':
      return `${bucket.value}${t(`${prefix}.days`)}`;
    default:
      return t(`${prefix}.now`);
  }
}
