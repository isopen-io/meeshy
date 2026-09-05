// GATE — `sheet:member` (#5093) : les deux ronds qui remplacent la barre
// d'onglets, et la feuille qu'ils ouvrent, sur les DEUX écrans que la table de
// navigation de la planche en dote (`MeeshyWebV3.dc.html:867-868`).
//
// `__tests__/espace-membre.test.ts` oppose les destinations aux `route.ts`
// présents et juge le document servi ; `__tests__/tableau-a11y.test.ts` passe
// `axe` sur la feuille ouverte dans jsdom. Ce fichier juge ce qu'un VRAI
// navigateur en fait, et il porte les deux choses qu'aucun des deux ne peut
// dire :
//
//   1. **Échap** — la feuille n'est modale que si le module servi sur ces deux
//      écrans l'a ÉLEVÉE (`lib/realtime/plein-ecran.ts`). Un `<dialog open>`
//      non modal n'a ni `::backdrop`, ni piège à focus, ni Échap : le témoin
//      attend `:modal` avant d'appuyer, sinon il mesure le socle en croyant
//      mesurer l'amélioration.
//   2. **Aucun contrôle couvert au repos** (charte règle 7 b/c). Les deux ronds
//      sont `position:fixed` ; ce qui les empêche de recouvrir la dernière
//      ligne de la page est la BANDE que leur conteneur réserve dans le flux.
//      Cela ne se lit pas dans le HTML — seul un navigateur qui a mis en page
//      peut dire ce qu'il y a sous un point donné (`elementFromPoint`).

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { ESPACE, RANGEES_DE_L_ESPACE } from '../../lib/contenu/espace';
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

/**
 * LES DEUX HÔTES, ET CE QUI LES SÉPARE. Les mêmes ronds aux mêmes coins, la
 * même feuille — mais `/chats` sert son module de participation et le tableau
 * de bord n'expédie AUCUN script. Échap n'est donc pas une propriété de la
 * feuille : c'est une propriété de l'ÉCRAN qui la sert, et `eleve` le dit.
 * L'écrire ici plutôt que de le déduire est ce qui empêche un vert d'inertie —
 * un sondage `:modal` qui expirerait en silence sortirait aussi vert qu'un
 * module absent.
 */
const HOTES = [
  { nom: 'le tableau de bord', chemin: '/', eleve: false },
  { nom: 'la liste', chemin: '/chats', eleve: true },
] as const;

const contexte = async (
  navigateur: Browser,
  options: { readonly schema?: 'light' | 'dark'; readonly stockage?: 'light' | 'dark' | null; readonly javaScriptEnabled?: boolean } = {},
): Promise<BrowserContext> => {
  const ctx = await navigateur.newContext({
    colorScheme: options.schema ?? 'light',
    javaScriptEnabled: options.javaScriptEnabled ?? true,
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

const feuille = (page: Page) => page.locator('dialog.espace');

HOTES.forEach(({ nom, chemin, eleve }) => {
  /**
   * LE CRITÈRE DE FIN, COMPTÉ EN GESTES : ouvrir la feuille (1), toucher une
   * rangée (2). Six écrans à deux gestes, dont quatre n'avaient AUCUNE porte.
   */
  test(`deux gestes mènent aux réglages — ${nom}`, async ({ browser }) => {
    const ctx = await contexte(browser);
    const page = await ctx.newPage();

    await page.goto(`${v3.base}${chemin}`);
    await page.getByRole('link', { name: ESPACE.ouvrir }).click();
    await expect(feuille(page)).toBeVisible();

    await feuille(page).getByRole('link', { name: 'Paramètres' }).click();
    await expect(page).toHaveURL(`${v3.base}/settings`);

    await ctx.close();
  });

  test(`les sept destinations sont rendues — ${nom}`, async ({ browser }) => {
    const ctx = await contexte(browser);
    const page = await ctx.newPage();

    await page.goto(`${v3.base}${chemin}?espace`);
    await expect(feuille(page)).toBeVisible();

    for (const rangee of RANGEES_DE_L_ESPACE) {
      await expect(feuille(page).locator(`a.rangee[href="${rangee.href}"]`)).toHaveCount(1);
    }
    await expect(page.locator('a.flottante.gauche')).toHaveAttribute('href', '/feed');

    await ctx.close();
  });

  /**
   * ÉCHAP — l'amélioration, là où un module la porte, et RIEN là où il n'y en a
   * pas. Le sondage attend `:modal` avant d'appuyer : le module qui élève la
   * feuille est DIFFÉRÉ (chargé après le premier pixel puis l'inactivité), donc
   * appuyer tout de suite mesurerait le socle en croyant mesurer l'élévation.
   *
   * MESURÉ LE 2026-09-04, et c'est ce qui a fait écrire `eleve` : sur `/`, ce
   * sondage a expiré. Le tableau de bord n'expédie aucun script — sa vertu, pas
   * son défaut —, donc `<dialog open>` y reste NON MODAL : ni `::backdrop`, ni
   * piège à focus, ni Échap. Le témoin l'affirme dans les deux sens plutôt que
   * de sauter le cas : un écran qui se mettrait à charger un module sans qu'on
   * l'ait voulu ferait tomber la seconde branche.
   */
  (eleve ? test : test.skip)(`Échap ferme la feuille — ${nom}`, async ({ browser }) => {
    const ctx = await contexte(browser);
    const page = await ctx.newPage();

    await page.goto(`${v3.base}${chemin}?espace`);
    await expect
      .poll(() => page.evaluate(() => document.querySelector('dialog.espace')?.matches(':modal') ?? false), {
        timeout: 10_000,
      })
      .toBe(true);

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(`${v3.base}${chemin}`);

    await ctx.close();
  });

  (eleve ? test.skip : test)(`la feuille reste NON modale, et le document sans script — ${nom}`, async ({ browser }) => {
    const ctx = await contexte(browser);
    const page = await ctx.newPage();

    await page.goto(`${v3.base}${chemin}?espace`);
    await expect(feuille(page)).toBeVisible();

    // Le script de thème est le SEUL octet de JavaScript que cet écran expédie
    // (§ 8.3) : tout script SOURCÉ serait un module, donc un aller-retour.
    expect(await page.locator('script[src]').count()).toBe(0);
    expect(await page.evaluate(() => document.querySelector('dialog.espace')?.matches(':modal') ?? false)).toBe(false);

    // Le socle tient sans lui : la croix ferme.
    await feuille(page).locator('a.fermer').click();
    await expect(page).toHaveURL(`${v3.base}${chemin}`);

    await ctx.close();
  });

  /**
   * LE SOCLE, SANS UN OCTET DE JAVASCRIPT : trois liens ferment la feuille. Le
   * VOILE est visé par son coin haut-gauche — son centre est couvert par la
   * feuille, qui s'ancre en bas et remonte.
   */
  test(`le voile ferme la feuille sans JavaScript — ${nom}`, async ({ browser }) => {
    const ctx = await contexte(browser, { javaScriptEnabled: false });
    const page = await ctx.newPage();

    await page.goto(`${v3.base}${chemin}?espace`);
    await expect(feuille(page)).toBeVisible();

    await page.locator('a.voile').click({ position: { x: 8, y: 8 } });
    await expect(page).toHaveURL(`${v3.base}${chemin}`);

    await ctx.close();
  });

  /**
   * CHARTE RÈGLE 7 b/c — « au repos, aucun élément fixe ne couvre un CONTRÔLE ».
   *
   * Le témoin descend jusqu'au BAS du document, puis demande au navigateur ce
   * qu'il y a au centre du DERNIER contrôle de la page : si un rond le
   * recouvre, `elementFromPoint` rend le rond. C'est la seule mesure qui
   * l'attrape — le HTML servi est le même dans les deux cas, et une capture ne
   * dirait pas lequel des deux reçoit le doigt.
   */
  test(`aucun rond ne couvre le dernier contrôle — ${nom}`, async ({ browser }) => {
    const ctx = await contexte(browser);
    const page = await ctx.newPage();

    await page.goto(`${v3.base}${chemin}`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    const verdict = await page.evaluate(() => {
      const cibles = [...document.querySelectorAll('main a, main button, main summary')].filter(
        (noeud) => !noeud.closest('.flottantes'),
      );
      const dernier = cibles[cibles.length - 1];
      if (dernier === undefined) return { mesure: false, couvert: null };
      const rect = dernier.getBoundingClientRect();
      const dessus = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        mesure: true,
        couvert: dessus === null ? null : dessus.closest('.flottantes') === null ? null : 'un rond flottant',
      };
    });

    expect(verdict.mesure, 'aucun contrôle mesuré — le balayage n’a rien vu').toBe(true);
    expect(verdict.couvert, `le dernier contrôle de ${chemin} est couvert`).toBeNull();

    await ctx.close();
  });
});

COLONNES_DE_THEME.forEach((theme) => {
  test(`0 violation axe serious/critical — /?espace (${theme.id})`, async ({ browser }) => {
    const ctx = await contexte(browser, { schema: theme.colorScheme, stockage: theme.stockage });
    const page = await ctx.newPage();

    await page.goto(`${v3.base}/?espace`);
    await expect(feuille(page)).toBeVisible();
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));

    const { violations } = await new AxeBuilder({ page }).analyze();
    const bloquantes = violationsBloquantes(violations);
    expect(bloquantes, rapporteViolations(`/?espace (${theme.id})`, bloquantes)).toEqual([]);

    await ctx.close();
  });
});
