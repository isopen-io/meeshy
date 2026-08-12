/**
 * Utilitaire de formatage de dates relatives avec support i18n
 */

import { calendarDayDiff } from '@meeshy/shared/utils/calendar-date';

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

  // Calculer les différences
  const diffMs = now.getTime() - messageDate.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  // Différence en jours calendaires (comparaison des minuits locaux)
  const diffDays = calendarDayDiff(messageDate.getTime(), now.getTime());

  // Moins d'une minute
  if (diffMinutes < 1) {
    return t('justNow');
  }

  // Moins d'une heure
  if (diffMinutes < 60) {
    return t('minutesAgo', { minutes: diffMinutes });
  }

  // Moins de 24h (aujourd'hui)
  if (diffHours < 24 && diffDays === 0) {
    return t('hoursAgo', { hours: diffHours });
  }

  // Hier
  if (diffDays === 1) {
    const time = formatTime(messageDate, locale);
    return t('yesterday', { time });
  }

  // Cette semaine (moins de 7 jours)
  if (diffDays < 7) {
    const dayName = messageDate.toLocaleDateString(locale, { weekday: 'short' });
    const time = formatTime(messageDate, locale);
    // Capitaliser la première lettre du jour
    const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    return `${capitalizedDay} ${time}`;
  }

  // Plus ancien (>= 7 jours) : afficher la date complète simplifiée
  return formatShortDate(messageDate, locale);
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

  // Différence en jours calendaires (comparaison des minuits locaux)
  const diffDays = calendarDayDiff(messageDate.getTime(), now.getTime());

  // Si c'est aujourd'hui — ou dans le futur (décalage d'horloge client sur une
  // frontière de minuit → diffDays négatif) — afficher seulement l'heure.
  // Sans ce garde `<= 0`, un timestamp de demain retombait sur la branche
  // `diffDays < 7` et s'affichait avec un jour de semaine (ex. « Mer. 00:10 »).
  if (diffDays <= 0) {
    return formatTime(messageDate, locale);
  }

  // Si c'est hier
  if (diffDays === 1) {
    const time = formatTime(messageDate, locale);
    return t('yesterday', { time });
  }

  // Si c'est dans les 7 derniers jours, afficher le jour de la semaine + heure
  if (diffDays < 7) {
    const dayName = messageDate.toLocaleDateString(locale, { weekday: 'short' });
    const time = formatTime(messageDate, locale);
    // Capitaliser la première lettre du jour
    const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    return `${capitalizedDay} ${time}`;
  }

  // Si c'est plus ancien, afficher la date complète simplifiée
  return formatShortDate(messageDate, locale);
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

/**
 * Formate une date + heure courte, localisée selon la locale d'interface.
 * Format : "5 nov. 2025, 14:30" (fr) / "Nov 5, 2025, 14:30" (en)
 *
 * Utilisé par les cartes/détails de liens de tracking (métadonnées created/
 * expires/lastClick). Toujours en 24h (`hour12: false`), cohérent avec
 * `formatFullDate`/`formatTime`/`formatConversationDate`.
 *
 * @param date - La date à formater
 * @param locale - Locale BCP 47 (défaut: 'fr')
 * @returns La date formatée
 */
export function formatShortDateTime(
  date: Date | string,
  locale: string = DEFAULT_LOCALE
): string {
  const messageDate = typeof date === 'string' ? new Date(date) : date;

  return messageDate.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Formate une date courte (sans heure), localisée selon la locale d'interface.
 * Format : "5 nov. 2025" (fr) / "Nov 5, 2025" (en) — ordre natif par locale.
 *
 * Helper date-seule à privilégier pour les métadonnées « créé le / expire le /
 * dernière activité » (groupes, profils voix, contacts). Ne JAMAIS appeler
 * `toLocaleDateString()` sans locale : la date s'afficherait dans la locale du
 * navigateur au lieu de la langue d'interface (violation du Prisme).
 *
 * @param date - La date à formater
 * @param locale - Locale BCP 47 (défaut: 'fr')
 * @returns La date formatée
 */
export function formatShortDate(
  date: Date | string,
  locale: string = DEFAULT_LOCALE
): string {
  const messageDate = typeof date === 'string' ? new Date(date) : date;

  return messageDate.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(date: Date, locale: string): string {
  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
