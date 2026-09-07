// GATE — `/feed/reels` (#5032) : le fil de réels connecté, rendu par le MÊME
// lecteur que `/reels/:id`.
//
// `__tests__/reels-du-fil.test.ts` garde la STRUCTURE (une seule paire de
// fonctions compose le lecteur) et `__tests__/reels-porte.test.ts` ce que la
// porte sert. Ce fichier juge ce qu'un VRAI navigateur en fait, et il porte les
// deux choses qu'aucun des deux ne peut dire :
//
//   1. **Combien de vidéos DÉCODENT.** Le critère de la matrice — « une seule
//      vidéo décodée à la fois » — se mesure sur des éléments montés, jamais
//      sur une chaîne de HTML. Le témoin compte les `<video>` du document ET
//      leur `readyState` : un `<video>` posé mais jamais chargé ne décode pas,
//      et confondre les deux ferait passer un document à vingt vidéos pour
//      conforme parce qu'elles portent `preload="none"`.
//   2. **Que le parcours AVANCE.** Deux réels dans le bouchon, un pas de
//      curseur : le tap « Réel suivant » doit servir l'AUTRE réel, pas le même.
//
// CE QUE CE FICHIER NE MESURE PAS, ET POURQUOI C'EST DIT PLUTÔT QUE SAUTÉ. La
// matrice demande « lecture à 60 fps mesurée pendant le défilement vertical ».
// La cible (`MeeshyWebV3.dc.html:180`) ne dessine AUCUN défilement : un réel
// remplit l'écran, et on passe au suivant par un tap. Il n'y a donc pas de
// geste de défilement à mesurer sur cette géométrie — ni 60 fps à déclarer
// verts, ni gate à faire semblant de tenir. Le jour où un module apporte un
// défilement, la mesure vient avec lui. Voir le commentaire de clôture de
// #5032.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { violationsBloquantes, rapporteViolations } from './lib/a11y';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';
import { COLONNES_DE_THEME } from './lib/verdict-axe';

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
  const ctx = await navigateur.newContext({
    colorScheme: options.schema ?? 'light',
    viewport: { width: 390, height: 844 },
  });
  await ctx.addCookies([
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
  ]);
  if (options.stockage !== undefined && options.stockage !== null) {
    await ctx.addInitScript(
      ([cle, valeur]) => {
        try {
          window.localStorage.setItem(cle, valeur);
        } catch {
          /* le script anti-flash retombe sur la préférence système */
        }
      },
      [THEME_STORAGE_KEY, options.stockage] as const,
    );
  }
  return ctx;
};

/**
 * UNE SEULE VIDÉO, ET ELLE EST SEULE À DÉCODER.
 *
 * `readyState > 0` veut dire que le navigateur a commencé à lire le média.
 * Compter les `<video>` seuls laisserait passer un document qui en pose vingt ;
 * ne compter que ceux qui décodent laisserait passer un document qui en pose
 * vingt dont dix-neuf attendent. Les deux comptes sont donc opposés.
 */
test('un seul <video> dans le document, et un seul qui décode', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  const reponse = await page.goto(`${v3.base}/feed/reels`);
  expect(reponse?.status(), '/feed/reels n’a pas servi le lecteur').toBe(200);

  const compte = await page.evaluate(() => {
    const videos = [...document.querySelectorAll('video')];
    return { poses: videos.length, decodent: videos.filter((v) => v.readyState > 0).length };
  });

  expect(compte.poses).toBe(1);
  expect(compte.decodent).toBeLessThanOrEqual(1);

  await ctx.close();
});

/**
 * LE PARCOURS AVANCE — et il sert l'AUTRE réel. Un tap qui rechargerait le
 * même serait un contrôle sans effet (charte règle 7) que ni la structure ni
 * la porte ne pourraient dénoncer : elles ne voient qu'une réponse à la fois.
 */
test('le tap « suivant » sert le réel suivant, pas le même', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/feed/reels`);
  const premier = await page.locator('.story-tete .nom').textContent();

  await page.getByRole('link', { name: 'Réel suivant' }).click();
  await expect(page).toHaveURL(/\/feed\/reels\?cursor=/);

  const second = await page.locator('.story-tete .nom').textContent();
  expect(second).not.toBe(premier);

  // ET LE FIL SE TERMINE : au bout, plus aucun tap (charte règle 7).
  expect(await page.locator('a.tap').count()).toBe(0);

  await ctx.close();
});

/**
 * LA PORTE, ET LE RETOUR — le parcours entier que la planche dessine
 * (`MeeshyWebV3.dc.html:870-871`) : du fil aux réels par le bouton, des réels
 * au fil par la croix. Un aller sans retour laisserait le lecteur dans un
 * écran dont il ne sait pas sortir, et `__tests__/reels-du-fil.test.ts` ne
 * peut dire que la présence des deux liens, jamais qu'ils MÈNENT quelque part.
 */
test('le fil ouvre les réels, et la croix y ramène', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/feed`);
  await page.getByRole('link', { name: 'Réels' }).click();
  await expect(page).toHaveURL(`${v3.base}/feed/reels`);
  await expect(page.locator('.story-ecran')).toBeVisible();

  await page.getByRole('link', { name: 'Fermer' }).click();
  await expect(page).toHaveURL(`${v3.base}/feed`);

  await ctx.close();
});

/**
 * LE PRISME EST SERVI ET ANNONCÉ. Le premier réel du bouchon est espagnol et
 * porte sa traduction française ; la lectrice est francophone. Les deux moitiés
 * sont exigées — un texte servi sans être annoncé, ou annoncé sans être servi,
 * est le défaut du cycle 123 dans l'un ou l'autre sens.
 */
test('sert le texte au Prisme et dit d’où il vient', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/feed/reels`);

  await expect(page.locator('.story-ecran')).toContainText('Le nouveau glossaire partagé');
  await expect(page.locator('.story-prisme')).toContainText('espagnol');
  await expect(page.locator('.story-prisme a')).toHaveAttribute('href', /lang=es/);

  await ctx.close();
});

/**
 * ET « VOIR L'ORIGINAL » A UN EFFET. Le lien du Prisme change le texte LU —
 * c'est la loi 4, et c'est ce que le cycle 123 a trouvé inerte ailleurs.
 */
test('voir l’original change le texte lu', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/feed/reels`);
  await page.locator('.story-prisme a').click();

  await expect(page.locator('.story-ecran')).toContainText('Nuevo glosario compartido');

  await ctx.close();
});

COLONNES_DE_THEME.forEach((theme) => {
  test(`0 violation axe serious/critical — /feed/reels (${theme.id})`, async ({ browser }) => {
    const ctx = await contexte(browser, { schema: theme.colorScheme, stockage: theme.stockage });
    const page = await ctx.newPage();

    await page.goto(`${v3.base}/feed/reels`);
    await expect(page.locator('.story-ecran')).toBeVisible();
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));

    const { violations } = await new AxeBuilder({ page }).analyze();
    const bloquantes = violationsBloquantes(violations);
    expect(bloquantes, rapporteViolations(`/feed/reels (${theme.id})`, bloquantes)).toEqual([]);

    await ctx.close();
  });
});
