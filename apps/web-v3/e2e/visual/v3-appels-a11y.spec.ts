// GATE — « 0 violation axe serious/critical » sur `/calls`, sur les QUATRE colonnes de thème du
// § 9.6, et l'EFFET de chaque ligne (elle mène au fil de sa conversation).
//
// `__tests__/appels-porte.test.ts` juge le document servi dans jsdom (T1-T6bis, la spécification
// § 3) ; ce fichier juge ce qu'un VRAI navigateur en fait : le CONTRASTE calculé des quatre teintes
// de tuile sur les quatre colonnes — jsdom ne le calcule pas —, et le fait qu'une ligne cliquée
// atteint réellement `/chats/:cle`.
//
// L'ÉCRAN N'A AUCUN MODULE CLIENT — servi entier par son gestionnaire de route, comme `/contacts` et
// `/notifications`. Il vit donc dans le projet `pages`, pour la même raison que
// `v3-contacts-a11y.spec.ts` : il importe `lib/a11y.ts` STATIQUEMENT (qui ré-exporte
// `COLONNES_DE_THEME` et le verdict de `verdict-axe.ts`) — c'est cet import, pas le nom du
// fichier, qui décide du projet (`playwright.config.ts` › `SUITES_QUI_IMPORTENT_LA_LOI`).

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON } from '../../lib/api/cookies';
import { COLONNES_DE_THEME, rapporteViolations, violationsBloquantes } from './lib/a11y';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { CONVERSATION_DU_LECTEUR } from './lib/bouchon-monde';
import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';

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

const contexteDuMembre = async (
  navigateur: Browser,
  theme: (typeof COLONNES_DE_THEME)[number],
  base: string,
): Promise<BrowserContext> => {
  const contexte = await navigateur.newContext({ colorScheme: theme.colorScheme });
  await contexte.addCookies([{ name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: base }]);
  if (theme.stockage !== null) {
    await contexte.addInitScript(
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
  return contexte;
};

COLONNES_DE_THEME.forEach((theme) => {
  test(`0 violation axe serious/critical — /calls (${theme.id})`, async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, theme, v3.base);
    const page = await contexte.newPage();

    await page.goto(`${v3.base}/calls`);
    await expect(page.locator('main.appels-ecran')).toBeVisible();
    // La classe résolue est vérifiée AVANT axe : c'est elle qui prouve que la
    // colonne mesure bien la branche qu'elle prétend mesurer.
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));
    // La page NOMINALE est celle que la porte demande : `limit=30`.
    await expect(page.locator('li.appel')).toHaveCount(30);

    const { violations } = await new AxeBuilder({ page }).analyze();
    const bloquantes = violationsBloquantes(violations);
    expect(bloquantes, rapporteViolations(`/calls (${theme.id})`, bloquantes)).toEqual([]);

    await contexte.close();
  });
});

test('n’embarque aucun module — ni CallManager ni la pile WebRTC', async ({ browser }) => {
  const contexte = await contexteDuMembre(browser, COLONNES_DE_THEME[0]!, v3.base);
  const page = await contexte.newPage();

  await page.goto(`${v3.base}/calls`);
  await expect(page.locator('main.appels-ecran')).toBeVisible();

  const html = await page.content();
  expect(html.toLowerCase()).not.toContain('callmanager');
  expect(html.toLowerCase()).not.toContain('webrtc');

  await contexte.close();
});

test('chaque ligne a un effet : cliquer mène au fil de sa conversation', async ({ browser }) => {
  const contexte = await contexteDuMembre(browser, COLONNES_DE_THEME[0]!, v3.base);
  const page = await contexte.newPage();

  await page.goto(`${v3.base}/calls`);
  await expect(page.locator('main.appels-ecran')).toBeVisible();

  // La ligne VIDÉO du bouchon (« Équipe Lagos ») pointe
  // `CONVERSATION_DU_LECTEUR` — un fil que le bouchon sert déjà.
  await page.locator('li.appel a', { hasText: 'Équipe Lagos' }).click();

  await expect(page).toHaveURL(`${v3.base}/chats/${CONVERSATION_DU_LECTEUR.id}`);

  await contexte.close();
});

/**
 * L'ÉTAT PAGINÉ — le seul où `a.plus-ancien` existe, donc le seul où sa
 * DISPOSITION se mesure. Il n'était atteignable par aucun témoin tant que le
 * bouchon tenait moins de lignes que la limite de la porte : le lien partait
 * dans le HTML, un test de chaîne le voyait, et personne ne l'avait jamais vu
 * PEINT. Il l'était au-dessus de l'en-tête (`order:-1` non porté).
 */
test('le lien « plus anciens » se peint SOUS l’en-tête, et ouvre la page suivante', async ({ browser }) => {
  const contexte = await contexteDuMembre(browser, COLONNES_DE_THEME[0]!, v3.base);
  const page = await contexte.newPage();

  await page.goto(`${v3.base}/calls`);
  const lien = page.locator('a.plus-ancien');
  await expect(lien).toHaveCount(1);

  const tete = await page.locator('header.fil-tete').boundingBox();
  const suite = await lien.boundingBox();
  expect(tete).not.toBeNull();
  expect(suite).not.toBeNull();
  expect(suite!.y).toBeGreaterThanOrEqual(tete!.y + tete!.height);
  // La cible tactile de la charte, sur le lien comme sur les lignes.
  expect(suite!.height).toBeGreaterThanOrEqual(44);

  await lien.click();

  await expect(page).toHaveURL(/\/calls\?cursor=/);
  await expect(page.locator('li.appel')).toHaveCount(1);
  // La dernière page n'offre plus de suite — un contrôle n'existe que s'il mène quelque part.
  await expect(page.locator('a.plus-ancien')).toHaveCount(0);

  await contexte.close();
});

/**
 * L'ÉTAT VIDE — un lecteur sans aucun appel dans sa fenêtre de trois mois.
 * Comme le tableau de bord vide (`v3-tableau.spec.ts`), c'est un ÉCRAN à part
 * entière, avec sa propre passerelle : un bouchon toujours garni ne le fait
 * jamais visiter.
 */
test.describe('l’historique vide', () => {
  let passerelleVide: PasserelleDeBouchon;
  let serveurVide: ServeurV3;

  test.beforeAll(async () => {
    passerelleVide = await passerelleDeBouchon({ appelsVides: true });
    serveurVide = await serveurDeLaV3(passerelleVide.base);
  });

  test.afterAll(async () => {
    await serveurVide?.ferme();
    await passerelleVide?.ferme();
  });

  test('rend la carte vide, sans ligne — 0 violation axe serious/critical', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, COLONNES_DE_THEME[0]!, serveurVide.base);
    const page = await contexte.newPage();

    await page.goto(`${serveurVide.base}/calls`);
    await expect(page.locator('main.appels-ecran')).toBeVisible();
    await expect(page.locator('.carte-vide')).toBeVisible();
    await expect(page.locator('li.appel')).toHaveCount(0);

    const { violations } = await new AxeBuilder({ page }).analyze();
    const bloquantes = violationsBloquantes(violations);
    expect(bloquantes, rapporteViolations('/calls (vide)', bloquantes)).toEqual([]);

    await contexte.close();
  });
});
