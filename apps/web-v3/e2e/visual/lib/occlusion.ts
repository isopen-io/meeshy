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
 */
export const POSITIONS_DE_DEFILEMENT = ['haut', 'milieu', 'bas'] as const;
export type PositionDeDefilement = (typeof POSITIONS_DE_DEFILEMENT)[number];

/**
 * Défile vers la position nommée, puis rend les CONTRÔLES (`a, button,
 * summary, [role="button"]`) dont le CENTRE est couvert par un élément dont
 * le style calculé est `position:fixed` — la bannière temps réel comprise,
 * pour qu'un futur élément fixe reste tenu par la même mesure.
 */
export const controlesCouvertsParUnFixe = async (
  page: Page,
  position: PositionDeDefilement,
): Promise<readonly string[]> => {
  await page.evaluate((pos) => {
    const hauteur = document.body.scrollHeight - window.innerHeight;
    window.scrollTo(0, pos === 'haut' ? 0 : pos === 'milieu' ? hauteur / 2 : hauteur);
  }, position);

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
