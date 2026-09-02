// GATE § 12.5 règles 4 et 6 — « 0 cible < 44 px à 360 et 390 px ; min(.action.primaire) = 56 ;
// a.flottant[href] ≥ 52 ».
//
// POURQUOI AU NAVIGATEUR, ET PAS EN JEST. Une hauteur de cible est une valeur CALCULÉE : elle
// dépend de la cascade complète (`min-block-size`, le rembourrage, l'interligne, la police servie,
// la largeur du cadre). Un `grep` sur la feuille dit ce que le code DEMANDE ; seule une mise en
// page dit ce que le doigt TOUCHE. C'est la différence entre les témoins de `__tests__/charte.test.ts`
// et celui-ci, et elle est la raison d'être du fichier.
//
// DEUX LARGEURS, PARCE QUE LA RÈGLE EN NOMME DEUX. 390 px est le cadre de la planche (§ 9.6) ;
// 360 px est le téléphone le plus étroit encore vendu — et c'est là qu'une action pleine largeur
// passe sur deux lignes, donc là qu'un rembourrage écrit en dur casserait la hauteur.

import { expect, test } from '@playwright/test';

import { ACTION_PRIMAIRE, ciblesMesurees, ciblesTropPetites, FLOTTANT_MIN, hauteursDe, LARGEURS, TARGET_MIN } from './lib/cibles';

/**
 * Les écrans portés à la charte, et l'ancre qui prouve que la page attendue a bien été servie —
 * sans elle, une redirection ou une page d'erreur rendrait un balayage VIDE, donc vert.
 *
 * La liste grandit d'un écran par commit ; elle n'est jamais vidée sans qu'un témoin tombe.
 * `/chat/:lien` n'y entre pas : il a besoin de la passerelle de bouchon, que le `webServer`
 * global ne monte pas — ses cibles sont mesurées par `v3-join.spec.ts`, avec le MÊME instrument
 * (`lib/cibles.ts`).
 */
const ECRANS = [{ nom: 'vitrine', chemin: '/', ancre: 'a.action.primaire' }] as const;

test.describe('§ 12.5 règles 4 et 6 — les cibles tactiles', () => {
  ECRANS.forEach((ecran) => {
    LARGEURS.forEach((largeur) => {
      test(`${ecran.nom} — aucune cible sous ${TARGET_MIN} px à ${largeur} px`, async ({ page }) => {
        await page.setViewportSize({ width: largeur, height: 844 });
        const reponse = await page.goto(ecran.chemin, { waitUntil: 'domcontentloaded' });

        expect(reponse?.status(), `${ecran.chemin} n'a pas servi son écran`).toBe(200);
        await expect(page.locator(ecran.ancre).first()).toBeVisible();

        const mesurees = await ciblesMesurees(page);

        // Un balayage VIDE sortirait vert sans avoir rien mesuré : la vitrine porte au moins ses
        // deux appels à l'action, sa marque et les cinq liens du pied.
        expect(mesurees.length, "aucune cible mesurée — le balayage n'a rien vu").toBeGreaterThan(5);

        const petites = ciblesTropPetites(mesurees);

        expect(petites, `cibles sous ${TARGET_MIN} px : ${JSON.stringify(petites)}`).toEqual([]);
      });
    });

    test(`${ecran.nom} — l'action principale mesure ${ACTION_PRIMAIRE} px`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(ecran.chemin, { waitUntil: 'domcontentloaded' });

      const hauteurs = await hauteursDe(page, '.action.primaire');

      expect(hauteurs.length).toBeGreaterThan(0);
      expect(Math.min(...hauteurs)).toBe(ACTION_PRIMAIRE);
    });

    /**
     * Règle 6 — un rond flottant est un `<a href>` vers une route SERVIE. Tant qu'aucune de ses
     * destinations n'existe, l'écran n'en rend AUCUN : le témoin mesure alors une liste vide, ce
     * qui est le comportement voulu — jamais une puce inerte.
     */
    test(`${ecran.nom} — aucun rond flottant inerte`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(ecran.chemin, { waitUntil: 'domcontentloaded' });

      const flottants = await page.evaluate(() =>
        [...document.querySelectorAll('a.flottant')].map((noeud) => ({
          href: noeud.getAttribute('href') ?? '',
          hauteur: Math.round(noeud.getBoundingClientRect().height),
        })),
      );

      expect(flottants.filter((rond) => rond.href === '' || rond.href === '#')).toEqual([]);
      expect(flottants.filter((rond) => rond.hauteur < FLOTTANT_MIN)).toEqual([]);
    });
  });
});
