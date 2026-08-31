import type { Page } from '@playwright/test';

/**
 * LA LIMITE D'UN CONTRÔLE — WCAG 1.4.11, 3:1 — mesurée là où elle est VRAIE :
 * dans le navigateur, sur la couleur SERVIE.
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
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN CONTRÔLE REMPLI N'EST PLUS EXEMPTÉ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La première écriture n'examinait que les contrôles SANS fond, au motif qu'« un
 * contrôle rempli porte son affordance par sa surface ». C'est une hypothèse, et
 * l'écran `join` l'a falsifiée : ses champs portent `background:
 * var(--color-surface)` sur un plan `--color-bg` — soit **1,06:1 en clair et
 * 1,09:1 en sombre**. Leur surface ne porte rien du tout, et leur bordure
 * rendait 1,11:1. Les SEULS contrôles réels du rôle premier n'avaient donc
 * aucune limite perceptible, dans les deux schémas, et ce gate les ignorait
 * précisément parce qu'ils étaient remplis.
 *
 * La règle juste ne choisit pas entre les deux porteurs : **la limite d'un
 * contrôle est perceptible si SON FOND se détache du plan, OU si SA BORDURE se
 * détache de son fond.** C'est ce que `contrasteDeLaLimite` calcule, et c'est
 * pourquoi il vit ICI plutôt que dans chaque spec — deux écrans qui écriraient
 * la règle chacun de leur côté finiraient par l'écrire différemment.
 */

/** Ce qui porte SEUL son affordance : une balise de contrôle, ou un rôle qui en fait un. */
const CONTROLES = 'a[href], button, [role="button"], input, select, textarea';

export type ContourMesure = {
  readonly repere: string;
  /** La couleur du trait, ou `null` quand le contrôle n'en a pas. */
  readonly bordure: string | null;
  /** Le fond PROPRE du contrôle, ou `null` quand il est transparent. */
  readonly fond: string | null;
  /** Le premier plan OPAQUE derrière lui — jamais `body` supposé. */
  readonly plan: string;
};

/**
 * Les limites des contrôles de la page — TOUS, remplis ou non.
 *
 * Le plan comparé est le premier ancêtre au fond OPAQUE, jamais `body` supposé :
 * un bouton fantôme posé sur une carte se mesure contre la carte.
 *
 * Un contrôle sans trait ET sans fond propre ne rend AUCUNE mesure : il n'a pas
 * de limite à juger — c'est un lien dans une phrase, dont la lisibilité relève
 * du contraste de TEXTE, mesuré ailleurs.
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
      const trait = Number.isNaN(largeur) || largeur === 0 ? null : style.borderTopColor;
      const fond = TRANSPARENT.test(style.backgroundColor) ? null : style.backgroundColor;

      if (trait === null && fond === null) return [];

      const repere = `${noeud.tagName.toLowerCase()}.${noeud.className}`.trim();
      return [{ repere, bordure: trait, fond, plan: planDe(noeud) }];
    });
  }, CONTROLES);

/**
 * Le rapport de contraste de la LIMITE — le MEILLEUR des deux porteurs.
 *
 * Un contrôle rempli dont le fond tranche sur le plan a une limite, même sans
 * trait ; un contrôle fantôme dont le trait tranche sur le plan en a une, même
 * sans fond. Prendre le maximum est ce qui refuse le seul cas fautif : celui où
 * AUCUN des deux ne se voit.
 *
 * `contraste` est injecté depuis `scripts/lib/couleur.mjs`, le site unique du
 * calcul — le réécrire ici en ferait la jumelle que ce module existe pour
 * empêcher.
 */
export const contrasteDeLaLimite = (
  mesure: ContourMesure,
  contraste: (a: string, b: string) => number,
  hex: (rgb: string) => string,
): number => {
  const duFond = mesure.fond === null ? 0 : contraste(hex(mesure.fond), hex(mesure.plan));
  const duTrait =
    mesure.bordure === null
      ? 0
      : contraste(hex(mesure.bordure), hex(mesure.fond ?? mesure.plan));

  return Math.max(duFond, duTrait);
};
