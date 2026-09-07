import type { CSSProperties } from 'react';

/**
 * L'ACCENT DE LA CONVERSATION, pose en variable CSS sur le conteneur.
 *
 * Cote iOS il est CALCULE (`DynamicColorGenerator` : langue x type x theme) et
 * chaque vue le recoit en parametre. Sur le web, une variable CSS le fait
 * descendre a toute la sous-arborescence sans qu'un seul composant intermediaire
 * ait a le connaitre — les bulles, les puces, les bordures et le composeur le
 * lisent en `var(--accent)`. C'est le mecanisme qui rend tenable la regle
 * « aucun composant de conversation ne code une couleur en dur ».
 *
 * Le POC derive l'accent de la teinte de la conversation ; le vrai calcul vit
 * dans `ColorGeneration.swift` et devra etre porte tel quel.
 */
const TINTS: Record<1 | 2 | 3 | 4, string> = {
  1: 'var(--color-av-1)',
  2: 'var(--color-av-2)',
  3: 'var(--color-av-3)',
  4: 'var(--color-av-4)',
};

export function withAccent(tint: 1 | 2 | 3 | 4, rest?: CSSProperties): CSSProperties {
  return { ...rest, '--accent': TINTS[tint] } as CSSProperties;
}
