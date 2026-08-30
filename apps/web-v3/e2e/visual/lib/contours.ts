import type { Page } from '@playwright/test';

/**
 * LE CONTOUR D'UN CONTRÔLE SANS FOND — WCAG 1.4.11, 3:1 — mesuré là où il est
 * VRAI : dans le navigateur, sur la couleur SERVIE.
 *
 * Pourquoi pas dans `scripts/check-jetons.mjs`, qui mesure déjà des contrastes :
 * ce gate juge la VALEUR d'un jeton (`--color-border-interactive` tient-il 3:1
 * sur les quatre plans ?) et il le fait bien. Ce qu'il ne peut pas juger, c'est
 * le jeton qu'un écran CHOISIT — parce qu'une feuille ne sait pas lequel de ses
 * sélecteurs est un contrôle. `.secondaire` est un bouton, `dl div` un
 * séparateur, et rien dans le CSS ne les distingue.
 *
 * Le DOM, lui, le sait : une balise et un rôle disent ce qui est un contrôle. La
 * mesure vit donc ici, à côté de la mesure de lisibilité du texte, et se lance
 * sur les quatre colonnes de thème — le mode CLAIR est le pire des deux pour
 * cette faute, et il ne se voit dans aucune capture prise en sombre.
 *
 * Le défaut mesuré qui l'a fait écrire : `.secondaire` portait
 * `border: 1px solid var(--color-border)` — 1,62:1 en sombre, 1,27:1 en clair —
 * alors que `packages/design-tokens` disqualifie ce jeton pour ce rôle à
 * l'endroit exact où il le définit.
 */

/** Ce qui porte SEUL son affordance : une balise de contrôle, ou un rôle qui en fait un. */
const CONTROLES = 'a[href], button, [role="button"], input, select, textarea';

export type ContourMesure = {
  readonly repere: string;
  readonly bordure: string;
  readonly plan: string;
};

/**
 * Les contours des contrôles de la page qui n'ont AUCUN fond — un contrôle
 * rempli porte son affordance par sa surface, pas par son trait.
 *
 * Le plan comparé est le premier ancêtre au fond OPAQUE, jamais `body` supposé :
 * un bouton fantôme posé sur une carte se mesure contre la carte.
 */
export const contoursDeControle = (page: Page): Promise<readonly ContourMesure[]> =>
  page.evaluate((selecteur) => {
    const TRANSPARENT = /^rgba?\([^)]*,\s*0(?:\.0+)?\s*\)$/;

    const planDe = (noeud: Element): string => {
      for (let parent = noeud.parentElement; parent !== null; parent = parent.parentElement) {
        const fond = getComputedStyle(parent).backgroundColor;
        if (!TRANSPARENT.test(fond)) return fond;
      }
      return getComputedStyle(document.body).backgroundColor;
    };

    return [...document.querySelectorAll(selecteur)].flatMap((noeud) => {
      const style = getComputedStyle(noeud);
      const largeur = Number.parseFloat(style.borderTopWidth);
      if (Number.isNaN(largeur) || largeur === 0) return [];
      if (!TRANSPARENT.test(style.backgroundColor)) return [];

      const repere = `${noeud.tagName.toLowerCase()}.${noeud.className}`.trim();
      return [{ repere, bordure: style.borderTopColor, plan: planDe(noeud) }];
    });
  }, CONTROLES);
