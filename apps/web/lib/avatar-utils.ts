import { getUserDisplayName as resolveDisplayName } from '@/utils/user-display-name';
import { getInitials } from '@/utils/initials';

// Le type accepté dérive directement du résolveur de nom canonique : `getUserInitials`
// accepte exactement ce que `getUserDisplayName` sait résoudre (champs de nom structurels),
// pas un `User` complet — source unique de type.
type UserNameSource = Parameters<typeof resolveDisplayName>[0];

/**
 * Génère les initiales d'un utilisateur à partir de ses informations.
 *
 * Dérive du **nom résolu canonique** (`getUserDisplayName` : displayName >
 * firstName+lastName > username) découpé par le **canonique string** `getInitials`
 * (mot unique → 2 car., multi-mot → 1ʳᵉ du 1er + 1ʳᵉ du dernier mot, uppercase,
 * crash/null-safe). Les initiales **correspondent toujours au nom affiché** —
 * source unique de découpe + source unique de résolution de nom.
 *
 * @param user - L'objet utilisateur (champs de nom)
 * @returns Les initiales en majuscules (ex: "JD" pour John Doe), `'??'` si aucun nom
 */
export function getUserInitials(user: UserNameSource): string {
  return getInitials(resolveDisplayName(user, ''), '??');
}

/**
 * Génère les initiales pour un message (utilisateur ou anonyme)
 * @param message - L'objet message avec sender
 * @returns Les initiales en majuscules
 */
export function getMessageInitials(message: unknown): string {
  // Narrowing au trust boundary : on ne lit que `sender` (champs de nom) sur une
  // entrée non typée, puis on délègue au canonique.
  const sender = (message as { sender?: UserNameSource } | null | undefined)?.sender;
  return sender ? getUserInitials(sender) : '??';
}

/**
 * Génère un nom d'affichage pour un utilisateur
 * @param user - L'objet utilisateur
 * @returns Le nom d'affichage
 */
export function getUserDisplayName(user: UserNameSource): string {
  // Délègue à la source unique `utils/user-display-name` (priorité
  // displayName > firstName+lastName > username, fallback `'Utilisateur inconnu'`,
  // avec trim des valeurs blanches) — pas de réimplémentation locale.
  return resolveDisplayName(user);
}
