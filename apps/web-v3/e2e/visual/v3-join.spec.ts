import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';

import { JETON_DU_MEMBRE } from './lib/bouchon-socket';
import { COLONNES_DE_THEME, rapporteViolations, violationsBloquantes } from './lib/verdict-axe';
import { ACTION_PRIMAIRE, ACTION_SECONDAIRE, ciblesMesurees, ciblesTropPetites, hauteursDe, LARGEURS, TARGET_MIN } from './lib/cibles';
import { NOM_DU_COOKIE, porteInvitee } from './lib/porte-invitee';
import {
  chargeMesureReseau,
  CONVERSATION_DU_LECTEUR,
  IDENTIFIANT_DU_LIEN_PARTAGE,
  INVITE,
  LIEN_DU_FIL,
  lienParDefaut,
  passerelleDeBouchon,
  PSEUDO_DEJA_PRIS,
  PSEUDO_SUGGERE,
  RACINE_V3,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';
import { THEME_STORAGE_KEY } from '../../app/theme-script';

/**
 * L'ÉTAT CHOIX DE `/chat/:lien` — la vue `join`, issue #4522, jouée sur la
 * chaîne réelle : le serveur de la v3 tel que `next build` l'a émis et la
 * passerelle de bouchon (`lib/serveurs.ts`), qui MIME la porte canonique route
 * par route et LOI par loi (leçon 422). Tout ce qui suit se joue SANS
 * JAVASCRIPT (`javaScriptEnabled: false`) : c'est le chemin qui marche partout,
 * et le temps réel n'a rien à faire ici — l'état CHOIX est une lecture pure.
 *
 * Ce que le critère de fin de `join` demande, ligne par ligne : le formulaire
 * se soumet et la place est créée (201 OBSERVÉ sur la porte canonique) ; la
 * langue est pré-remplie depuis `Accept-Language` ; l'accordéon des droits est
 * un `<details>/<summary>` natif atteignable au clavier ; chaque refus que la
 * porte émet est peint DANS la modale, un test par refus — et le refus n'est
 * pas dicté au bouchon, il naît de l'ÉTAT du lien (`passerelle.lien`), comme
 * en production ; 0 violation axe serious/critical dans les quatre colonnes de
 * thème ; 0 cible sous 44 px à 360 et 390 px, action primaire à 56, secondaire
 * à 52 ; un lecteur connecté n'y voit jamais la modale.
 */

const DOSSIER_DES_RENDUS = process.env.RENDUS_DIR ?? join(RACINE_V3, 'test-results', 'rendus');
/** Un segment que la passerelle ne connaît pas — l'aperçu rend 404 (`routes/anonymous.ts:592-597`). */
const LIEN_INCONNU = 'inconnu-de-tous';
const COMMANDE = 'bunx playwright test e2e/visual/v3-join.spec.ts';
const budgets = JSON.parse(readFileSync(join(RACINE_V3, 'budgets.json'), 'utf8'));

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const porte = porteInvitee({ passerelle: () => passerelle, v3: () => v3 });

const sansJavaScript = (navigateur: Browser, options: Parameters<Browser['newContext']>[0] = {}): Promise<BrowserContext> =>
  navigateur.newContext({ javaScriptEnabled: false, ...options });

/** Le dernier `POST /links/:key/members` reçu, avec le statut RENDU. */
const derniereJonction = (): { readonly chemin: string; readonly statut: number | null } | undefined =>
  [...passerelle.journal].reverse().find((appel) => appel.methode === 'POST' && appel.chemin.endsWith('/members'));

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon({ inconnus: [LIEN_INCONNU] });
  v3 = await serveurDeLaV3(passerelle.base);
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

test.beforeEach(() => {
  Object.assign(passerelle.lien, lienParDefaut());
  passerelle.placesActives.delete(INVITE.session);
  // Le pseudo POSTÉ par un témoin précédent est ce que la reconnaissance nomme (`currentUser`) : chaque témoin repart de la place par défaut.
  passerelle.invite.nom = INVITE.nom;
  passerelle.place.reinitialise();
  passerelle.oublie();
});

test.describe('la modale, sans JavaScript', () => {
  test('rend la modale sur le cadre inerte, avec la langue du navigateur et AUCUN message demandé', async ({ browser }) => {
    const contexte = await sansJavaScript(browser, { locale: 'es-ES' });
    const page = await contexte.newPage();
    const reponse = await page.goto(porte.adresse);

    expect(reponse?.status()).toBe(200);
    await expect(page.locator('dialog[open]')).toBeVisible();
    await expect(page.locator('main#main-content')).toHaveAttribute('inert', '');
    await expect(page.locator('dialog h2')).toHaveText('Équipe Lagos');
    await expect(page.locator('#langue')).toHaveValue('es');
    expect(await page.locator('li.ligne').count()).toBe(0);
    expect(porte.cheminsRecus()).toEqual([`GET /api/v1/anonymous/link/${IDENTIFIANT_DU_LIEN_PARTAGE}`]);
    await contexte.close();
  });

  test('offre un accordéon des droits natif, atteignable au clavier', async ({ browser }) => {
    const contexte = await sansJavaScript(browser);
    const page = await contexte.newPage();
    await page.goto(porte.adresse);

    const details = page.locator('dialog details.droits');
    await expect(details).toHaveCount(1);
    await expect(details).not.toHaveAttribute('open', '');

    await page.locator('dialog details.droits summary').focus();
    await page.keyboard.press('Space');
    await expect(details).toHaveAttribute('open', '');
    await expect(details.locator('li')).toHaveCount(5);

    await page.keyboard.press('Enter');
    await expect(details).not.toHaveAttribute('open', '');
    await contexte.close();
  });

  test('crée la place — 201 OBSERVÉ sur la porte canonique — pose le cookie porté au lien et ouvre les droits', async ({ browser }) => {
    const contexte = await sansJavaScript(browser);
    const page = await contexte.newPage();
    await page.goto(porte.adresse);

    await page.locator('#pseudo').fill('Tolu');
    await Promise.all([page.waitForURL(`${porte.adresse}?bienvenue=1`), page.locator('dialog form .action.primaire').click()]);

    expect(derniereJonction()).toMatchObject({ chemin: `/api/v1/links/${LIEN_DU_FIL}/members`, statut: 201 });
    expect(await page.locator('dialog').count()).toBe(0);
    await expect(page.locator('details.bandeau.bien[open]')).toBeVisible();
    await expect(page.locator('form.composeur')).toBeVisible();
    expect(await porte.cookieDeLaPlace(contexte)).toMatchObject({ value: INVITE.session, path: '/chat' });
    expect(porte.cheminsRecus().some((c) => c.includes('/anonymous/join') || c.includes('/conversations/join'))).toBe(false);
    await contexte.close();
  });

  test('demande le courriel et la date de naissance quand le lien les exige, et les envoie', async ({ browser }) => {
    passerelle.lien.requireEmail = true;
    passerelle.lien.requireBirthday = true;
    const contexte = await sansJavaScript(browser);
    const page = await contexte.newPage();
    await page.goto(porte.adresse);

    await expect(page.locator('#courriel')).toHaveAttribute('type', 'email');
    await expect(page.locator('#naissance')).toHaveAttribute('type', 'date');
    await page.locator('#pseudo').fill('Tolu');
    await page.locator('#courriel').fill('tolu@example.com');
    await page.locator('#naissance').fill('1990-05-12');
    await Promise.all([page.waitForURL(`${porte.adresse}?bienvenue=1`), page.locator('dialog form .action.primaire').click()]);

    const jonction = derniereJonction();
    expect(jonction?.statut).toBe(201);
    const corps = JSON.parse([...passerelle.journal].reverse().find((a) => a.chemin.endsWith('/members'))?.corps ?? '{}') as Record<string, unknown>;
    expect(corps).toMatchObject({ nickname: 'Tolu', email: 'tolu@example.com', birthday: '1990-05-12T00:00:00.000Z' });
    await contexte.close();
  });
});

/**
 * LES REFUS, UN TEST PAR REFUS — chacun produit par l'ÉTAT du lien, jamais
 * dicté au bouchon. Un refus de SAISIE (400, 409 pseudo pris) garde le
 * formulaire et nomme son champ ; un refus DU LIEN (403, 409 `LINK_EXHAUSTED`,
 * 410) retire le formulaire et garde « Se connecter » / « Créer un compte » ;
 * un lien clos AVANT tout choix (410 à l'aperçu) fait de même dès l'arrivée.
 */
test.describe('les refus, peints dans la modale', () => {
  const soumets = async (navigateur: Browser, pseudo = 'Tolu') => {
    const contexte = await sansJavaScript(navigateur);
    const page = await contexte.newPage();
    await page.goto(porte.adresse);
    await page.locator('#pseudo').fill(pseudo);
    await page.locator('dialog form .action.primaire').click();
    await page.waitForLoadState('load');
    return { contexte, page };
  };

  test('409 USERNAME_TAKEN_IN_CONVERSATION — le pseudo LIBRE pré-rempli, le champ en refus, le formulaire gardé', async ({ browser }) => {
    const { contexte, page } = await soumets(browser, PSEUDO_DEJA_PRIS);
    expect(derniereJonction()?.statut).toBe(409);
    await expect(page.locator('dialog[open] #pseudo')).toHaveValue(PSEUDO_SUGGERE);
    await expect(page.locator('dialog[open] #pseudo')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('dialog[open] #pseudo-refus')).toBeVisible();
    expect(await porte.cookieDeLaPlace(contexte)).toBeUndefined();
    await contexte.close();
  });

  test('400 — un champ exigé manque : la phrase de la passerelle sur SON champ, la saisie gardée', async ({ browser }) => {
    passerelle.lien.requireEmail = true;
    // Sans JavaScript, `required` retient la soumission dans le navigateur : la réponse de la
    // porte se lit en POSTANT le formulaire tel quel, comme un agent qui ne valide rien.
    const contexte = await sansJavaScript(browser);
    const reponse = await contexte.request.post(porte.adresse, { form: { pseudo: 'Tolu', langue: 'fr', courriel: '' } });
    expect(reponse.status()).toBe(400);
    const html = await reponse.text();
    // Le lien exige un courriel : la feuille réserve la hauteur de sa variante ÉTENDUE (`choix-feuille.ts`).
    expect(html).toContain('<dialog class="feuille etendue" open');
    expect(html).toContain('id="courriel-refus" role="alert"');
    expect(html).toContain("L&#39;email est obligatoire pour rejoindre cette conversation");
    expect(html).toContain('value="Tolu"');
    expect(derniereJonction()?.statut).toBe(400);
    await contexte.close();
  });

  test('403 ACCOUNT_REQUIRED — dès l’aperçu : aucun formulaire, seulement le compte', async ({ browser }) => {
    passerelle.lien.requireAccount = true;
    const contexte = await sansJavaScript(browser);
    const page = await contexte.newPage();
    const reponse = await page.goto(porte.adresse);
    expect(reponse?.status()).toBe(200);
    await expect(page.locator('dialog .bandeau.refus')).toBeVisible();
    expect(await page.locator('dialog form').count()).toBe(0);
    await expect(page.locator(`a[href="/login?returnUrl=%2Fchat%2F${IDENTIFIANT_DU_LIEN_PARTAGE}"]`)).toBeVisible();
    await contexte.close();
  });

  test('403 LANGUAGE_NOT_ALLOWED — la langue choisie n’est pas admise', async ({ browser }) => {
    passerelle.lien.allowedLanguages = ['yo', 'en'];
    const contexte = await sansJavaScript(browser, { locale: 'fr-FR' });
    const page = await contexte.newPage();
    await page.goto(porte.adresse);
    // La liste offerte est celle du lien, et la langue du visiteur n'y figure pas : la première autorisée est proposée.
    await expect(page.locator('#langue option')).toHaveCount(2);
    await expect(page.locator('#langue')).toHaveValue('yo');
    // La porte juge la langue POSTÉE ; on lui en pose une qu'elle refuse.
    passerelle.lien.allowedLanguages = ['en'];
    await page.locator('#pseudo').fill('Tolu');
    await page.locator('dialog form .action.primaire').click();
    await page.waitForLoadState('load');
    expect(derniereJonction()?.statut).toBe(403);
    await expect(page.locator('dialog .bandeau.refus')).toContainText('Cette langue n’est pas admise sur ce lien.');
    expect(await page.locator('dialog form').count()).toBe(0);
    await contexte.close();
  });

  test('403 REGION_NOT_ALLOWED — l’adresse du visiteur hors des plages du lien, relayée par la v3', async ({ browser }) => {
    passerelle.lien.allowedIpRanges = ['10.0.0.0/8'];
    const contexte = await sansJavaScript(browser, { extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.9' } });
    const page = await contexte.newPage();
    await page.goto(porte.adresse);
    await page.locator('#pseudo').fill('Tolu');
    await page.locator('dialog form .action.primaire').click();
    await page.waitForLoadState('load');
    expect(derniereJonction()?.statut).toBe(403);
    await expect(page.locator('dialog .bandeau.refus')).toContainText('Ce lien n’est pas ouvert depuis votre réseau.');
    expect(await page.locator('dialog form').count()).toBe(0);
    await contexte.close();
  });

  test('409 LINK_EXHAUSTED — le plafond de simultanéité atteint : un refus DU LIEN, pas une saisie à corriger', async ({ browser }) => {
    passerelle.lien.maxConcurrentUsers = 1;
    passerelle.lien.currentConcurrentUsers = 1;
    const { contexte, page } = await soumets(browser);
    expect(derniereJonction()?.statut).toBe(409);
    await expect(page.locator('dialog .bandeau.refus')).toContainText('Ce lien a atteint son nombre d’entrées.');
    expect(await page.locator('dialog form').count()).toBe(0);
    expect(await page.locator('#pseudo').count()).toBe(0);
    await contexte.close();
  });

  test('410 CONVERSATION_CLOSED — l’aperçu sert encore, la porte refuse', async ({ browser }) => {
    passerelle.lien.conversationClose = true;
    const { contexte, page } = await soumets(browser);
    expect(derniereJonction()?.statut).toBe(410);
    await expect(page.locator('dialog .bandeau.refus')).toContainText('Cette conversation est terminée.');
    expect(await page.locator('dialog form').count()).toBe(0);
    await contexte.close();
  });

  test.describe('un lien clos AVANT tout choix — 410 à l’aperçu', () => {
    for (const [nom, regle, phrase] of [
      ['LINK_INACTIVE', () => { passerelle.lien.actif = false; }, 'Ce lien a été fermé par son auteur.'],
      ['LINK_EXPIRED', () => { passerelle.lien.expireA = new Date(Date.now() - 60_000).toISOString(); }, 'Ce lien a expiré.'],
      ['LINK_MAX_USES', () => { passerelle.lien.maxUses = 12; }, 'Ce lien a atteint son nombre d’entrées.'],
    ] as const) {
      test(`${nom} — la modale dit pourquoi, sans formulaire, et garde le compte — sans rien inventer`, async ({ browser }) => {
        regle();
        const contexte = await sansJavaScript(browser);
        const page = await contexte.newPage();
        const reponse = await page.goto(porte.adresse);
        expect(reponse?.status()).toBe(410);
        await expect(page.locator('dialog[open] .bandeau.refus')).toContainText(phrase);
        expect(await page.locator('dialog form').count()).toBe(0);
        await expect(page.locator(`a[href="/signup?returnUrl=%2Fchat%2F${IDENTIFIANT_DU_LIEN_PARTAGE}"]`)).toBeVisible();
        // Rien de la passerelle n'a été servi que le code : ni le segment en guise de nom, ni la question, ni l'accordéon.
        await expect(page.locator('dialog h2')).toHaveText('Ce lien est fermé');
        expect(await page.title()).toBe('Ce lien est fermé — Meeshy');
        expect(await page.locator('dialog details.droits').count()).toBe(0);
        expect(await page.locator('dialog .question').textContent()).not.toContain('anonyme');
        expect(porte.aucuneJonction()).toBe(true);
        await contexte.close();
      });
    }
  });
});

/**
 * CE QUE LE LECTEUR DÉTIENT TRANCHE AVANT L'APERÇU (§ 6.3.B). L'aperçu refuse
 * 410 un lien plein ou fermé — et un lien plein l'est PAR son dernier admis.
 * Chaque cas règle l'ÉTAT du lien du bouchon, dont les quatre portes dérivent
 * leurs réponses comme les routes réelles lisent la même ligne.
 */
test.describe('ce que le lecteur DÉTIENT tranche avant l’aperçu', () => {
  test('le DERNIER admis d’un lien à maxUses est servi à la même adresse : le fil, ses droits, un composeur qui dit pourquoi — jamais la modale', async ({ browser }) => {
    passerelle.lien.maxUses = passerelle.lien.currentUses + 1;
    const contexte = await sansJavaScript(browser);
    const page = await contexte.newPage();
    await page.goto(porte.adresse);
    await page.locator('#pseudo').fill('Tolu');
    await Promise.all([page.waitForURL(`${porte.adresse}?bienvenue=1`), page.locator('dialog form .action.primaire').click()]);

    expect(derniereJonction()?.statut).toBe(201);
    expect(passerelle.lien.currentUses).toBe(passerelle.lien.maxUses);
    expect(await page.locator('dialog').count()).toBe(0);
    await expect(page.locator('details.bandeau.bien[open]')).toBeVisible();
    // La liste refuse 403 SHARE_LINK_MAX_USES au dernier admis (`messages-list.ts:275-277`, loi rejouée par le
    // bouchon) : le composeur le DIT, et aucune carte « aucun message » ne prétend que le fil est vide.
    await expect(page.locator('#composeur-ferme .raison')).toHaveText('Ce lien a atteint son nombre d’entrées.');
    expect(await page.locator('.carte-vide').count()).toBe(0);
    expect(porte.cheminsRecus()).toContain(`GET /api/v1/links/${IDENTIFIANT_DU_LIEN_PARTAGE}`);
    expect(porte.cheminsRecus().filter((c) => c.includes('/members'))).toHaveLength(1);
    await contexte.close();
  });

  test('un invité à place ACTIVE revient sur un lien devenu plein : le fil, zéro modale, aucune re-jonction', async ({ browser }) => {
    passerelle.placesActives.add(INVITE.session);
    passerelle.lien.maxUses = passerelle.lien.currentUses;
    const contexte = await porte.contexteDeLInvite(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    const reponse = await page.goto(porte.adresse);
    expect(reponse?.status()).toBe(200);
    expect(await page.locator('dialog').count()).toBe(0);
    await expect(page.locator('.fil-tete .sous')).toHaveText('Entré comme Tolu · anonyme');
    expect(porte.aucuneJonction()).toBe(true);
    expect(await porte.cookieDeLaPlace(contexte)).toMatchObject({ value: INVITE.session });
    await contexte.close();
  });

  /**
   * ÉTAT G AU RECHARGEMENT — « contenu conservé » (§ 6.3 G) : le battement 410
   * ferme le COMPOSEUR, pas la LECTURE. La liste ne lit pas `isActive`
   * (`messages-list.ts`, gagé par `messages-routes.test.ts:854-885`) et sert la
   * place active ; la reconnaissance NOMME l'occupant (`currentUser`) ; aucun
   * droit n'ayant été servi, aucun verdict n'est rendu. Le témoin d'avant
   * codifiait l'inverse — « AUCUNE liste n'est demandée » — et rendait un fil
   * VIDE sous « Entré comme  · anonyme ».
   */
  test('un lien fermé par son auteur PENDANT la lecture : au rechargement, le composeur fermé avec sa raison, la lecture et le nom gardés — jamais la modale, jamais un verdict (état G)', async ({ browser }) => {
    passerelle.placesActives.add(INVITE.session);
    passerelle.lien.actif = false;
    const contexte = await porte.contexteDeLInvite(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    const reponse = await page.goto(porte.adresse);
    expect(reponse?.status()).toBe(200);
    expect(await page.locator('dialog').count()).toBe(0);
    await expect(page.locator('#composeur-ferme .raison')).toHaveText('Ce lien a été fermé par son auteur.');
    expect(await page.locator('.carte-vide').count()).toBe(0);
    await expect(page.locator('li.ligne')).toHaveCount(passerelle.messages().length);
    await expect(page.locator('.fil-tete .sous')).toHaveText(`Entré comme ${INVITE.nom} · anonyme`);
    expect(await page.locator('li[data-droit]').count()).toBe(0);
    expect(await porte.cookieDeLaPlace(contexte)).toMatchObject({ value: INVITE.session });
    // L'aperçu refuse ; la place est reconnue ET nommée ; le battement ferme ; la liste est LUE avec la session ; ce qui est affiché est DIT.
    expect(porte.cheminsRecus()).toEqual([
      `GET /api/v1/anonymous/link/${IDENTIFIANT_DU_LIEN_PARTAGE}`,
      `GET /api/v1/links/${IDENTIFIANT_DU_LIEN_PARTAGE}`,
      'PATCH /api/v1/guest-sessions/me',
      `GET /api/v1/conversations/${CONVERSATION_DU_LECTEUR.id}`,
      `GET /api/v1/conversations/${CONVERSATION_DU_LECTEUR.id}/messages`,
      `POST /api/v1/conversations/${CONVERSATION_DU_LECTEUR.id}/receipts`,
    ]);
    await contexte.close();
  });

  test('une place RÉVOQUÉE sur un lien fermé : la modale close, la reconnaissance refusée en amont, aucun battement', async ({ browser }) => {
    passerelle.placesActives.delete(INVITE.session);
    passerelle.sessionsRevoquees.add(INVITE.session);
    passerelle.lien.actif = false;
    const contexte = await porte.contexteDeLInvite(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    const reponse = await page.goto(porte.adresse);
    expect(reponse?.status()).toBe(410);
    await expect(page.locator('dialog h2')).toHaveText('Ce lien est fermé');
    expect(porte.cheminsRecus()).toEqual([`GET /api/v1/anonymous/link/${IDENTIFIANT_DU_LIEN_PARTAGE}`, `GET /api/v1/links/${IDENTIFIANT_DU_LIEN_PARTAGE}`]);
    passerelle.sessionsRevoquees.delete(INVITE.session);
    await contexte.close();
  });
});

/** Un formulaire posté deux fois ne prend qu'UNE place ; un formulaire venu d'ailleurs, aucune ; un préchargement ne joint rien. */
test.describe('une place, un acte', () => {
  test('deux POST successifs avec le même jar de cookies : UN seul POST /members, currentUses +1', async ({ browser }) => {
    const contexte = await sansJavaScript(browser);
    const avant = passerelle.lien.currentUses;
    const premiere = await contexte.request.post(porte.adresse, { form: { pseudo: 'Tolu', langue: 'fr' }, maxRedirects: 0 });
    expect(premiere.status()).toBe(303);
    expect(await porte.cookieDeLaPlace(contexte)).toMatchObject({ value: INVITE.session });

    const seconde = await contexte.request.post(porte.adresse, { form: { pseudo: 'Tolu', langue: 'fr' }, maxRedirects: 0 });
    expect(seconde.status()).toBe(303);
    expect(seconde.headers()['location']).toBe(`/chat/${IDENTIFIANT_DU_LIEN_PARTAGE}`);
    expect(porte.cheminsRecus().filter((c) => c.includes('/members'))).toHaveLength(1);
    expect(passerelle.lien.currentUses).toBe(avant + 1);
    await contexte.close();
  });

  test('un formulaire soumis depuis un autre site est refusé 403 avant tout appel, sans cookie', async ({ browser }) => {
    const contexte = await sansJavaScript(browser);
    const reponse = await contexte.request.post(porte.adresse, {
      form: { pseudo: 'Tolu', langue: 'fr' },
      headers: { origin: 'https://evil.example' },
      maxRedirects: 0,
    });
    expect(reponse.status()).toBe(403);
    expect(await reponse.text()).toContain('Ce formulaire ne vient pas de Meeshy');
    expect(porte.cheminsRecus()).toEqual([]);
    expect(await porte.cookieDeLaPlace(contexte)).toBeUndefined();
    await contexte.close();
  });

  test('un préchargement d’un lecteur CONNECTÉ ne joint rien : 503 sans corps, aucun appel', async ({ browser }) => {
    const contexte = await sansJavaScript(browser);
    await contexte.addCookies([
      { name: 'meeshy_session', value: 'x', domain: '127.0.0.1', path: '/' },
      { name: 'meeshy_auth', value: JETON_DU_MEMBRE, domain: '127.0.0.1', path: '/' },
    ]);
    const reponse = await contexte.request.get(porte.adresse, { headers: { 'sec-purpose': 'prefetch;prerender' }, maxRedirects: 0 });
    expect(reponse.status()).toBe(503);
    expect(await reponse.text()).toBe('');
    expect(porte.cheminsRecus()).toEqual([]);
    await contexte.close();
  });

  test('404 — un lien que personne ne connaît : une page qui le dit, ni modale ni panne', async ({ browser }) => {
    const contexte = await sansJavaScript(browser);
    const page = await contexte.newPage();
    const reponse = await page.goto(`${v3.base}/chat/${LIEN_INCONNU}`, { waitUntil: 'load' });
    expect(reponse?.status()).toBe(404);
    expect(await page.locator('dialog').count()).toBe(0);
    await expect(page.locator('h1')).toHaveText('Ce lien ne mène nulle part');
    await contexte.close();
  });
});

test.describe('les autres portes', () => {
  test('un lecteur CONNECTÉ ne voit jamais la modale : joint puis mené à /chats/:cle', async ({ browser }) => {
    const contexte = await sansJavaScript(browser);
    await contexte.addCookies([
      { name: 'meeshy_session', value: 'x', domain: '127.0.0.1', path: '/' },
      { name: 'meeshy_auth', value: JETON_DU_MEMBRE, domain: '127.0.0.1', path: '/' },
    ]);
    const page = await contexte.newPage();
    await page.goto(porte.adresse, { waitUntil: 'commit' });
    await page.waitForURL(/\/chats\//);
    expect(await page.locator('dialog').count()).toBe(0);
    expect(derniereJonction()?.statut).toBe(200);
    await contexte.close();
  });

  test('une session invitée valide passe la modale — jamais de re-jonction', async ({ browser }) => {
    passerelle.placesActives.add(INVITE.session);
    const contexte = await porte.contexteDeLInvite(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(porte.adresse);
    expect(await page.locator('dialog').count()).toBe(0);
    await expect(page.locator('form.composeur')).toBeVisible();
    expect(porte.aucuneJonction()).toBe(true);
    expect((await contexte.cookies()).find((c) => c.name === NOM_DU_COOKIE)?.value).toBe(INVITE.session);
    await contexte.close();
  });
});

test.describe('§ 12.5 règles 4 et 6 — les cibles de la modale', () => {
  for (const largeur of LARGEURS) {
    test(`aucune cible sous ${TARGET_MIN} px à ${largeur} px — hors du cadre inerte`, async ({ browser }) => {
      const contexte = await sansJavaScript(browser, { viewport: { width: largeur, height: 844 } });
      const page = await contexte.newPage();
      await page.goto(porte.adresse);
      const mesurees = await ciblesMesurees(page);
      expect(mesurees.length, "aucune cible mesurée — le balayage n'a rien vu").toBeGreaterThanOrEqual(6);
      const petites = ciblesTropPetites(mesurees);
      expect(petites, `cibles sous ${TARGET_MIN} px : ${JSON.stringify(petites)}`).toEqual([]);
      await contexte.close();
    });
  }

  test('l’action principale mesure 56 px, la secondaire 52', async ({ browser }) => {
    const contexte = await sansJavaScript(browser);
    const page = await contexte.newPage();
    await page.goto(porte.adresse);
    expect(Math.min(...(await hauteursDe(page, 'dialog .action.primaire')))).toBe(ACTION_PRIMAIRE);
    expect(Math.min(...(await hauteursDe(page, 'dialog .action.contour')))).toBe(ACTION_SECONDAIRE);
    await contexte.close();
  });
});

test.describe('§ 8.5 — accessibilité, quatre colonnes de thème', () => {
  for (const theme of COLONNES_DE_THEME) {
    test(`0 violation axe serious/critical — état CHOIX (${theme.id})`, async ({ browser }) => {
      const contexte = await browser.newContext({ colorScheme: theme.colorScheme });
      if (theme.stockage !== null) {
        await contexte.addInitScript(
          ([cle, valeur]) => {
            try {
              window.localStorage.setItem(cle, valeur);
            } catch {
              /* la colonne le dira */
            }
          },
          [THEME_STORAGE_KEY, theme.stockage] as const,
        );
      }
      const page = await contexte.newPage();
      await page.goto(porte.adresse, { waitUntil: 'load' });
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));
      const { violations } = await new AxeBuilder({ page }).analyze();
      const bloquantes = violationsBloquantes(violations);
      expect(bloquantes, rapporteViolations(`${porte.adresse} [${theme.id}]`, bloquantes)).toEqual([]);
      await contexte.close();
    });
  }

  // axe s'injecte dans la page : ce témoin-là garde le JavaScript du navigateur. Le document,
  // lui, n'en charge aucun — l'état CHOIX ne porte ni chargeur ni module.
  test('0 violation axe serious/critical — 409, le champ en refus (sombre)', async ({ browser }) => {
    const contexte = await browser.newContext({ colorScheme: 'dark' });
    const page = await contexte.newPage();
    await page.goto(porte.adresse);
    await page.locator('#pseudo').fill(PSEUDO_DEJA_PRIS);
    await page.locator('dialog form .action.primaire').click();
    await page.waitForLoadState('load');
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bloquantes = violationsBloquantes(violations);
    expect(bloquantes, rapporteViolations(`${porte.adresse} [409]`, bloquantes)).toEqual([]);
    await contexte.close();
  });
});

test.describe('§ 12.6 — le poids, en Fast 3G', () => {
  test('tient ses plafonds réseau (requêtes avant le premier pixel, CLS) sans session', async ({ browser }, info) => {
    const { mesurePage, franchissementsReseau } = await chargeMesureReseau();
    const mesure = await mesurePage({ url: porte.adresse, commande: COMMANDE, navigateur: browser, profil: budgets.reseau.profil });
    info.annotations.push({
      type: 'CHOIX en Fast 3G',
      description: `req. avant le premier pixel ${mesure.requetes_avant_premier_pixel ?? '?'} · FCP ${mesure.fcp_ms ?? '?'} ms · LCP ${mesure.lcp_ms ?? '?'} ms · CLS ${mesure.cls ?? '?'} · ${mesure.octets_transferes ?? '?'} o`,
    });
    console.log(`[mesure] join /chat/:lien Fast 3G — requêtes avant le premier pixel ${mesure.requetes_avant_premier_pixel} · FCP ${mesure.fcp_ms} ms · LCP ${mesure.lcp_ms} ms · CLS ${mesure.cls} · ${mesure.octets_transferes} o`);
    expect(mesure.http).toBe(200);
    expect(franchissementsReseau(mesure, budgets.reseau).filter((f) => f.statut === 'GATE').map((f) => f.texte)).toEqual([]);
  });
});

test.describe('les rendus que le rapport regarde', () => {
  /**
   * Le JavaScript du navigateur reste ACTIF ici, et c'est un fait à garder en tête : sans lui,
   * la classe rendue par le serveur (`THEME_PAR_DEFAUT`, sombre) n'est jamais corrigée, et la
   * colonne « claire » capturerait le schéma sombre — mesuré. Le document, lui, ne charge
   * toujours aucun module en état CHOIX : seul le script du thème s'exécute.
   */
  test('captures 390×844 — l’état CHOIX et ses refus, clair et sombre', async ({ browser }, info) => {
    mkdirSync(DOSSIER_DES_RENDUS, { recursive: true });
    for (const schema of ['light', 'dark'] as const) {
      const contexte = await browser.newContext({ colorScheme: schema, locale: 'fr-FR' });
      const page = await contexte.newPage();
      await page.goto(porte.adresse, { waitUntil: 'load' });
      const nominal = join(DOSSIER_DES_RENDUS, `join-${schema}.png`);
      await page.screenshot({ path: nominal });
      info.annotations.push({ type: `rendu ${schema}`, description: nominal });

      await page.locator('dialog details.droits summary').click();
      await page.screenshot({ path: join(DOSSIER_DES_RENDUS, `join-droits-${schema}.png`) });

      await page.locator('#pseudo').fill(PSEUDO_DEJA_PRIS);
      await page.locator('dialog form .action.primaire').click();
      await page.waitForLoadState('load');
      await page.screenshot({ path: join(DOSSIER_DES_RENDUS, `join-refus-409-${schema}.png`) });
      await contexte.close();

      passerelle.lien.requireAccount = true;
      const refus = await browser.newContext({ colorScheme: schema, locale: 'fr-FR' });
      const pageDeRefus = await refus.newPage();
      await pageDeRefus.goto(porte.adresse, { waitUntil: 'load' });
      await pageDeRefus.screenshot({ path: join(DOSSIER_DES_RENDUS, `join-refus-403-${schema}.png`) });
      await refus.close();
      passerelle.lien.requireAccount = false;
    }
  });
});
