/**
 * Utilitaire de formatage de dates relatives avec support i18n
 */

export interface DateFormatOptions {
  /** Fonction de traduction i18n */
  t: (key: string, params?: Record<string, any>) => string;
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
  const { t } = options;
  const messageDate = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();

  // Calculer les différences
  const diffMs = now.getTime() - messageDate.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  // Calculer la différence en jours (en comparant les dates à minuit)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDateStart = new Date(
    messageDate.getFullYear(),
    messageDate.getMonth(),
    messageDate.getDate()
  );
  const diffTime = todayStart.getTime() - messageDateStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

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
    const time = messageDate.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return t('yesterday', { time });
  }

  // Cette semaine (moins de 7 jours)
  if (diffDays < 7) {
    const dayName = messageDate.toLocaleDateString('fr-FR', { weekday: 'short' });
    const time = messageDate.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    // Capitaliser la première lettre du jour
    const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    return `${capitalizedDay} ${time}`;
  }

  // Plus ancien (>= 7 jours) : afficher la date complète simplifiée
  const day = messageDate.toLocaleDateString('fr-FR', { day: 'numeric' });
  const month = messageDate.toLocaleDateString('fr-FR', { month: 'short' });
  const year = messageDate.toLocaleDateString('fr-FR', { year: 'numeric' });
  return `${day} ${month} ${year}`;
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
  const { t } = options;
  const messageDate = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();

  // Calculer la différence en jours (en comparant les dates à minuit)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDateStart = new Date(
    messageDate.getFullYear(),
    messageDate.getMonth(),
    messageDate.getDate()
  );
  const diffTime = todayStart.getTime() - messageDateStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // Si c'est aujourd'hui, afficher seulement l'heure
  if (diffDays === 0) {
    return messageDate.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Si c'est hier
  if (diffDays === 1) {
    const time = messageDate.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return t('yesterday', { time });
  }

  // Si c'est dans les 7 derniers jours, afficher le jour de la semaine + heure
  if (diffDays < 7) {
    const dayName = messageDate.toLocaleDateString('fr-FR', { weekday: 'short' });
    const time = messageDate.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    // Capitaliser la première lettre du jour
    const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
    return `${capitalizedDay} ${time}`;
  }

  // Si c'est plus ancien, afficher la date complète simplifiée
  const day = messageDate.toLocaleDateString('fr-FR', { day: 'numeric' });
  const month = messageDate.toLocaleDateString('fr-FR', { month: 'short' });
  const year = messageDate.toLocaleDateString('fr-FR', { year: 'numeric' });
  return `${day} ${month} ${year}`;
}

/**
 * Formate une date complète pour la copie de message
 * Format : "lundi 4 novembre 2025 à 14:30"
 *
 * @param date - La date à formater
 * @returns La date formatée en texte complet
 */
export function formatFullDate(date: Date | string): string {
  const messageDate = typeof date === 'string' ? new Date(date) : date;

  const weekday = messageDate.toLocaleDateString('fr-FR', { weekday: 'long' });
  const day = messageDate.toLocaleDateString('fr-FR', { day: 'numeric' });
  const month = messageDate.toLocaleDateString('fr-FR', { month: 'long' });
  const year = messageDate.toLocaleDateString('fr-FR', { year: 'numeric' });
  const time = messageDate.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${weekday} ${day} ${month} ${year} à ${time}`;
}
