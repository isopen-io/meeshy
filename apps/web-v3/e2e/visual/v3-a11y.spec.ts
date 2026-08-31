// GATE § 8.5 — « 0 erreur `axe` `serious`/`critical` sur toute route `(public)` ».
//
// Ce fichier ne PORTE pas la loi, il l'APPLIQUE : le verdict, le balayage, sa garde, le statut
// attendu par route et les quatre colonnes de thème vivent dans `lib/a11y.ts`, gagés sans
// navigateur par `__tests__/a11y-gate.test.ts`. Ici il ne reste que ce qu'un navigateur seul peut
// faire — poser le thème, ouvrir la route, vérifier ce qu'elle a servi, lancer axe.

import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  BUDGETS_V3,
  COLONNES_DE_THEME,
  ECHANTILLONS,
  MANIFESTE_V3,
  exigeUnManifesteLu,
  lisGroupes,
  pagesEmises,
  rapporteViolations,
  routesPubliques,
  violationsBloquantes,
} from './lib/a11y';
import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { lireEntrees } from '../../scripts/lib/routes-emises.mjs';

const entrees = exigeUnManifesteLu(lireEntrees(readFileSync(MANIFESTE_V3, 'utf8')));
const routes = routesPubliques({
  entrees,
  groupes: lisGroupes(readFileSync(BUDGETS_V3, 'utf8')),
  echantillons: ECHANTILLONS,
});

test.describe('§ 8.5 — accessibilité des routes (public)', () => {
  // Un balayage VIDE ne sort pas vert par vacuité : il doit dire POURQUOI il est vide, et sa
  // raison s'éteint d'elle-même. Si des pages d'App Router sont émises alors qu'aucune n'est
  // reconnue `(public)`, ce témoin tombe — c'est `budgets.json` qui a cessé de les réclamer.
  if (routes.length === 0) {
    test("aucune route (public) n'est encore servie — le gate s'allume à la première page du lot L1", () => {
      expect(
        pagesEmises(entrees).map((entree) => entree.route),
        "des pages d'App Router sont émises et aucune n'entre dans le groupe (public) de budgets.json",
      ).toEqual([]);
    });
  }

  COLONNES_DE_THEME.forEach((theme) => {
    test.describe(`thème ${theme.id}`, () => {
      // Le thème est une dimension du BALAYAGE, pas un réglage du navigateur : le nom du test le
      // porte, sinon un échec de contraste ne dit pas LAQUELLE des deux palettes est rouge.
      test.use({ colorScheme: theme.colorScheme });

      routes.forEach((route) => {
        test(`0 violation axe serious/critical sur ${route.chemin} (${theme.id})`, async ({
          page,
        }) => {
          if (theme.stockage !== null) {
            await page.addInitScript(
              ([cle, valeur]) => {
                try {
                  window.localStorage.setItem(cle, valeur);
                } catch {
                  /* le script anti-flash retombe sur la préférence système, la colonne le dira */
                }
              },
              [THEME_STORAGE_KEY, theme.stockage] as const,
            );
          }

          const reponse = await page.goto(route.chemin, { waitUntil: 'domcontentloaded' });
          expect(reponse, `${route.chemin} n'a rien servi`).not.toBeNull();
          // Une route ÉMISE qui échoue à l'exécution sert une page d'erreur qui hérite du
          // `<html lang>` du layout et passe axe : sans ce statut, le gate sortirait vert sur un
          // écran que le visiteur ne peut pas lire.
          expect(
            reponse?.status(),
            `${route.chemin} n'a pas servi la page attendue — axe aurait audité sa page d'erreur`,
          ).toBe(route.statut);

          // La classe résolue par le script anti-flash EST le sujet de l'audit qui suit : si elle
          // n'est pas celle de la colonne, axe mesure la mauvaise palette et son vert ne vaut rien.
          await expect(
            page.locator('html'),
            `${route.chemin} n'a pas résolu le thème ${theme.id}`,
          ).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));

          const { violations } = await new AxeBuilder({ page }).analyze();
          const bloquantes = violationsBloquantes(violations);

          expect(
            bloquantes,
            rapporteViolations(`${route.chemin} [${theme.id}]`, bloquantes),
          ).toEqual([]);
        });
      });
    });
  });
});
