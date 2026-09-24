import type { ReactNode } from 'react';

/**
 * **LA CIBLE RONDE DU CHROME — UNE COTE, TOUS LES ÉCRANS** (#6080).
 *
 * iOS n'a qu'un seul dessin pour les actions d'en-tête : un **disque de 28**
 * dans une **cible tactile de 44** (`ConversationView+Header.swift`). Cette
 * cote est GÉNÉRÉE depuis la source Swift et publiée dans la table du web
 * depuis le premier jour — `--size-header-circle` (`styles/ios.css:73`,
 * dérivée de `--ios-header-circle`).
 *
 * **Personne ne la lisait.** Mesuré avant ce lot : `thread-header.tsx` écrivait
 * `size-7` (28, juste par accident), `conversations.tsx` écrivait `size-8`
 * (32) pour la même famille de bouton, et le rail des stories posait des
 * disques pleins de 44. Trois dessins pour un seul rôle, sur trois écrans que
 * l'utilisateur enchaîne — c'est exactement ce que « aligner les vues » nomme.
 *
 * Un jeton qu'aucune surface ne consomme ne protège rien : il se régénère
 * fidèlement, et la dérive se produit à côté de lui. Ce module est le
 * CONSOMMATEUR, et il est unique.
 *
 * **La teinte se DÉRIVE de la couleur du bouton** (`currentColor`), jamais
 * d'une prop : dans un fil c'est l'accent de la conversation, dans la liste
 * c'est la marque, et un disque teinté à 18 % de sa propre encre est juste
 * dans les deux cas sans que l'appelant ait à le dire — donc sans qu'il
 * puisse se tromper.
 */

/** La cible TACTILE — 44, le minimum d'Apple, jamais négociable (dimension 5). */
export const CHROME_ACTION_HIT = 44;

/**
 * Les classes de la cible tactile. Un `<button>` et un `<a>` la portent
 * indifféremment : ce module ne choisit pas l'élément — un lien qui navigue
 * DOIT rester un lien (`route-table.tsx` § Link).
 */
export const CHROME_ACTION_HIT_CLASS = 'relative grid size-11 shrink-0 place-items-center rounded-chip';

/**
 * Le DISQUE visible au centre de la cible. `aria-hidden` n'est pas posé ici :
 * ce `<span>` ne porte aucun texte, et c'est l'élément interactif qui tient
 * le nom accessible.
 */
export function ChromeActionDisc({ children }: { readonly children: ReactNode }) {
  return (
    <span
      data-chrome-disc
      className="grid place-items-center rounded-chip"
      style={{
        width: 'var(--size-header-circle)',
        height: 'var(--size-header-circle)',
        backgroundColor: 'color-mix(in srgb, currentColor 18%, transparent)',
      }}
    >
      {children}
    </span>
  );
}
