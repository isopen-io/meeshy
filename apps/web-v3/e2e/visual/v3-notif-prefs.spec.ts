import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON } from '../../lib/api/cookies';
import { BASCULES_DE_PREFS, type CleDePreference } from '../../lib/contenu/prefs-de-notif';
import { ciblesMesurees, ciblesTropPetites, TARGET_MIN } from './lib/cibles';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { chargeMesureReseau, passerelleDeBouchon, RACINE_V3, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';
import { COLONNES_DE_THEME, rapporteViolations, violationsBloquantes } from './lib/verdict-axe';

/**
 * `/notifications/preferences` — LES TREIZE BASCULES, EN DIRECT (issue
 * #4899, spécification § 3).
 *
 * LE CRITÈRE CENTRAL : chaque bascule envoie SA mutation (une clé, jamais le
 * document entier — la leçon structurelle du legacy) et le rechargement RELIT
 * ce que la passerelle a stocké — jamais un espoir local. `__tests__/prefs-
 * porte.test.ts` et `__tests__/prefs-vue.test.ts` jugent le document et la
 * porte en jsdom ; ce fichier juge ce qu'un VRAI navigateur en fait : le
 * `fetch` du module, l'optimisme, le rollback visible, le contraste calculé.
 */

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const cookiesDuLecteur = (base: string) => [
  { name: 'meeshy_session', value: 'sonde', url: base },
  { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: base },
];

const contexteDuLecteur = async (
  browser: Browser,
  options: { readonly javaScriptEnabled?: boolean; readonly colorScheme?: 'light' | 'dark' } = {},
): Promise<BrowserContext> => {
  const contexte = await browser.newContext({
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: options.javaScriptEnabled ?? true,
    colorScheme: options.colorScheme ?? 'light',
  });
  await contexte.addCookies(cookiesDuLecteur(v3.base));
  return contexte;
};

/** Le module arrive APRÈS le premier pixel : on l'attend par son EFFET, jamais par une minuterie seule. */
const attendsLeModule = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.waitForFunction(() => document.querySelector('main[data-participation="prefs"]') !== null);
  await page.waitForTimeout(1_200);
};

const formulaireDe = (page: import('@playwright/test').Page, cle: string) =>
  page.locator('form.bascule', { has: page.locator(`input[name="cle"][value="${cle}"]`) });

/**
 * CE QUE LE BOUCHON A RÉELLEMENT STOCKÉ — la seule autorité de ces témoins :
 * un document rendu peut mentir, l'état écrit derrière la route ne peut pas.
 * `CleDePreference` est une restriction de `keyof NotificationPreference`
 * (`lib/contenu/prefs-de-notif.ts`), donc l'index ci-dessous est TYPÉ : aucune
 * assertion n'est nécessaire, et si une clé de la table cessait d'appartenir
 * au schéma, c'est `bun run type-check` qui rougirait — pas ce témoin, en
 * silence, à l'exécution.
 */
const stocke = (cle: CleDePreference): boolean => Boolean(passerelle.notificationPrefs[cle]);

test.describe('les treize bascules, en direct', () => {
  test.beforeAll(async () => {
    passerelle = await passerelleDeBouchon();
    v3 = await serveurDeLaV3(passerelle.base);
  });

  test.afterAll(async () => {
    await v3?.ferme();
    await passerelle?.ferme();
  });

  /**
   * LE CŒUR DU CRITÈRE — pour CHAQUE clé de la table IMPORTÉE (jamais une
   * énumération à la main, qui se périmerait à la première bascule ajoutée) :
   * basculer, attendre le PATCH dans le réseau (corps EXACT `{"notification":
   * {[cle]:…}}`), recharger, vérifier que `aria-checked` reflète ce que la
   * passerelle a STOCKÉ.
   */
  test('chaque bascule envoie sa mutation et est relue du serveur après rechargement', async ({ browser }) => {
    const contexte = await contexteDuLecteur(browser);
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/notifications/preferences`);
    await attendsLeModule(page);

    for (const { cle, libelle } of BASCULES_DE_PREFS) {
      const avant = stocke(cle);
      const formulaire = formulaireDe(page, cle);
      const bouton = formulaire.locator('button[role="switch"]');

      const [requete] = await Promise.all([
        page.waitForRequest(
          (r) => r.method() === 'PATCH' && new URL(r.url()).pathname === '/api/v1/me/preferences',
        ),
        bouton.click(),
      ]);

      expect(JSON.parse(requete.postData() ?? '{}'), libelle).toEqual({ notification: { [cle]: !avant } });

      await page.reload();
      await expect(formulaireDe(page, cle).locator('button[role="switch"]'), libelle).toHaveAttribute(
        'aria-checked',
        String(stocke(cle)),
      );
      // La relecture PROUVE la persistance : le bouchon a stocké l'INVERSE de « avant ».
      expect(stocke(cle), libelle).toBe(!avant);
    }

    await contexte.close();
  });

  test('sans JavaScript, une bascule aboutit — PATCH reçu, 302/303, état relu, région de statut visible', async ({
    browser,
  }) => {
    const contexte = await contexteDuLecteur(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/notifications/preferences`);

    const cle = 'pushEnabled';
    const avant = stocke(cle);
    const bouton = formulaireDe(page, cle).locator('button[role="switch"]');

    await bouton.click();

    await expect(page).toHaveURL(`${v3.base}/notifications/preferences?regle=${cle}`);
    await expect(page.locator('.avis[role="status"]')).toBeVisible();
    await expect(formulaireDe(page, cle).locator('button[role="switch"]')).toHaveAttribute(
      'aria-checked',
      String(!avant),
    );
    expect(stocke(cle)).toBe(!avant);

    await contexte.close();
  });

  test('un échec réseau APRÈS le premier pixel fait un rollback VISIBLE — l’état reste celui du serveur', async ({
    browser,
  }) => {
    const contexte = await contexteDuLecteur(browser);
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/notifications/preferences`);
    await attendsLeModule(page);

    const cle = 'emailEnabled';
    const avant = stocke(cle);
    const bouton = formulaireDe(page, cle).locator('button[role="switch"]');

    // Coupé APRÈS le premier pixel — le module est déjà là, c'est bien SON
    // fetch qui échoue, jamais le chargement du document.
    await page.route(
      (url) => url.pathname === '/api/v1/me/preferences',
      (route) => (route.request().method() === 'PATCH' ? route.abort() : route.continue()),
    );

    // L'INSTANT optimiste (peint avant le réseau) est éprouvé par le témoin
    // SUIVANT, où la réponse est délibérément retardée pour le rendre
    // observable ; ici l'abandon de la requête est trop proche du clic pour
    // garantir une fenêtre stable — seul le résultat FINAL importe au
    // critère de fin : le rollback est VISIBLE, jamais un état qui divergerait
    // du serveur.
    await bouton.click();
    await expect(bouton).toHaveAttribute('aria-checked', String(avant));
    await expect(page.locator('.echec[role="alert"]')).toBeVisible();

    await page.unroute((url) => url.pathname === '/api/v1/me/preferences');
    await page.reload();
    await expect(formulaireDe(page, cle).locator('button[role="switch"]')).toHaveAttribute(
      'aria-checked',
      String(avant),
    );
    expect(stocke(cle)).toBe(avant);

    await contexte.close();
  });

  test('la bascule est optimiste — l’état change AVANT que le bouchon ne réponde', async ({ browser }) => {
    const contexte = await contexteDuLecteur(browser);
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/notifications/preferences`);
    await attendsLeModule(page);

    const cle = 'soundEnabled';
    const avant = stocke(cle);
    const bouton = formulaireDe(page, cle).locator('button[role="switch"]');

    // La réponse RÉELLE est retardée : si l'état ne bougeait qu'à son retour,
    // ce témoin ne verrait rien avant la fin de la pause.
    await page.route(
      (url) => url.pathname === '/api/v1/me/preferences',
      async (route) => {
        if (route.request().method() !== 'PATCH') return route.continue();
        await new Promise((resoud) => setTimeout(resoud, 800));
        await route.continue();
      },
    );

    await bouton.click();
    await expect(bouton).toHaveAttribute('aria-checked', String(!avant));
    // LES DEUX MOITIÉS DE LA RANGÉE DISENT LA MÊME CHOSE. Le champ caché
    // `valeur` est ce que le chemin SANS JavaScript enverrait : peint
    // optimiste sans le suivre, le contrôle redemanderait l'état qu'il vient
    // d'afficher, la première fois qu'il repasserait par le navigateur.
    await expect(formulaireDe(page, cle).locator('input[name="valeur"]')).toHaveValue(String(avant));

    await contexte.close();
  });

  COLONNES_DE_THEME.forEach((theme) => {
    test(`0 violation axe serious/critical — /notifications/preferences (${theme.id})`, async ({ browser }) => {
      const contexte = await contexteDuLecteur(browser, { colorScheme: theme.colorScheme });
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
      const page = await contexte.newPage();

      await page.goto(`${v3.base}/notifications/preferences`);
      await expect(page.locator('main.prefs-ecran')).toBeVisible();
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));

      const { violations } = await new AxeBuilder({ page }).analyze();
      const bloquantes = violationsBloquantes(violations);
      expect(bloquantes, rapporteViolations(`/notifications/preferences (${theme.id})`, bloquantes)).toEqual([]);

      // LES DEUX FENTES DE STATUT SONT `hidden` AU REPOS — donc AUCUNE des
      // quatre colonnes ne mesurait leur contraste, alors que ce sont les
      // seuls textes de l'écran peints hors de l'encre courante
      // (`--color-text-muted` pour l'avis, `--color-danger` pour l'échec).
      // Un écran « 0 violation » dont on n'aurait jamais regardé les états
      // n'est vert que par OMISSION : les deux se révèlent ici, dans la
      // colonne mesurée.
      await page.goto(`${v3.base}/notifications/preferences?regle=pushEnabled`);
      await expect(page.locator('.avis[role="status"]')).toBeVisible();
      const avecAvis = violationsBloquantes((await new AxeBuilder({ page }).analyze()).violations);
      expect(avecAvis, rapporteViolations(`/notifications/preferences?regle= (${theme.id})`, avecAvis)).toEqual([]);

      await attendsLeModule(page);
      await page.route(
        (url) => url.pathname === '/api/v1/me/preferences',
        (route) => (route.request().method() === 'PATCH' ? route.abort() : route.continue()),
      );
      await formulaireDe(page, 'systemEnabled').locator('button[role="switch"]').click();
      await expect(page.locator('.echec[role="alert"]')).toBeVisible();
      const avecEchec = violationsBloquantes((await new AxeBuilder({ page }).analyze()).violations);
      expect(avecEchec, rapporteViolations(`/notifications/preferences — échec (${theme.id})`, avecEchec)).toEqual([]);

      await contexte.close();
    });
  });

  test('chaque rangée-commutateur et l’action d’en-tête de /notifications tiennent 44 px', async ({ browser }) => {
    const contexte = await contexteDuLecteur(browser);
    const page = await contexte.newPage();

    await page.goto(`${v3.base}/notifications/preferences`);
    const cibles = ciblesMesurees(page);
    const trop = ciblesTropPetites(await cibles);
    expect(trop, JSON.stringify(trop)).toEqual([]);

    await page.goto(`${v3.base}/notifications`);
    const action = page.locator('.fil-tete a.medias[href="/notifications/preferences"]');
    await expect(action).toBeVisible();
    const boite = await action.boundingBox();
    expect(boite?.width ?? 0).toBeGreaterThanOrEqual(TARGET_MIN);
    expect(boite?.height ?? 0).toBeGreaterThanOrEqual(TARGET_MIN);

    await contexte.close();
  });

  test('tient le plafond réseau de /notifications/preferences (§ 12.6, motif /notifications/*)', async ({
    browser,
  }) => {
    const budgets = JSON.parse(readFileSync(join(RACINE_V3, 'budgets.json'), 'utf8'));
    const { mesurePage, franchissementsReseau } = await chargeMesureReseau();

    const mesure = await mesurePage({
      url: `${v3.base}/notifications/preferences`,
      commande: 'bunx playwright test e2e/visual/v3-notif-prefs.spec.ts',
      navigateur: browser as unknown as Parameters<typeof mesurePage>[0]['navigateur'],
      cookies: cookiesDuLecteur(v3.base),
    });

    expect(mesure.statut).toBe('mesuré');
    expect(mesure.http).toBe(200);

    const franchis = franchissementsReseau(mesure, budgets.reseau).filter(
      (franchissement) => franchissement.statut === 'GATE',
    );
    expect(franchis.map((franchissement) => franchissement.texte)).toEqual([]);
  });
});
