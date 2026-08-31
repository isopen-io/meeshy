import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, test } from '@playwright/test';

import { contoursDeControle, contrasteDeLaLimite } from './lib/contours';
import {
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
 * `linkExpired` — le critère de fin de l'issue #4496, ligne à ligne.
 *
 * « Deux requêtes avant le premier pixel utile (HTML + CSS), aucun composant
 * client monté, les deux CTA câblés et atteignables au clavier, LINK_EXPIRED /
 * LINK_INACTIVE / LINK_MAX_USES / CONVERSATION_CLOSED rendant chacun sa raison
 * propre. »
 *
 * POURQUOI LE BOUCHON JOUE TROIS CHAÎNES, ET PAS UNE. Une INVITATION close se
 * lit sur deux portes : `resolve` la dit inactive — c'est ce qui envoie le
 * lecteur ici — et `GET /anonymous/link/:identifier` NOMME le refus. Un lien de
 * TRACKING (story, réel, post, humeur : tout le § P0) n'a que la première :
 * l'aperçu ne connaît pas son modèle et rend 404. Un jeton INCONNU n'en a
 * aucune. Un bouchon qui refuserait des deux côtés pour tout jeton ferait passer
 * ce spec sur une chaîne que la production ne produit jamais — et c'est
 * exactement ce qui a laissé un écran servir « Indéterminé » à la moitié du
 * produit.
 *
 * COMMENT ON LE LANCE :
 *   cd apps/web-v3 && bun run build
 *   bun run e2e -- e2e/visual/v3-lien-expire.spec.ts
 */

const REFUS: Readonly<Record<string, string>> = {
  'jeton-expire': 'LINK_EXPIRED',
  'jeton-ferme': 'LINK_INACTIVE',
  'jeton-epuise': 'LINK_MAX_USES',
  'jeton-fil-clos': 'CONVERSATION_CLOSED',
};

/** La chaîne du § P0 : un lien de contenu clos, que la porte d'aperçu ignore. */
const TRACKING_FERME: Readonly<Record<string, string | null>> = {
  'jeton-story-expire': new Date(Date.now() - 86_400_000).toISOString(),
  'jeton-story-ferme': null,
};

const INCONNUS = ['jeton-inconnu'];

const COMMANDE = 'bunx playwright test e2e/visual/v3-lien-expire.spec.ts';

const CLE_DU_THEME = 'meeshy-theme';

const COLONNES = [
  { nom: 'system-light', schema: 'light', stockage: `localStorage.clear()`, attendue: 'light' },
  { nom: 'system-dark', schema: 'dark', stockage: `localStorage.clear()`, attendue: 'dark' },
  {
    nom: 'explicit-light-on-dark',
    schema: 'dark',
    stockage: `localStorage.setItem('${CLE_DU_THEME}','light')`,
    attendue: 'light',
  },
  {
    nom: 'explicit-dark-on-light',
    schema: 'light',
    stockage: `localStorage.setItem('${CLE_DU_THEME}','dark')`,
    attendue: 'dark',
  },
] as const;

/** `getComputedStyle` rend `rgb(r, g, b)` ; `couleur.mjs` prend du `#rrggbb`. */
const hex = (rgb: string): string => {
  const canaux = (rgb.match(/\d+/g) ?? []).slice(0, 3).map(Number);
  return `#${canaux.map((canal) => canal.toString(16).padStart(2, '0')).join('')}`;
};

const budgets = JSON.parse(readFileSync(join(RACINE_V3, 'budgets.json'), 'utf8'));

/** Le plancher MESURÉ, lu là où les mesures vivent — jamais recopié dans un test. */
const plancherDeRequetes = (): number =>
  (
    JSON.parse(readFileSync(join(RACINE_V3, 'budgets-mesures.json'), 'utf8')) as {
      readonly plancher_next_requetes?: { readonly valeur?: number };
    }
  ).plancher_next_requetes?.valeur ?? 0;

/** Le PLAFOND que le § 8.3 pose sur cet écran, lu là où les plafonds vivent. */
const gateDeRequetes = (): number =>
  budgets.reseau.ecrans.find((ecran: { readonly motifs: readonly string[] }) =>
    ecran.motifs.includes('/l/*/expired'),
  ).plafonds.requetes_avant_premier_pixel.valeur;

const manifeste = (): Readonly<Record<string, readonly string[]>> =>
  (
    JSON.parse(readFileSync(join(RACINE_V3, '.next', 'app-build-manifest.json'), 'utf8')) as {
      readonly pages: Readonly<Record<string, readonly string[]>>;
    }
  ).pages;

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const ecranDe = (jeton: string): string => `${v3.base}/l/${jeton}/expired`;

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon({
    refusParJeton: REFUS,
    trackingFermeParJeton: TRACKING_FERME,
    inconnus: INCONNUS,
  });
  v3 = await serveurDeLaV3(passerelle.base);
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

test.describe('linkExpired — un lien fermé dit pourquoi', () => {
  test('un lien clos mène ici en un saut, depuis la redirection', async ({ page }) => {
    const reponse = await page.goto(`${v3.base}/l/jeton-expire`, { waitUntil: 'commit' });
    const origine = reponse?.request().redirectedFrom();

    expect((await origine?.response())?.status()).toBe(302);
    expect(page.url()).toBe(ecranDe('jeton-expire'));
    await expect(page.locator('h1')).toContainText('expiré');
  });

  test('les quatre refus rendent quatre raisons DISTINCTES', async ({ page }) => {
    const raisons: string[] = [];

    for (const jeton of Object.keys(REFUS)) {
      await page.goto(ecranDe(jeton));
      raisons.push(
        `${await page.locator('h1').innerText()}|${await page.locator('dl dd').nth(1).innerText()}`,
      );
    }

    expect(new Set(raisons).size).toBe(4);
    expect(raisons.every((raison) => raison.trim() !== '|')).toBe(true);
  });

  test('un jeton que la passerelle ne nomme pas n’invente aucune cause', async ({ page }) => {
    await page.goto(ecranDe('jeton-inconnu'));

    await expect(page.locator('p.corps')).toContainText('peut-être');
    await expect(page.locator('dl dd').nth(1)).toHaveText('Indéterminé');
  });

  /**
   * LA CHAÎNE DU § P0, celle qu'aucun bouchon « des deux côtés » ne produit.
   *
   * Un lien de story clos : `resolve` le dit `isActive:false`, la porte d'aperçu
   * rend 404 parce qu'elle ne connaît pas son modèle. Tant que la cause
   * descendait de l'aperçu seul, cet écran servait « Indéterminé » — la page qui
   * ne dit rien — à tout le contenu que le rôle premier nomme.
   */
  test('nomme la cause d’un lien de CONTENU, que la porte d’aperçu ignore', async ({ page }) => {
    await page.goto(ecranDe('jeton-story-expire'));
    await expect(page.locator('dl dd').nth(1)).toHaveText('Expiré');

    await page.goto(ecranDe('jeton-story-ferme'));
    await expect(page.locator('dl dd').nth(1)).toHaveText('Fermé par son auteur');
  });

  /**
   * LA LOI 4, MESURÉE PAR SON EFFET : « cliquer change-t-il quelque chose ? »
   *
   * La suite secondaire d'un lien jugé CLOS ne peut pas être `/l/:token` — la
   * porte d'où l'on vient, qui redirige ici. Le témoin ne lit pas un `href` : il
   * SUIT le geste et exige un autre écran. Un `mailto:` n'est pas navigable
   * depuis un navigateur de test, donc c'est son schéma qui est vérifié — ce qui
   * suffit à établir qu'il ne boucle pas.
   */
  test('la suite d’un lien clos ne ramène jamais sur cet écran', async ({ page }) => {
    for (const jeton of ['jeton-expire', 'jeton-story-expire', 'jeton-inconnu']) {
      await page.goto(ecranDe(jeton));
      const href = await page.locator('nav a.secondaire').getAttribute('href');

      expect(href).not.toBe(`/l/${jeton}`);
      expect(href?.startsWith('mailto:') === true || href === '/').toBe(true);
    }
  });

  test('ne rend rien de la conversation derrière le lien', async ({ page }) => {
    await page.goto(ecranDe('jeton-expire'));
    const html = await page.content();

    expect(html).not.toContain(NOM_DU_LIEN);
    expect(html).not.toContain(CREATEUR_DU_LIEN);
  });

  test('les deux CTA sont câblés et atteignables au clavier', async ({ page }) => {
    await page.goto(ecranDe('jeton-expire'));

    const suites = page.locator('nav a');
    await expect(suites).toHaveCount(2);
    for (const href of await suites.evaluateAll((liens) =>
      liens.map((lien) => lien.getAttribute('href') ?? ''),
    )) {
      expect(href).not.toBe('');
      expect(href).not.toBe('#');
    }

    // La tabulation part du document : le premier arrêt est le retour de
    // l'en-tête, puis les deux suites, DANS L'ORDRE où l'écran les propose.
    const arrets: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Tab');
      arrets.push(
        await page.evaluate(() => {
          const actif = document.activeElement;
          return actif === null ? '' : `${actif.tagName}:${actif.className}`.trim();
        }),
      );
    }

    expect(arrets).toEqual(['A:retour', 'A:cta principal', 'A:cta secondaire']);
  });

  test('activer une suite au CLAVIER mène bien à son adresse', async ({ page }) => {
    await page.goto(ecranDe('jeton-expire'));

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');

    await page.waitForURL(/\/login\?next=/);
    expect(page.url()).toContain('next=%2Fl%2Fjeton-expire');
  });

  /**
   * LE GATE DE REQUÊTES, TENU PAR LA NATURE DE LA ROUTE.
   *
   * Le critère de fin demande deux requêtes avant le premier pixel et aucun
   * composant client. Une PAGE d'App Router ne peut tenir ni l'un ni l'autre :
   * Next pose quatre chunks de runtime dans le `<head>` de toute page rendue,
   * même sans une ligne de `'use client'`. Cet écran est donc un GESTIONNAIRE de
   * route, comme son jumeau `/l/:token`.
   *
   * Le manifeste porte la preuve dans les deux sens : il n'existe AUCUNE entrée
   * de page pour cet écran, et l'entrée du gestionnaire liste les mêmes quatre
   * chunks framework que `/healthz/route` — un Route Handler pur qui répond en
   * JSON et n'en sert évidemment aucun. Ces listes sont de la comptabilité
   * interne de Next, jamais ce qui part sur le fil : ce qui part est mesuré au
   * navigateur par le test réseau plus bas.
   */
  test('est un gestionnaire de route, pas une page — la seule forme qui tienne le gate', () => {
    const pages = manifeste();

    expect(pages['/(public)/l/[token]/expired/page']).toBeUndefined();
    expect(pages['/(public)/l/[token]/expired/route']).toBeDefined();
    expect(pages['/(public)/l/[token]/route']).toBeDefined();
  });

  test('ne sert aucun script hors le moteur de thème, ni aucune feuille externe', async ({
    page,
  }) => {
    await page.goto(ecranDe('jeton-expire'));
    const html = await page.content();

    expect(html).not.toContain('/_next/static/chunks/');
    expect(html).not.toContain('rel="stylesheet"');
    expect((html.match(/<script/g) ?? []).length).toBe(1);
  });

  /**
   * LES QUATRE COLONNES DE THÈME (§ 9.6), sur cet écran.
   *
   * Deux d'entre elles ne sont pas des variantes de confort : `light` explicite
   * sur OS `dark` et son symétrique sont les SEULES qui attrapent la jumelle
   * media/classe — une table de jetons qui basculerait sur
   * `prefers-color-scheme` pendant que la classe dit l'inverse. Les colonnes
   * « système » ne peuvent pas la voir : les deux moteurs y disent la même
   * chose.
   *
   * Ce qui est mesuré n'est pas un score de pixels — le harnais de diff par
   * région (`v3-visual.spec.ts`, § 9.2) n'est pas encore livré, et
   * `pixelmatch` n'est pas installé. C'est ce que le score CHERCHE : la couleur
   * SERVIE change avec la classe et pas avec l'OS, le texte reste lisible
   * (WCAG AA, 4,5:1) et le CONTOUR de chaque contrôle sans fond tient les 3:1 de
   * WCAG 1.4.11 — dans les quatre colonnes. Ce dernier ne pouvait tomber nulle
   * part ailleurs : `axe` n'active aucune règle de contraste non textuel en
   * serious/critical, le gate de jetons mesure la valeur d'un jeton et non celui
   * qu'un écran choisit, et le mode CLAIR — le pire des deux pour cette faute —
   * n'apparaît dans aucune capture prise en sombre. Le calcul de contraste vient du
   * site unique `scripts/lib/couleur.mjs` ; le réécrire ici en ferait la jumelle
   * que ce module existe pour empêcher.
   */
  test('sert la bonne table dans les quatre colonnes de thème, et reste lisible', async ({
    browser,
  }, info) => {
    const { contraste } = (await import(
      pathToFileURL(join(RACINE_V3, 'scripts', 'lib', 'couleur.mjs')).href
    )) as { readonly contraste: (a: string, b: string) => number };

    const fonds: string[] = [];

    for (const colonne of COLONNES) {
      const contexte = await browser.newContext({ colorScheme: colonne.schema });
      await contexte.addInitScript(`try{${colonne.stockage}}catch(e){}`);
      const page = await contexte.newPage();
      await page.goto(ecranDe('jeton-expire'));

      const lu = await page.evaluate(() => {
        const de = (selecteur: string, propriete: 'color' | 'backgroundColor'): string => {
          const noeud = document.querySelector(selecteur);
          return noeud === null ? '' : getComputedStyle(noeud)[propriete];
        };
        return {
          classe: document.documentElement.className,
          fond: de('body', 'backgroundColor'),
          titre: de('h1', 'color'),
          corps: de('p.corps', 'color'),
          suite: de('.cta.principal', 'color'),
          fondDeLaSuite: de('.cta.principal', 'backgroundColor'),
        };
      });

      const contours = await contoursDeControle(page);

      info.annotations.push({
        type: colonne.nom,
        description: `${JSON.stringify(lu)} contours=${JSON.stringify(contours)}`,
      });
      fonds.push(hex(lu.fond));

      expect(lu.classe, colonne.nom).toBe(colonne.attendue);
      expect(contraste(hex(lu.titre), hex(lu.fond)), colonne.nom).toBeGreaterThanOrEqual(4.5);
      expect(contraste(hex(lu.corps), hex(lu.fond)), colonne.nom).toBeGreaterThanOrEqual(4.5);
      expect(
        contraste(hex(lu.suite), hex(lu.fondDeLaSuite)),
        colonne.nom,
      ).toBeGreaterThanOrEqual(4.5);

      // WCAG 1.4.11 — la LIMITE d'un contrôle porte l'information « il y a un
      // contrôle ici », que ce soit son fond ou son trait qui la dessine.
      // L'écran en dessine au moins un ; zéro mesure serait un test vert qui n'a
      // rien regardé.
      expect(contours.length, colonne.nom).toBeGreaterThan(0);
      for (const contour of contours) {
        expect(
          contrasteDeLaLimite(contour, contraste, hex),
          `${colonne.nom} — ${contour.repere}`,
        ).toBeGreaterThanOrEqual(3);
      }

      await contexte.close();
    }

    // La classe GOUVERNE : les deux colonnes qui rendent `light` servent le même
    // fond, quel que soit l'OS — et il diffère de celui des deux `dark`.
    expect(new Set(fonds).size).toBe(2);
  });

  /**
   * LA MESURE, ET CE QU'ELLE NE DÉCLARE PLUS.
   *
   * Le § 8.3 gate cet écran à DEUX requêtes avant le premier pixel, « HTML +
   * CSS ». Il en a un temps servi SIX : le document, la feuille de la coquille,
   * et les quatre chunks du runtime qu'App Router pose dans le `<head>` de toute
   * PAGE rendue — y compris une page sans un seul composant client. Le
   * franchissement était alors déclaré en question ouverte, renvoyé à un
   * arbitrage d'architecture.
   *
   * Il n'y en avait pas à faire ICI : un gestionnaire de route compose son
   * document à la main et n'entre dans aucun de ces chunks. L'écran en est un
   * depuis, et il sert son document SEUL — les jetons et le glyphe sont inlinés
   * (§ `document.ts`), donc même la feuille disparaît. Ce test ne tolère donc
   * plus aucun franchissement de GATE, et il enregistre le chiffre mesuré dans
   * `budgets-mesures.json`.
   *
   * Le plancher d'App Router, lui, reste MESURÉ et la question ouverte n° 12
   * reste ouverte — pour la lecture partagée (`/stories/:id` …), qui a besoin
   * d'une page.
   */
  test('tient tous les plafonds réseau de budgets.json', async ({ browser }, info) => {
    const { mesurePage, franchissementsReseau } = await chargeMesureReseau();
    const mesure = await mesurePage({
      url: ecranDe('jeton-expire'),
      commande: COMMANDE,
      navigateur: browser,
      profil: budgets.reseau.profil,
    });

    info.annotations.push({
      type: '/l/:token/expired',
      description: `${mesure.requetes_avant_premier_pixel} requête(s) avant le premier pixel, FCP ${mesure.fcp_ms} ms, LCP ${mesure.lcp_ms} ms, CLS ${mesure.cls}, ${JSON.stringify(mesure.octets_par_type)}`,
    });

    expect(mesure.http).toBe(200);
    expect(mesure.requetes_avant_premier_pixel).toBeLessThanOrEqual(gateDeRequetes());
    expect(mesure.requetes_avant_premier_pixel).toBeLessThan(plancherDeRequetes());
    expect(
      franchissementsReseau(mesure, budgets.reseau)
        .filter((f) => f.statut === 'GATE')
        .map((f) => f.mesure),
    ).toEqual([]);
  });
});
