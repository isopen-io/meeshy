import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { FERMETURE, LIENS } from '../../lib/contenu/liens';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { LIEN_DU_FIL, passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';

/**
 * `/links` — FERMER UN LIEN, ET `/l/:token` RÉPOND 410 DANS LA FOULÉE (#4933).
 *
 * QUATRE SUITES, LE CRITÈRE DE FIN LIGNE À LIGNE :
 *   (1) sans JavaScript — le `<form>` d'une ligne POSTe, PRG, la ligne reste
 *       « fermé » ;
 *   (2) avec JavaScript — OPTIMISTE, puis RÉTABLI par un 403/404 avec le motif
 *       SERVI verbatim ;
 *   (3) bout en bout — `/l/:token` passe de 302 à 410 dans le MÊME test ;
 *   (4) rien sans session — création ET fermeture restent fermées à qui n'a
 *       pas de jeton, sans jamais atteindre la passerelle.
 *
 * Le BOUCHON copie une LOI, pas une réponse (leçon 422) : chaque test change
 * l'ÉTAT (`passerelle.carnet.retarde/createdBy/supprime`, `passerelle.lien.actif`)
 * et lit ce que la passerelle RENDRAIT — jamais un statut dicté au bouchon.
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

test.afterEach(() => {
  passerelle.carnet.remets();
  passerelle.oublie();
});

const cookiesDuLecteur = (base: string) => [
  { name: COOKIE_DE_SESSION, value: 'sonde', url: base },
  { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: base },
];

const contexteConnecte = async (
  navigateur: Browser,
  options: { readonly javaScriptEnabled?: boolean } = {},
): Promise<BrowserContext> => {
  const ctx = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: options.javaScriptEnabled ?? true,
  });
  await ctx.addCookies(cookiesDuLecteur(v3.base));
  return ctx;
};

const ouvreLesLiens = async (ctx: BrowserContext): Promise<Page> => {
  const page = await ctx.newPage();
  await page.goto(`${v3.base}/links`, { waitUntil: 'domcontentloaded' });
  return page;
};

const ligneDeLagos = (page: Page) => page.locator(`li[data-lien="${LIEN_DU_FIL}"]`);

const dernierPatch = () =>
  [...passerelle.journal].reverse().find((appel) => appel.methode === 'PATCH' && appel.chemin === `/api/v1/links/${LIEN_DU_FIL}`);

test.describe('sans JavaScript — un <form>, un PRG', () => {
  test('« Fermer ce lien » POSTe vers /links, PATCHe le lien, et la ligne reste « fermé »', async ({ browser }) => {
    const ctx = await contexteConnecte(browser, { javaScriptEnabled: false });
    const page = await ouvreLesLiens(ctx);

    await ligneDeLagos(page).locator('details.actions summary').click();
    await ligneDeLagos(page).getByRole('button', { name: FERMETURE.geste }).click();

    await expect(page).toHaveURL(`${v3.base}/links?ferme`);

    const patch = dernierPatch();
    expect(patch).toBeDefined();
    expect(patch?.statut).toBe(200);
    expect(JSON.parse(patch?.corps ?? '{}')).toEqual({ isActive: false });

    const ligne = ligneDeLagos(page);
    await expect(ligne).toHaveCount(1);
    await expect(ligne).toHaveClass(/ferme/);
    await expect(ligne).toContainText(LIENS.ferme);
    await expect(ligne.locator('details.actions')).toHaveCount(0);

    await expect(page.locator('.avis[role="status"]')).toContainText(FERMETURE.fait);
    // Le sous-titre porte le compte SERVI par le bouchon après mutation —
    // jamais recompté sur la page (§ 12.10.4).
    await expect(page.locator('.fil-tete .sous')).toHaveText('16 liens actifs');

    await ctx.close();
  });
});

test.describe('avec JavaScript — optimiste, puis rétabli', () => {
  test('la ligne passe « fermé » AVANT la réponse, et le reste après un succès retardé', async ({ browser }) => {
    const ctx = await contexteConnecte(browser);
    const page = await ouvreLesLiens(ctx);
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__sentinelle = 1;
    });

    passerelle.carnet.retarde(800);
    await ligneDeLagos(page).locator('details.actions summary').click();
    await ligneDeLagos(page).getByRole('button', { name: FERMETURE.geste }).click();

    // AVANT la réponse (800 ms de retard posés sur le PATCH) : optimiste.
    await expect(ligneDeLagos(page)).toHaveClass(/ferme/, { timeout: 300 });
    await expect(ligneDeLagos(page).locator('details.actions')).toHaveCount(0, { timeout: 300 });
    // La pastille est DÉVOILÉE, pas composée : elle est là où le rechargement
    // la remet — en FRÈRE de `.dit`, pas dedans (`.dit` est une colonne flex,
    // la pastille y tombait sur une troisième ligne et la ligne SAUTAIT).
    await expect(ligneDeLagos(page).locator('.lien > .etat')).toBeVisible({ timeout: 300 });
    // ET LE FOCUS N'EST PAS TOMBÉ SUR <body> : le `<details>` qui portait le
    // bouton actionné vient d'être retiré.
    expect(await page.evaluate(() => document.activeElement?.classList.contains('lien'))).toBe(true);

    // APRÈS : le carnet frais confirme, SANS navigation.
    await expect(page.locator('.avis[role="status"]')).toContainText(FERMETURE.fait, { timeout: 2_000 });
    await expect(ligneDeLagos(page)).toHaveClass(/ferme/);
    await expect
      .poll(async () => new URL(page.url()).pathname + new URL(page.url()).search)
      .toBe('/links?ferme');
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__sentinelle)).toBe(1);

    await ctx.close();
  });

  test('un 404 (ligne supprimée entre-temps) RÉTABLIT la ligne avec le motif verbatim', async ({ browser }) => {
    passerelle.carnet.supprime(LIEN_DU_FIL);
    const ctx = await contexteConnecte(browser);
    const page = await ouvreLesLiens(ctx);
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__sentinelle = 1;
    });

    await ligneDeLagos(page).locator('details.actions summary').click();
    await ligneDeLagos(page).getByRole('button', { name: FERMETURE.geste }).click();

    // La région est SERVIE muette : le témoin porte sur ce qui la distingue —
    // elle devient VISIBLE et porte le motif servi, verbatim.
    await expect(page.locator('#carnet > .avis.alerte')).toBeVisible();
    await expect(page.locator('#carnet [role="alert"]')).toContainText(`${FERMETURE.refuse} Lien de partage non trouvé`);
    // RÉTABLIE : la ligne redevient active, son menu revient.
    await expect(ligneDeLagos(page)).not.toHaveClass(/ferme/);
    await expect(ligneDeLagos(page).locator('details.actions')).toHaveCount(1);
    // ET LE FOCUS REVIENT AU GESTE : le nœud qui le portait a été remplacé.
    // Sans ce report, la tabulation suivante repart du haut du document.
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('SUMMARY');
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__sentinelle)).toBe(1);
    await expect(page).toHaveURL(`${v3.base}/links`);

    await ctx.close();
  });

  test('un 403 (créé par un autre compte) RÉTABLIT la ligne avec le motif verbatim', async ({ browser }) => {
    passerelle.carnet.createdBy(LIEN_DU_FIL, 'autre-compte');
    const ctx = await contexteConnecte(browser);
    const page = await ouvreLesLiens(ctx);

    await ligneDeLagos(page).locator('details.actions summary').click();
    await ligneDeLagos(page).getByRole('button', { name: FERMETURE.geste }).click();

    await expect(page.locator('#carnet [role="alert"]')).toContainText(
      `${FERMETURE.refuse} Permissions insuffisantes pour modifier ce lien`,
    );
    await expect(ligneDeLagos(page)).not.toHaveClass(/ferme/);

    await ctx.close();
  });
});

/**
 * REVUE DE #4933 — le menu converge vers UN SEUL ouvert, une fois le module
 * chargé (§ 12.10.4 : « une surface pilotée par le script »). Sans lui,
 * `<details>` natif est le contrat et rien à redire ; ici on éprouve les TROIS
 * façons dont un second menu, un clic ailleurs et Échap le referment.
 */
test.describe('le menu converge vers un seul ouvert', () => {
  test('ouvrir un second menu referme le premier', async ({ browser }) => {
    const ctx = await contexteConnecte(browser);
    const page = await ouvreLesLiens(ctx);

    // Un second lien ACTIF est nécessaire pour ouvrir DEUX menus : `mshy_demo`
    // est fermé et n'en porte aucun (règle 11), on en crée donc un.
    await page.getByRole('link', { name: 'Nouveau lien' }).click();
    await page.locator('input[name="conversation"]').fill('Le potager du quartier');
    await page.locator('dialog.nouveau-lien button[type="submit"]').click();
    await expect(page).toHaveURL(`${v3.base}/links?cree`);
    // LA FEUILLE PART EN ENTIER — dialogue ET voile. `poseLeCarnet` ne retirait
    // que le `<dialog>` ; le `<a class="voile">` servi à côté de lui
    // (`liens-vue.ts` › `nouveauLien`, `position:fixed;inset:0`) restait et
    // avalait tous les clics du carnet frais. Sans cette assertion, les gestes
    // mesurés plus bas ne prouveraient rien : ils porteraient sur un écran que
    // le lecteur, lui, ne peut pas toucher (contre-revue de #4933).
    await expect(page.locator('a.voile')).toHaveCount(0);

    // `mshy_cree_1` (créé) est inséré EN TÊTE de liste, `mshy_lagos` juste
    // en dessous (`bouchon-carnet.ts` : « les liens créés en tête »). Un menu
    // OUVERT descend SOUS son sommaire (`liens-feuille.ts`, choix assumé) : on
    // ouvre donc d'abord celui du BAS — son panneau descend vers `mshy_demo`
    // (fermé, sans menu), sans jamais couvrir le sommaire du HAUT — puis celui
    // du haut, dont l'ouverture doit refermer l'autre.
    const duHaut = page.locator('li[data-lien="mshy_cree_1"] details.actions');
    const duBas = ligneDeLagos(page).locator('details.actions');

    await duBas.locator('summary').click();
    await expect(duBas).toHaveJSProperty('open', true);

    await duHaut.locator('summary').click();
    await expect(duHaut).toHaveJSProperty('open', true);
    await expect(duBas).toHaveJSProperty('open', false);

    await ctx.close();
  });

  test('un clic ailleurs dans #carnet, sans en ouvrir un second, referme le menu ouvert', async ({ browser }) => {
    const ctx = await contexteConnecte(browser);
    const page = await ouvreLesLiens(ctx);

    const menu = ligneDeLagos(page).locator('details.actions');
    await menu.locator('summary').click();
    await expect(menu).toHaveJSProperty('open', true);

    // Le panneau OUVERT recouvre visuellement la ligne suivante (défaut 1 du
    // lot : c'est justement ce que ce correctif referme) — cliquer sur cette
    // ligne heurterait donc le panneau lui-même, pas « ailleurs ». Le titre de
    // l'écran, lui, est HORS de `#carnet` et jamais recouvert : un clic là est
    // sans équivoque un clic EXTÉRIEUR.
    await page.locator('.fil-tete h1').click();
    await expect(menu).toHaveJSProperty('open', false);

    await ctx.close();
  });

  test('Échap referme le menu qui porte le focus, et lui rend le focus sur son sommaire', async ({ browser }) => {
    const ctx = await contexteConnecte(browser);
    const page = await ouvreLesLiens(ctx);

    const menu = ligneDeLagos(page).locator('details.actions');
    await menu.locator('summary').click();
    await expect(menu).toHaveJSProperty('open', true);

    await page.keyboard.press('Escape');
    await expect(menu).toHaveJSProperty('open', false);
    await expect(menu.locator('summary')).toBeFocused();

    await ctx.close();
  });
});

/**
 * REVUE DE #4933 — le panneau du menu est ancré par `inset-inline-end`, une
 * propriété LOGIQUE : sans elle (`right:0`), il pendrait du mauvais côté dès
 * que le document passe `dir="rtl"`. Aucun module n'est requis ici — c'est le
 * `<details>` natif, en CSS pur, que le témoin éprouve.
 *
 * DEUX MESURES, ET LA SECONDE EST CELLE QUI PEUT ROUGIR (contre-revue) : aux
 * largeurs TÉLÉPHONE, `width:min(22rem,100%)` rend le panneau AUSSI LARGE que
 * sa ligne — `right:0` et `inset-inline-end:0` le posent alors au MÊME pixel,
 * et un témoin qui ne regarde que le viewport passe avec le défaut en place
 * (vérifié en remettant `right:0`). Le côté ne se mesure donc qu'à une largeur
 * où le panneau est PLUS ÉTROIT que sa ligne : là, en RTL, son bord de FIN est
 * le bord GAUCHE de la ligne.
 */
test.describe('le panneau du menu reste dans le viewport en RTL', () => {
  ([360, 390] as const).forEach((largeur) => {
    test(`la boîte du panneau reste dans le viewport à ${largeur}px`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width: largeur, height: 844 },
        javaScriptEnabled: false,
      });
      await ctx.addCookies(cookiesDuLecteur(v3.base));
      const page = await ctx.newPage();
      await page.goto(`${v3.base}/links`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));

      await ligneDeLagos(page).locator('details.actions summary').click();
      const panneau = ligneDeLagos(page).locator('details.actions form');
      await expect(panneau).toBeVisible();
      const boite = await panneau.boundingBox();
      expect(boite).not.toBeNull();
      expect(boite?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((boite?.x ?? 0) + (boite?.width ?? 0)).toBeLessThanOrEqual(largeur);

      await ctx.close();
    });
  });

  test('à une largeur où le panneau est plus étroit que sa ligne, il pend du côté de FIN', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 900, height: 844 },
      javaScriptEnabled: false,
    });
    await ctx.addCookies(cookiesDuLecteur(v3.base));
    const page = await ctx.newPage();
    await page.goto(`${v3.base}/links`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));

    await ligneDeLagos(page).locator('details.actions summary').click();
    const panneau = ligneDeLagos(page).locator('details.actions form');
    await expect(panneau).toBeVisible();
    const boite = await panneau.boundingBox();
    const rangee = await ligneDeLagos(page).boundingBox();
    expect(boite).not.toBeNull();
    expect(rangee).not.toBeNull();
    // La mesure n'a de sens que si les deux boîtes diffèrent : sinon les deux
    // ancrages donnent le même pixel et le témoin ne peut pas rougir.
    expect(boite?.width ?? 0).toBeLessThan(rangee?.width ?? 0);
    // `.liens>li` est le bloc conteneur (`position:relative`) : en RTL, le bord
    // de FIN du panneau est le bord GAUCHE de la rangée. Avec `right:0` il
    // pendrait à DROITE — c'est ce que cette assertion attrape.
    expect(Math.abs((boite?.x ?? 0) - (rangee?.x ?? 0))).toBeLessThanOrEqual(1);

    await ctx.close();
  });
});

test.describe('bout en bout — /l/:token répond 410 dans la foulée', () => {
  test('un lien VIF redirige (302), le MÊME lien révoqué rend 410', async ({ browser }) => {
    const ctx = await contexteConnecte(browser);
    const page = await ouvreLesLiens(ctx);
    const pageLien = await ctx.newPage();

    // UN LECTEUR CONNECTÉ traverse DEUX sauts : `/l/:token` → `/chat/:lien`
    // (302, ce que ce test vise) → `/chats/:cle` (`/chat/:lien` joint et
    // renvoie un MEMBRE à son fil, § 12.3 « état MEMBRE »). `redirectedFrom()`
    // ne rend que le hop IMMÉDIATEMENT précédent : on remonte jusqu'au PREMIER,
    // celui de `/l/:token`.
    const avant = await pageLien.goto(`${v3.base}/l/${LIEN_DU_FIL}`, { waitUntil: 'commit' });
    let premierHop = avant?.request() ?? null;
    while (premierHop?.redirectedFrom() != null) premierHop = premierHop.redirectedFrom();
    expect((await premierHop?.response())?.status()).toBe(302);
    expect((await premierHop?.response())?.headers().location).toBe(`/chat/${LIEN_DU_FIL}`);

    await ligneDeLagos(page).locator('details.actions summary').click();
    await ligneDeLagos(page).getByRole('button', { name: FERMETURE.geste }).click();
    await expect(page).toHaveURL(`${v3.base}/links?ferme`);

    const apres = await pageLien.goto(`${v3.base}/l/${LIEN_DU_FIL}`);
    expect(apres?.status()).toBe(410);
    expect(new URL(pageLien.url()).pathname).toBe(`/l/${LIEN_DU_FIL}/expired`);

    const resolve = passerelle.journal.some(
      (appel) => appel.methode === 'GET' && appel.chemin.includes(`/tracking-links/${LIEN_DU_FIL}/resolve`),
    );
    const apercu = passerelle.journal.some(
      (appel) => appel.methode === 'GET' && appel.chemin.includes(`/anonymous/link/${LIEN_DU_FIL}`) && appel.statut === 410,
    );
    expect(resolve).toBe(true);
    expect(apercu).toBe(true);

    await ctx.close();
  });
});

test.describe('rien sans session', () => {
  test('création ET fermeture restent fermées à qui n’a pas de jeton', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });

    const carnet = await ctx.request.get(`${v3.base}/links`, { maxRedirects: 0 });
    expect(carnet.status()).toBe(302);
    expect(carnet.headers().location).toBe('/login?returnUrl=%2Flinks');

    const fermeture = await ctx.request.post(`${v3.base}/links`, {
      form: { geste: 'fermer', lien: LIEN_DU_FIL },
      headers: { origin: v3.base },
      maxRedirects: 0,
    });
    expect(fermeture.status()).toBe(302);
    expect(fermeture.headers().location).toBe('/login?returnUrl=%2Flinks');
    expect(passerelle.journal.some((appel) => appel.methode === 'PATCH')).toBe(false);

    const creation = await ctx.request.get(`${v3.base}/links?nouveau`, { maxRedirects: 0 });
    expect(creation.status()).toBe(302);
    expect(creation.headers().location).toBe('/login?returnUrl=%2Flinks');

    await ctx.close();
  });
});
