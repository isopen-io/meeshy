import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON } from '../../lib/api/cookies';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';
import { COLONNES_DE_THEME, rapporteViolations, violationsBloquantes } from './lib/verdict-axe';

/**
 * 0 violation `axe` `serious`/`critical` sur les QUATRE réglages-détails —
 * `/settings/privacy`, `/settings/media` (+ ses trois sous-écrans),
 * `/settings/message` et `/settings/notification` — dans les QUATRE colonnes
 * de thème du § 9.6, clair ET sombre, comme `v3-reglages-a11y.spec.ts` le
 * fait pour les six écrans qu'il porte.
 *
 * CE QUE `__tests__/reglages-details-a11y.test.ts` NE MESURE PAS. Ce fichier
 * jest audite les MÊMES documents dans jsdom, où le CONTRASTE ne se calcule
 * pas — sa règle `color-contrast` est `serious`, la barre exacte de ce gate,
 * et son verdict dépend ENTIÈREMENT du thème effectivement appliqué par le
 * script anti-flash. Sans un VRAI navigateur, la branche `.dark` n'est jamais
 * auditée pour le contraste. C'est le trou nommé par le rapport de revue du
 * travail `reglages-details` (défaut 1) : ce fichier le ferme.
 */

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon();
  v3 = await serveurDeLaV3(passerelle.base);
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

const contexte = async (
  navigateur: Browser,
  options: { readonly schema?: 'light' | 'dark'; readonly stockage?: 'light' | 'dark' | null } = {},
): Promise<BrowserContext> => {
  const ctx = await navigateur.newContext({ colorScheme: options.schema ?? 'light' });
  await ctx.addCookies([{ name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base }]);
  if (options.stockage !== undefined && options.stockage !== null) {
    await ctx.addInitScript(
      ([cle, valeur]) => {
        try {
          window.localStorage.setItem(cle, valeur);
        } catch {
          /* le script anti-flash retombe sur la préférence système, la colonne le dira */
        }
      },
      [THEME_STORAGE_KEY, options.stockage] as const,
    );
  }
  return ctx;
};

/**
 * LES SEPT DOCUMENTS DU LOT — les QUATRE routes du travail, PLUS les trois
 * sous-écrans de `/settings/media` (audio, vidéo, document) qui portent
 * chacun leur propre `<main>` et n'étaient couverts par AUCUN des deux gates
 * existants (`v3-reglages-a11y.spec.ts` s'arrête aux six écrans du lot
 * précédent). `/settings/notification` est un ALIAS 302 vers
 * `/notifications/preferences` (`app/settings/notification/route.ts`) — le
 * `repere` cible le `<details>` d'édition DND que ce lot y ajoute, jamais
 * regardé au navigateur avant ce fichier.
 */
const ECRANS = [
  { chemin: '/settings/privacy', repere: '.bascules' },
  { chemin: '/settings/media', repere: 'a[href="/settings/media/document"]' },
  { chemin: '/settings/media/audio', repere: '.rangs' },
  { chemin: '/settings/media/video', repere: '.rangs' },
  { chemin: '/settings/media/document', repere: 'button.commutateur' },
  { chemin: '/settings/message', repere: '.rangs' },
  { chemin: '/settings/notification', repere: 'details.fenetre-edition' },
] as const;

COLONNES_DE_THEME.forEach((theme) => {
  ECRANS.forEach(({ chemin, repere }) => {
    test(`0 violation axe serious/critical — ${chemin} (${theme.id})`, async ({ browser }) => {
      const ctx = await contexte(browser, { schema: theme.colorScheme, stockage: theme.stockage });
      const page = await ctx.newPage();

      await page.goto(`${v3.base}${chemin}`);
      await expect(page.locator('main.reglages, main.prefs-ecran')).toBeVisible();
      await expect(page.locator(repere).first()).toBeVisible();
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));

      const { violations } = await new AxeBuilder({ page }).analyze();
      const bloquantes = violationsBloquantes(violations);
      expect(bloquantes, rapporteViolations(`${chemin} (${theme.id})`, bloquantes)).toEqual([]);

      await ctx.close();
    });
  });
});

/**
 * PAS DE COLONNE « SANS JAVASCRIPT » ICI. `AxeBuilder` s'injecte lui-même
 * dans la page pour l'auditer — il a donc besoin du JavaScript qu'il mesure
 * l'absence d'exigence CHEZ, ce qui est une contradiction, pas une garde.
 * (Mesuré : combiner `javaScriptEnabled:false` et `AxeBuilder.analyze()`
 * bloque indéfiniment, le script d'injection ne s'exécutant jamais.) La
 * promesse « ces routes n'ont pas besoin de JS » reste vérifiée où elle PEUT
 * l'être : fonctionnellement, par `v3-reglages-details.spec.ts`, chaque test
 * y ouvrant son contexte avec `javaScriptEnabled: false`.
 */
