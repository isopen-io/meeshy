import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';

/**
 * B3 (5.3) — recompute la liste ordonnée de langues consommables d'une entrée
 * `connectedUsers` après un changement de préférences, pour que le filtre
 * `SOCKET_LANG_FILTER` reflète immédiatement la nouvelle langue (sinon : filtré
 * sur l'ancienne jusqu'à reconnexion). Mute la `Map` en place.
 *
 * @returns `true` si l'entrée existait et a été mise à jour ; `false` (no-op)
 *   si le user n'est pas connecté.
 */
export function applyResolvedLanguagesRefresh<
  T extends { resolvedLanguages: string[]; language: string }
>(
  connectedUsers: Map<string, T>,
  userId: string,
  prefs: {
    systemLanguage: string;
    regionalLanguage?: string | null;
    customDestinationLanguage?: string | null;
    deviceLocale?: string | null;
  }
): boolean {
  const entry = connectedUsers.get(userId);
  if (!entry) return false;
  const resolvedLanguages = resolveUserLanguagesOrdered(prefs, {
    deviceLocale: prefs.deviceLocale ?? undefined,
  });
  connectedUsers.set(userId, { ...entry, resolvedLanguages, language: prefs.systemLanguage });
  return true;
}
