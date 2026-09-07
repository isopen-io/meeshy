import type { Page } from '@playwright/test';

/**
 * CHARTE RÈGLE 8 b/c — « au repos, aucun élément FIXE ne couvre un
 * CONTRÔLE », À TOUTE POSITION DE DÉFILEMENT.
 *
 * SITE UNIQUE de la mesure : `v3-chats.spec.ts` la portait seule (revue de
 * #5164) ; `v3-espace-membre.spec.ts` gardait, pour le TABLEAU DE BORD, un
 * témoin plus étroit qui ne regardait que le DERNIER contrôle après un
 * défilement complet en bas — la seule position où la bande réservée par un
 * conteneur `.flottantes` masque le défaut. Une seconde mesure (revue
 * suivante) a montré qu'un élément `position:fixed` recouvre ce qu'il y a en
 * dessous QUEL QUE SOIT le défilement : réserver une bande en fin de flux ne
 * protège que le tout-en-bas, jamais le REPOS (défilement 0) une fois que le
 * contenu réel dépasse une fenêtre. D'où la mesure GÉNÉRALE, aux TROIS
 * positions, partagée par tous les hôtes qui peuvent un jour porter un
 * élément fixe.
 *
 * `interactifsSousUnFlottant`, plus bas, ÉTEND ce fichier d'une seconde
 * mesure — par pile de hit-test (`elementsFromPoint`), l'instrument que la
 * charte règle 8 nomme — sans remplacer celle-ci : les deux prédicats se
 * complètent (voir son doc-comment).
 */
export const POSITIONS_DE_DEFILEMENT = ['haut', 'milieu', 'bas'] as const;
export type PositionDeDefilement = (typeof POSITIONS_DE_DEFILEMENT)[number];

/**
 * LE PLACEMENT DU DÉFILEMENT — SITE UNIQUE (correction de revue, 2026-09-06).
 * Les deux mesures de ce fichier ET les témoins qui interrogent le pied de
 * page partaient d'une même expression recopiée trois fois ; une position qui
 * se calcule à trois endroits finit par se calculer de trois façons, et le
 * jour où l'une dérive, ce sont des témoins SANS RAPPORT qui rougissent.
 */
export const placeLeDefilement = async (page: Page, position: PositionDeDefilement): Promise<void> => {
  await page.evaluate((pos) => {
    const hauteur = document.body.scrollHeight - window.innerHeight;
    window.scrollTo(0, pos === 'haut' ? 0 : pos === 'milieu' ? hauteur / 2 : hauteur);
  }, position);
};

/**
 * Défile vers la position nommée, puis rend les CONTRÔLES (`a, button,
 * summary, [role="button"]`) dont la BOÎTE croise celle d'un élément dont le
 * style calculé est `position:fixed` — la bannière temps réel comprise, pour
 * qu'un futur élément fixe reste tenu par la même mesure.
 */
export const controlesCouvertsParUnFixe = async (
  page: Page,
  position: PositionDeDefilement,
): Promise<readonly string[]> => {
  await placeLeDefilement(page, position);

  return page.evaluate(() => {
    const fixes = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((noeud) => getComputedStyle(noeud).position === 'fixed')
      .map((noeud) => noeud.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const chevauche = (a: DOMRect, b: DOMRect): boolean =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    return [...document.querySelectorAll<HTMLElement>('a, button, summary, [role="button"]')]
      .filter((noeud) => getComputedStyle(noeud).position !== 'fixed')
      .filter((noeud) => {
        const rect = noeud.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && fixes.some((fixe) => chevauche(rect, fixe));
      })
      .map((noeud) => noeud.textContent?.trim().slice(0, 40) ?? '');
  });
};

/**
 * LA MESURE PAR PILE DE HIT-TEST (charte règle 8, l'instrument qu'elle nomme
 * — `conception-web-v3.md:1208`).
 *
 * CE QUI SÉPARE LES DEUX MESURES, ÉCRIT DANS LE BON SENS (correction de
 * revue, 2026-09-06 — la première rédaction affirmait que le chevauchement de
 * rects « rate un occulteur `pointer-events:none` », ce qui est FAUX et
 * contredisait le dernier paragraphe de ce même commentaire) :
 *
 *   - `controlesCouvertsParUnFixe` compare des BOÎTES. Elle voit donc TOUT ce
 *     qui se superpose, `pointer-events:none` compris (un voile décoratif
 *     masque l'ENCRE sans jamais entrer dans une pile de hit-test) ; en
 *     revanche elle ne regarde que `position:fixed`, elle ignore l'ordre de
 *     PEINTURE (deux boîtes qui se croisent sans que l'une couvre l'autre —
 *     `z-index`, contexte d'empilement, `clip-path`) et elle compte pour
 *     couvert un contrôle dont seul un COIN mord sur l'occulteur.
 *   - `interactifsSousUnFlottant`, ci-dessous, interroge le NAVIGATEUR :
 *     `position:sticky` compris, l'empilement réel tranché, et la question
 *     posée est celle du doigt — « ce contrôle est-il ATTEIGNABLE ici ? ».
 *     Elle est aveugle, elle, à l'occulteur `pointer-events:none`.
 *
 * Aucune des deux ne subsume l'autre : un témoin rougit sur L'UNE OU L'AUTRE.
 *
 * Pour chaque élément dont le style calculé est `position:fixed` ou
 * `position:sticky` (hors flux — une bannière temps réel, un rail, ou tout ce
 * qu'un futur écran posera de la même façon) : échantillonne cinq points de
 * son rect (les quatre coins rentrés de 2 px, plus le centre — rentrés pour ne
 * pas tomber hors de l'occulteur sur un coin arrondi), bornés au viewport, et
 * interroge `document.elementsFromPoint(x, y)`. Tout nœud INTERACTIF (`a,
 * button, summary, [role="button"]`) trouvé dans la pile SOUS l'occulteur est
 * rapporté (texte tronqué à 40 caractères, comme l'existant) — SOUS, et non
 * « sous le sommet de la pile » : un troisième élément peint AU-DESSUS de
 * l'occulteur ne rend pas au doigt ce que l'occulteur lui prend.
 *
 * Deux exclusions, pour ne rapporter que de VRAIES occlusions : ce que
 * l'occulteur CONTIENT (son propre contenu n'est pas couvert par lui) et ce
 * qui CONTIENT l'occulteur (un ancêtre interactif n'est pas couvert par son
 * propre descendant — il le porte).
 */
export const interactifsSousUnFlottant = async (
  page: Page,
  position: PositionDeDefilement,
): Promise<readonly string[]> => {
  await placeLeDefilement(page, position);

  return page.evaluate(() => {
    const HORS_FLUX = new Set(['fixed', 'sticky']);
    const estInteractif = (noeud: Element): boolean => noeud.matches('a, button, summary, [role="button"]');

    const occulteurs = [...document.querySelectorAll<HTMLElement>('body *')].filter((noeud) => {
      const style = getComputedStyle(noeud);
      return HORS_FLUX.has(style.position) && style.pointerEvents !== 'none';
    });

    const rapportes = new Set<string>();

    occulteurs.forEach((occulteur) => {
      const rect = occulteur.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const marge = 2;
      const brut: readonly [number, number][] = [
        [rect.left + marge, rect.top + marge],
        [rect.right - marge, rect.top + marge],
        [rect.left + marge, rect.bottom - marge],
        [rect.right - marge, rect.bottom - marge],
        [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2],
      ];
      const points = brut.map(
        ([x, y]) =>
          [Math.min(Math.max(x, 0), window.innerWidth - 1), Math.min(Math.max(y, 0), window.innerHeight - 1)] as const,
      );

      points.forEach(([x, y]) => {
        const pile = document.elementsFromPoint(x, y);
        const indexOcculteur = pile.findIndex((noeud) => occulteur.contains(noeud));
        if (indexOcculteur === -1) return;
        pile.slice(indexOcculteur + 1).forEach((noeud) => {
          if (occulteur.contains(noeud) || noeud.contains(occulteur) || !estInteractif(noeud)) return;
          rapportes.add(noeud.textContent?.trim().slice(0, 40) ?? '');
        });
      });
    });

    return [...rapportes];
  });
};
