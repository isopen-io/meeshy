import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '../../lib/api/cookies';
import { attachmentServi } from './lib/bouchon-fil';
import { chargeDeMessage, JETON_DU_MEMBRE, UTILISATEUR_DU_MEMBRE } from './lib/bouchon-socket';
import { estMutante, rapporteRequetesInterdites, requetesPendantOngletCache } from './lib/lifecycle';
import { avance, DELAI_D_OBSERVATION_MS, enregistre, figeLHorloge, installeLHorloge, occulte, revele } from './lib/navigateur-cycle';
import {
  chargeMesureReseau,
  CONVERSATION_DU_LECTEUR,
  PAIR_ANGLOPHONE,
  PAIR_HISPANOPHONE,
  passerelleDeBouchon,
  RACINE_V3,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';

/**
 * LE FIL, À LA PORTE DU MEMBRE (`/chats/:cle`, issue #4524) — sur la chaîne
 * réelle : le serveur de la v3 tel que `next build` l'a émis, la passerelle de
 * bouchon qui MIME la vraie (`e2e/visual/lib/serveurs.ts`, chaque route cite
 * l'émetteur qu'elle copie) et le bouchon socket (`lib/bouchon-socket.ts`).
 *
 * Ce que ces témoins gardent, dans l'ordre du critère de fin de la matrice :
 *
 *   • le document SANS JavaScript sert le Prisme (le texte dans la langue du
 *     lecteur, l'original replié avec son `lang`), et le formulaire envoie
 *     puis relit — c'est le chemin qui marche partout (§ 12.4) ;
 *   • ≤ 4 requêtes avant le premier pixel, AUCUN script avant lui, et
 *     `socket.io-client` n'arrive qu'après `participate` — deux requêtes,
 *     toutes deux après le premier pixel ;
 *   • un message reçu apparaît SANS rechargement ; la traduction qui arrive
 *     fait changer la bulle de langue, `lang` compris ; la frappe se voit ;
 *   • le composeur : optimiste puis confirmé, Entrée envoie, Maj + Entrée
 *     passe à la ligne, le focus reste ;
 *   • un onglet caché ⇒ ZÉRO requête (§ 8.5), et le socket revient au retour ;
 *   • les cibles tactiles ; et les deux captures 390×844, claire et sombre,
 *     que le rapport de l'écran REGARDE.
 */

const COMMANDE = 'bunx playwright test e2e/visual/v3-fil.spec.ts';

const budgets = JSON.parse(readFileSync(join(RACINE_V3, 'budgets.json'), 'utf8'));

/** Les captures que le rapport regarde — hors du paquet quand `RENDUS_DIR` le dit, sinon à côté des traces. */
const DOSSIER_DES_RENDUS = process.env.RENDUS_DIR ?? join(RACINE_V3, 'test-results', 'rendus');

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const FIL = (): string => `${v3.base}/chats/${CONVERSATION_DU_LECTEUR.id}`;

/** Les cookies d'un lecteur CONNECTÉ, tels que `app/session.ts` les lit. */
const cookiesDuMembre = () => [
  { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: v3.base },
  { name: COOKIE_DE_SESSION, value: 'ouverte', url: v3.base },
];

const contexteDuMembre = async (
  navigateur: Browser,
  options: Parameters<Browser['newContext']>[0] = {},
): Promise<BrowserContext> => {
  const contexte = await navigateur.newContext(options);
  await contexte.addCookies(cookiesDuMembre());
  return contexte;
};

const ouvreLeFil = async (contexte: BrowserContext): Promise<Page> => {
  const page = await contexte.newPage();
  await page.goto(FIL(), { waitUntil: 'load' });
  return page;
};

/** Le module de participation est là, authentifié, dans la room : le point d'état le dit. */
const attendLeTempsReel = async (page: Page): Promise<void> => {
  await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'connecte', { timeout: 15_000 });
};

const messageDIbrahim = (
  id: string,
  content: string,
  translations: readonly { readonly language: string; readonly content: string }[] = [],
) =>
  chargeDeMessage({
    id,
    conversationId: CONVERSATION_DU_LECTEUR.id,
    senderId: PAIR_ANGLOPHONE.id,
    content,
    originalLanguage: 'en',
    sender: { id: 'p-ibrahim', displayName: PAIR_ANGLOPHONE.nom, userId: PAIR_ANGLOPHONE.id },
    translations,
  });

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
  passerelle.presences.reinitialise();
});

test.describe('sans JavaScript — le document est le fil', () => {
  test('sert le texte dans la langue du lecteur ; l’original, replié, porte la sienne', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);

    await expect(page.locator('li.ligne')).toHaveCount(passerelle.messages().length);

    // m1 est écrit en anglais et traduit : le texte LU est français (la langue du
    // document, donc sans `lang`), l'original replié dit `lang="en"`, la pastille
    // nomme la langue d'origine — jamais de commentaire, jamais l'original à côté.
    const m1 = page.locator('li[data-id="m1"]');
    await expect(m1.locator('.texte')).toHaveText('On se cale à 15 h pour la revue ?');
    expect(await m1.locator('.texte').getAttribute('lang')).toBeNull();
    await expect(m1.locator('details.original p')).toHaveAttribute('lang', 'en');
    await expect(m1.locator('details.original p')).toHaveText('Shall we meet at 3 pm for the review?');
    await expect(m1.locator('.langue .code')).toHaveText('en');

    const m3 = page.locator('li[data-id="m3"]');
    await expect(m3.locator('.texte')).toHaveText('Parfait, je le relis cet après-midi.');
    await expect(m3.locator('.langue .code')).toHaveText('es');
    await expect(m3.locator('.reactions li').first()).toContainText('👍');

    // L'invité est nommé comme tel ; la bulle du lecteur porte son accusé.
    await expect(page.locator('li[data-id="m2"] .anonyme')).toBeVisible();
    await expect(page.locator('li[data-id="m4"]')).toHaveClass(/mien/);
    await expect(page.locator('li[data-id="m4"] .accuse')).toHaveAttribute('data-accuse', /^(envoye|recu|lu)$/);

    // 0 Ko de JS de page : aucun `<script src>` — le module de participation
    // n'est qu'une ADRESSE dans le document, jamais une balise de script.
    expect(await page.locator('script[src]').count()).toBe(0);
    await contexte.close();
  });

  test('envoie par le formulaire, puis relit — Post/Redirect/Get', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser, { javaScriptEnabled: false });
    const page = await ouvreLeFil(contexte);
    const avant = await page.locator('li.ligne').count();

    await page.locator('#champ-texte').fill('Envoyé sans JavaScript');
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'GET' && r.url() === FIL()),
      page.locator('button.envoyer').click(),
    ]);

    await expect(page.locator('li.ligne')).toHaveCount(avant + 1);
    // La liste est servie du plus RÉCENT au plus ancien (`column-reverse`) : la ligne envoyée est la PREMIÈRE du DOM.
    await expect(page.locator('li.ligne').first().locator('.texte')).toHaveText('Envoyé sans JavaScript');
    await expect(page.locator('li.ligne').first()).toHaveClass(/mien/);
    expect(page.url()).toMatch(/#m-m\d+$/);

    const envoi = passerelle.journal.find(
      (a) => a.methode === 'POST' && a.chemin === `/api/v1/conversations/${CONVERSATION_DU_LECTEUR.id}/messages`,
    );
    expect(JSON.parse(envoi?.corps ?? '{}')).toMatchObject({ content: 'Envoyé sans JavaScript' });
    await contexte.close();
  });
});

test.describe('avant le premier pixel', () => {
  test('≤ 4 requêtes, et aucun script — socket.io-client n’arrive qu’APRÈS participate', async ({ browser }, info) => {
    const { mesurePage, franchissementsReseau } = await chargeMesureReseau();
    const mesure = await mesurePage({ url: FIL(), commande: COMMANDE, navigateur: browser, cookies: cookiesDuMembre() });
    info.annotations.push({
      type: 'requêtes avant le premier pixel',
      description: `${mesure.requetes_avant_premier_pixel ?? '?'} (plafond 4) · FCP ${mesure.fcp_ms ?? '?'} ms · LCP ${mesure.lcp_ms ?? '?'} ms · ${mesure.octets_transferes ?? '?'} o`,
    });
    expect(mesure.http).toBe(200);
    expect(franchissementsReseau(mesure, budgets.reseau).filter((f) => f.statut === 'GATE').map((f) => f.texte)).toEqual([]);

    // La MÊME mesure sous le profil du § 8.3 (Fast 3G, `budgets.json`) : c'est là
    // que le CLS (gate 0,05) et le LCP (cible 2 200 ms) prennent leur sens — un
    // document qui arrive par morceaux ne doit rien déplacer.
    const enTroisG = await mesurePage({ url: FIL(), commande: COMMANDE, navigateur: browser, cookies: cookiesDuMembre(), profil: budgets.reseau.profil });
    info.annotations.push({
      type: 'fil du membre en Fast 3G',
      description: `req. avant le premier pixel ${enTroisG.requetes_avant_premier_pixel ?? '?'} · FCP ${enTroisG.fcp_ms ?? '?'} ms · LCP ${enTroisG.lcp_ms ?? '?'} ms · CLS ${enTroisG.cls ?? '?'} · ${enTroisG.octets_transferes ?? '?'} o`,
    });
    console.log(`[mesure] /chats/:cle Fast 3G — requêtes avant le premier pixel ${enTroisG.requetes_avant_premier_pixel} · FCP ${enTroisG.fcp_ms} ms · LCP ${enTroisG.lcp_ms} ms · CLS ${enTroisG.cls} · ${enTroisG.octets_transferes} o`);
    expect(enTroisG.http).toBe(200);
    expect(franchissementsReseau(enTroisG, budgets.reseau).filter((f) => f.statut === 'GATE').map((f) => f.texte)).toEqual([]);

    // L'ORDRE, lu dans la chronologie de la page elle-même : le premier pixel
    // d'abord, `participate` ensuite, `socket.io` en dernier — et rien d'autre
    // sous `/__v3/rt/`.
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    const chrono = await page.evaluate(() => ({
      premierPixel:
        performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint')?.startTime ?? null,
      ressources: performance
        .getEntriesByType('resource')
        .map((e) => ({ nom: e.name, debut: e.startTime })),
    }));
    const modules = chrono.ressources.filter((r) => r.nom.includes('/__v3/rt/'));
    expect(modules.map((m) => m.nom.replace(/^.*\/__v3\/rt\//, '').replace(/\.[0-9a-f]{16}\.js$/, ''))).toEqual([
      'participate',
      'socket.io',
    ]);
    expect(chrono.premierPixel).not.toBeNull();
    modules.forEach((m) => expect(m.debut).toBeGreaterThan(chrono.premierPixel ?? Number.POSITIVE_INFINITY));

    const html = await (await contexte.request.get(FIL())).text();
    expect(html).not.toMatch(/<script[^>]+src=/);
    await contexte.close();
  });
});

test.describe('en direct', () => {
  test('un message reçu apparaît sans rechargement, dans la langue du lecteur', async ({ browser }, info) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    await page.evaluate(() => {
      (window as unknown as { __temoin: number }).__temoin = 1;
    });

    const depart = Date.now();
    passerelle.socket.emets(
      CONVERSATION_DU_LECTEUR.id,
      'message:new',
      messageDIbrahim('m201', 'The room is booked.', [{ language: 'fr', content: 'La salle est réservée.' }]),
    );
    const ligne = page.locator('li[data-id="m201"]');
    await expect(ligne).toBeVisible({ timeout: 10_000 });
    info.annotations.push({
      type: 'message:new → peint',
      description: `${Date.now() - depart} ms (machine de test, bouchon local — mesuré, pas promis)`,
    });

    await expect(ligne.locator('.texte')).toHaveText('La salle est réservée.');
    expect(await ligne.locator('.texte').getAttribute('lang')).toBeNull();
    await expect(ligne.locator('details.original p')).toHaveAttribute('lang', 'en');
    await expect(ligne.locator('.langue .code')).toHaveText('en');
    // Le document n'a pas été rechargé : le témoin posé avant l'émission est toujours là.
    expect(await page.evaluate(() => (window as unknown as { __temoin?: number }).__temoin)).toBe(1);
    expect(page.url()).toBe(FIL());
    await contexte.close();
  });

  test('la traduction qui arrive fait changer la bulle de langue, lang compris', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'message:new', messageDIbrahim('m202', 'I confirm.'));
    const ligne = page.locator('li[data-id="m202"]');
    await expect(ligne.locator('.texte')).toHaveText('I confirm.');
    await expect(ligne.locator('.texte')).toHaveAttribute('lang', 'en');
    await expect(ligne.locator('.langue')).toBeHidden();

    // `message:translation`, la charge de `buildTranslationEvent.ts:70-97`.
    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'message:translation', {
      messageId: 'm202',
      translations: [
        {
          id: 't202',
          messageId: 'm202',
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          translatedContent: 'Je confirme.',
          translationModel: 'nllb',
          cacheKey: 'k',
          cached: false,
          confidenceScore: 0.9,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    await expect(ligne.locator('.texte')).toHaveText('Je confirme.');
    expect(await ligne.locator('.texte').getAttribute('lang')).toBeNull();
    await expect(ligne.locator('.langue .code')).toHaveText('en');
    await expect(ligne.locator('details.original p')).toHaveText('I confirm.');
    await contexte.close();
  });

  test('qui écrit se voit, puis s’efface ; une réaction et un accusé se peignent', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);

    // `TypingEvent` (`StatusHandler.ts:276-292`).
    const frappe = {
      userId: PAIR_ANGLOPHONE.id,
      username: 'ibrahim',
      displayName: PAIR_ANGLOPHONE.nom,
      conversationId: CONVERSATION_DU_LECTEUR.id,
    };
    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'typing:start', { ...frappe, isTyping: true });
    await expect(page.locator('#frappe')).toHaveText('Ibrahim écrit…');
    // « X écrit… » se VOIT dans le cas nominal — lecteur en bas — : entièrement dans
    // le cadre, au-dessus du composeur, jamais sous lui (mesuré avant : 12 px visibles
    // sur 22, le composeur collant le recouvrait).
    const cadre = page.viewportSize();
    const boiteDeFrappe = await page.locator('#frappe').boundingBox();
    const boiteDuComposeur = await page.locator('form.composeur').boundingBox();
    expect(cadre).not.toBeNull();
    expect(boiteDeFrappe).not.toBeNull();
    expect(boiteDuComposeur).not.toBeNull();
    expect(boiteDeFrappe?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((boiteDeFrappe?.y ?? 0) + (boiteDeFrappe?.height ?? 0)).toBeLessThanOrEqual(cadre?.height ?? 0);
    expect((boiteDeFrappe?.y ?? 0) + (boiteDeFrappe?.height ?? 0)).toBeLessThanOrEqual((boiteDuComposeur?.y ?? 0) + 0.5);
    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'typing:stop', { ...frappe, isTyping: false });
    await expect(page.locator('#frappe')).toBeHidden();

    // `ReactionUpdateEvent` (`reaction:added`).
    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'reaction:added', {
      messageId: 'm1',
      conversationId: CONVERSATION_DU_LECTEUR.id,
      participantId: 'p-amina',
      userId: 'u1',
      emoji: '🎉',
      action: 'added',
      aggregation: { emoji: '🎉', count: 3, participantIds: [] },
      timestamp: new Date().toISOString(),
    });
    await expect(page.locator('li[data-id="m1"] .reactions li').filter({ hasText: '🎉' })).toContainText('3');

    // `read-status:updated` — la frontière de lecture d'un pair couvre ma bulle.
    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'read-status:updated', {
      conversationId: CONVERSATION_DU_LECTEUR.id,
      participantId: 'p-ibrahim',
      userId: PAIR_ANGLOPHONE.id,
      type: 'read',
      updatedAt: new Date().toISOString(),
      summary: {},
    });
    await expect(page.locator('li[data-id="m4"] .accuse')).toHaveAttribute('data-accuse', 'lu');
    await contexte.close();
  });

  /**
   * `message:edited` — le noyau de `buildMessageEditedCore` (`messageEditedPayload.ts:
   * 103-116`), sans traduction : la passerelle retraduit après une édition et
   * `message:translation` suit. `message:deleted` — `{ messageId, conversationId }`
   * (`MessageHandler.ts:1190-1194`).
   */
  test('une édition change la bulle et la dit « modifié » ; sa retraduction suit ; un retrait la remplace par sa mention — sans rechargement', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    const debut = new Date(Date.now() - 60_000).toISOString();
    passerelle.socket.emets(
      CONVERSATION_DU_LECTEUR.id,
      'message:new',
      { ...messageDIbrahim('m203', 'Meet at 3 pm', [{ language: 'fr', content: 'Rendez-vous à 15 h' }]), createdAt: debut },
    );
    const ligne = page.locator('li[data-id="m203"]');
    await expect(ligne.locator('.texte')).toHaveText('Rendez-vous à 15 h');
    await expect(ligne.locator('.modifie')).toBeHidden();

    const edite = new Date().toISOString();
    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'message:edited', {
      id: 'm203',
      conversationId: CONVERSATION_DU_LECTEUR.id,
      senderId: PAIR_ANGLOPHONE.id,
      content: 'Meet at 4 pm',
      originalLanguage: 'en',
      messageType: 'text',
      createdAt: debut,
      updatedAt: edite,
      isEdited: true,
      editedAt: edite,
      sender: { id: 'p-ibrahim', displayName: PAIR_ANGLOPHONE.nom, userId: PAIR_ANGLOPHONE.id, type: 'user' },
    });
    await expect(ligne.locator('.texte')).toHaveText('Meet at 4 pm');
    await expect(ligne.locator('.texte')).toHaveAttribute('lang', 'en');
    await expect(ligne.locator('.modifie')).toBeVisible();
    await expect(ligne.locator('.langue')).toBeHidden();

    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'message:translation', {
      messageId: 'm203',
      translations: [{ id: 't203', messageId: 'm203', sourceLanguage: 'en', targetLanguage: 'fr', translatedContent: 'Rendez-vous à 16 h', translationModel: 'nllb', cacheKey: 'k', cached: false, confidenceScore: 0.9, createdAt: edite }],
    });
    await expect(ligne.locator('.texte')).toHaveText('Rendez-vous à 16 h');
    expect(await ligne.locator('.texte').getAttribute('lang')).toBeNull();
    await expect(ligne.locator('.modifie')).toBeVisible();

    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'message:deleted', { messageId: 'm203', conversationId: CONVERSATION_DU_LECTEUR.id });
    await expect(ligne).toHaveClass(/supprime/);
    await expect(ligne.locator('.texte')).toHaveText('Ce message a été supprimé');
    await expect(ligne.locator('details.original')).toBeHidden();
    expect(await ligne.locator('button.reagir').count()).toBe(0);
    // La ligne reste à sa place : rien ne saute, rien ne disparaît sous les yeux du lecteur.
    expect(await page.locator('li[data-id="m203"]').count()).toBe(1);
    await contexte.close();
  });

  /**
   * « N en ligne » suit `user:status` (`MeeshySocketIOManager.ts:2869`), que la
   * passerelle ne pousse qu'aux rooms des AMIS acceptés (`presence-audience.ts`,
   * directive 2026-08-25) — le membre du bouchon est l'ami des deux pairs. Le
   * compte ne bouge que pour un participant que le document a NOMMÉ : un
   * inconnu ne fabrique rien.
   */
  test('« N en ligne » suit user:status — pour un participant que la passerelle SERT, jamais pour un inconnu, et se tait à zéro', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    const enLigne = page.locator('.fil-tete .en-ligne');
    await expect(enLigne).toHaveText(/1 en ligne/);
    expect(await page.locator('main').getAttribute('data-participants')).toBe(`${PAIR_ANGLOPHONE.id},${PAIR_HISPANOPHONE.id}`);

    passerelle.socket.diffuseLaPresence(PAIR_HISPANOPHONE.id, true);
    await expect(enLigne).toHaveText(/2 en ligne/);
    passerelle.socket.diffuseLaPresence('u-inconnu', true);
    await page.waitForTimeout(DELAI_D_OBSERVATION_MS);
    await expect(enLigne).toHaveText(/2 en ligne/);
    passerelle.socket.diffuseLaPresence(PAIR_ANGLOPHONE.id, false);
    await expect(enLigne).toHaveText(/1 en ligne/);
    passerelle.socket.diffuseLaPresence(PAIR_HISPANOPHONE.id, false);
    await expect(enLigne).toBeHidden();
    await expect(page.locator('.fil-tete .sous')).toContainText(`${CONVERSATION_DU_LECTEUR.membres} participants`);
    await contexte.close();
  });

  /**
   * Un vocal se rend en LECTEUR (`preload="none"`) : rien ne se télécharge
   * avant un geste, et son poids comme sa durée sont ANNONCÉS. Sa transcription
   * arrive par `audio:transcription-ready` (`TranscriptionReadyEventData`,
   * `MeeshySocketIOManager.ts:2412`) et sa traduction par
   * `audio:translation-ready` (`:2580`) : le module RELIT ce seul message
   * (`GET …/messages?around=<id>&limit=1`, `messages-list.ts:346-401`), et la
   * transcription descend le Prisme — `lang` quand la langue servie n'est pas
   * celle du document.
   */
  test('un vocal reçu se rend sans rien télécharger ; sa transcription arrive par audio:transcription-ready et suit le Prisme', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    const octets = Buffer.from('un vocal de douze secondes');
    const piece = passerelle.deposeUnePiece({ nom: 'vocal.ogg', type: 'audio/ogg', octets, dureeMs: 12_000 });
    const attachment: Record<string, unknown> = attachmentServi(piece);
    const vocal = {
      ...chargeDeMessage({
        id: 'm801',
        conversationId: CONVERSATION_DU_LECTEUR.id,
        senderId: PAIR_ANGLOPHONE.id,
        content: '',
        originalLanguage: 'en',
        sender: { id: 'p-ibrahim', displayName: PAIR_ANGLOPHONE.nom, userId: PAIR_ANGLOPHONE.id },
        attachments: [attachment],
      }),
      senderParticipantId: 'p-ibrahim',
    };
    passerelle.ajouteUnMessage(vocal);
    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'message:new', vocal);

    const ligne = page.locator('li[data-id="m801"]');
    const lien = ligne.locator('a.fichier[data-genre="audio"]');
    await expect(lien).toBeVisible();
    await expect(lien).toHaveAttribute('href', new RegExp(`^${passerelle.base}/api/v1/attachments/file/`));
    await expect(ligne.locator('.pieces .poids')).toHaveText(`0:12 · ${octets.length} o`);
    await expect(ligne.locator('audio')).toHaveAttribute('preload', 'none');
    await expect(ligne.locator('.transcription')).toBeHidden();
    // Rien n'a été téléchargé : le fichier n'a pas été demandé.
    expect(passerelle.journal.filter((a) => a.chemin.includes('/attachments/file/'))).toEqual([]);

    attachment.transcription = { id: 'tr801', text: 'Hello from Lagos', language: 'en' };
    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'audio:transcription-ready', {
      messageId: 'm801',
      attachmentId: piece.id,
      conversationId: CONVERSATION_DU_LECTEUR.id,
      transcription: { id: 'tr801', text: 'Hello from Lagos', language: 'en' },
    });
    const transcription = ligne.locator('.transcription');
    await expect(transcription).toBeVisible();
    await expect(transcription).toContainText('Hello from Lagos');
    await expect(transcription).toHaveAttribute('lang', 'en');
    expect(passerelle.journal.some((a) => a.chemin.startsWith(`/api/v1/conversations/${CONVERSATION_DU_LECTEUR.id}/messages?around=m801`))).toBe(true);

    attachment.translations = { fr: { transcription: 'Bonjour depuis Lagos', targetLanguage: 'fr', url: '/api/v1/attachments/file/tr/fr.ogg' } };
    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'audio:translation-ready', {
      messageId: 'm801',
      attachmentId: piece.id,
      conversationId: CONVERSATION_DU_LECTEUR.id,
      language: 'fr',
      translatedAudio: { id: 'ta801', targetLanguage: 'fr', url: '/api/v1/attachments/file/tr/fr.ogg', transcription: 'Bonjour depuis Lagos', durationMs: 12_000, format: 'ogg', cloned: false, quality: 1, ttsModel: 'tts' },
    });
    await expect(transcription).toContainText('Bonjour depuis Lagos');
    expect(await transcription.getAttribute('lang')).toBeNull();
    await contexte.close();
  });
});

test.describe('le composeur', () => {
  test('optimiste puis confirmé ; Entrée envoie, Maj + Entrée passe à la ligne, le focus reste', async ({ browser }, info) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    const champ = page.locator('#champ-texte');
    const hauteurAvant = (await champ.boundingBox())?.height ?? 0;

    await champ.click();
    await page.keyboard.type('Bonjour');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('monde');
    expect(await champ.inputValue()).toBe('Bonjour\nmonde');
    expect(await page.locator('li.mien[data-cid]').count()).toBe(0);
    // Le champ grandit avec le texte (une à six lignes).
    expect((await champ.boundingBox())?.height ?? 0).toBeGreaterThan(hauteurAvant);
    // La frappe s'annonce.
    await expect.poll(() => passerelle.socket.recus.filter((e) => e.evenement === 'typing:start').length).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    const mienne = page.locator('li.mien[data-cid]');
    await expect(mienne).toHaveCount(1);
    await expect(mienne.locator('.texte')).toContainText('Bonjour');
    await expect(mienne).toHaveAttribute('data-id', /^m\d+$/, { timeout: 10_000 });
    await expect(mienne).not.toHaveClass(/envoi-attente/);
    expect(await champ.inputValue()).toBe('');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('champ-texte');

    const envoi = passerelle.socket.recus.find((e) => e.evenement === 'message:send');
    expect(envoi?.charge).toMatchObject({
      conversationId: CONVERSATION_DU_LECTEUR.id,
      content: 'Bonjour\nmonde',
      clientMessageId: expect.stringMatching(/^cid_/),
    });
    await expect.poll(() => passerelle.socket.recus.filter((e) => e.evenement === 'typing:stop').length).toBeGreaterThan(0);

    const envoyer = (await page.locator('button.envoyer').boundingBox())?.height ?? 0;
    info.annotations.push({ type: 'bouton d’envoi', description: `${envoyer} px de haut` });
    expect(envoyer).toBeGreaterThanOrEqual(44);
    await contexte.close();
  });

  /**
   * LE PLAFOND DE LA PASSERELLE EST ANNONCÉ ET TENU — `MESSAGE_LIMITS.MAX_MESSAGE_LENGTH`
   * (4 000, `config/message-limits.ts:13`), refusé par la route (`messages-send.ts:45`)
   * et par le socket (`validateMessageLength`). Sans JavaScript, `maxlength` ; avec, un
   * compteur dès 90 % ; et un texte que la passerelle refuse quand même (une valeur posée
   * hors de la frappe) REVIENT dans le champ avec sa raison — jamais une bulle en échec
   * dont « Réessayer » rejouerait le refus. Le bouchon porte la loi : il refuse 4 001.
   */
  test('4 000 caractères : maxlength sans JavaScript, compteur dès 90 %, et un refus rend le texte au champ', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    const champ = page.locator('#champ-texte');
    await expect(champ).toHaveAttribute('maxlength', '4000');
    await expect(page.locator('#compteur')).toBeHidden();

    await champ.fill('a'.repeat(3700));
    await expect(page.locator('#compteur')).toBeVisible();
    await expect(page.locator('#compteur')).toHaveText('3700 / 4000');

    // Une valeur posée hors de la frappe (script) franchit `maxlength` : la passerelle refuse, le texte reste.
    passerelle.oublie();
    await champ.evaluate((noeud, texte) => {
      (noeud as HTMLTextAreaElement).value = texte;
      noeud.dispatchEvent(new Event('input', { bubbles: true }));
    }, 'b'.repeat(4001));
    await page.keyboard.press('Enter');
    await expect(page.locator('#refus-du-composeur')).toBeVisible();
    await expect(page.locator('#refus-du-composeur')).toContainText('4001');
    expect(await champ.inputValue()).toBe('b'.repeat(4001));
    expect(await page.locator('li.mien.envoi-echec').count()).toBe(0);
    // Rien n'est parti : le module tient la loi avant la passerelle — et la passerelle la tient aussi.
    expect(passerelle.socket.recus.filter((e) => e.evenement === 'message:send')).toHaveLength(0);
    expect(passerelle.journal.filter((a) => a.methode === 'POST' && a.chemin.includes('/messages'))).toHaveLength(0);
    await contexte.close();
  });

  test('aucune cible sous 44 px', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    for (const selecteur of ['a.retour', 'button.envoyer', '#champ-texte', 'details.original summary']) {
      const boite = await page.locator(selecteur).first().boundingBox();
      expect(boite?.height ?? 0, selecteur).toBeGreaterThanOrEqual(44);
      expect(boite?.width ?? 0, selecteur).toBeGreaterThanOrEqual(44);
    }
    await contexte.close();
  });
});

test.describe('§ 8.5 — un onglet caché ne coûte rien', () => {
  test('hidden ⇒ zéro requête, le socket se ferme ; visible ⇒ il revient, et ce qui s’est dit pendant l’absence arrive par UN /sync', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    const journal = enregistre(contexte);

    const debut = Date.now();
    await occulte(page);
    await expect.poll(() => passerelle.socket.connectes()).toBe(0);
    // Un pair écrit pendant l'absence : le socket, coupé, ne le rejoue pas —
    // seuls la liste et `/sync` le servent (§ 7, « retour d'arrière-plan »).
    passerelle.ajouteUnMessage({ ...messageDIbrahim('m601', 'Dit pendant votre absence.'), senderParticipantId: 'p-ibrahim' });
    await page.waitForTimeout(DELAI_D_OBSERVATION_MS);
    const fin = Date.now();
    await revele(page);

    const fenetres = [{ debut, fin }];
    const pendant = requetesPendantOngletCache({ journal: journal(), fenetres });
    expect(pendant, rapporteRequetesInterdites('fil du membre, onglet caché', pendant, fenetres)).toEqual([]);
    await expect.poll(() => passerelle.socket.connectes()).toBe(1);
    await attendLeTempsReel(page);
    // Même une absence COURTE rattrape : le message apparaît, par un seul `/sync`, sans rechargement.
    await expect(page.locator('li[data-id="m601"] .texte')).toHaveText('Dit pendant votre absence.', { timeout: 10_000 });
    expect(journal().filter((e) => e.emiseA >= fin && e.url.includes('/api/v1/sync'))).toHaveLength(1);
    // Un membre ne bat pas : rien de mutant ne part au retour non plus.
    expect(journal().filter(estMutante)).toEqual([]);
    await contexte.close();
  });
});

test.describe('la room', () => {
  /**
   * L'authentification de la passerelle est ASYNCHRONE : `MeeshySocketIOManager.ts:
   * 1740` lance `handleTokenAuthentication(socket)` sans l'attendre, et un
   * `conversation:join` émis sur `connect` arrive avant que `connectedUsers` ne
   * connaisse le socket — `conversation:join-error { reason: 'not_authenticated' }`
   * (`ConversationHandler.ts:129-134`). Le bouchon rejoue cette course
   * (`DELAI_D_AUTHENTIFICATION_MS`) et COMPTE ces refus : un module qui rejoint sur
   * `connect` en produit un à chaque ouverture, et n'entre jamais dans la room.
   */
  test('se rejoint APRÈS `authenticated` — un seul conversation:join, jamais refusé not_authenticated', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    await expect.poll(() => passerelle.socket.recus.filter((e) => e.evenement === 'conversation:join').length).toBe(1);
    expect(passerelle.socket.jonctionsRefusees()).toBe(0);
    expect(passerelle.socket.recus.find((e) => e.evenement === 'conversation:join')?.charge).toEqual({ conversationId: CONVERSATION_DU_LECTEUR.id });
    await contexte.close();
  });

  /**
   * `hasGap` n'existe que si le client ANNONCE `seq` (`routes/sync/index.ts:279`,
   * `seq < checkpointSeq - GAP_THRESHOLD`) : le module renvoie le `checkpointSeq`
   * du delta précédent, et le bouchon calcule le trou par la MÊME loi — un membre
   * dont le curseur de compte a été creusé entre deux rattrapages voit le
   * séparateur. Deux coupures, parce que le premier tour n'a aucun curseur à
   * annoncer et ne peut donc rien se voir signaler.
   */
  test('un trou creusé par la passerelle peint son séparateur — GET /sync annonce le dernier seq connu', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    await installeLHorloge(contexte);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    await figeLHorloge(contexte);

    const seqAnnonces = (): readonly (string | null)[] =>
      passerelle.journal
        .filter((a) => a.chemin.startsWith('/api/v1/sync'))
        .map((a) => new URL(a.chemin, 'http://bouchon').searchParams.get('seq'));
    const coupe = async (): Promise<void> => {
      await contexte.setOffline(true);
      await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'hors-ligne');
      await avance(contexte, 5 * 60_000);
      await contexte.setOffline(false);
      await attendLeTempsReel(page);
    };

    await coupe();
    await expect.poll(() => seqAnnonces().length).toBe(1);
    // Premier tour : aucun curseur connu, rien n'est annoncé — et rien ne peut être mesuré.
    expect(seqAnnonces()[0]).toBeNull();
    expect(await page.locator('li.trou').count()).toBe(0);

    passerelle.creuseUnTrou();
    await coupe();
    await expect.poll(() => seqAnnonces().length).toBe(2);
    // Second tour : le `checkpointSeq` reçu est renvoyé en `seq`, la passerelle mesure le trou, le fil le dit.
    expect(seqAnnonces()[1]).toBe('0');
    await expect(page.locator('li.trou a[href]')).toBeVisible({ timeout: 10_000 });
    await contexte.close();
  });
});

test.describe('ce qui est affiché est dit — POST /conversations/:id/receipts', () => {
  test('à l’ouverture par le serveur, après un message reçu par le module, jamais depuis un onglet caché', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    const accuses = (): readonly { readonly type: string; readonly messageIds: readonly string[] }[] =>
      passerelle.journal
        .filter((a) => a.methode === 'POST' && a.chemin.endsWith('/receipts'))
        .map((a) => JSON.parse(a.corps) as { type: string; messageIds: string[] });

    // Le SERVEUR a accusé la page servie (`receipts.ts:946`) — toutes les lignes d'autrui, dans l'ordre d'écriture, jamais les miennes.
    const dAutrui = [...passerelle.messages()]
      .filter((m) => m.senderId !== UTILISATEUR_DU_MEMBRE)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .map((m) => m.id);
    await expect.poll(() => accuses().length).toBe(1);
    expect(accuses()[0]).toEqual({ type: 'read', messageIds: dAutrui });
    expect(dAutrui).toEqual(expect.arrayContaining(['m1', 'm2', 'm3']));
    expect(dAutrui).not.toContain('m4');

    // Un message reçu et PEINT est dit, groupé une seconde.
    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'message:new', messageDIbrahim('m501', 'Read me.'));
    await expect(page.locator('li[data-id="m501"]')).toBeVisible();
    await expect.poll(() => accuses().length, { timeout: 5_000 }).toBe(2);
    expect(accuses()[1]).toEqual({ type: 'read', messageIds: ['m501'] });

    // Ce qui arrive juste avant l'occultation attend le retour : un onglet caché ne dit rien (§ 8.5).
    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'message:new', messageDIbrahim('m502', 'Hidden.'));
    await expect(page.locator('li[data-id="m502"]')).toBeVisible();
    await occulte(page);
    await page.waitForTimeout(1_500);
    expect(accuses()).toHaveLength(2);
    await revele(page);
    await expect.poll(() => accuses().length, { timeout: 5_000 }).toBe(3);
    expect(accuses()[2]).toEqual({ type: 'read', messageIds: ['m502'] });
    await contexte.close();
  });
});

test.describe('les pièces jointes', () => {
  /**
   * `POST /attachments/upload` (`upload.ts:55-59`, `authOptional`) puis le message
   * avec ses `attachmentIds` (`messages-send.ts:76`). `fileUrl` est servi RELATIF
   * (`UploadProcessor.getAttachmentPath`) : la v3 le résout sur l'origine publique
   * de la passerelle (`lib/api/fil.ts` › `urlDePiece`), et ce témoin SUIT le lien
   * jusqu'au 200 du bouchon — un `href` résolu contre le document serait inerte.
   */
  test('une pièce choisie est annoncée avec son poids, téléversée, servie à une adresse ABSOLUE sur la passerelle — et le lien mène au fichier', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    const octets = Buffer.from('bonjour depuis un fichier joint');

    await page.locator('#champ-piece').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: octets });
    const annonce = page.locator('#piece-choisie');
    await expect(annonce).toBeVisible();
    await expect(annonce).toContainText('note.txt');
    await expect(annonce).toContainText(`${octets.length} o`);
    // Annoncée, pas partie : rien ne se téléverse avant l'envoi.
    expect(passerelle.journal.filter((a) => a.chemin.includes('/attachments'))).toEqual([]);

    await page.locator('#champ-texte').fill('Voici la note');
    await page.keyboard.press('Enter');
    const mienne = page.locator('li.mien[data-cid]');
    await expect(mienne.locator('.pieces li .nom-de-piece')).toHaveText('note.txt');
    await expect(mienne).toHaveAttribute('data-id', /^m\d+$/, { timeout: 10_000 });

    const lien = mienne.locator('a.fichier');
    await expect(lien).toHaveAttribute('href', new RegExp(`^${passerelle.base}/api/v1/attachments/file/`), { timeout: 10_000 });
    const href = await lien.getAttribute('href');
    const servi = await contexte.request.get(href ?? '');
    expect(servi.status()).toBe(200);
    expect((await servi.body()).equals(octets)).toBe(true);
    await expect(mienne.locator('.pieces .poids')).toContainText(`${octets.length} o`);

    const posts = passerelle.journal.filter((a) => a.methode === 'POST').map((a) => a.chemin);
    expect(posts.indexOf('/api/v1/attachments/upload')).toBeGreaterThanOrEqual(0);
    expect(posts.indexOf(`/api/v1/conversations/${CONVERSATION_DU_LECTEUR.id}/messages`)).toBeGreaterThan(posts.indexOf('/api/v1/attachments/upload'));
    const envoi = passerelle.journal.find((a) => a.methode === 'POST' && a.chemin.endsWith('/messages'));
    expect(JSON.parse(envoi?.corps ?? '{}')).toMatchObject({ content: 'Voici la note', attachmentIds: [expect.stringMatching(/^a\d+$/)] });
    await contexte.close();
  });
});

test.describe('les réactions', () => {
  /**
   * `reaction:add` / `reaction:remove` `{ messageId, emoji }` (`ReactionHandler.ts`),
   * exposés au membre comme à l'invité ; l'agrégat exact revient par
   * `reaction:added` / `reaction:removed`. Sans JavaScript, la même pastille est un
   * `<form method="post">` (`chat-lien.test.ts`).
   */
  test('réagir d’un tap — la palette, reaction:add sur le socket, la pastille devient la mienne ; un second tap la retire', async ({ browser }) => {
    const contexte = await contexteDuMembre(browser);
    const page = await ouvreLeFil(contexte);
    await attendLeTempsReel(page);
    const m1 = page.locator('li[data-id="m1"]');
    expect(await m1.locator('form.reagir-par').count()).toBe(0);

    await m1.locator('button.reagir').click();
    const palette = page.locator('dialog.palette[open]');
    await expect(palette).toBeVisible();
    await palette.locator('button.emoji[value="❤️"]').click();
    await expect(palette).toBeHidden();

    const pastille = m1.locator('.reactions li[data-emoji="❤️"] button.reaction');
    await expect(pastille).toHaveAttribute('aria-pressed', 'true');
    await expect(pastille.locator('.nombre')).toHaveText('1');
    await expect.poll(() => passerelle.socket.recus.filter((e) => e.evenement === 'reaction:add').length).toBe(1);
    expect(passerelle.socket.recus.find((e) => e.evenement === 'reaction:add')?.charge).toEqual({ messageId: 'm1', emoji: '❤️' });
    // La pastille peinte est le même FORMULAIRE que la pastille servie.
    expect(await m1.locator('form.reagir-par input[name="reaction"]').inputValue()).toBe('❤️');

    await pastille.click();
    await expect(m1.locator('.reactions li[data-emoji="❤️"]')).toHaveCount(0);
    await expect.poll(() => passerelle.socket.recus.filter((e) => e.evenement === 'reaction:remove').length).toBe(1);

    // Une pastille SERVIE (les deux pouces de m3, jamais le mien) : mon tap l'incrémente et la fait mienne.
    const pouce = page.locator('li[data-id="m3"] .reactions li[data-emoji="👍"] button.reaction');
    await expect(pouce.locator('.nombre')).toHaveText('2');
    await pouce.click();
    await expect(pouce).toHaveAttribute('aria-pressed', 'true');
    await expect(pouce.locator('.nombre')).toHaveText('3');
    // Aucune cible sous 44 px — pastille et bouton « Réagir » compris.
    for (const cible of [pouce, m1.locator('button.reagir')]) {
      const boite = await cible.boundingBox();
      expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(boite?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
    await contexte.close();
  });
});

/**
 * UN FIL LONG — plus de messages que le cadre n'en montre — sur SA propre chaîne,
 * pour ne pas garnir celle des autres témoins. Le document arrive sur le DERNIER
 * message par sa mise en page (`column-reverse`), sans script ; après un envoi,
 * le 303 vise `#m-<id>` ; avec le module, rien ne saute (mesuré avant : premier
 * pixel à 732 ms et saut de 2 315 px à 1 855 ms en Fast 3G).
 */
test.describe('un fil long — le dernier bout est le bon, sans script et sans saut', () => {
  let longue: PasserelleDeBouchon;
  let serveur: ServeurV3;
  const MESSAGES_AJOUTES = 40;

  test.beforeAll(async () => {
    longue = await passerelleDeBouchon();
    for (let rang = 0; rang < MESSAGES_AJOUTES; rang += 1) {
      longue.ajouteUnMessage({
        ...chargeDeMessage({
          id: `mlong${rang}`,
          conversationId: CONVERSATION_DU_LECTEUR.id,
          senderId: PAIR_ANGLOPHONE.id,
          content: `Ligne ${rang} d’un long fil, assez longue pour occuper de la hauteur à l’écran.`,
          originalLanguage: 'fr',
          sender: { id: 'p-ibrahim', displayName: PAIR_ANGLOPHONE.nom, userId: PAIR_ANGLOPHONE.id },
          createdAt: new Date(Date.now() - (MESSAGES_AJOUTES - rang) * 60_000 - 20 * 60_000).toISOString(),
        }),
        senderParticipantId: 'p-ibrahim',
      });
    }
    serveur = await serveurDeLaV3(longue.base);
  });

  test.afterAll(async () => {
    await serveur?.ferme();
    await longue?.ferme();
  });

  const adresse = (): string => `${serveur.base}/chats/${CONVERSATION_DU_LECTEUR.id}`;
  const contexteLong = async (navigateur: Browser, options: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> => {
    const contexte = await navigateur.newContext(options);
    await contexte.addCookies([
      { name: COOKIE_DE_JETON, value: JETON_DU_MEMBRE, url: serveur.base },
      { name: COOKIE_DE_SESSION, value: 'ouverte', url: serveur.base },
    ]);
    return contexte;
  };
  const dansLeCadre = (boite: { readonly y: number; readonly height: number } | null, hauteur: number): boolean =>
    boite !== null && boite.y >= 0 && boite.y + boite.height <= hauteur;

  test('sans JavaScript — la dernière ligne est dans le cadre à l’arrivée, les plus anciennes au-dessus ; après un envoi, la mienne aussi', async ({ browser }) => {
    const contexte = await contexteLong(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(adresse(), { waitUntil: 'load' });
    const hauteur = page.viewportSize()?.height ?? 0;

    // Une page de 40 sur 44 : la suite est au-dessus, derrière « Messages plus anciens ».
    await expect(page.locator('li.ligne')).toHaveCount(40);
    await expect(page.locator('a.plus-ancien')).toHaveCount(1);
    // Le DOM va du plus récent au plus ancien : la PREMIÈRE ligne est la dernière écrite.
    expect(dansLeCadre(await page.locator('li.ligne').first().boundingBox(), hauteur)).toBe(true);
    expect((await page.locator('li.ligne').last().boundingBox())?.y ?? 0).toBeLessThan(0);
    expect((await page.locator('a.plus-ancien').boundingBox())?.y ?? 0).toBeLessThan(0);

    await page.locator('#champ-texte').fill('Envoyé sans script, lu en bas');
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'GET' && r.url() === adresse()),
      page.locator('button.envoyer').click(),
    ]);
    await page.waitForLoadState('load');
    expect(page.url()).toMatch(/#m-m\d+$/);
    const mienne = page.locator('li.mien').first();
    await expect(mienne.locator('.texte')).toHaveText('Envoyé sans script, lu en bas');
    expect(dansLeCadre(await mienne.boundingBox(), hauteur)).toBe(true);
    await contexte.close();
  });

  test('avec JavaScript — le défilement est déjà en bas et ne bouge pas quand le module arrive', async ({ browser }) => {
    const contexte = await contexteLong(browser);
    const page = await contexte.newPage();
    await page.goto(adresse(), { waitUntil: 'load' });
    const hauteur = page.viewportSize()?.height ?? 0;
    const position = (): Promise<{ readonly zone: number; readonly page: number }> =>
      page.evaluate(() => ({
        zone: Math.abs(document.querySelector('.messages')?.scrollTop ?? -1),
        page: window.scrollY,
      }));

    const avant = await position();
    expect(avant).toEqual({ zone: 0, page: 0 });
    expect(dansLeCadre(await page.locator('li.ligne').first().boundingBox(), hauteur)).toBe(true);
    await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'connecte', { timeout: 15_000 });
    await page.waitForTimeout(DELAI_D_OBSERVATION_MS);
    expect(await position()).toEqual({ zone: 0, page: 0 });
    expect(dansLeCadre(await page.locator('li.ligne').first().boundingBox(), hauteur)).toBe(true);
    await contexte.close();
  });

  /**
   * Une page d'HISTORIQUE n'est pas une arrivée : les lignes que le module
   * charge par le haut ne portent jamais la teinte « neuve », réservée à ce qui
   * ARRIVE (mesuré avant : vingt-quatre lignes surlignées jusqu'au rechargement).
   */
  test('avec JavaScript — les messages plus anciens chargés par le module ne sont pas teintés « neuve »', async ({ browser }) => {
    const contexte = await contexteLong(browser);
    const page = await contexte.newPage();
    await page.goto(adresse(), { waitUntil: 'load' });
    await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'connecte', { timeout: 15_000 });
    await expect(page.locator('li.ligne')).toHaveCount(40);

    await page.locator('a.plus-ancien').evaluate((lien) => (lien as HTMLElement).click());
    // Tout le fil, tel que la passerelle le tient (les témoins voisins y ont pu écrire) — jamais un chiffre figé.
    await expect(page.locator('li.ligne')).toHaveCount(longue.messages().length);
    expect(await page.locator('li.ligne.neuve').count()).toBe(0);
    await page.waitForTimeout(DELAI_D_OBSERVATION_MS);
    expect(await page.locator('li.ligne.neuve').count()).toBe(0);
    await contexte.close();
  });
});

test.describe('les rendus que le rapport regarde', () => {
  test('captures 390×844 — clair et sombre', async ({ browser }, info) => {
    mkdirSync(DOSSIER_DES_RENDUS, { recursive: true });
    for (const schema of ['light', 'dark'] as const) {
      const contexte = await contexteDuMembre(browser, { colorScheme: schema });
      const page = await ouvreLeFil(contexte);
      await attendLeTempsReel(page);
      const chemin = join(DOSSIER_DES_RENDUS, `thread-${schema}.png`);
      await page.screenshot({ path: chemin });
      info.annotations.push({ type: `rendu ${schema}`, description: chemin });
      await contexte.close();
    }
  });
});
