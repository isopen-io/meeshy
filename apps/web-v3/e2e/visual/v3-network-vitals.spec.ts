import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { expect, test, type Browser } from '@playwright/test';

import { themeScriptSource } from '../../app/theme-script';
import {
  budgetDeBundle,
  chargeMesureReseau,
  CREATEUR_DU_LIEN,
  NOM_DU_LIEN,
  passerelleDeBouchon,
  RACINE_V3,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';

/**
 * Gate D — le poids réseau et les vitals de la v3 (conception § 9.7).
 *
 * Le groupe `linkRedirect` porte, ligne à ligne, le critère de fin de l'issue
 * #4495 : « une seule requête avant la 302, zéro `<script>` hors ThemeScript
 * (≤ 400 o), HTML de repli ≤ 4 Ko gzip hors sprite, OG réels lus par un
 * crawler simulé, et le POST de clic observé APRÈS la redirection ».
 *
 * UNE PRÉCISION QUE LE CRITÈRE APPELLE. Le clic part SERVEUR à serveur : il
 * n'apparaît donc dans aucun journal de navigateur, et le journal CDP ne peut
 * en dire qu'une moitié — que rien d'autre que le document n'est parti avant la
 * 302. L'autre moitié — que le clic est bien parti, et APRÈS — se lit sur la
 * passerelle, dont le bouchon date chaque appel avec l'horloge du test. Les
 * deux assertions sont faites, sur la même navigation.
 *
 * COMMENT ON LE LANCE. `bun run e2e -- e2e/visual/v3-network-vitals.spec.ts
 * --grep linkRedirect` — le script remplit `CHROMIUM_PATH` depuis
 * `scripts/lib/navigateur.cjs`, le site unique de « où est Chromium » (§ 9.2).
 * `bunx playwright test …` marche à l'identique partout où les navigateurs de
 * Playwright sont installés à la révision qu'il réclame.
 *
 * Les seuils ne sont pas écrits ici : ils viennent de `budgets.json`, et la
 * comparaison est faite par `franchissementsReseau` — le site unique du § 9.2.
 * Un spec qui réécrirait le calcul serait la « jumelle » que la passe Opus
 * cherche à sa question (d).
 */

/**
 * Un jeton PAR test, et le journal de la passerelle se lit filtré par lui.
 *
 * Le clic part APRÈS la réponse : il peut donc atterrir dans le journal
 * pendant le test SUIVANT. Un journal remis à zéro entre les tests ne suffit
 * pas — il déplace la course, il ne la ferme pas — et le test d'ordre voyait
 * alors le clic du test précédent, daté AVANT sa propre redirection.
 */
const JETON = '8fz3-lagos';
const JETON_ORDRE = '8fz3-ordre';
const UA_ROBOT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const UA_HUMAIN =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const budgets = JSON.parse(readFileSync(join(RACINE_V3, 'budgets.json'), 'utf8'));

const COMMANDE = 'bunx playwright test e2e/visual/v3-network-vitals.spec.ts --grep linkRedirect';

/**
 * La mesure du repli, avec l'agent d'un robot : c'est le seul chemin de cette
 * route qui RENDE des pixels. Mesurer le chemin humain reviendrait à mesurer la
 * page de destination — un autre écran, un autre budget.
 *
 * Elle APPELLE `mesurePage`, le site unique du § 9.2 : la session CDP, l'écoute
 * des trois événements réseau et le bloc `VITALS` y vivent une seule fois. Ce
 * spec avait commencé par les recopier, faute d'un paramètre d'agent sur la
 * fonction partagée — trente-cinq lignes identiques au caractère près, c'est-à-
 * dire une jumelle qui aurait divergé au premier plafond ajouté. Le remède est
 * d'ÉTENDRE le site unique (`userAgent`), jamais de le dupliquer.
 */
const mesureDuRepli = async (navigateur: Browser, url: string) => {
  const { mesurePage } = await chargeMesureReseau();
  return mesurePage({ url, commande: COMMANDE, navigateur, userAgent: UA_ROBOT });
};

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const lienDe = (jeton = JETON): string => `${v3.base}/l/${jeton}`;

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon();
  v3 = await serveurDeLaV3(passerelle.base);
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

test.describe('linkRedirect — un lien partagé s’ouvre en un aller-retour', () => {
  test('une seule requête avant la 302, et un seul saut', async ({ browser }) => {
    const contexte = await browser.newContext({ userAgent: UA_HUMAIN });
    const page = await contexte.newPage();
    const cdp = await contexte.newCDPSession(page);
    await cdp.send('Network.enable');

    const emises: string[] = [];
    cdp.on('Network.requestWillBeSent', (e) => emises.push(e.request.url));

    const finale = await page.goto(lienDe(), { waitUntil: 'commit' });
    const origine = finale?.request().redirectedFrom();

    expect(emises.filter((url) => url.includes(`/l/${JETON}`))).toHaveLength(1);
    expect(origine?.url()).toBe(lienDe());
    expect(origine?.redirectedFrom()).toBeNull();
    expect((await origine?.response())?.status()).toBe(302);
    expect(finale?.url()).toBe(`${v3.base}/chats/${JETON}`);

    await contexte.close();
  });

  test('le POST de clic part APRÈS la redirection, jamais avant', async ({ browser }) => {
    const contexte = await browser.newContext({ userAgent: UA_HUMAIN });
    const page = await contexte.newPage();
    const cdp = await contexte.newCDPSession(page);
    await cdp.send('Network.enable');

    /**
     * L'horloge du NAVIGATEUR, pas celle du gestionnaire d'événement.
     *
     * `Date.now()` dans le rappel CDP date la RÉCEPTION du message par le
     * processus de test, une dizaine de millisecondes après le fait — assez
     * pour dater la 302 APRÈS un clic qui est pourtant bien parti ensuite.
     * `responseTime` est le moment, en millisecondes depuis l'époque, où le
     * navigateur a reçu la 302 : la même horloge murale que celle du bouchon,
     * qui tourne sur la même machine.
     */
    const redirections: number[] = [];
    cdp.on('Network.requestWillBeSent', (e) => {
      if (e.redirectResponse?.status === 302) redirections.push(e.redirectResponse.responseTime ?? 0);
    });

    await page.goto(lienDe(JETON_ORDRE), { waitUntil: 'commit' });

    const pourCeTest = () => passerelle.journal.filter((a) => a.chemin.includes(JETON_ORDRE));
    await expect
      .poll(() => pourCeTest().filter((a) => a.methode === 'POST').length, { timeout: 10_000 })
      .toBe(1);

    const resolution = pourCeTest().find((a) => a.methode === 'GET');
    const clic = pourCeTest().find((a) => a.methode === 'POST');

    expect(resolution?.chemin).toContain(`/tracking-links/${JETON_ORDRE}/resolve`);
    expect(clic?.chemin).toContain(`/tracking-links/${JETON_ORDRE}/click`);
    expect(redirections).toHaveLength(1);
    /**
     * La comparaison se fait à la RÉSOLUTION que les deux horloges partagent.
     *
     * `responseTime` est fractionnaire (…718.983) ; `Date.now()`, dont le
     * bouchon date ses appels, TRONQUE à la milliseconde (…718). Un clic parti
     * dans la même milliseconde que la 302 se lisait donc « 0,983 ms avant
     * elle » — un échec sur une avance que ni l'une ni l'autre des deux horloges
     * ne sait mesurer. Le plancher ramène la borne à la milliseconde entière :
     * l'invariant testé reste « jamais AVANT », il cesse d'être testé sur des
     * chiffres après la virgule que le témoin d'en face n'a pas.
     */
    const laRedirection = Math.floor(redirections[0] ?? Number.MAX_SAFE_INTEGER);
    expect(clic?.a ?? 0).toBeGreaterThanOrEqual(laRedirection);
    expect(JSON.parse(clic?.corps ?? '{}')).toMatchObject({ socialSource: 'Direct', device: 'mobile' });

    await contexte.close();
  });

  test('le repli ne porte AUCUN script hors le moteur de thème, sous 400 octets', async ({ request }) => {
    const reponse = await request.get(lienDe(), { headers: { 'user-agent': UA_ROBOT } });
    const html = await reponse.text();
    const scripts = html.match(/<script\b[\s\S]*?<\/script>/g) ?? [];

    expect(reponse.status()).toBe(200);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain(themeScriptSource);
    expect(Buffer.byteLength(themeScriptSource, 'utf8')).toBeLessThanOrEqual(400);
  });

  test('le repli tient sous 4 Ko gzip, sprite non compté puisqu’il n’est pas demandé', async ({
    request,
  }, info) => {
    const reponse = await request.get(lienDe(), { headers: { 'user-agent': UA_ROBOT } });
    const html = await reponse.text();
    const gzip = gzipSync(Buffer.from(html, 'utf8'), { level: 9 }).byteLength;

    // La valeur MESURÉE est annotée plutôt que recopiée dans un fichier : une
    // mesure qu'on recopie dérive, une mesure que le gate produit à chaque
    // exécution ne le peut pas.
    info.annotations.push({
      type: 'repli /l/:token',
      description: `${Buffer.byteLength(html, 'utf8')} o bruts, ${gzip} o gzip -9 (plafond 4096)`,
    });

    expect(html).not.toContain('sprite.svg');
    expect(gzip).toBeLessThanOrEqual(4096);
  });

  test('un crawler simulé lit des OG RÉELS, et rien de l’identité du créateur', async ({ request }) => {
    const html = await (
      await request.get(lienDe(), { headers: { 'user-agent': UA_ROBOT } })
    ).text();

    expect(html).toContain(`<meta property="og:title" content="${NOM_DU_LIEN}"/>`);
    expect(html).toContain('property="og:description"');
    expect(html).toContain(`<meta property="og:url" content="${lienDe()}"/>`);
    expect(html).not.toContain(CREATEUR_DU_LIEN);
  });

  test('le repli tient les plafonds réseau de budgets.json pour /l/*', async ({ browser }) => {
    const { franchissementsReseau } = await chargeMesureReseau();
    const mesure = await mesureDuRepli(browser, lienDe());
    const franchissements = franchissementsReseau(mesure, budgets.reseau);

    expect(mesure.http).toBe(200);
    expect(mesure.requetes_avant_premier_pixel).toBe(1);
    expect(franchissements.filter((f) => f.statut === 'GATE').map((f) => f.texte)).toEqual([]);
  });

  test('check-bundle-budget rend 0 Ko de JS sur cette route', () => {
    const manifeste = JSON.parse(
      readFileSync(join(RACINE_V3, '.next', 'app-build-manifest.json'), 'utf8'),
    ) as { readonly pages: Readonly<Record<string, readonly string[]>> };

    // La clé EXISTE au manifeste — Next y range aussi les gestionnaires de
    // route —, et c'est bien pourquoi le gate classe par NATURE plutôt que par
    // présence : un `route` n'expédie aucun octet au navigateur.
    expect(Object.keys(manifeste.pages)).toContain('/(public)/l/[token]/route');
    expect(budgetDeBundle()).toContain('0 Ko de JS client');
  });
});
