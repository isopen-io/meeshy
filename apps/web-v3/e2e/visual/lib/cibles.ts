import type { Page } from '@playwright/test';

/**
 * LA MESURE DES CIBLES TACTILES — charte règles 4 et 6, un seul site.
 *
 * Une hauteur de cible est une valeur CALCULÉE : elle dépend de la cascade
 * complète (`min-block-size`, le rembourrage, l'interligne, la police servie,
 * la largeur du cadre). Un `grep` sur la feuille dit ce que le code DEMANDE ;
 * seule une mise en page dit ce que le doigt TOUCHE. C'est pourquoi la mesure
 * vit au navigateur, et pourquoi elle vit ICI plutôt que dans chaque spec :
 * deux specs qui recopieraient le sélecteur des cibles ou l'exception du cadre
 * inerte divergeraient au premier écran ajouté.
 *
 * Ce qu'un doigt peut viser : tout `a`, `button`, `input`, `select`, `summary`
 * VISIBLE — hors d'un sous-arbre `inert`, qui n'est PAS une cible : le cadre
 * flouté de `/chat/:lien` porte un composeur et un retour que personne ne peut
 * atteindre tant que la modale est là (règle 25). Un nœud masqué n'est pas une
 * cible non plus — `.hors-ecran` en pose un par écran.
 */

/** La règle 4 : rien de tactile sous 44 px, ni en hauteur NI en largeur. */
export const TARGET_MIN = 44;
export const ACTION_PRIMAIRE = 56;
export const ACTION_SECONDAIRE = 52;
export const FLOTTANT_MIN = 52;

/** Les deux largeurs que la règle nomme : le cadre de la planche, et le téléphone le plus étroit encore vendu. */
export const LARGEURS = [360, 390] as const;

export type Cible = {
  readonly selecteur: string;
  readonly texte: string;
  readonly largeur: number;
  readonly hauteur: number;
};

const CIBLES = 'a, button, input, select, summary, [role="button"]';

export const ciblesMesurees = (page: Page): Promise<readonly Cible[]> =>
  page.evaluate(
    (selecteur) =>
      [...document.querySelectorAll(selecteur)]
        .filter((noeud) => noeud.closest('[inert]') === null)
        // Un nœud VISUELLEMENT MASQUÉ n'est pas une cible : `.hors-ecran` fait
        // 1 px par construction — le lien d'évitement de chaque écran (règle 6)
        // et le champ de fichier du composeur, dont la cible réelle est le
        // `<label class="joindre">` posé à côté de lui. La règle le disait déjà
        // en toutes lettres au-dessus ; seul le filtre `largeur > 0` la faisait
        // respecter, et il ne la faisait pas respecter du tout.
        .filter((noeud) => noeud.closest('.hors-ecran') === null)
        .map((noeud) => {
          const rect = noeud.getBoundingClientRect();
          return {
            selecteur: `${noeud.tagName.toLowerCase()}.${noeud.className || '(sans classe)'}`,
            texte: (noeud.textContent ?? '').trim().slice(0, 40),
            largeur: Math.round(rect.width),
            hauteur: Math.round(rect.height),
          };
        })
        .filter((cible) => cible.largeur > 0 && cible.hauteur > 0),
    CIBLES,
  );

export const ciblesTropPetites = (cibles: readonly Cible[]): readonly Cible[] =>
  cibles.filter((cible) => cible.hauteur < TARGET_MIN || cible.largeur < TARGET_MIN);

/** Les hauteurs calculées d'un sélecteur — pour opposer `.action.primaire` à 56 et `.action.contour` à 52. */
export const hauteursDe = (page: Page, selecteur: string): Promise<readonly number[]> =>
  page.evaluate(
    (s) => [...document.querySelectorAll(s)].filter((n) => n.closest('[inert]') === null).map((noeud) => Math.round(noeud.getBoundingClientRect().height)),
    selecteur,
  );
