import type { ReactNode } from 'react';

/**
 * UN BARREAU QUI PARAÎT (#6405) — le ressort d'entrée des champs de
 * l'inscription, et rien d'autre.
 *
 * **Tant qu'il n'est pas paru, il n'existe pas.** Un bloc replié mais MONTÉ
 * laisserait ses champs dans l'ordre de tabulation, dans le formulaire envoyé
 * et dans l'arbre d'accessibilité — un champ « invisible » qu'un lecteur
 * d'écran annonce et qu'une tabulation atteint est pire qu'un champ visible.
 * Le rendu conditionnel, lui, ne ment à personne.
 *
 * **L'animation est une ENTRÉE, jamais une sortie.** La loi des barreaux est
 * monotone (`signup-phases.ts`, #8288) : rien ne se referme, donc il n'y a rien à
 * animer en sens inverse. Le ressort est celui que l'inscription emploie déjà
 * (`.signup-spring`, `app.css` § « LE RESSORT DU COMPOSER ») : un fondu et un
 * glissé vers le bas, en `opacity` et `transform` seuls (#11314). Le bloc a sa
 * HAUTEUR réelle dès le premier rendu — jamais une valeur devinée qui se
 * couperait au premier cran de Dynamic Type, et aucune mise en page par image.
 * `prefers-reduced-motion` la coupe déjà, à la source.
 */
export function RungReveal({ shown, children }: { readonly shown: boolean; readonly children: ReactNode }) {
  if (!shown) return null;
  return (
    <div className="signup-spring grid gap-5" data-rung-reveal="open">
      {children}
    </div>
  );
}
