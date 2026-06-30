/**
 * Utilitaire de formatage de dates relatives avec support i18n
 */

import { classifyCalendarDay, classifyRelativeTime } from '@meeshy/shared';

const DEFAULT_LOCALE = 'fr';

export interface DateFormatOptions {
  /** Fonction de traduction i18n */
  t: (key: string, params?: Record<string, any>) => string;
  /** Locale BCP 47 pour les noms de jours/mois (ex: 'fr', 'en', 'es', 'pt') */
  locale?: string;
  /** Clé de base pour les traductions (ex: 'conversations' ou 'common') */
  translationKey?: string;
}

/**
 * Formate une date de manière relative avec support i18n
 *
 * Règles de formatage :
 * - < 1 minute : "à l'instant"
 * - < 60 minutes : "il y a Xmin"
 * - < 24h : "il y a Xh"
 * - Hier : "Hier HH:mm"
 * - < 7 jours : "Jour HH:mm" (ex: "Ven 23:45")
 * - >= 7 jours : Date complète (ex: "Ven. 04. Nov. 2025")
 *
 * @param date - La date à formater
 * @param options - Options de formatage avec fonction de traduction
 * @returns La date formatée
 */
export function formatRelativeDate(
  date: Date | string,
  options: DateFormatOptions
): string {
  const { t, locale = DEFAULT_LOCALE } = options;
  const messageDate = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();

  const day = classifyCalendarDay(messageDate.getTime(), now.getTime());

  // Aujourd'hui : granularité intra-journée (instant / minutes / heures)
  if (day.unit === 'today') {
    const elapsed = classifyRelativeTime(messageDate.getTime(), now.getTime());
    switch (elapsed.unit) {
      case 'now':
        return t('justNow');
      case 'minutes':
        return t('minutesAgo', { minutes: elapsed.value });
      case 'hours':
        return t('hoursAgo', { hours: elapsed.value });
      default:
        // Intra-journée : jamais days/beyond ; repli défensif sur l'heure.
        return formatTime(messageDate, locale);
    }
  }

  if (day.unit === 'yesterday') {
    return t('yesterday', { time: formatTime(messageDate, locale) });
  }

  if (day.unit === 'thisWeek') {
    return formatWeekday(messageDate, locale);
  }

  // Plus ancien (>= 7 jours) : afficher la date complète simplifiée
  return formatShortFullDate(messageDate, locale);
}

/**
 * Formate une date pour la liste de conversations
 * (Version simplifiée sans les traductions "il y a X minutes/heures")
 *
 * Règles de formatage :
 * - Aujourd'hui : "HH:mm"
 * - Hier : "Hier HH:mm"
 * - Cette semaine : "Jour HH:mm" (ex: "Ven 23:45")
 * - Plus ancien : Date complète (ex: "Ven. 04. Nov. 2025")
 *
 * @param date - La date à formater
 * @param options - Options de formatage avec fonction de traduction
 * @returns La date formatée
 */
export function formatConversationDate(
  date: Date | string,
  options: DateFormatOptions
): string {
  const { t, locale = DEFAULT_LOCALE } = options;
  const messageDate = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();

  const day = classifyCalendarDay(messageDate.getTime(), now.getTime());

  // Si c'est aujourd'hui, afficher seulement l'heure
  if (day.unit === 'today') {
    return formatTime(messageDate, locale);
  }

  // Si c'est hier
  if (day.unit === 'yesterday') {
    return t('yesterday', { time: formatTime(messageDate, locale) });
  }

  // Si c'est dans les 7 derniers jours, afficher le jour de la semaine + heure
  if (day.unit === 'thisWeek') {
    return formatWeekday(messageDate, locale);
  }

  // Si c'est plus ancien, afficher la date complète simplifiée
  return formatShortFullDate(messageDate, locale);
}

/**
 * Formate une date complète pour la copie de message
 * Format : "lundi 4 novembre 2025 à 14:30" (fr) / "Monday, November 4, 2025 at 14:30" (en)
 *
 * @param date - La date à formater
 * @param locale - Locale BCP 47 (défaut: 'fr')
 * @returns La date formatée en texte complet
 */
export function formatFullDate(
  date: Date | string,
  locale: string = DEFAULT_LOCALE
): string {
  const messageDate = typeof date === 'string' ? new Date(date) : date;

  return messageDate.toLocaleString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatTime(date: Date, locale: string): string {
  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatWeekday(date: Date, locale: string): string {
  const dayName = date.toLocaleDateString(locale, { weekday: 'short' });
  // Capitaliser la première lettre du jour
  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  return `${capitalizedDay} ${formatTime(date, locale)}`;
}

function formatShortFullDate(date: Date, locale: string): string {
  const day = date.toLocaleDateString(locale, { day: 'numeric' });
  const month = date.toLocaleDateString(locale, { month: 'short' });
  const year = date.toLocaleDateString(locale, { year: 'numeric' });
  return `${day} ${month} ${year}`;
}
