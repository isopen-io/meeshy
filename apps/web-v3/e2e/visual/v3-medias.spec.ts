import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type CDPSession, type Page } from '@playwright/test';

import { THEME_STORAGE_KEY } from '../../app/theme-script';
import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { chargeDeMessage, JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { ciblesMesurees, ciblesTropPetites, LARGEURS } from './lib/cibles';
// `lib/a11y.ts` importe un `.mjs` que le transpile CommonJS de Playwright ne charge pas dans le
// projet `chaines` : ce spec monte sa propre chaîne, donc il prend le verdict et les colonnes à
// leur site sans `.mjs` — la même frontière que `v3-fil-riche.spec.ts` nomme dans son en-tête.
import { COLONNES_DE_THEME, rapporteViolations, violationsBloquantes } from './lib/verdict-axe';
import {
  CONVERSATION_DU_LECTEUR,
  CONVERSATION_RICHE,
  INVITE,
  messagesRiches,
  passerelleDeBouchon,
  PISTE_TRADUITE,
  RACINE_V3,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';

/**
 * LA GALERIE DES MÉDIAS (issue #4525, `cible/media.png`) — sur la chaîne réelle :
 * le serveur de la v3 tel que `next build` l'a émis, et la passerelle de
 * bouchon, qui sert ici les charges que la passerelle sert (chaque champ cite
 * son émetteur dans `lib/bouchon-monde.ts`).
 *
 * Ce que ces témoins gardent, dans l'ordre du critère de fin :
 *
 *   • **chaque tuile est cliquable et OUVRE le média** — la loi « un contrôle
 *     existe s'il a un effet », mesurée sur l'EFFET (un onglet s'ouvre sur le
 *     fichier, la galerie n'est pas quittée), jamais sur un attribut ;
 *   • **le poids est affiché AVANT le téléchargement, et AUCUN octet de média
 *     n'est transféré à l'ouverture de la grille** — assertion CDP sur
 *     `encodedDataLength`, doublée du journal de la passerelle : zéro requête
 *     ET zéro octet, deux origines de mesure pour un même fait ;
 *   • **l'audio rend sa transcription au Prisme, avec `lang=`** ;
 *   • 0 violation `axe` `serious`/`critical`, sur les QUATRE colonnes de thème ;
 *   • la grille est atteignable AU CLAVIER, dans l'ordre du document ;
 *   • aucune cible sous 44 px et aucun débordement horizontal, à 360 comme à
 *     390 px (charte règles 4 et 9) ;
 *   • les deux captures 390×844, claire et sombre, que le rapport REGARDE.
 */

const COMMANDE = 'bunx playwright test e2e/visual/v3-medias.spec.ts';

const DOSSIER_DES_RENDUS = process.env.RENDUS_DIR ?? join(RACINE_V3, 'test-results', 'rendus');

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const MEDIAS = (genre?: string): string =>
  `${v3.base}/chats/${CONVERSATION_DU_LECTEUR.id}/medias${genre === undefined ? '' : `?genre=${genre}`}`;

/** Un PDF — le quatrième genre de la table, que `messagesRiches` ne porte pas. */
const messageDeFichier = (conversationId: string) => ({
  ...chargeDeMessage({
    id: 'r7',
    conversationId,
    senderId: INVITE.id,
    content: '',
    originalLanguage: 'fr',
    sender: { id: INVITE.id, displayName: INVITE.nom, type: 'anonymous' },
    attachments: [
      {
        id: 'ar7',
        fileUrl: '2026/09/ar7/budget.pdf',
        originalName: 'budget.pdf',
        mimeType: 'application/pdf',
        fileSize: 1_258_291,
      },
    ],
    createdAt: new Date(Date.now() - 17 * 60_000).toISOString(),
  }),
  senderParticipantId: INVITE.id,
});

/**
 * UN MESSAGE PROTÉGÉ QUI PORTE UNE PHOTO — le témoin du cycle 125, posé sur un
 * écran neuf : la galerie ne doit JAMAIS servir l'URL d'une pièce à vue unique.
 */
const messageProtege = (conversationId: string) => ({
  ...chargeDeMessage({
    id: 'r8',
    conversationId,
    senderId: INVITE.id,
    content: '',
    originalLanguage: 'fr',
    sender: { id: INVITE.id, displayName: INVITE.nom, type: 'anonymous' },
    attachments: [
      {
        id: 'ar8',
        fileUrl: '/api/v1/attachments/file/2026/secret-vue-unique.jpg',
        originalName: 'secret-vue-unique.jpg',
        mimeType: 'image/jpeg',
        fileSize: 512_000,
      },
    ],
    createdAt: new Date(Date.now() - 16 * 60_000).toISOString(),
  }),
  senderParticipantId: INVITE.id,
  isViewOnce: true,
});

const contexteDuMembre = async (
  navigateur: Browser,
  options: Parameters<Browser['newContext']>[0] = {},
): Promise<BrowserContext> => {
  const contexte = await navigateur.newContext(options);
  await contexte.addCookies([
    { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
    { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
  ]);
  return contexte;
};

/**
 * LES OCTETS RÉELLEMENT TRANSFÉRÉS, par CDP. Le journal de la passerelle dit
 * qu'aucune requête n'est PARTIE ; `encodedDataLength` dit qu'aucun octet n'est
 * ARRIVÉ — la seconde n'est pas la première : un cache, un préchargement du
 * navigateur ou une redirection compteraient des octets sans repasser par le
 * bouchon.
 */
type Compteur = { readonly octets: () => number; readonly reponses: () => readonly string[] };

const compteLesOctetsDeMedia = async (page: Page): Promise<Compteur> => {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const suivies = new Map<string, string>();
  const poids = new Map<string, number>();
  cdp.on('Network.requestWillBeSent', ({ requestId, request }) => {
    if (request.url.includes('/attachments/')) suivies.set(requestId, request.url);
  });
  cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
    if (suivies.has(requestId)) poids.set(requestId, encodedDataLength);
  });
  return {
    octets: () => [...poids.values()].reduce((somme, valeur) => somme + valeur, 0),
    reponses: () => [...suivies.values()],
  };
};

const audite = async (page: Page, ou: string): Promise<void> => {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bloquantes = violationsBloquantes(violations);
  expect(bloquantes, rapporteViolations(ou, bloquantes)).toEqual([]);
};

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon();
  messagesRiches(CONVERSATION_DU_LECTEUR.id).forEach((message) => passerelle.ajouteUnMessage(message));
  passerelle.ajouteUnMessage(messageDeFichier(CONVERSATION_DU_LECTEUR.id));
  passerelle.ajouteUnMessage(messageProtege(CONVERSATION_DU_LECTEUR.id));
  v3 = await serveurDeLaV3(passerelle.base);
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

test.beforeEach(() => {
  passerelle.oublie();
});

test.describe('la grille — parcourir sans rien télécharger', () => {
  test('annonce le poids de chaque pièce et ne transfère AUCUN octet de média', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    const compteur = await compteLesOctetsDeMedia(page);
    await page.goto(MEDIAS(), { waitUntil: 'load' });

    await expect(page.locator('li[data-piece="ar1"] .poids')).toHaveText('420 Ko');
    await expect(page.locator('li[data-piece="ar2"] .poids')).toHaveText('0:42 · 3,0 Mo');
    await expect(page.locator('li[data-piece="ar3"] .poids')).toHaveText('0:21 · 94 Ko');
    await expect(page.locator('li[data-piece="ar7"] .poids')).toHaveText('1,2 Mo');

    expect(await page.locator('img').count()).toBe(0);
    expect(await page.locator('video').count()).toBe(0);
    await expect(page.locator('audio')).toHaveAttribute('preload', 'none');

    await page.waitForTimeout(500);
    expect(compteur.reponses()).toEqual([]);
    expect(compteur.octets()).toBe(0);
    expect(passerelle.journal.filter((appel) => appel.chemin.includes('/attachments/file/'))).toEqual([]);
    await contexte.close();
  });

  /**
   * LA PROTECTION EST HÉRITÉE DU FIL (cycle 125) : une photo à VUE UNIQUE n'a
   * aucune pièce à projeter, donc son URL ne peut pas partir — même pas dans un
   * `href` que personne ne touche.
   */
  test('ne sert JAMAIS une pièce d’un message protégé', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(MEDIAS(), { waitUntil: 'load' });

    expect(await page.locator('li[data-piece="ar8"]').count()).toBe(0);
    expect(await page.content()).not.toContain('secret-vue-unique');
    await contexte.close();
  });

  /**
   * L'EFFET, JAMAIS L'ATTRIBUT. La planche dessine des tuiles inertes ; celles-ci
   * ouvrent le fichier dans un onglet, et la galerie reste où elle est — comme
   * l'affiche du fil, pour la même raison (`download` est ignoré hors origine).
   */
  test('ouvre chaque tuile sur son média, sans quitter la galerie', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(MEDIAS(), { waitUntil: 'load' });
    const avant = page.url();

    const tuiles = page.locator('.grille .tuile');
    expect(await tuiles.count()).toBe(3);
    expect(await page.locator('.lecteurs > li').count()).toBe(1);
    for (const href of await tuiles.evaluateAll((noeuds) => noeuds.map((n) => n.getAttribute('href') ?? ''))) {
      expect(href).toContain(passerelle.base);
    }

    const image = page.locator('li[data-piece="ar1"] .tuile');
    await expect(image).toHaveAttribute('aria-label', /Télécharger tableau\.jpg · 420 Ko/);
    const [ouvert] = await Promise.all([contexte.waitForEvent('page'), image.click()]);
    await ouvert.waitForLoadState('domcontentloaded').catch(() => undefined);
    expect(page.url()).toBe(avant);
    expect(ouvert.url()).toContain('/api/v1/attachments/file/');
    await contexte.close();
  });

  /**
   * LES PUCES ONT UN EFFET. Elles sont inertes dans la planche ; ici la grille
   * SERVIE change, la puce active se déclare, et « Tous » ramène — un filtre
   * dont on ne revient pas serait un piège.
   */
  test('filtre par genre, déclare la puce active, et laisse revenir', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(MEDIAS(), { waitUntil: 'load' });
    expect(await page.locator('.grille > li, .lecteurs > li').count()).toBe(4);

    await page.getByRole('link', { name: 'Images', exact: true }).click();
    await expect(page.locator('.grille > li')).toHaveCount(1);
    await expect(page.locator('.grille > li')).toHaveAttribute('data-genre', 'image');
    expect(await page.locator('.lecteurs').count()).toBe(0);
    await expect(page.getByRole('link', { name: 'Images', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.fil-tete .sous')).toHaveText(`${CONVERSATION_DU_LECTEUR.titre} · 1 élément`);

    await page.getByRole('link', { name: 'Tous', exact: true }).click();
    await expect(page.locator('.grille > li, .lecteurs > li')).toHaveCount(4);
    await contexte.close();
  });

  /**
   * Un genre sans pièce n'est pas un écran blanc : c'est un état DESSINÉ qui se
   * NOMME. La conversation riche (`vues.json#rich`) ne porte aucun fichier —
   * c'est le seul fil du bouchon dont un genre soit vide, et c'est ce qui rend
   * ce témoin non vacant.
   */
  test('dessine l’état vide d’un filtre, et ne laisse aucune grille blanche', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${v3.base}/chats/${CONVERSATION_RICHE.id}/medias?genre=fichier`, { waitUntil: 'load' });

    await expect(page.locator('.carte-vide h3')).toHaveText('Aucun média dans « Fichiers »');
    expect(await page.locator('.grille').count()).toBe(0);
    await expect(page.getByRole('link', { name: 'Tous', exact: true })).toBeVisible();
    await contexte.close();
  });
});

test.describe('le Prisme d’un vocal, dans la galerie', () => {
  test('sert la transcription du lecteur, dit d’où elle vient, et déclare la langue de l’original', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(MEDIAS('audio'), { waitUntil: 'load' });

    const vocal = page.locator('li[data-piece="ar3"]');
    await expect(vocal.locator('.transcription')).toContainText('J’apporte les chiffres de mars');
    await expect(vocal.locator('.transcrit')).toHaveText('Transcrit du yo · lire en fr');
    await expect(vocal.locator('.transcrit-original p')).toHaveAttribute('lang', 'yo');
    // La piste suit le TEXTE servi (cycle 128) : on entend ce qu'on lit.
    await expect(vocal.locator('audio')).toHaveAttribute('src', `${passerelle.base}${PISTE_TRADUITE}`);
    await contexte.close();
  });
});

test.describe('l’écran est atteignable — clavier, cibles, cadre', () => {
  test('atteint CHAQUE pièce au clavier, dans l’ordre du document', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await contexte.newPage();
    await page.goto(MEDIAS(), { waitUntil: 'load' });

    // DEUX listes, chacune du plus RÉCENT au plus ancien (la cible) : la grille —
    // le fichier, la vidéo, l'image — puis les vocaux. C'est cet ordre-là que le
    // doigt et le clavier parcourent : le DOM ne ment pas sur l'ordre de lecture.
    expect(await page.locator('.grille > li, .lecteurs > li').evaluateAll((noeuds) => noeuds.map((n) => (n as HTMLElement).dataset.piece))).toEqual([
      'ar7',
      'ar2',
      'ar1',
      'ar3',
    ]);

    const atteints: string[] = [];
    for (let pas = 0; pas < 16; pas += 1) {
      await page.keyboard.press('Tab');
      atteints.push(
        await page.evaluate(() => {
          const actif = document.activeElement as HTMLElement | null;
          const porteur = actif?.closest('li[data-piece]') as HTMLElement | null;
          return porteur === null ? '' : (porteur.dataset.piece ?? '');
        }),
      );
    }
    ['ar7', 'ar2', 'ar1', 'ar3'].forEach((piece) => expect(atteints).toContain(piece));
    // Le premier de la grille est atteint AVANT le dernier : la tabulation suit le document.
    expect(atteints.indexOf('ar7')).toBeLessThan(atteints.indexOf('ar1'));
    expect(atteints.indexOf('ar1')).toBeLessThan(atteints.indexOf('ar3'));
    await contexte.close();
  });

  LARGEURS.forEach((largeur) => {
    test(`ne laisse aucune cible sous 44 px ni débordement horizontal (${largeur} px)`, async ({ browser }) => {
      const contexte = await contexteDuMembre(browser, { viewport: { width: largeur, height: 844 } });
      const page = await contexte.newPage();
      await page.goto(MEDIAS(), { waitUntil: 'load' });

      expect(ciblesTropPetites(await ciblesMesurees(page))).toEqual([]);
      const debordement = await page.evaluate(() => ({
        largeur: document.documentElement.scrollWidth,
        cadre: document.documentElement.clientWidth,
      }));
      expect(debordement.largeur).toBeLessThanOrEqual(debordement.cadre);
      await contexte.close();
    });
  });
});

/**
 * LES QUATRE COLONNES DE THÈME (§ 9.6) : `color-contrast` est d'impact
 * `serious` — la barre exacte de ce gate — et la seule règle d'axe dont le
 * verdict dépende du thème.
 */
COLONNES_DE_THEME.forEach((colonne) => {
  test(`0 violation axe serious/critical — la galerie (${colonne.id})`, async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { colorScheme: colonne.colorScheme });
    if (colonne.stockage !== null) {
      await contexte.addInitScript(
        ([cle, valeur]) => window.localStorage.setItem(cle as string, valeur as string),
        [THEME_STORAGE_KEY, colonne.stockage],
      );
    }
    const page = await contexte.newPage();
    await page.goto(MEDIAS(), { waitUntil: 'load' });
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${colonne.classeAttendue}\\b`));
    await audite(page, `/chats/:cle/medias [${colonne.id}]`);
    await contexte.close();
  });
});

test.describe('les captures que le rapport REGARDE', () => {
  (['light', 'dark'] as const).forEach((schema) => {
    test(`rend la galerie en 390×844 (${schema})`, async ({ browser }) => {
      const contexte = await contexteDuMembre(browser, { colorScheme: schema, viewport: { width: 390, height: 844 } });
      const page = await contexte.newPage();
      await page.goto(MEDIAS(), { waitUntil: 'load' });
      await expect(page.locator('.grille > li')).toHaveCount(3);

      mkdirSync(DOSSIER_DES_RENDUS, { recursive: true });
      await page.screenshot({ path: join(DOSSIER_DES_RENDUS, `media-${schema}.png`) });
      await contexte.close();
    });
  });
});

test.afterAll(() => {
  test.info().annotations.push({ type: 'commande', description: COMMANDE });
});
