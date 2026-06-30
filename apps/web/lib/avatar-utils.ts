import type { User } from '@meeshy/shared/types';
import { getUserDisplayName as resolveDisplayName } from '@/utils/user-display-name';

/**
 * Génère les initiales d'un utilisateur à partir de ses informations
 * @param user - L'objet utilisateur
 * @returns Les initiales en majuscules (ex: "JD" pour John Doe)
 */
export function getUserInitials(user: User | null | undefined): string {
  if (!user) {
    return '??';
  }

  // Priorité 1: firstName et lastName
  if (user.firstName && user.lastName) {
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  }

  // Priorité 2: firstName seulement
  if (user.firstName) {
    return user.firstName.charAt(0).toUpperCase();
  }

  // Priorité 3: lastName seulement
  if (user.lastName) {
    return user.lastName.charAt(0).toUpperCase();
  }

  // Priorité 4: displayName
  if (user.displayName) {
    const words = user.displayName.trim().split(/\s+/);
    if (words.length >= 2) {
      return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
    }
    return words[0].charAt(0).toUpperCase();
  }

  // Priorité 5: username
  if (user.username) {
    return user.username.charAt(0).toUpperCase();
  }

  // Fallback: initiales par défaut
  return '??';
}

/**
 * Génère les initiales pour un message (utilisateur ou anonyme)
 * @param message - L'objet message avec sender
 * @returns Les initiales en majuscules
 */
export function getMessageInitials(message: unknown): string {
  // Utilisateur normal
  if (message.sender) {
    return getUserInitials(message.sender);
  }

  // Fallback
  return '??';
}

/**
 * Génère un nom d'affichage pour un utilisateur
 * @param user - L'objet utilisateur
 * @returns Le nom d'affichage
 */
export function getUserDisplayName(user: User | null | undefined): string {
  // Délègue à la source unique `utils/user-display-name` (priorité
  // displayName > firstName+lastName > username, fallback `'Utilisateur inconnu'`,
  // avec trim des valeurs blanches) — pas de réimplémentation locale.
  return resolveDisplayName(user);
}
