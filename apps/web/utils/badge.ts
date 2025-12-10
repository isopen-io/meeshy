/**
 * BADGE API UTILITIES
 * Gestion du badge de notification sur l'icône PWA
 *
 * Support: Chrome 81+, Edge 81+, Samsung Internet 14+
 * Pas de support: Safari, Firefox
 */

/**
 * Vérifie si l'API Badging est supportée
 */
export const isBadgingSupported = (): boolean => {
  return 'setAppBadge' in navigator && 'clearAppBadge' in navigator;
};

/**
 * Met à jour le badge de l'application avec le nombre de notifications non lues
 *
 * @param count Nombre de notifications (0 = pas de badge, undefined = badge sans nombre)
 * @example
 * updateAppBadge(5);  // Badge [5]
 * updateAppBadge(0);  // Pas de badge
 * updateAppBadge();   // Badge [●] sans nombre
 */
export async function updateAppBadge(count?: number): Promise<void> {
  if (!isBadgingSupported()) {
    console.warn('[Badge] Badge API not supported on this browser');
    return;
  }

  try {
    const nav = navigator as any;

    if (count === undefined) {
      // Badge sans nombre (juste un point)
      await nav.setAppBadge();
    } else if (count === 0) {
      // Supprimer le badge
      await nav.clearAppBadge();
    } else {
      // Afficher le badge avec le compteur
      await nav.setAppBadge(count);
    }
  } catch (error) {
    console.error('[Badge] Error updating app badge:', error);
  }
}

/**
 * Supprime le badge de l'application
 */
export async function clearAppBadge(): Promise<void> {
  if (!isBadgingSupported()) {
    return;
  }

  try {
    await (navigator as any).clearAppBadge();
  } catch (error) {
    console.error('[Badge] Error clearing app badge:', error);
  }
}
