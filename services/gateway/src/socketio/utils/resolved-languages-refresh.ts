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
    // La colonne est NULLABLE, et le déclarer `string` ne l'a jamais rendue non
    // nulle : la valeur venait d'un `select` Prisma, donc `null` traversait le
    // typage jusque dans `entry.language`, typé `string`.
    systemLanguage?: string | null;
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
  // Cycle 124 — la langue de CADRAGE est la TÊTE de la liste qu'on vient de
  // calculer, pas une seconde lecture de `systemLanguage`. Les deux divergeaient
  // dans la MÊME instruction dès que le rang 1 est vide (`language: null` dans
  // un champ typé `string`) ou seulement dénormalisé (`'pt-BR'` là où la liste
  // porte déjà `'pt'`).
  //
  // Un rafraîchissement qui ne résout RIEN ne détruit pas la langue connue : il
  // n'apporte aucune information nouvelle, et écraser par un défaut ferait
  // régresser un lecteur dont la langue était établie à la connexion.
  connectedUsers.set(userId, {
    ...entry,
    resolvedLanguages,
    language: resolvedLanguages[0] ?? entry.language,
  });
  return true;
}
