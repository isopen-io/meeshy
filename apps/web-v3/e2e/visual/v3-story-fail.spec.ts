import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { ciblesMesurees, ciblesTropPetites, hauteursDe } from './lib/cibles';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { passerelleDeBouchon, RACINE_V3, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';
import { COLONNES_DE_THEME, rapporteViolations, violationsBloquantes } from './lib/verdict-axe';

/**
 * `storyFail` — le critère de fin de l'issue #4967, sur un vrai navigateur.
 *
 * `__tests__/story-fail.test.ts` juge le document servi et la porte, sans
 * jamais démarrer un serveur. Ce fichier juge ce que la CHAÎNE réelle en fait :
 * les EN-TÊTES bruts d'une réponse (que `next start` ajoute lui-même —
 * `date`, `etag`, `content-length`, `x-powered-by` — et que ce spec doit donc
 * IGNORER dans la comparaison, sans quoi l'oracle serait faux pour la
 * mauvaise raison), le nombre d'appels réellement partis vers la passerelle
 * (assertion réseau, pas seulement une assertion sur le texte), et le rendu
 * mesuré au navigateur (cibles, axe, réseau, captures).
 *
 * BOUCHON COPIÉ : `e2e/visual/lib/bouchon-story.ts`, dont le doc-comment cite
 * `services/gateway/src/routes/posts/core.ts:459-485` et
 * `services/PostService.ts:686-745` — la MÊME route que `chargeDeLaStory`
 * (`lib/api/publication.ts`) attaque.
 *
 * COMMENT ON LE LANCE :
 *   cd apps/web-v3 && bun run build
 *   bun run e2e -- e2e/visual/v3-story-fail.spec.ts
 */

const DOSSIER_DES_RENDUS = process.env.RENDUS_DIR ?? join(RACINE_V3, 'test-results', 'rendus');

const CAUSES = ['absente', 'supprimee', 'echue', 'restreinte'] as const;
const PORTES: readonly { readonly base: string; readonly vivante: string }[] = [
  { base: '/stories', vivante: 'story-vivante' },
  { base: '/moods', vivante: 'story-vivante' },
  { base: '/reels', vivante: 'story-vivante' },
];

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

test.beforeEach(() => {
  passerelle.oublie();
});

const contexteMembre = async (navigateur: Browser, options: { readonly javaScriptEnabled?: boolean } = {}): Promise<BrowserContext> => {
  const ctx = await navigateur.newContext({
    colorScheme: 'light',
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: options.javaScriptEnabled ?? true,
  });
  await ctx.addCookies([
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
  ]);
  return ctx;
};

const contexteVisiteur = async (navigateur: Browser): Promise<BrowserContext> =>
  navigateur.newContext({ colorScheme: 'light', viewport: { width: 390, height: 844 } });

// Les en-têtes que `next start` ajoute lui-même, différents à chaque réponse
// ou sans rapport avec le REFUS que l'oracle compare (leçon : un oracle qui
// s'oppose sur `date` serait faux pour la mauvaise raison).
const IGNORES = new Set(['date', 'etag', 'content-length', 'x-powered-by', 'keep-alive', 'connection']);

const entetesComparables = (entetes: Readonly<Record<string, string>>): string =>
  JSON.stringify(
    Object.entries(entetes)
      .filter(([nom]) => !IGNORES.has(nom.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b)),
  );

test.describe('l’oracle du membre — quatre causes, trois portes', () => {
  test('les quatre causes rendent le même document, sur les trois portes', async ({ browser }) => {
    const ctx = await contexteMembre(browser);

    for (const porte of PORTES) {
      const reponses = await Promise.all(
        CAUSES.map((cause) => ctx.request.get(`${v3.base}${porte.base}/${cause}`)),
      );

      reponses.forEach((reponse) => expect(reponse.status()).toBe(404));

      const entetes = reponses.map((reponse) => entetesComparables(reponse.headers()));
      entetes.forEach((valeur) => expect(valeur).toBe(entetes[0]));

      const corps = await Promise.all(reponses.map((reponse) => reponse.text()));
      expect(new Set(corps).size).toBe(1);
    }

    // UN appel de post par requête, rien de plus — aucun `/view`, aucun second aller-retour.
    const appelsDePost = passerelle.journal.filter((appel) => appel.chemin.startsWith('/api/v1/posts/'));
    expect(appelsDePost).toHaveLength(CAUSES.length * PORTES.length);
    expect(appelsDePost.every((appel) => appel.methode === 'GET')).toBe(true);

    await ctx.close();
  });

  test('la story vivante se lit, elle — la garde de vacuité de l’oracle', async ({ browser }) => {
    const ctx = await contexteMembre(browser);
    const page = await ctx.newPage();

    await page.goto(`${v3.base}/stories/story-vivante`);
    await expect(page.locator('.story-tete .nom')).toHaveText('Amina');
    await expect(page.locator('.texte')).toContainText('Une story de test, servie par le bouchon.');

    await ctx.close();
  });
});

test.describe('le visiteur sans session', () => {
  test('voit la même invitation, que la story existe ou non — et rien ne part', async ({ browser }) => {
    const ctx = await contexteVisiteur(browser);
    const cibles = [...CAUSES, 'story-vivante'];

    const resultats = await Promise.all(
      cibles.map(async (cible) => {
        const page = await ctx.newPage();
        await page.goto(`${v3.base}/stories/${cible}`);
        const titre = await page.locator('h1').textContent();
        const seConnecter = await page.getByRole('link', { name: 'Se connecter' }).getAttribute('href');
        await page.close();
        return { cible, titre, seConnecter };
      }),
    );

    // LE TITRE — et tout le reste hors `returnUrl` — ne dépend PAS de la
    // cause : la v3 n'a rien demandé, elle ne peut donc rien distinguer.
    resultats.forEach((resultat) => expect(resultat.titre).toBe(resultats[0]?.titre));
    // `returnUrl` porte fidèlement l'ADRESSE DEMANDÉE, propre à chaque cible —
    // c'est ce qui la fait REVENIR au bon endroit après connexion, pas une
    // fuite de la cause.
    resultats.forEach((resultat) =>
      expect(resultat.seConnecter).toBe(`/login?returnUrl=${encodeURIComponent(`/stories/${resultat.cible}`)}`),
    );

    // AUCUN appel vers la passerelle, quelle que soit la cause.
    expect(passerelle.journal.filter((appel) => appel.chemin.startsWith('/api/v1/posts/'))).toEqual([]);

    await ctx.close();
  });
});

test.describe('axe et cibles', () => {
  COLONNES_DE_THEME.forEach((theme) => {
    test(`0 violation axe serious/critical — /stories/echue (${theme.id})`, async ({ browser }) => {
      const ctx = await browser.newContext({
        colorScheme: theme.colorScheme,
        viewport: { width: 390, height: 844 },
      });
      await ctx.addCookies([
        { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
        { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
      ]);
      if (theme.stockage !== null) {
        await ctx.addInitScript(
          ([cle, valeur]) => {
            try {
              window.localStorage.setItem(cle, valeur);
            } catch {
              /* le script anti-flash retombe sur la préférence système */
            }
          },
          [THEME_STORAGE_KEY, theme.stockage] as const,
        );
      }
      const page = await ctx.newPage();

      await page.goto(`${v3.base}/stories/echue`);
      await expect(page.locator('h1')).toHaveText('Story indisponible');
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));

      const { violations } = await new AxeBuilder({ page }).analyze();
      const bloquantes = violationsBloquantes(violations);
      expect(bloquantes, rapporteViolations(`/stories/echue (${theme.id})`, bloquantes)).toEqual([]);

      await ctx.close();
    });
  });

  test('aucune cible sous 44 px, et les deux actions tiennent leur hauteur', async ({ browser }) => {
    const ctx = await contexteMembre(browser);
    const page = await ctx.newPage();

    await page.goto(`${v3.base}/stories/echue`);
    await expect(page.locator('h1')).toBeVisible();

    expect(ciblesTropPetites(await ciblesMesurees(page))).toEqual([]);
    const primaires = await hauteursDe(page, '.action.primaire');
    const secondaires = await hauteursDe(page, '.action.contour');
    expect(Math.min(...primaires)).toBeGreaterThanOrEqual(56);
    expect(Math.min(...secondaires)).toBeGreaterThanOrEqual(52);

    await ctx.close();
  });
});

test.describe('sans JavaScript', () => {
  test('les deux actions mènent à une route SERVIE', async ({ browser }) => {
    const ctx = await contexteMembre(browser, { javaScriptEnabled: false });
    const page = await ctx.newPage();

    await page.goto(`${v3.base}/stories/echue`);

    await page.getByRole('link', { name: 'Retour au fil' }).click();
    await expect(page).toHaveURL(`${v3.base}/feed`);
    expect((await page.request.get(`${v3.base}/feed`)).status()).toBeLessThan(400);

    await page.goto(`${v3.base}/stories/echue`);
    await page.getByRole('link', { name: 'Créer une story' }).click();
    await expect(page).toHaveURL(`${v3.base}/stories/new`);

    await ctx.close();
  });
});

test.describe('écran serveur', () => {
  test('aucun chunk de page pour /stories/:id, /moods/:id, /reels/:id', () => {
    const manifeste = JSON.parse(
      readFileSync(join(RACINE_V3, '.next', 'app-build-manifest.json'), 'utf8'),
    ) as { readonly pages: Readonly<Record<string, readonly string[]>> };

    const cles = Object.keys(manifeste.pages);
    expect(cles.filter((cle) => /\/stories\/\[id\]\/page|\/moods\/\[id\]\/page|\/reels\/\[id\]\/page/.test(cle))).toEqual([]);
  });

  test('ne charge AUCUNE ressource /_next/static à cette adresse', async ({ browser }) => {
    const ctx = await contexteMembre(browser);
    const page = await ctx.newPage();
    const requetes: string[] = [];
    page.on('request', (requete) => requetes.push(requete.url()));

    await page.goto(`${v3.base}/stories/echue`);
    await expect(page.locator('h1')).toBeVisible();

    expect(requetes.filter((url) => url.includes('/_next/static'))).toEqual([]);

    await ctx.close();
  });
});

test.describe('réseau', () => {
  /**
   * `mesurePage` (`scripts/mesure-reseau.mjs` › `composeMesure`) REFUSE, par
   * construction, de chiffrer une page dont le statut n'est pas 2xx/3xx — « un
   * chiffre pris sur une page d'erreur est pire qu'un "à établir" »
   * (`estCodeDeMesure`) : l'indisponible est un 404 délibéré, le témoin ne
   * peut donc PAS emprunter l'outil de mesure des écrans nominaux. Ce que le
   * critère demande — « une seule requête avant le premier pixel » — se
   * vérifie ici directement : le document est AUTOPORTEUR (jetons, feuille et
   * glyphes inlinés, favicon en `data:` — § teteDuDocument), donc rien
   * d'autre que le document lui-même ne devrait partir.
   */
  test('tient le plafond de requêtes du groupe (public)', async ({ browser }, info) => {
    const budgets = JSON.parse(readFileSync(join(RACINE_V3, 'budgets.json'), 'utf8')) as {
      readonly reseau: {
        readonly ecrans: readonly { readonly motifs: readonly string[]; readonly plafonds: { readonly requetes_avant_premier_pixel: { readonly valeur: number } } }[];
      };
    };
    const gate = budgets.reseau.ecrans.find((ecran) => ecran.motifs.includes('/stories/*'))?.plafonds
      .requetes_avant_premier_pixel.valeur;
    expect(gate).toBeDefined();

    const ctx = await contexteMembre(browser);
    const page = await ctx.newPage();
    const requetes: string[] = [];
    page.on('request', (requete) => requetes.push(requete.url()));

    const reponse = await page.goto(`${v3.base}/stories/echue`, { waitUntil: 'load' });

    info.annotations.push({
      type: '/stories/:id (indisponible)',
      description: `${requetes.length} requête(s) avant le premier pixel`,
    });

    expect(reponse?.status()).toBe(404);
    expect(requetes.length).toBeLessThanOrEqual(gate as number);

    await ctx.close();
  });
});

test.describe('captures', () => {
  ['light', 'dark'].forEach((schema) => {
    test(`capture ${schema}`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: schema as 'light' | 'dark', viewport: { width: 390, height: 844 } });
      await ctx.addCookies([
        { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
        { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
      ]);
      const page = await ctx.newPage();

      await page.goto(`${v3.base}/stories/echue`);
      await expect(page.locator('h1')).toBeVisible();

      mkdirSync(DOSSIER_DES_RENDUS, { recursive: true });
      await page.screenshot({ path: join(DOSSIER_DES_RENDUS, `storyFail-${schema}.png`) });

      await ctx.close();
    });
  });
});
