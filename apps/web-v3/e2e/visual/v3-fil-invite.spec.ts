import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { RAISONS_DE_FERMETURE } from '../../lib/api/invite';
import { occulte, revele } from './lib/navigateur-cycle';
import { NOM_DU_COOKIE, porteInvitee } from './lib/porte-invitee';
import {
  chargeMesureReseau,
  CONVERSATION_DU_LECTEUR,
  IDENTIFIANT_DU_LIEN_PARTAGE,
  INVITE,
  LIEN_DU_FIL,
  passerelleDeBouchon,
  PSEUDO_DEJA_PRIS,
  PSEUDO_SUGGERE,
  RACINE_V3,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';

/**
 * LE FIL, À LA PORTE DE L'INVITÉ (`/chat/:lien`, conception § 12.3, issue
 * #4524) — la machine à TROIS états décidés par le serveur d'après ce que le
 * lecteur DÉTIENT, jouée sur la chaîne réelle : le serveur de la v3 tel que
 * `next build` l'a émis, la passerelle de bouchon (`lib/serveurs.ts`) et le
 * bouchon socket (`lib/bouchon-socket.ts`), qui MIMENT la passerelle réelle
 * route par route. Les six cas C→H de la recette du § 6.5 se jouent sur ce
 * même écran dans `v3-lifecycle.spec.ts`, avec les mêmes gestes
 * (`lib/porte-invitee.ts`).
 */

const DOSSIER_DES_RENDUS = process.env.RENDUS_DIR ?? join(RACINE_V3, 'test-results', 'rendus');

const COMMANDE = 'bunx playwright test e2e/visual/v3-fil-invite.spec.ts';

const budgets = JSON.parse(readFileSync(join(RACINE_V3, 'budgets.json'), 'utf8'));

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const porte = porteInvitee({ passerelle: () => passerelle, v3: () => v3 });

test.beforeAll(async () => {
  passerelle = await passerelleDeBouchon();
  v3 = await serveurDeLaV3(passerelle.base);
});

test.afterAll(async () => {
  await v3?.ferme();
  await passerelle?.ferme();
});

test.beforeEach(() => {
  passerelle.placesActives.add(INVITE.session);
  passerelle.lien.actif = true;
  passerelle.invite.nom = INVITE.nom;
  passerelle.place.reinitialise();
  passerelle.oublie();
});

test.describe('la machine à trois états', () => {
  test('CHOIX — sans session : le cadre inerte et flouté, la modale, et AUCUN message ne part', async ({ browser }) => {
    const contexte = await browser.newContext({ javaScriptEnabled: false });
    const page = await contexte.newPage();
    const reponse = await page.goto(porte.adresse);

    expect(reponse?.status()).toBe(200);
    await expect(page.locator('dialog[open]')).toBeVisible();
    await expect(page.locator('main#main-content')).toHaveAttribute('inert', '');
    expect(await page.locator('li.ligne').count()).toBe(0);
    await expect(page.locator(`a[href="/login?returnUrl=%2Fchat%2F${IDENTIFIANT_DU_LIEN_PARTAGE}"]`)).toBeVisible();
    await expect(page.locator(`a[href="/signup?returnUrl=%2Fchat%2F${IDENTIFIANT_DU_LIEN_PARTAGE}"]`)).toBeVisible();
    // L'aperçu seul est parti — jamais la liste des messages.
    expect(porte.cheminsRecus()).toEqual([`GET /api/v1/anonymous/link/${IDENTIFIANT_DU_LIEN_PARTAGE}`]);
    await contexte.close();
  });

  test('CHOIX → INVITÉ — le formulaire anonyme rejoint par la porte CANONIQUE, pose le cookie porté au lien, ouvre les droits', async ({ browser }) => {
    const contexte = await browser.newContext({ javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(porte.adresse);

    await page.locator('#pseudo').fill('Tolu');
    await Promise.all([page.waitForURL(`${porte.adresse}?bienvenue=1`), page.locator('dialog form .action.primaire').click()]);

    expect(await page.locator('dialog').count()).toBe(0);
    await expect(page.locator('details.bandeau.bien[open]')).toBeVisible();
    await expect(page.locator('li.ligne')).toHaveCount(passerelle.messages().length);
    await expect(page.locator('form.composeur')).toBeVisible();
    expect(await porte.cookieDeLaPlace(contexte)).toMatchObject({ value: INVITE.session, path: '/chat' });

    const chemins = porte.cheminsRecus();
    expect(chemins).toContain(`POST /api/v1/links/${LIEN_DU_FIL}/members`);
    expect(chemins.some((c) => c.includes('/anonymous/join') || c.includes('/conversations/join'))).toBe(false);
    await contexte.close();
  });

  test('CHOIX — un 409 garde la modale et pré-remplit le pseudo LIBRE que la passerelle propose', async ({ browser }) => {
    const contexte = await browser.newContext({ javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(porte.adresse);

    await page.locator('#pseudo').fill(PSEUDO_DEJA_PRIS);
    await page.locator('dialog form .action.primaire').click();
    await page.waitForLoadState('load');

    await expect(page.locator('dialog[open] #pseudo')).toHaveValue(PSEUDO_SUGGERE);
    await expect(page.locator('dialog[open] #pseudo')).toHaveAttribute('aria-invalid', 'true');
    expect(await porte.cookieDeLaPlace(contexte)).toBeUndefined();
    await contexte.close();
  });

  test('INVITÉ — la session en main : UNE re-validation au montage, le fil par le même document, le composeur régi par les droits', async ({ browser }) => {
    const contexte = await porte.contexteDeLInvite(browser, { javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(porte.adresse);

    expect(await page.locator('dialog').count()).toBe(0);
    await expect(page.locator('li.ligne')).toHaveCount(passerelle.messages().length);
    await expect(page.locator('form.composeur')).toBeVisible();
    // Sans `?bienvenue`, le bandeau des droits n'est pas ouvert sous les yeux de qui lisait.
    expect(await page.locator('details.bandeau.bien[open]').count()).toBe(0);
    // Le lien n'admet ni fichier ni image (`allowAnonymousFiles` / `allowAnonymousImages`,
    // `upload.ts:287-311`) : le trombone est servi CACHÉ, champ désactivé — rien à voir, rien à
    // soumettre ; il n'existe que pour que le module révèle un droit RENDU par l'hôte sans F5.
    await expect(page.locator('label.joindre')).toBeHidden();
    expect(await page.locator('#champ-piece').isDisabled()).toBe(true);
    await expect(page.locator('details.bandeau.bien li.refuse', { hasText: 'Pas de photo ni de fichier' })).toHaveCount(1);

    // L'aperçu d'abord — c'est lui qui nomme la clé du cookie (§ 6.3.E) —, puis UNE
    // re-validation, puis seulement la conversation, avec la session en en-tête.
    const chemins = porte.cheminsRecus();
    expect(chemins[0]).toBe(`GET /api/v1/anonymous/link/${IDENTIFIANT_DU_LIEN_PARTAGE}`);
    // `PATCH /guest-sessions/me` (`link-admission.ts:775-829`) — jamais l'adaptateur déprécié `POST /anonymous/refresh` (`anonymous.ts:341`).
    expect(chemins[1]).toBe('PATCH /api/v1/guest-sessions/me');
    expect(chemins.filter((c) => c === 'PATCH /api/v1/guest-sessions/me')).toHaveLength(1);
    expect(chemins.some((c) => c.includes('/anonymous/refresh'))).toBe(false);
    expect(chemins.indexOf(`GET /api/v1/conversations/${CONVERSATION_DU_LECTEUR.id}/messages`)).toBeGreaterThan(1);
    expect(porte.aucuneJonction()).toBe(true);

    // Et sans JavaScript, l'invité envoie puis relit.
    const avant = await page.locator('li.ligne').count();
    await page.locator('#champ-texte').fill('Envoyé par un invité, sans JavaScript');
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'GET' && r.url() === porte.adresse),
      page.locator('button.envoyer').click(),
    ]);
    await expect(page.locator('li.ligne')).toHaveCount(avant + 1);
    // Servie du plus récent au plus ancien : la ligne envoyée est la première du DOM.
    await expect(page.locator('li.ligne').first()).toHaveClass(/mien/);
    expect(page.url()).toMatch(/#m-m\d+$/);
    await contexte.close();
  });
});

test.describe('§ 12.6 — l’état CHOIX arrive par morceaux en 3G sans bouger', () => {
  /**
   * La feuille modale est rendue AVANT le cadre et porte une hauteur POSÉE
   * (`choix-feuille.ts`) : mesuré avant, elle était peinte courte puis grandissait
   * vers le haut pendant que le document arrivait — CLS 0,347 en Fast 3G contre le
   * gate 0,05 du § 12.6. Le profil est celui de `budgets.json` (Fast 3G, préréglage
   * de Chrome DevTools) ; la mesure est celle de `scripts/mesure-reseau.mjs`, le
   * site unique du § 9.2.
   */
  test('tient le gate CLS ≤ 0,05 et ses plafonds réseau en Fast 3G — sans session, la modale sur le cadre inerte', async ({ browser }, info) => {
    const { mesurePage, franchissementsReseau } = await chargeMesureReseau();
    const mesure = await mesurePage({ url: porte.adresse, commande: COMMANDE, navigateur: browser, profil: budgets.reseau.profil });
    info.annotations.push({
      type: 'CHOIX en Fast 3G',
      description: `req. avant le premier pixel ${mesure.requetes_avant_premier_pixel ?? '?'} · FCP ${mesure.fcp_ms ?? '?'} ms · LCP ${mesure.lcp_ms ?? '?'} ms · CLS ${mesure.cls ?? '?'} · ${mesure.octets_transferes ?? '?'} o`,
    });
    console.log(`[mesure] CHOIX /chat/:lien Fast 3G — requêtes avant le premier pixel ${mesure.requetes_avant_premier_pixel} · FCP ${mesure.fcp_ms} ms · LCP ${mesure.lcp_ms} ms · CLS ${mesure.cls} · ${mesure.octets_transferes} o`);
    expect(mesure.http).toBe(200);
    expect(franchissementsReseau(mesure, budgets.reseau).filter((f) => f.statut === 'GATE').map((f) => f.texte)).toEqual([]);
    expect(mesure.cls).not.toBeNull();
    expect(mesure.cls ?? 1).toBeLessThanOrEqual(0.05);
  });
});

/**
 * LA VUE `rights` (issue #4523) — l'ÉTAT du fil juste après la jonction, à la
 * MÊME adresse : le pseudo SAISI dans la modale revient dans l'en-tête et dans
 * le bandeau ; les quatre droits sont ceux que la passerelle a SERVIS
 * (`entry.rights` à la jonction, `participant.canSend*` +
 * `conversation.allowViewHistory` au battement — l'INSTANTANÉ du join,
 * `link-admission.ts:554-577`), dans l'ordre de `cible/rights.png`, depuis la
 * source que l'accordéon de la modale lit aussi (`lib/contenu/droits.ts`,
 * gagé par `__tests__/droits-source-unique.test.ts`) ; le bandeau précède les
 * puces et se replie d'un tap, SANS JavaScript. Avec lui : l'adresse oublie
 * `?bienvenue` (un F5 rend le fil replié), et un droit RETIRÉ par l'hôte
 * (`PATCH …/participants/:id/rights`) se voit EN DIRECT — la passerelle le
 * POUSSE par `participant:rights-updated` sur la room personnelle de l'invité
 * (`participants-writes.ts:403-425`, `AuthHandler.ts:381`) ; le battement, lui,
 * ne le porte JAMAIS (il rend l'instantané) et ne doit rien repeindre — un
 * droit rendu rouvre le composeur que le document avait servi caché derrière
 * la raison. Le témoin d'avant faisait rendre le changement PAR le battement du
 * bouchon : vert par vacuité contre la passerelle réelle (leçon 422). `login`
 * et `signup` mènent au fil du MEMBRE, jamais ici (`v3-join.spec.ts` › « un
 * lecteur CONNECTÉ ne voit jamais la modale : joint puis mené à /chats/:cle »).
 */
test.describe('la vue rights — ce que l’invité a le droit de faire, dit dans le fil', () => {
  const PSEUDO_SAISI = 'Folake';

  test('restitue le pseudo saisi — en-tête et bandeau — et rend les quatre droits SERVIS, dans l’ordre de la planche, sans JavaScript', async ({ browser }) => {
    const contexte = await browser.newContext({ javaScriptEnabled: false });
    const page = await contexte.newPage();
    await page.goto(porte.adresse);
    await page.locator('#pseudo').fill(PSEUDO_SAISI);
    await Promise.all([page.waitForURL(`${porte.adresse}?bienvenue=1`), page.locator('dialog form .action.primaire').click()]);

    const jonction = JSON.parse([...passerelle.journal].reverse().find((a) => a.chemin.endsWith('/members'))?.corps ?? '{}') as Record<string, unknown>;
    expect(jonction.nickname).toBe(PSEUDO_SAISI);
    await expect(page.locator('.fil-tete .sous')).toHaveText(`Entré comme ${PSEUDO_SAISI} · anonyme`);

    const bandeau = page.locator('details.bandeau.bien');
    await expect(bandeau).toHaveAttribute('open', '');
    await expect(bandeau.locator('summary b')).toHaveText(`Bienvenue ${PSEUDO_SAISI} — vous êtes entré en anonyme`);
    // Les verdicts sont ceux du LIEN (`droitsDeLInvite`) : lire, écrire, ni photo ni fichier, jamais d'appel.
    const lignes = bandeau.locator('li[data-droit]');
    await expect(lignes).toHaveCount(4);
    expect(await lignes.evaluateAll((l) => l.map((li) => `${li.getAttribute('data-droit')}:${li.classList.contains('accorde') ? 'oui' : 'non'}`))).toEqual([
      'historique:oui',
      'ecrire:oui',
      'fichiers:non',
      'appels:non',
    ]);
    // Un seul glyphe VISIBLE par ligne — celui du verdict.
    for (const rang of [0, 3]) {
      expect(await lignes.nth(rang).locator('.verdict svg:visible').count()).toBe(1);
    }
    // Le bandeau PRÉCÈDE les puces (`cible/rights.png`), et le composeur suit les droits : ouvert, sans trombone.
    expect(
      await page.evaluate(() => {
        const bandeau = document.querySelector('details.bandeau.bien');
        // `.puces` et non `nav.puces` : la région du Prisme est un `<div>` depuis
        // que `prisme-vue.ts` en est le site unique — « un point de repère de
        // navigation sans un seul lien » (revue de #5164). Le sélecteur était
        // resté sur l'ancienne balise et ne trouvait plus rien.
        const puces = document.querySelector('.puces');
        return bandeau !== null && puces !== null && (bandeau.compareDocumentPosition(puces) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      }),
    ).toBe(true);
    await expect(page.locator('form.composeur')).toBeVisible();
    await expect(page.locator('label.joindre')).toBeHidden();
    // Replié d'un tap — un `<details>` natif, qui n'attend aucun script.
    await bandeau.locator('summary').click();
    await expect(bandeau).not.toHaveAttribute('open', '');
    await contexte.close();
  });

  test('avec JavaScript, l’adresse oublie ?bienvenue : un rechargement rend le fil, bandeau replié — jamais une seconde arrivée', async ({ browser }) => {
    const contexte = await porte.contexteDeLInvite(browser);
    const page = await porte.ouvre(contexte, `${porte.adresse}?bienvenue=1`);
    await expect(page.locator('details.bandeau.bien')).toHaveAttribute('open', '');
    await expect(page).toHaveURL(porte.adresse);

    await page.reload({ waitUntil: 'load' });
    expect(await page.locator('details.bandeau.bien[open]').count()).toBe(0);
    expect(await page.locator('dialog').count()).toBe(0);
    expect(porte.aucuneJonction()).toBe(true);
    await contexte.close();
  });

  test('un droit RETIRÉ par l’hôte se voit EN DIRECT — participant:rights-updated, composeur fermé avec sa raison, bandeau relu — survit au battement, puis RENDU rouvre, sans rechargement', async ({ browser }) => {
    const contexte = await porte.contexteDeLInvite(browser);
    const page = await porte.ouvre(contexte, `${porte.adresse}?bienvenue=1`);
    await expect(page.locator('form.composeur')).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __memeDocument: boolean }).__memeDocument = true;
    });
    const battementsAuMontage = porte.cheminsRecus().filter((c) => c === 'PATCH /api/v1/guest-sessions/me').length;

    // L'hôte retire le droit d'écrire : le delta s'écrit, l'événement part sur les deux rooms.
    passerelle.hote.changeLesDroits({ canSendMessages: false });

    const ferme = page.locator('#composeur-ferme');
    await expect(ferme).toBeVisible();
    await expect(ferme).toContainText(RAISONS_DE_FERMETURE.DROIT_RETIRE ?? 'ABSENT');
    await expect(page.locator('form.composeur')).toBeHidden();
    const ecrire = page.locator('details.bandeau.bien li[data-droit="ecrire"]');
    await expect(ecrire).toHaveClass(/refuse/);
    await expect(ecrire.locator('b')).toHaveText('Lecture seule');
    // Le MÊME document — aucun rechargement —, aucune re-jonction, et AUCUN battement n'a été nécessaire.
    expect(await page.evaluate(() => (window as unknown as { __memeDocument?: boolean }).__memeDocument)).toBe(true);
    expect(porte.aucuneJonction()).toBe(true);
    expect(porte.cheminsRecus().filter((c) => c === 'PATCH /api/v1/guest-sessions/me').length).toBe(battementsAuMontage);

    // Le battement suivant rend l'INSTANTANÉ du join (`canSendMessages: true`) : il ne doit RIEN rouvrir.
    const jonctionsAvant = passerelle.socket.recus.filter((e) => e.evenement === 'conversation:join').length;
    await page.waitForTimeout(1_100);
    await occulte(page);
    await revele(page);
    await expect.poll(() => porte.cheminsRecus().filter((c) => c === 'PATCH /api/v1/guest-sessions/me').length).toBeGreaterThan(battementsAuMontage);
    await expect(ferme).toBeVisible();
    await expect(page.locator('form.composeur')).toBeHidden();
    await expect(ecrire).toHaveClass(/refuse/);

    /**
     * ATTENDRE LA RE-JONCTION DE LA ROOM, PAS LE BATTEMENT. L'occultation ferme
     * le socket (§ 8.5) ; la révélation le rouvre et RE-JOINT la conversation.
     * Ces deux reprises sont indépendantes : le battement est un `PATCH` HTTP,
     * la room est un `conversation:join` sur le socket. Émettre sur la foi du
     * battement, c'est parler à une room que personne n'a encore rejointe —
     * l'événement est perdu, et le composeur ne rouvre jamais. Mesuré : vert en
     * local, rouge sur le runner, où la reconnexion perd la course (14 sondes,
     * 5 s, `form.composeur` resté `hidden`). Le témoin attend donc le signal de
     * ce qu'il va vraiment faire parler.
     */
    await expect
      .poll(() => passerelle.socket.recus.filter((e) => e.evenement === 'conversation:join').length)
      .toBeGreaterThan(jonctionsAvant);

    // L'hôte rend le droit : le composeur rouvre, le bandeau le dit.
    passerelle.hote.changeLesDroits({ canSendMessages: true });
    await expect(page.locator('form.composeur')).toBeVisible();
    await expect(ferme).toBeHidden();
    await expect(ecrire).toHaveClass(/accorde/);
    await contexte.close();
  });

  /**
   * Chargé FERMÉ par un droit (le lien n'admettait pas les messages au join),
   * puis RENDU par l'hôte : le formulaire que le document a servi caché se
   * révèle, et un envoi part — sans F5. Mesuré avant : le bandeau disait
   * « Écrire et répondre » pendant que le bas de l'écran disait « L'hôte
   * n'autorise pas… » — le serveur ne servait aucun `<form>` à révéler.
   */
  test('un droit RENDU après un chargement FERMÉ rouvre le composeur servi caché, et un envoi part — le trombone suit son propre droit', async ({ browser }) => {
    passerelle.place.reinitialise({ allowAnonymousMessages: false });
    const contexte = await porte.contexteDeLInvite(browser);
    const page = await porte.ouvre(contexte);
    const ferme = page.locator('#composeur-ferme');
    await expect(ferme).toBeVisible();
    await expect(ferme).toContainText(RAISONS_DE_FERMETURE.DROIT_RETIRE ?? 'ABSENT');
    await expect(page.locator('form.composeur')).toBeHidden();
    await expect(page.locator('label.joindre')).toBeHidden();
    await expect(page.locator('details.bandeau.bien li[data-droit="ecrire"]')).toHaveClass(/refuse/);

    passerelle.hote.changeLesDroits({ canSendMessages: true, canSendImages: true });
    await expect(page.locator('form.composeur')).toBeVisible();
    await expect(ferme).toBeHidden();
    await expect(page.locator('details.bandeau.bien li[data-droit="ecrire"]')).toHaveClass(/accorde/);
    await expect(page.locator('details.bandeau.bien li[data-droit="fichiers"] b')).toHaveText('Envoyer des photos');
    await expect(page.locator('label.joindre')).toBeVisible();
    await expect(page.locator('#champ-piece')).toHaveAttribute('accept', 'image/*');

    await porte.ecrit(page, 'Rendu, donc écrit');
    await expect.poll(() => passerelle.socket.recus.filter((e) => e.evenement === 'message:send').length).toBe(1);
    await expect(page.locator('li.mien .texte').first()).toHaveText('Rendu, donc écrit');
    expect(porte.aucuneJonction()).toBe(true);
    await contexte.close();
  });

  /**
   * ÉTAT G AU RECHARGEMENT — « contenu conservé » (§ 6.3 G) : un lien fermé
   * pendant la lecture, puis F5. Le battement 410 ferme le COMPOSEUR ; la liste
   * ne lit pas `isActive` et sert la place active ; la reconnaissance NOMME
   * l'occupant ; aucun droit n'ayant été servi, aucun verdict n'est rendu.
   * Mesuré avant : 0 ligne, « Entré comme  · anonyme », quatre droits refusés.
   */
  test('lien fermé par l’hôte puis F5 : les messages lus restent, le composeur dit pourquoi, l’invité garde son nom, aucun verdict n’est fabriqué', async ({ browser }) => {
    const contexte = await porte.contexteDeLInvite(browser);
    const page = await porte.ouvre(contexte);
    await expect(page.locator('li.ligne')).toHaveCount(passerelle.messages().length);

    passerelle.lien.actif = false;
    await page.reload({ waitUntil: 'load' });

    expect(await page.locator('dialog').count()).toBe(0);
    await expect(page.locator('li.ligne')).toHaveCount(passerelle.messages().length);
    await expect(page.locator('#composeur-ferme')).toBeVisible();
    await expect(page.locator('#composeur-ferme')).toContainText(RAISONS_DE_FERMETURE.LINK_DEACTIVATED ?? 'ABSENT');
    expect(await page.locator('form.composeur').count()).toBe(0);
    await expect(page.locator('.fil-tete .sous')).toHaveText(`Entré comme ${INVITE.nom} · anonyme`);
    expect(await page.locator('li[data-droit]').count()).toBe(0);
    expect(await page.locator('main').getAttribute('data-moi')).toBe(INVITE.id);
    // La ligne de l'invité reste la SIENNE.
    await expect(page.locator('li.ligne.mien')).toHaveCount(passerelle.messages().filter((m) => m.senderId === INVITE.id).length);
    expect(porte.aucuneJonction()).toBe(true);
    const chemins = porte.cheminsRecus();
    expect(chemins).toContain(`GET /api/v1/conversations/${CONVERSATION_DU_LECTEUR.id}/messages`);
    expect(chemins).toContain(`GET /api/v1/links/${IDENTIFIANT_DU_LIEN_PARTAGE}`);
    await contexte.close();
  });

  /**
   * LE POIDS DE L'ÉTAT INVITÉ (§ 12.6, motif `/chat/*`) : le fil de l'invité,
   * bandeau ouvert, mesuré avec la place en cookie — l'option que le site
   * unique de la mesure porte pour cela. Le module de participation arrive
   * APRÈS le premier pixel : il n'entre pas dans le compte.
   */
  test('tient ses plafonds réseau en Fast 3G — l’état INVITÉ juste après la jonction, bandeau ouvert', async ({ browser }, info) => {
    const { mesurePage, franchissementsReseau } = await chargeMesureReseau();
    const mesure = await mesurePage({
      url: `${porte.adresse}?bienvenue=1`,
      commande: COMMANDE,
      navigateur: browser,
      profil: budgets.reseau.profil,
      // `url` : la forme que le site unique déclare (`CookieDeMesure`) — Playwright en dérive le chemin `/chat`, celui que la route pose.
      cookies: [{ name: NOM_DU_COOKIE, value: INVITE.session, url: porte.adresse }],
    });
    info.annotations.push({
      type: 'INVITÉ (rights) en Fast 3G',
      description: `req. avant le premier pixel ${mesure.requetes_avant_premier_pixel ?? '?'} · FCP ${mesure.fcp_ms ?? '?'} ms · LCP ${mesure.lcp_ms ?? '?'} ms · CLS ${mesure.cls ?? '?'} · ${mesure.octets_transferes ?? '?'} o`,
    });
    console.log(`[mesure] INVITÉ /chat/:lien?bienvenue Fast 3G — requêtes avant le premier pixel ${mesure.requetes_avant_premier_pixel} · FCP ${mesure.fcp_ms} ms · LCP ${mesure.lcp_ms} ms · CLS ${mesure.cls} · ${mesure.octets_transferes} o`);
    expect(mesure.http).toBe(200);
    expect(franchissementsReseau(mesure, budgets.reseau).filter((f) => f.statut === 'GATE').map((f) => f.texte)).toEqual([]);
    expect(mesure.cls).not.toBeNull();
    expect(mesure.cls ?? 1).toBeLessThanOrEqual(0.05);
  });
});

/**
 * LE CADRE LE PLUS ÉTROIT QUE LA CHARTE NOMME (règle 4 : 360 px) — et le
 * téléphone du rôle premier. Mesuré avant la règle de la feuille : à 360 × 640,
 * l'état INVITÉ juste après la jonction laissait 28 px aux messages et posait
 * le composeur de 673 à 758 — SOUS le pli, le corps devenu défilable. L'invité
 * qui venait d'entrer ne voyait ni la conversation ni où écrire.
 */
test.describe('§ 12.5 règle 4 — le composeur reste dans le cadre à 360 × 640, bandeau des droits ouvert', () => {
  const geometrie = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const boite = (selecteur: string) => {
        const r = document.querySelector(selecteur)?.getBoundingClientRect();
        return r === undefined ? null : { haut: Math.round(r.top), bas: Math.round(r.bottom), hauteur: Math.round(r.height) };
      };
      return {
        cadre: window.innerHeight,
        corpsDeborde: document.documentElement.scrollHeight > window.innerHeight,
        bandeau: boite('details.bandeau.bien[open]'),
        messages: boite('.messages'),
        composeur: boite('form.composeur'),
      };
    });

  test('bandeau ouvert : le composeur est dans le cadre, les messages gardent deux lignes, le corps ne défile pas', async ({ browser }) => {
    const contexte = await porte.contexteDeLInvite(browser, { viewport: { width: 360, height: 640 } });
    const page = await contexte.newPage();
    await page.goto(`${porte.adresse}?bienvenue=1`, { waitUntil: 'load' });
    await expect(page.locator('details.bandeau.bien[open]')).toBeVisible();

    const g = await geometrie(page);
    expect(g.corpsDeborde).toBe(false);
    expect(g.composeur?.bas).toBeLessThanOrEqual(g.cadre);
    expect(g.messages?.hauteur).toBeGreaterThanOrEqual(2 * 80);
    // Le bandeau a cédé, sans disparaître : son résumé reste une cible de 44 px.
    expect(g.bandeau?.hauteur).toBeGreaterThanOrEqual(44);
    await expect(page.locator('details.bandeau.bien[open] summary')).toBeVisible();

    // Un bandeau d'ÉTAT s'ajoute (hors ligne) : le composeur reste dans le cadre.
    await contexte.setOffline(true);
    await expect(page.locator('#bandeau-hors-ligne')).toBeVisible();
    const h = await geometrie(page);
    expect(h.corpsDeborde).toBe(false);
    expect(h.composeur?.bas).toBeLessThanOrEqual(h.cadre);
    await contexte.close();
  });
});

test.describe('les rendus que le rapport regarde', () => {
  test('captures 390×844 — l’invité juste après la jonction (la vue rights), clair et sombre', async ({ browser }, info) => {
    mkdirSync(DOSSIER_DES_RENDUS, { recursive: true });
    for (const schema of ['light', 'dark'] as const) {
      const contexte = await porte.contexteDeLInvite(browser, { colorScheme: schema });
      const page = await porte.ouvre(contexte, `${porte.adresse}?bienvenue=1`);
      const chemin = join(DOSSIER_DES_RENDUS, `rights-${schema}.png`);
      await page.screenshot({ path: chemin });
      info.annotations.push({ type: `rendu ${schema}`, description: chemin });
      await contexte.close();
    }
  });

  test('captures 390×844 — l’état CHOIX, clair et sombre', async ({ browser }, info) => {
    mkdirSync(DOSSIER_DES_RENDUS, { recursive: true });
    for (const schema of ['light', 'dark'] as const) {
      const contexte = await browser.newContext({ colorScheme: schema });
      const page = await contexte.newPage();
      await page.goto(porte.adresse, { waitUntil: 'load' });
      const chemin = join(DOSSIER_DES_RENDUS, `join-${schema}.png`);
      await page.screenshot({ path: chemin });
      info.annotations.push({ type: `rendu ${schema}`, description: chemin });
      await contexte.close();
    }
  });
});
