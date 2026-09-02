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

// Les valeurs d'exemple des routes `(public)` DYNAMIQUES. Une route dynamique qui entre au dépôt
// sans sa ligne ici fait ÉCHOUER le balayage, en se nommant — jamais sauter.
const ECHANTILLONS: Readonly<Record<string, string>> = {};

/**
 * LES ÉCRANS QUE LE MANIFESTE NE PEUT PAS NOMMER — et sans lesquels ce gate ne balaie RIEN.
 *
 * `routesPubliques` lit `app-build-manifest.json`, qui ne porte que les PAGES d'App Router. Or
 * tous les écrans servis de la v3 sont des GESTIONNAIRES DE ROUTE (`bun run build` : « 13
 * gestionnaire(s) de route, 0 page ») — c'est la décision qui tient le gate d'UNE requête avant
 * le premier pixel (§ 12.6). Le balayage sortait donc vert par VACUITÉ sur des écrans bel et bien
 * publics, et son propre témoin le disait à voix haute (« aucune route (public) n'est encore
 * servie »).
 *
 * Ce que ce balayage ajoute au `jest-axe` de `__tests__/vitrine-a11y.test.ts` — qui juge le MÊME
 * document — n'est pas une seconde vérification de la structure : c'est le CONTRASTE.
 * `color-contrast` a besoin d'une mise en page et de couleurs CALCULÉES ; jsdom n'en a aucune et
 * axe y saute la règle sans le dire. Les quatre colonnes de thème la rendent mesurable dans les
 * DEUX schémas.
 *
 * La liste grandit d'un écran par commit, et chaque entrée porte le statut attendu : une
 * redirection ou une page d'erreur ferait auditer autre chose que l'écran visé.
 */
const GESTIONNAIRES_PUBLICS: readonly { readonly chemin: string; readonly statut: number }[] = [
  { chemin: '/', statut: 200 },
];

const entrees = exigeUnManifesteLu(lireEntrees(readFileSync(MANIFESTE_V3, 'utf8')));
const routes = routesPubliques({
  entrees,
  groupes: lisGroupes(readFileSync(BUDGETS_V3, 'utf8')),
  echantillons: ECHANTILLONS,
});

// L'INSTRUMENT PROUVE QU'IL VOIT — et il ne peut le prouver que là où le build a eu lieu.
//
// Ces deux témoins vivaient dans `__tests__/a11y-gate.test.ts`, exécuté par le job
// `Test web-v3`, qui ne lance jamais `next build` : ils rendaient `ENOENT` à chaque run.
// Ici, le job `a11y-v3` construit l'application avant de lancer ce fichier — c'est le
// sens de son étape « Build apps/web-v3 (le manifeste que le balayage lit) ».
//
// Ce que le reste du fichier ne dit pas déjà : l'assertion `pagesEmises` du bloc § 8.5
// ci-dessous est CONDITIONNÉE à `routes.length === 0`, donc muette dès qu'une route
// `(public)` existe. Les deux témoins qui suivent sont inconditionnels — ils tiennent la
// distinction PAGE / GESTIONNAIRE DE ROUTE quel que soit l'état du lot L1.
test.describe("le manifeste RÉEL de la v3 — l'instrument prouve qu'il voit", () => {
  test('porte au moins le gestionnaire /healthz, livré en L-0.5', () => {
    expect(entrees.map((entree) => entree.route)).toContain('/healthz/route');
  });

  test('se compose exactement des PAGES émises, jamais des gestionnaires de route', () => {
    expect(pagesEmises(entrees).map((entree) => entree.route)).not.toContain('/healthz/route');
  });
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

      [...routes, ...GESTIONNAIRES_PUBLICS].forEach((route) => {
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
