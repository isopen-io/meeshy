import { mkdirSync, readFileSync } from 'node:fs';
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
  chargeMesureReseau,
  CONVERSATION_DU_LECTEUR,
  CONVERSATION_RICHE,
  INVITE,
  messagesRiches,
  OCTETS_DE_LA_FIXTURE,
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
 *   • **une tuile ouvre le MÊME plein écran que le fil** (#4525, + point 2 de
 *     #5024) — une NAVIGATION vers `?media=<pièce>` de CETTE adresse, jamais un
 *     onglet ; un fichier (PDF), lui, garde son onglet, geste nommé ;
 *   • **le poids est affiché AVANT le téléchargement, et AUCUN octet de média
 *     n'est transféré à l'ouverture de la grille — puis, à l'ouverture de la
 *     surimpression, SEULE l'image demandée part** — assertion CDP sur
 *     `encodedDataLength`, doublée du journal de la passerelle ;
 *   • **la fiche d'un vocal se lit ENTIÈRE, au Prisme, avec sa piste servie** ;
 *   • **fermer — croix, `data-retour`, retour arrière — rend l'adresse de la
 *     galerie SANS `?media=`**, trois chemins pour un seul effet ;
 *   • **un genre sans plein écran (PDF) n'en a pas, même forcé** ;
 *   • 0 violation `axe` `serious`/`critical`, sur les QUATRE colonnes de thème,
 *     grille ET surimpression ;
 *   • la grille ET la surimpression sont atteignables AU CLAVIER ;
 *   • aucune cible sous 44 px et aucun débordement horizontal, à 360 comme à
 *     390 px (charte règles 4 et 9) ;
 *   • le régime `?media=` tient les plafonds de `/chats/*` et son document est
 *     pesé ;
 *   • aucun accusé de lecture, plein écran ouvert ou fermé ;
 *   • les captures 390×844, claire et sombre, grille ET surimpression, que le
 *     rapport REGARDE.
 */

const COMMANDE = 'bunx playwright test e2e/visual/v3-medias.spec.ts';

const DOSSIER_DES_RENDUS = process.env.RENDUS_DIR ?? join(RACINE_V3, 'test-results', 'rendus');

const budgets = JSON.parse(readFileSync(join(RACINE_V3, 'budgets.json'), 'utf8'));

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
   * L'EFFET, JAMAIS L'ATTRIBUT. La planche dessine des tuiles inertes ; celle
   * d'un FICHIER ouvre son onglet, geste nommé, et la galerie reste où elle
   * est — comme l'affiche du fil, pour la même raison (`download` est ignoré
   * hors origine). L'image et la vidéo, elles, mènent au MÊME plein écran que
   * le fil (§ ci-dessous) : ce test garde le SEUL genre qui ouvre encore un
   * onglet.
   */
  test('ouvre un fichier dans un onglet, geste nommé, sans quitter la galerie', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(MEDIAS(), { waitUntil: 'load' });
    const avant = page.url();

    expect(await page.locator('.grille .tuile').count()).toBe(3);
    expect(await page.locator('.lecteurs > li').count()).toBe(1);

    const fichier = page.locator('li[data-piece="ar7"] .tuile');
    await expect(fichier).toHaveAttribute('href', new RegExp(`^${passerelle.base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    await expect(fichier).toHaveAttribute('target', '_blank');
    await expect(fichier).toHaveAttribute('aria-label', /Télécharger budget\.pdf · 1,2 Mo/);
    const [ouvert] = await Promise.all([contexte.waitForEvent('page'), fichier.click()]);
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

/**
 * UNE TUILE OUVRE LE MÊME PLEIN ÉCRAN QUE LE FIL (#4525, + point 2 de #5024) —
 * la surimpression rendue par `app/connecte/plein-vue.ts`, le site UNIQUE de
 * son balisage (`__tests__/fil-source-unique.test.ts`), par-dessus la grille
 * INCHANGÉE et `inert`.
 */
test.describe('une tuile ouvre le même plein écran que le fil', () => {
  test('ouvre une tuile image dans le même plein écran que le fil, grille inchangée derrière', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    const compteur = await compteLesOctetsDeMedia(page);
    await page.goto(MEDIAS(), { waitUntil: 'load' });

    await page.locator('li[data-piece="ar1"] .tuile').click();
    await page.waitForLoadState('load');

    expect(page.url()).toBe(`${MEDIAS()}?media=ar1`);
    // Une NAVIGATION, pas un onglet : la même page a changé d'adresse.
    expect(contexte.pages().length).toBe(1);
    await expect(page.locator('dialog.plein')).toBeVisible();
    await expect(page.locator('#titre-du-plein')).toHaveText('tableau.jpg');
    expect(await page.locator('main[inert]').count()).toBe(1);
    expect(await page.locator('.grille > li').count()).toBe(3);

    await page.waitForTimeout(300);
    const CHEMIN_DE_L_IMAGE = '/api/v1/attachments/file/2026/tableau.jpg';
    expect(compteur.reponses()).toEqual([`${passerelle.base}${CHEMIN_DE_L_IMAGE}`]);
    // L'IMAGE ENTIÈRE, pas « quelque chose » : `> 0` aurait été vert sur un 404,
    // dont le corps pèse aussi des octets. `encodedDataLength` compte l'en-tête
    // EN PLUS du corps, d'où le `>=` — la table du bouchon dit ce que le corps pèse.
    expect(compteur.octets()).toBeGreaterThanOrEqual(OCTETS_DE_LA_FIXTURE[CHEMIN_DE_L_IMAGE] ?? 0);
    const requetesDeMedia = passerelle.journal.filter((appel) => appel.chemin.includes('/attachments/file/2026/'));
    expect(requetesDeMedia).toHaveLength(1);
    expect(requetesDeMedia[0]?.chemin).toContain('tableau.jpg');
    await contexte.close();
  });

  /**
   * FERMER REND L'ADRESSE DE LA GALERIE SANS `?media=` — trois chemins, un seul
   * effet : la croix, `data-retour` (ce qu'un module suit à Échap — témoin
   * séparé ci-dessous, avec JavaScript, § « ce que le module ajoute »), le
   * retour arrière du navigateur (l'état est une navigation).
   */
  test('ferme par la croix, par le retour arrière, et data-retour dit la même adresse', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${MEDIAS('image')}&media=ar1`, { waitUntil: 'load' });

    const fermer = page.locator('dialog.plein a.fermer');
    await expect(fermer).toHaveAttribute('href', `/chats/${CONVERSATION_DU_LECTEUR.id}/medias?genre=image`);
    await expect(page.locator('dialog.plein')).toHaveAttribute('data-retour', `/chats/${CONVERSATION_DU_LECTEUR.id}/medias?genre=image`);

    await fermer.click();
    await expect(page).toHaveURL(`${MEDIAS('image')}`);
    expect(await page.locator('main[inert]').count()).toBe(0);
    await expect(page.locator('.grille > li')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Images', exact: true })).toHaveAttribute('aria-current', 'page');

    await page.goto(`${MEDIAS('image')}&media=ar1`, { waitUntil: 'load' });
    await page.goBack();
    await expect(page).toHaveURL(`${MEDIAS('image')}`);
    await contexte.close();
  });

  /**
   * « VOIR DANS LA CONVERSATION » A UN EFFET (charte règle 7). C'est le geste
   * que le legacy offrait (`AttachmentGallery.tsx` › « Voir dans le message »),
   * repris ici : il doit AMENER au message d'où la pièce vient, dans le FIL, et
   * non seulement porter la bonne adresse — un `href` juste vers une porte qui
   * ne sait pas le lire serait un contrôle inerte, et l'assertion unitaire ne
   * l'aurait pas vu.
   */
  test('« Voir dans la conversation » mène au message, dans le fil', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${MEDIAS()}?media=ar1`, { waitUntil: 'load' });

    await page.getByRole('link', { name: 'Voir dans la conversation' }).click();
    await page.waitForLoadState('load');

    expect(page.url()).toBe(`${v3.base}/chats/${CONVERSATION_DU_LECTEUR.id}?autour=r1#m-r1`);
    await expect(page.locator('#m-r1')).toBeVisible();
    expect(await page.locator('dialog.plein').count()).toBe(0);
    await contexte.close();
  });

  /**
   * LA VIDÉO S'OUVRE AVEC SA BOÎTE, SANS UN OCTET AVANT LA PRESSION —
   * `preload="none"` : la surimpression MONTRE, elle ne dépense pas les octets
   * à la place du lecteur.
   */
  test('la vidéo s’ouvre en plein écran sans un octet avant la pression', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    const compteur = await compteLesOctetsDeMedia(page);
    await page.goto(`${MEDIAS()}?media=ar2`, { waitUntil: 'load' });

    const video = page.locator('video.media-plein');
    await expect(video).toHaveAttribute('preload', 'none');
    await expect(page.locator('dialog.plein .poids')).toHaveText('0:42 · 3,0 Mo');

    await page.waitForTimeout(500);
    expect(compteur.reponses()).toEqual([]);
    expect(passerelle.journal.filter((appel) => appel.chemin.includes('/attachments/file/'))).toEqual([]);
    await contexte.close();
  });

  /**
   * LA FICHE D'UN VOCAL SE LIT ENTIÈRE, AU PRISME — jamais tronquée, avec sa
   * piste JOUÉE élue par le texte SERVI (cycle 128), comme dans le fil.
   */
  test('la fiche d’un vocal se lit entière, au Prisme', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    const compteur = await compteLesOctetsDeMedia(page);
    await page.goto(MEDIAS(), { waitUntil: 'load' });

    await page.locator('li[data-piece="ar3"] a.fiche').click();
    await expect(page).toHaveURL(`${MEDIAS()}?media=ar3`);

    const transcription = page.locator('dialog.plein .transcription');
    await expect(transcription).toContainText('J’apporte les chiffres de mars, tout est prêt.');
    expect(await transcription.evaluate((noeud) => getComputedStyle(noeud).webkitLineClamp)).toBe('none');
    await expect(page.locator('dialog.plein .transcrit')).toHaveText('Transcrit du yo · lire en fr');
    await expect(page.locator('dialog.plein .transcrit-original p')).toHaveAttribute('lang', 'yo');
    await expect(page.locator('dialog.plein audio.media-plein')).toHaveAttribute('src', `${passerelle.base}${PISTE_TRADUITE}`);
    await expect(page.locator('dialog.plein audio.media-plein')).toHaveAttribute('preload', 'none');

    await page.waitForTimeout(300);
    expect(compteur.reponses()).toEqual([]);
    await contexte.close();
  });

  /** UN GENRE SANS PLEIN ÉCRAN N'EN A PAS, MÊME FORCÉ — la tuile PDF garde son onglet. */
  test('un PDF n’a pas de plein écran, même forcé', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${MEDIAS()}?media=ar7`, { waitUntil: 'load' });

    expect(await page.locator('dialog.plein').count()).toBe(0);
    expect(await page.locator('main[inert]').count()).toBe(0);
    await expect(page.locator('li[data-piece="ar7"] .tuile')).toHaveAttribute('target', '_blank');
    await contexte.close();
  });

  /**
   * LA SURIMPRESSION RETIENT LE FOCUS SANS JAVASCRIPT — `inert` sur la grille :
   * le premier `Tab` atteint la croix, et aucune tabulation n'entre dans la
   * grille recouverte.
   */
  test('la surimpression est atteignable au clavier, et rien derrière elle', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(`${MEDIAS()}?media=ar1`, { waitUntil: 'load' });

    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.className)).toContain('fermer');

    let entreDansLaGrille = false;
    for (let pas = 0; pas < 12; pas += 1) {
      await page.keyboard.press('Tab');
      entreDansLaGrille ||= await page.evaluate(() => (document.activeElement as HTMLElement | null)?.closest('main[inert]') !== null);
    }
    expect(entreDansLaGrille).toBe(false);
    await contexte.close();
  });

  /**
   * LE RÉGIME `?media=` DE LA GALERIE TIENT LES PLAFONDS DE `/chats/*` — la
   * surimpression est servie DANS le même document (aucune requête de plus),
   * sous les MÊMES plafonds réseau que la grille : 4 requêtes avant le premier
   * pixel, LCP ≤ 2,2 s, CLS ≤ 0,05 (patron `v3-fil-riche.spec.ts` § « le coût du
   * plein écran, mesuré »).
   */
  test('le régime ?media= de la galerie tient les plafonds de /chats/*, et son document est pesé', async ({ browser }, info) => {
    const { mesurePage, franchissementsReseau } = await chargeMesureReseau();
    const cookies = [
      { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
      { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
    ];
    const mesure = await mesurePage({
      url: `${MEDIAS()}?media=ar1`,
      commande: COMMANDE,
      navigateur: browser,
      cookies,
      profil: budgets.reseau.profil,
    });
    console.log(
      `[mesure] /chats/:cle/medias?media= Fast 3G — requêtes avant le premier pixel ${mesure.requetes_avant_premier_pixel} · FCP ${mesure.fcp_ms} ms · LCP ${mesure.lcp_ms} ms · CLS ${mesure.cls} · ${mesure.octets_transferes} o`,
    );
    info.annotations.push({
      type: 'plein écran de la galerie en Fast 3G',
      description: `req. avant le premier pixel ${mesure.requetes_avant_premier_pixel ?? '?'} · FCP ${mesure.fcp_ms ?? '?'} ms · LCP ${mesure.lcp_ms ?? '?'} ms · CLS ${mesure.cls ?? '?'} · ${mesure.octets_transferes ?? '?'} o`,
    });
    expect(mesure.http).toBe(200);
    expect(franchissementsReseau(mesure, budgets.reseau).filter((f) => f.statut === 'GATE').map((f) => f.texte)).toEqual([]);
  });

  /**
   * PARCOURIR UNE GALERIE N'EST PAS LIRE (`route.ts:21-25`) — et ouvrir ou
   * fermer un plein écran, encore moins : aucun `POST …/receipts` sur cette
   * adresse, jamais.
   */
  test('n’écrit aucun accusé de lecture, plein écran ouvert ou fermé', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(MEDIAS(), { waitUntil: 'load' });
    await page.locator('li[data-piece="ar1"] .tuile').click();
    await page.waitForLoadState('load');
    await page.locator('dialog.plein a.fermer').click();
    await page.waitForLoadState('load');

    expect(passerelle.journal.filter((appel) => appel.methode === 'POST' && appel.chemin.includes('/receipts'))).toEqual([]);
    await contexte.close();
  });
});

/**
 * CE QUE LE MODULE DE LA GALERIE AJOUTE — ET RIEN DE PLUS (défaut trouvé en
 * revue : `data-retour` était servi SANS lecteur sur cet écran, alors que le
 * fil en a un depuis `participate.ts`. Même surimpression, deux comportements
 * clavier). `lib/realtime/plein.ts` est le plus léger des neuf modules
 * (241 o gzip, `budgets-mesures.json → participate`) : un seul appel à
 * `prendsLePleinEcran()`, le site UNIQUE de cette élévation
 * (`lib/realtime/plein-ecran.ts`), déjà utilisé par le fil et par la liste.
 * Le témoin ci-dessous est le jumeau EXACT de
 * `v3-fil-riche.spec.ts` § « ce que le module AJOUTE à la surimpression ».
 */
test.describe('ce que le module de la galerie AJOUTE — et rien de plus', () => {
  test('Échap ferme le plein écran et rend la galerie', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await contexte.newPage();
    await page.goto(`${MEDIAS('image')}&media=ar1`, { waitUntil: 'load' });

    // Le module élève le `<dialog open>` servi en MODALE : c'est ce qui donne
    // Échap, le voile et le piège à focus — jamais une seconde surimpression.
    await expect
      .poll(() => page.evaluate(() => document.querySelector('dialog.plein')?.matches(':modal') ?? false), { timeout: 15_000 })
      .toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForURL((url) => url.searchParams.get('media') === null, { timeout: 15_000 });
    await expect(page.locator('.grille > li')).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Images', exact: true })).toHaveAttribute('aria-current', 'page');
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

    test(`ne laisse aucune cible sous 44 px ni débordement horizontal (${largeur} px), plein écran ouvert`, async ({ browser }) => {
      const contexte = await contexteDuMembre(browser, { viewport: { width: largeur, height: 844 } });
      const page = await contexte.newPage();
      await page.goto(`${MEDIAS()}?media=ar1`, { waitUntil: 'load' });

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

  test(`0 violation axe serious/critical — la galerie en plein écran (${colonne.id})`, async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { colorScheme: colonne.colorScheme });
    if (colonne.stockage !== null) {
      await contexte.addInitScript(
        ([cle, valeur]) => window.localStorage.setItem(cle as string, valeur as string),
        [THEME_STORAGE_KEY, colonne.stockage],
      );
    }
    const page = await contexte.newPage();
    await page.goto(`${MEDIAS()}?media=ar1`, { waitUntil: 'load' });
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${colonne.classeAttendue}\\b`));
    await audite(page, `/chats/:cle/medias?media= [${colonne.id}]`);
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

    test(`rend la galerie en plein écran en 390×844 (${schema})`, async ({ browser }) => {
      const contexte = await contexteDuMembre(browser, { colorScheme: schema, viewport: { width: 390, height: 844 } });
      const page = await contexte.newPage();
      await page.goto(`${MEDIAS()}?media=ar1`, { waitUntil: 'load' });
      await expect(page.locator('dialog.plein')).toBeVisible();

      mkdirSync(DOSSIER_DES_RENDUS, { recursive: true });
      await page.screenshot({ path: join(DOSSIER_DES_RENDUS, `media-plein-${schema}.png`) });
      await contexte.close();
    });
  });
});

test.afterAll(() => {
  test.info().annotations.push({ type: 'commande', description: COMMANDE });
});
