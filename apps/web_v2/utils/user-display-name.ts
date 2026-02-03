/**
 * Utilitaires pour l'affichage des noms d'utilisateurs
 * Priorité: displayName > firstName lastName > username
 */

interface UserLike {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}

/**
 * Obtient le nom à afficher pour un utilisateur selon la priorité:
 * 1. displayName (si défini et non vide)
 * 2. firstName + lastName (si au moins l'un des deux est défini)
 * 3. username
 * 4. fallback (par défaut: 'Utilisateur inconnu')
 *
 * @param user - Objet utilisateur (peut être SocketIOUser, AnonymousParticipant, etc.)
 * @param fallback - Texte à afficher si aucune information n'est disponible
 * @returns Le nom à afficher
 */
export function getUserDisplayName(user: UserLike | null | undefined, fallback: string = 'Utilisateur inconnu'): string {
  if (!user) return fallback;

  // Priorité 1: displayName
  if (user.displayName && user.displayName.trim()) {
    return user.displayName.trim();
  }

  // Priorité 2: firstName + lastName
  const firstName = user.firstName?.trim() || '';
  const lastName = user.lastName?.trim() || '';
  const fullName = `${firstName} ${lastName}`.trim();

  if (fullName) {
    return fullName;
  }

  // Priorité 3: username
  if (user.username && user.username.trim()) {
    return user.username.trim();
  }

  // Fallback
  return fallback;
}

/**
 * Variante qui retourne null au lieu d'un fallback si aucune info n'est disponible
 * Utile pour les cas où on veut gérer le fallback différemment
 */
export function getUserDisplayNameOrNull(user: UserLike | null | undefined): string | null {
  if (!user) return null;

  // Priorité 1: displayName
  if (user.displayName && user.displayName.trim()) {
    return user.displayName.trim();
  }

  // Priorité 2: firstName + lastName
  const firstName = user.firstName?.trim() || '';
  const lastName = user.lastName?.trim() || '';
  const fullName = `${firstName} ${lastName}`.trim();

  if (fullName) {
    return fullName;
  }

  // Priorité 3: username
  if (user.username && user.username.trim()) {
    return user.username.trim();
  }

  return null;
}
