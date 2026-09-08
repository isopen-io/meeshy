// GATE — le MODULE DE LECTURE de `/feed/reels` (#5388) : la file verticale
// joue, une seule vidéo décodée à la fois, et RIEN n'est retenu au changement
// d'écran.
//
// `__tests__/reels-lecture.test.ts` garde la DÉCISION pure (molette, toucher,
// clavier, autolecture, retour arrière) ; `__tests__/reels-du-fil.test.ts` et
// `__tests__/reels-porte.test.ts` gardent l'ARMEMENT du document. Ce fichier
// juge ce qu'un VRAI navigateur en fait — le geste, le décodeur, le repli.
//
// LE MP4 DU BOUCHON NE SE CHARGE PAS (`cdn.meeshy.test`) : on n'affirme donc
// JAMAIS `readyState > 0` ici — `v3-reels-du-fil.spec.ts` le fait déjà sur le
// document SANS module armé. Ce qui se mesure ici, c'est ce que le MODULE FAIT
// une fois armé : les attributs qu'il pose, le nombre de `<video>` qui
// survivent à la traversée, et le repli sans JavaScript.

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { violationsBloquantes, rapporteViolations } from './lib/a11y';
import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { passerelleDeBouchon, serveurDeLaV3, type PasserelleDeBouchon, type ServeurV3 } from './lib/serveurs';
import { COLONNES_DE_THEME } from './lib/verdict-axe';

// `/feed` DOIT être navigable : c'est par lui que /feed/reels s'atteint dans
// le parcours réel (`estNavigable('/feed/reels', ['/feed'])` couvre l'arbre).
const NAVIGABLE_DU_TEST = '/chats,/chat/,/feed';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon();
  v3 = await serveurDeLaV3(passerelle.base, { V3_NAVIGABLE: NAVIGABLE_DU_TEST });
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

const contexte = async (
  navigateur: Browser,
  options: {
    readonly reduiteMotion?: boolean;
    readonly javaScriptEnabled?: boolean;
    readonly schema?: 'light' | 'dark';
    readonly stockage?: 'light' | 'dark' | null;
  } = {},
): Promise<BrowserContext> => {
  const ctx = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: options.schema ?? 'light',
    reducedMotion: options.reduiteMotion === true ? 'reduce' : 'no-preference',
    javaScriptEnabled: options.javaScriptEnabled ?? true,
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
 * LE MODULE EST ARMÉ — attendu par SON EFFET, jamais par une minuterie : dès
 * qu'il tourne, l'autolecture demandée pose `muted`/`loop`/`playsInline` sur la
 * vidéo courante (la source ne charge pas, mais les ATTRIBUTS, eux, sont posés
 * avant même que `play()` ne rejette).
 */
const attendLeModuleArme = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => document.querySelector('video')?.muted === true);
};

const compteDesVideos = (page: Page): Promise<number> => page.locator('video').count();

test('le geste avance la file — clavier puis molette, jusqu’au bout, sans erreur', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/feed/reels`, { waitUntil: 'load' });
  await attendLeModuleArme(page);
  await expect(page.locator('.story-tete .nom')).toHaveText('Marta Ruiz');

  // NAVIGATION DOUCE : la sentinelle du navigateur de zone est posée dès son
  // chargeur exécuté — sa présence prouve que le pas qui suit passera par lui.
  await page.waitForFunction(() => (window as Window & { __zoneNavigateur?: number }).__zoneNavigateur !== undefined);

  await page.keyboard.press('ArrowDown');
  await expect(page).toHaveURL(/\/feed\/reels\?cursor=/);
  await attendLeModuleArme(page);
  await expect(page.locator('.story-tete .nom')).toHaveText('Ibrahim');
  expect(await compteDesVideos(page)).toBe(1);

  const urlAuBout = page.url();
  // FIN DE FILE : `hasMore=false` — le tap n'existe plus, donc la molette ne
  // mène nulle part. L'ABSENCE d'effet est le comportement attendu (charte
  // règle 7), pas une erreur.
  const erreurs: string[] = [];
  page.on('pageerror', (erreur) => erreurs.push(String(erreur)));

  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(200);

  expect(page.url()).toBe(urlAuBout);
  expect(erreurs).toEqual([]);

  await ctx.close();
});

test('une seule vidéo décodée, et RIEN n’est retenu au changement d’écran', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/feed/reels`, { waitUntil: 'load' });
  await attendLeModuleArme(page);
  expect(await compteDesVideos(page)).toBe(1);

  await page.getByRole('link', { name: 'Réel suivant' }).click();
  await attendLeModuleArme(page);
  expect(await compteDesVideos(page)).toBe(1);

  // LA SORTIE : la vidéo est relâchée AVANT que le `<main>` ne parte —
  // 0 `<video>` dans le document une fois sur `/feed`.
  await page.getByRole('link', { name: 'Fermer' }).click();
  await expect(page).toHaveURL(`${v3.base}/feed`);
  expect(await compteDesVideos(page)).toBe(0);

  await ctx.close();
});

test('dix allers-retours /feed ⇄ /feed/reels, SANS rechargement : le compte de <video> ne croît jamais', async ({
  browser,
}) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/feed`, { waitUntil: 'load' });
  // SOUS NAVIGATION DOUCE, PAS DE RECHARGEMENT : un socket, un écouteur qui
  // fuirait à chaque traversée grossirait ici, jamais sur un `page.goto`
  // répété (`v3-fil-retention.spec.ts:115`, même patron).
  await page.waitForFunction(() => (window as Window & { __zoneNavigateur?: number }).__zoneNavigateur !== undefined);

  for (let tour = 0; tour < 10; tour += 1) {
    await page.getByRole('link', { name: 'Réels' }).click();
    await expect(page).toHaveURL(`${v3.base}/feed/reels`);
    await attendLeModuleArme(page);
    expect(await compteDesVideos(page)).toBe(1);

    await page.getByRole('link', { name: 'Fermer' }).click();
    await expect(page).toHaveURL(`${v3.base}/feed`);
    expect(await compteDesVideos(page)).toBe(0);
  }

  await ctx.close();
});

/**
 * LA PREMIÈRE TRAVERSÉE DOUCE — la seule fenêtre où le navigateur de zone
 * `import()` le module (son auto-démarrage court) PUIS appelle `monte()` sur le
 * MÊME `<main>` (`navigateur.ts:monteLeModule`). Sans `unSeulMontageParEcran`
 * (`lifecycle.ts`, le site unique), deux jeux d'écouteurs vivent côte à côte et
 * une seule flèche fait DEUX pas de file.
 *
 * CE QUI SE MESURE ICI EST LA REQUÊTE, PAS L'ADRESSE — et la nuance a coûté un
 * témoin. Le second pas est ÉCRASÉ par le premier (`generation`,
 * `navigateur.ts`) : l'URL finale est la même avec le défaut et sans lui, si
 * bien qu'un témoin d'adresse reste vert des DEUX côtés du diff. Ce qui NE se
 * rattrape pas, c'est le document déjà parti sur le réseau : deux `fetch` du
 * même écran pour un seul geste — le prix exact que la 3G rurale paie
 * (§ 12.6). Le compte de requêtes est donc le seul signal que le navigateur
 * rend, et il tombe quand la garde saute (vérifié en la retirant).
 */
test('une seule flèche = une seule requête de document — le module n’est monté qu’une fois', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/feed`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window as Window & { __zoneNavigateur?: number }).__zoneNavigateur !== undefined);

  // PREMIÈRE traversée douce vers `/feed/reels` : c'est la seule qui ouvre la
  // fenêtre du double montage (ensuite le module est déjà évalué).
  await page.getByRole('link', { name: 'Réels' }).click();
  await expect(page).toHaveURL(`${v3.base}/feed/reels`);
  await attendLeModuleArme(page);

  const documentsDemandes: string[] = [];
  page.on('request', (requete) => {
    if (requete.resourceType() === 'fetch' && requete.url().includes('/feed/reels?cursor=')) {
      documentsDemandes.push(requete.url());
    }
  });

  await page.keyboard.press('ArrowDown');
  await expect(page).toHaveURL(/\/feed\/reels\?cursor=/);
  await attendLeModuleArme(page);
  await page.waitForTimeout(200);

  expect(documentsDemandes).toHaveLength(1);

  // ET LA PILE SE DÉPILE : le retour rend la TÊTE, puis une flèche haut de
  // plus n'a plus rien à remonter — un geste de lecture ne quitte pas la
  // lecture pour l'écran d'où l'on venait.
  await page.keyboard.press('ArrowUp');
  await expect(page).toHaveURL(`${v3.base}/feed/reels`);

  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(`${v3.base}/feed/reels`);

  await ctx.close();
});

test('l’autolecture est demandée MUETTE, et se refuse sous prefers-reduced-motion', async ({ browser }) => {
  const normal = await contexte(browser);
  const pageNormale = await normal.newPage();
  await pageNormale.goto(`${v3.base}/feed/reels`, { waitUntil: 'load' });
  await attendLeModuleArme(pageNormale);

  const attributs = await pageNormale.evaluate(() => {
    const video = document.querySelector('video');
    return video === null ? null : { muted: video.muted, loop: video.loop, playsInline: video.playsInline };
  });
  expect(attributs).toEqual({ muted: true, loop: true, playsInline: true });
  await normal.close();

  const reduite = await contexte(browser, { reduiteMotion: true });
  const pageReduite = await reduite.newPage();
  await pageReduite.goto(`${v3.base}/feed/reels`, { waitUntil: 'load' });
  // Le module s'exécute quand même (le chargeur ne dépend pas du geste) —
  // laissé le temps de tourner, sans jamais poser `muted` : l'attente positive
  // de l'AUTRE test n'a pas d'équivalent ici, donc un délai fixe est la seule
  // preuve disponible d'une ABSENCE.
  await pageReduite.waitForTimeout(600);
  const sousReduction = await pageReduite.evaluate(() => {
    const video = document.querySelector('video');
    return video === null ? null : { muted: video.muted, paused: video.paused };
  });
  expect(sousReduction?.muted).toBe(false);
  expect(sousReduction?.paused).toBe(true);
  await reduite.close();
});

test('le repli est la règle : sans JavaScript, la file se parcourt page par page', async ({ browser }) => {
  const ctx = await contexte(browser, { javaScriptEnabled: false });
  const page = await ctx.newPage();

  await page.goto(`${v3.base}/feed/reels`, { waitUntil: 'load' });
  await expect(page.locator('.story-tete .nom')).toHaveText('Marta Ruiz');
  expect(await compteDesVideos(page)).toBe(1);

  await page.getByRole('link', { name: 'Réel suivant' }).click();
  await expect(page).toHaveURL(/\/feed\/reels\?cursor=/);
  await expect(page.locator('.story-tete .nom')).toHaveText('Ibrahim');

  await ctx.close();
});

/**
 * LE BUDGET DE LA SURFACE NEUVE — et il MANQUAIT (défaut de revue #5388).
 *
 * `/feed/reels` vient d'entrer dans la famille des écrans qui EXPÉDIENT du
 * JavaScript. Son PLAFOND existait déjà (`budgets.json › reseau.ecrans`,
 * motif `/feed/*`) ; ce qui manquait était la MESURE qui l'oppose à la route
 * — aucun spec n'exerçait ce budget ici, et le chargeur différé n'était donc
 * gardé sur cet écran par rien. Le chargeur est PARTAGÉ
 * (`CHARGEUR_DE_PARTICIPATION`), donc l'ordre est le même « par
 * construction » — et « par construction » est exactement ce qu'un témoin
 * existe pour vérifier. Mesuré sous le profil du § 8.3 (Fast 3G,
 * `budgets.json`), là où la zone rurale de la directive du porteur se juge.
 */
test('avant le premier pixel — AUCUN script, et le module arrive après lui', async ({ browser }) => {
  const ctx = await contexte(browser);
  const page = await ctx.newPage();
  await page.goto(`${v3.base}/feed/reels`, { waitUntil: 'load' });
  await attendLeModuleArme(page);

  // L'ORDRE, LU DANS LA CHRONOLOGIE DE LA PAGE — le même témoin que le fil
  // (`v3-fil.spec.ts`, « L'ORDRE ») : le premier pixel d'abord, `reels`
  // ensuite, et sous `/__v3/rt/` rien que les modules attendus — surtout pas
  // `socket.io`, que ce module n'importe pas (`build-participate.mjs`, note
  // des SOURCES).
  const chrono = await page.evaluate(() => ({
    premierPixel:
      performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint')?.startTime ?? null,
    modules: performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('/__v3/rt/'))
      .map((e) => ({ nom: e.name, debut: e.startTime })),
  }));

  const noms = chrono.modules
    .map((m) => m.nom.replace(/^.*\/__v3\/rt\//, '').replace(/\.[0-9a-f]{16}\.js$/, ''))
    .sort();
  // `navigateur` accompagne `reels` parce que cette suite déclare un périmètre
  // navigable (`V3_NAVIGABLE`) — il vit la vie du DOCUMENT, pas celle de
  // l'écran. Ce qui est interdit ici est `socket.io` : ce module ne parle à
  // personne, et l'égalité STRICTE est ce qui le dirait s'il arrivait.
  expect(noms).toEqual(['navigateur', 'reels']);
  expect(chrono.premierPixel).not.toBeNull();
  chrono.modules.forEach((m) => expect(m.debut).toBeGreaterThan(chrono.premierPixel ?? Number.POSITIVE_INFINITY));

  // Le document servi ne porte AUCUN `src` de script : tout ce qu'il expédie
  // est le chargeur différé, en ligne (§ 12.4).
  const html = await (await ctx.request.get(`${v3.base}/feed/reels`)).text();
  expect(html).not.toMatch(/<script[^>]+src=/);

  await ctx.close();
});

COLONNES_DE_THEME.forEach((theme) => {
  test(`0 violation axe serious/critical — /feed/reels, module armé (${theme.id})`, async ({ browser }) => {
    const ctx = await contexte(browser, { schema: theme.colorScheme, stockage: theme.stockage });
    const page = await ctx.newPage();

    await page.goto(`${v3.base}/feed/reels`, { waitUntil: 'load' });
    await attendLeModuleArme(page);

    const { violations } = await new AxeBuilder({ page }).analyze();
    const bloquantes = violationsBloquantes(violations);
    expect(bloquantes, rapporteViolations(`/feed/reels, module armé (${theme.id})`, bloquantes)).toEqual([]);

    await ctx.close();
  });
});
