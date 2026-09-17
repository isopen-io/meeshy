import type { AdminUserEdit } from '@/lib/api/admin-user-actions';

/**
 * **CE QUI MÉRITE UNE CONFIRMATION** (#6819), et rien d'autre.
 *
 * Le port de l'administration porte la règle depuis #6432 : « une écriture
 * d'administration sans sa confirmation serait pire que son absence ». Le
 * corollaire est moins souvent dit et tout aussi vrai — **confirmer TOUT, c'est
 * n'avertir de rien** : un administrateur à qui l'on demande de valider chaque
 * changement de biographie apprend à cliquer « oui » sans lire, et le jour où
 * la question compte, il ne la voit plus.
 *
 * Deux changements sortent du lot, pour des raisons mesurées côté passerelle :
 *
 * - **`role`** déplace quelqu'un dans la hiérarchie. La passerelle contrôle le
 *   rang VISÉ en plus de celui de l'acteur (`users-write.ts`), donc une
 *   promotion mal placée ne se répare pas toujours d'un second geste — l'acteur
 *   peut avoir perdu le droit d'y revenir.
 * - **`isActive: false`** emporte la **coupure des sessions ouvertes** de la
 *   cible : `updateStatus` révoque les sessions et pose `deactivatedAt`.
 *   L'effet dépasse la ligne éditée — la personne est déconnectée séance
 *   tenante, où qu'elle soit et quoi qu'elle fasse.
 *
 * **Réactiver n'est pas sensible.** `isActive: true` ne coupe rien et rend un
 * accès. Demander confirmation pour rendre un droit entraînerait précisément
 * au réflexe qu'on veut empêcher sur le geste qui le retire.
 *
 * Le type est importé, jamais recopié : une seconde liste des champs éditables
 * divergerait au premier champ ajouté, et cette garde-ci deviendrait muette
 * sur lui sans que rien ne rougisse.
 */
export type SensitiveChange = 'role' | 'deactivate';

/**
 * L'ordre est STABLE — `role` puis `deactivate` — parce qu'un écran qui
 * énumère des avertissements ne doit pas les réordonner d'un rendu à l'autre :
 * la place d'un texte dans une liste est ce qui permet de le reconnaître sans
 * le relire.
 */
export function sensitiveChangesOf(edit: AdminUserEdit): readonly SensitiveChange[] {
  const changements: SensitiveChange[] = [];

  // `undefined` n'est pas un changement : un interrupteur qu'on n'a pas touché
  // ne présente aucun champ, et la passerelle ne le verrait pas non plus.
  if (edit.role !== undefined) changements.push('role');
  if (edit.isActive === false) changements.push('deactivate');

  return changements;
}
