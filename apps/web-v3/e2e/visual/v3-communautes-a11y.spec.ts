// GATE — « 0 violation axe serious/critical » sur `/communities`, sur les QUATRE colonnes de thème du
// § 9.6, « deux gestes depuis l'accueil » (Q1), et la garde de présence bout en bout.
//
// `__tests__/communautes-porte.test.ts` juge le document servi dans jsdom (T1-T8, la spécification
// § 3) ; ce fichier juge ce qu'un VRAI navigateur en fait : le CONTRASTE CALCULÉ du document sur les
// quatre colonnes — jsdom ne le calcule pas —, le COMPTE de clics jusqu'à l'écran, et l'EFFET réel
// d'une ligne (elle atteint une surimpression puis un fil servi).
//
// CE QU'IL NE JUGE PAS, ET QUI EST GARDÉ AILLEURS : le contraste des QUATRE teintes de tuile. Les
// deux communautés de la cible (« Diaspora FR-EN », « Atelier traduction ») tombent toutes deux sur
// `t4` — `teinteDeLAvatar` disperse sur quatre classes, et deux noms peuvent partager la leur. Ce
// fichier n'en exerce donc qu'UNE, et le prétendre serait un commentaire qui affirme plus que son
// témoin. `--color-on-avatar` contre les quatre `--color-avatar-*` est gaté, dans les DEUX schémas,
// par `scripts/check-jetons.mjs:475-478` — au niveau du JETON, qui est sa place : la paire ne dépend
// d'aucun écran. Le CÂBLAGE de la teinte (la tuile porte bien celle du NOM, jamais une classe en
// dur) est épinglé par `__tests__/communautes-porte.test.ts`.
//
// L'ÉCRAN N'A AUCUN MODULE CLIENT — servi entier par son gestionnaire de route, comme `/calls`. Il
// vit donc dans le projet `pages` : il importe `lib/a11y.ts` STATIQUEMENT (`playwright.config.ts` ›
// `SUITES_QUI_IMPORTENT_LA_LOI`).

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { ESPACE } from '../../lib/contenu/espace';
import { COLONNES_DE_THEME, rapporteViolations, violationsBloquantes } from './lib/a11y';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { CONVERSATION_DU_LECTEUR } from './lib/bouchon-monde';
import { COMMUNAUTE_ATELIER, COMMUNAUTE_DIASPORA } from './lib/bouchon-communautes';
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
  { avecSession = false }: { readonly avecSession?: boolean } = {},
): Promise<BrowserContext> => {
  const contexte = await navigateur.newContext({ colorScheme: theme.colorScheme });
  const cookies = [{ name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: base }];
  await contexte.addCookies(
    avecSession ? [...cookies, { name: COOKIE_DE_SESSION, value: 'sonde', url: base }] : cookies,
  );
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
  test(`0 violation axe serious/critical — /communities (${theme.id})`, async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, theme, v3.base);
    const page = await contexte.newPage();

    await page.goto(`${v3.base}/communities`);
    await expect(page.locator('main.communautes-ecran')).toBeVisible();
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));
    await expect(page.locator('li.communaute')).toHaveCount(2);

    const { violations } = await new AxeBuilder({ page }).analyze();
    const bloquantes = violationsBloquantes(violations);
    expect(bloquantes, rapporteViolations(`/communities (${theme.id})`, bloquantes)).toEqual([]);

    await contexte.close();
  });
});

test('n’embarque aucun module client', async ({ browser }) => {
  const contexte = await contexteDuMembre(browser, COLONNES_DE_THEME[0]!, v3.base);
  const page = await contexte.newPage();

  await page.goto(`${v3.base}/communities`);
  await expect(page.locator('main.communautes-ecran')).toBeVisible();

  const html = await page.content();
  expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
});

/**
 * T-GESTES (Q1) — « depuis l'accueil, DEUX clics ouvrent l'écran » : le
 * raccourci d'en-tête vers l'espace membre (`?espace`), puis la rangée
 * « Communautés » de la feuille.
 */
test('deux gestes depuis l’accueil ouvrent /communities', async ({ browser }) => {
  const contexte = await contexteDuMembre(browser, COLONNES_DE_THEME[0]!, v3.base, { avecSession: true });
  const page = await contexte.newPage();

  await page.goto(`${v3.base}/`);
  await expect(page.getByRole('link', { name: ESPACE.ouvrir })).toBeVisible();

  // Clic 1 — le raccourci d'en-tête ouvre l'espace membre.
  await page.getByRole('link', { name: ESPACE.ouvrir }).click();
  await expect(page.locator('dialog.espace')).toBeVisible();

  // Clic 2 — la rangée « Communautés » de la feuille.
  await page.locator('a.rangee', { hasText: 'Communautés' }).click();

  await expect(page).toHaveURL(`${v3.base}/communities`);
  await expect(page.locator('main.communautes-ecran')).toBeVisible();

  await contexte.close();
});

test('chaque ligne a un effet : elle ouvre la surimpression, une conversation mène à son fil', async ({ browser }) => {
  const contexte = await contexteDuMembre(browser, COLONNES_DE_THEME[0]!, v3.base);
  const page = await contexte.newPage();

  await page.goto(`${v3.base}/communities`);
  await page.locator('li.communaute a', { hasText: COMMUNAUTE_DIASPORA.name }).click();

  await expect(page).toHaveURL(`${v3.base}/communities?ouverte=${COMMUNAUTE_DIASPORA.id}`);
  await expect(page.locator('dialog.communaute-ouverte')).toBeVisible();
  await expect(page.locator('dialog.communaute-ouverte h2')).toHaveText(COMMUNAUTE_DIASPORA.name);

  await page.locator('dialog.communaute-ouverte li a', { hasText: CONVERSATION_DU_LECTEUR.titre }).click();

  await expect(page).toHaveURL(`${v3.base}/chats/${CONVERSATION_DU_LECTEUR.id}`);

  await contexte.close();
});

/**
 * T-GARDE (bout en bout) — sur l'écran nominal ET la surimpression ouverte,
 * aucun nœud de présence dans le DOM ; et la fixture du bouchon (copiée de la
 * passerelle) ne porte, au niveau LISTE, aucune présence.
 */
test.describe('T-garde — la co-appartenance ne révèle aucune présence', () => {
  test('aucun nœud de présence dans le DOM, écran nominal ET surimpression ouverte', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, COLONNES_DE_THEME[0]!, v3.base);
    const page = await contexte.newPage();

    await page.goto(`${v3.base}/communities`);
    await expect(page.locator('.pastille, [data-presence]')).toHaveCount(0);

    await page.locator('li.communaute a', { hasText: COMMUNAUTE_DIASPORA.name }).click();
    await expect(page.locator('dialog.communaute-ouverte')).toBeVisible();
    await expect(page.locator('.pastille, [data-presence]')).toHaveCount(0);

    await contexte.close();
  });

  test('la fixture du bouchon, copiée de communities/core.ts:99, ne porte aucune présence au niveau liste', () => {
    expect(Object.keys(COMMUNAUTE_DIASPORA)).not.toContain('isOnline');
    expect(Object.keys(COMMUNAUTE_DIASPORA)).not.toContain('lastActiveAt');
    expect(Object.keys(COMMUNAUTE_ATELIER)).not.toContain('isOnline');
  });
});

test('méta : publique « 128 membres · 14 conversations », privée « 32 membres · privée »', async ({ browser }) => {
  const contexte = await contexteDuMembre(browser, COLONNES_DE_THEME[0]!, v3.base);
  const page = await contexte.newPage();

  await page.goto(`${v3.base}/communities`);
  await expect(page.locator('li.communaute .meta', { hasText: 'membres · 14 conversations' })).toBeVisible();
  await expect(page.locator('li.communaute .meta', { hasText: '32 membres · privée' })).toBeVisible();

  await contexte.close();
});

test.describe('la création d’une communauté', () => {
  test('soumettre un nom pris fait apparaître le motif DANS la feuille', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, COLONNES_DE_THEME[0]!, v3.base);
    const page = await contexte.newPage();

    await page.goto(`${v3.base}/communities?nouvelle`);
    await expect(page.locator('dialog.nouvelle-communaute')).toBeVisible();

    await page.locator('#c-nom').fill(COMMUNAUTE_DIASPORA.name);
    await page.locator('dialog.nouvelle-communaute button[type="submit"]').click();

    await expect(page.locator('dialog.nouvelle-communaute .alerte')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${v3.base}/communities`));

    await contexte.close();
  });

  test('soumettre un nom libre revient sur /communities avec la ligne neuve', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, COLONNES_DE_THEME[0]!, v3.base);
    const page = await contexte.newPage();

    await page.goto(`${v3.base}/communities?nouvelle`);
    await page.locator('#c-nom').fill('Cercle des lecteurs');
    await page.locator('dialog.nouvelle-communaute button[type="submit"]').click();

    await expect(page).toHaveURL(`${v3.base}/communities`);
    await expect(page.locator('li.communaute', { hasText: 'Cercle des lecteurs' })).toBeVisible();

    await contexte.close();
  });
});

test.describe('l’état vide', () => {
  let passerelleVide: PasserelleDeBouchon;
  let serveurVide: ServeurV3;

  test.beforeAll(async () => {
    passerelleVide = await passerelleDeBouchon({ communautesVides: true });
    serveurVide = await serveurDeLaV3(passerelleVide.base);
  });

  test.afterAll(async () => {
    await serveurVide?.ferme();
    await passerelleVide?.ferme();
  });

  test('rend la carte vide, sans ligne — 0 violation axe serious/critical', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, COLONNES_DE_THEME[0]!, serveurVide.base);
    const page = await contexte.newPage();

    await page.goto(`${serveurVide.base}/communities`);
    await expect(page.locator('main.communautes-ecran')).toBeVisible();
    await expect(page.locator('.carte-vide')).toBeVisible();
    await expect(page.locator('li.communaute')).toHaveCount(0);

    const { violations } = await new AxeBuilder({ page }).analyze();
    const bloquantes = violationsBloquantes(violations);
    expect(bloquantes, rapporteViolations('/communities (vide)', bloquantes)).toEqual([]);

    await contexte.close();
  });
});
