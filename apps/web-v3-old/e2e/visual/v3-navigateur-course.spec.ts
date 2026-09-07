import { expect, test, type Browser, type BrowserContext, type Page, type Route } from '@playwright/test';

import {
  CONVERSATION_RICHE,
  passerelleDeBouchon,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';

/**
 * LA COURSE DE DOUBLE-NAVIGATION (#5163, revue du tour) — `v3-navigateur.spec.ts`
 * et `v3-navigateur-fuites.spec.ts` prouvent la navigation douce et l'absence
 * de fuite sur une séquence STRICTEMENT séquentielle (chaque clic attend son
 * écran avant le suivant) ; aucun des deux n'exerçait la fenêtre où une
 * SECONDE navigation démarre pendant que la PREMIÈRE n'est plus annulable
 * (`enVol?.abort()` n'annule que le `fetch` — passé `extraitLEchange`, plus
 * rien n'est en vol) mais n'a pas fini de monter son module.
 *
 * `lib/realtime/navigateur.ts` ferme cette fenêtre par un jeton de génération
 * (`generation`/`mienne`), vérifié à DEUX moments : avant `meeshy:zone-depart`
 * (la navigation périmée n'a encore touché ni destruction ni DOM) et — le
 * point que ce spec cible spécifiquement — juste avant `importe.monte()`,
 * APRÈS que l'`import()` dynamique du module a fini de résoudre
 * (`monteLeModule`, la revérification `estActuelle()`).
 *
 * REPRODUCTION DÉTERMINISTE, sans minuterie arbitraire : `participate.<hash>.js`
 * est un fichier UNIQUE et content-hashé, partagé par TOUTE navigation vers un
 * écran `fil` (`lib/actifs-rt.ts`) — le module loader du navigateur DÉDUPLIQUE
 * deux `import()` de la MÊME URL pendant qu'un premier est en vol : une seule
 * requête part, que ce spec RETIENT via `page.route` (jamais de `route.continue()`
 * automatique) et relâche lui-même, au moment de son choix.
 *
 * LE VERDICT ÉTAIT UN DIFFÉRENTIEL, DEVENU UN COMPTE ABSOLU (revue 2026-09-06,
 * défaut majeur « double montage à la première traversée douce vers un écran »).
 * `participate.ts` (et `liste.ts`, `notifs.ts`, même patron) portait, à sa
 * racine, un AUTO-DÉMARRAGE (`void demarre();`, doc-comment de son export
 * `monte`) : « sans navigateur, l'import du chargeur suffit ». Cet
 * auto-démarrage fait partie de la PREMIÈRE évaluation du module, donc il
 * tournait aussi lors d'une navigation DOUCE tout à fait ORDINAIRE, SANS
 * AUCUNE course, la toute première fois que la session visite un `fil` :
 * `importe.monte()` (l'appel explicite de `monteLeModule`) tournait ENSUITE,
 * sur le MÊME module déjà évalué, contre le MÊME `<main>` — DEUX
 * `conversation:join`, DEUX sockets, DEUX `observeCycleDeVie`, et les CINQ
 * écouteurs du composeur (`composeur.ts:428-432`) reposés deux fois : un
 * message envoyé partait deux fois. Ce n'était PAS un défaut préexistant hors
 * périmètre — sans le navigateur de zone, `monte()` n'était JAMAIS appelé
 * explicitement, donc jamais doublé ; c'est le protocole de montage LIVRÉ PAR
 * CE TRAVAIL qui produit le doublon. Correctif : `unSeulMontageParEcran(main)`
 * (`lib/realtime/lifecycle.ts`, SITE UNIQUE) — un marqueur posé sur le NŒUD
 * `<main>` lui-même, qui disparaît avec lui à chaque `echangeLeDocument` — que
 * les TROIS modules appellent juste après avoir trouvé leur `<main>`, avant
 * tout travail de montage (socket, écouteurs, cycle de vie). `ouvreUnFilNeuf`
 * (traverseeDeReference, plus bas) mesure désormais UNE seule connexion, un
 * compte ABSOLU — plus une base ouverte à laquelle comparer la course.
 *

 * Séquence de la course :
 *   1. clic sur la PREMIÈRE ligne de `/chats` → fil de la conversation A ; le
 *      DOM bascule (le gabarit `fil` est servi par le document, indépendant du
 *      montage du module), et `import(participate.<hash>.js)` part — RETENU ;
 *   2. PENDANT que cette requête est retenue, clic vers LE SECOND fil du
 *      bouchon (`CONVERSATION_RICHE`, `/chats/fil-riche` — une conversation
 *      ANNEXE, complète et DISTINCTE, § doc-tête de `serveurs.ts` ; le fil A
 *      lui-même ne montre qu'un lien « retour » et son propre historique, donc
 *      ce second lien est INJECTÉ comme un lien interne ordinaire, cf. le
 *      motif de la FRONTIÈRE dans `v3-navigateur.spec.ts`) ; SON `import()` de
 *      la MÊME URL de module rejoint la requête déjà en vol (aucune seconde
 *      requête ne part — mesuré par le journal des requêtes du module) ;
 *   3. on RELÂCHE la requête retenue une fois B posé sur le DOM. SANS le
 *      jeton, la continuation PÉRIMÉE de A trouve elle aussi
 *      `main[data-participation="fil"]` — celui de B, le SEUL présent — et
 *      remonte PAR-DESSUS lui, ouvrant un TROISIÈME socket (deux de
 *      l'auto-démarrage + l'explicite de B, plus l'explicite PÉRIMÉ de A) ;
 *      AVEC le jeton, la continuation de A se tait (`estActuelle()` rend
 *      faux) et le compte reste EXACTEMENT celui de la base.
 *
 * Verdict lu à la SOURCE (`passerelle.socket`), jamais déduit du DOM : une
 * connexion socket.io fantôme ne laisse aucune trace visuelle.
 */

const NAVIGABLE_DU_TEST = '/chats,/chat/,/feed';

let passerelle: PasserelleDeBouchon;
let v3: ServeurV3;

const cookiesDuLecteur = (base: string) => [
  { name: 'meeshy_session', value: 'sonde', url: base },
  { name: 'meeshy_auth', value: 'JWT.sonde', url: base },
];

const contexteDuLecteur = async (browser: Browser): Promise<BrowserContext> => {
  const contexte = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await contexte.addCookies(cookiesDuLecteur(v3.base));
  return contexte;
};

const ouvreLaListe = async (contexte: BrowserContext): Promise<Page> => {
  const page = await contexte.newPage();
  await page.goto(`${v3.base}/chats`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('main[data-participation="liste"]') !== null);
  await page.waitForFunction(
    () => (window as Window & { __zoneNavigateur?: number }).__zoneNavigateur !== undefined,
  );
  return page;
};

const conversationAffichee = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.querySelector('main[data-conversation]')?.getAttribute('data-conversation') ?? null);

/**
 * LA BASE — une traversée UNIQUE, sans second clic, vers un `fil` que cette
 * session n'a JAMAIS visité (module JAMAIS importé). Depuis le correctif
 * `unSeulMontageParEcran` (revue 2026-09-06), cette traversée n'ouvre plus
 * qu'UNE connexion : le nombre qu'elle rend est donc un COMPTE ABSOLU, vérifié
 * ci-dessous (`toBe(1)`), et non plus seulement un dénominateur auquel
 * comparer la course. Le CONTEXTE est fermé et ses sockets vidés avant de
 * rendre la main : le compteur `connectes()` partagé par tout le bouchon ne
 * doit plus rien porter de CETTE mesure quand la suivante commence.
 */
const traverseeDeReference = async (browser: Browser): Promise<number> => {
  const contexte = await contexteDuLecteur(browser);
  const page = await ouvreLaListe(contexte);
  await expect.poll(() => passerelle.socket.connectes(), { timeout: 10_000 }).toBeGreaterThan(0);

  await page.locator('a.ligne').first().click();
  await page.waitForFunction(() => document.querySelector('main[data-participation="fil"]') !== null);
  // Le temps que l'auto-démarrage ET l'appel explicite, s'ils courent tous
  // les deux, aient fini de se connecter — condition sur le NOMBRE de
  // `conversation:join` déjà reçus pour CETTE conversation, jamais une
  // minuterie arbitraire : deux appels concurrents à `connecte()` peuvent
  // chacun prendre plusieurs allers-retours (auth différée du bouchon,
  // `DELAI_D_AUTHENTIFICATION_MS`).
  const conversation = await conversationAffichee(page);
  await expect
    .poll(
      () => passerelle.socket.recus.filter(
        (e) => e.evenement === 'conversation:join'
          && (e.charge as { conversationId?: string } | null)?.conversationId === conversation,
      ).length,
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
  // Marge : si un SECOND montage devait encore arriver (l'appel explicite,
  // typiquement un peu derrière l'auto-démarrage), le laisser arriver avant
  // de lire le compte.
  await page.waitForTimeout(500);

  const compte = passerelle.socket.connectes();
  await contexte.close();
  await expect.poll(() => passerelle.socket.connectes(), { timeout: 10_000 }).toBe(0);
  return compte;
};

test.describe('la course de double-navigation ne monte pas de socket AU-DESSUS de la base', () => {
  test.setTimeout(90_000);

  test.beforeAll(async () => {
    passerelle = await passerelleDeBouchon();
    v3 = await serveurDeLaV3(passerelle.base, { V3_NAVIGABLE: NAVIGABLE_DU_TEST });
  });

  test.afterAll(async () => {
    await v3?.ferme();
    await passerelle?.ferme();
  });

  test('deux navigations vers `fil` pendant que le module partage un import en vol : le compte de sockets ne dépasse pas la base', async ({
    browser,
  }) => {
    // LA BASE — une traversée normale, sur SA PROPRE page (module jamais
    // importé, comme la course en a besoin plus bas).
    const base = await traverseeDeReference(browser);
    // COMPTE ABSOLU depuis le correctif `unSeulMontageParEcran` — une
    // traversée UNIQUE, non racée, vers un `fil` jamais visité ouvre
    // EXACTEMENT une connexion (rouge avant le correctif : `2`, l'auto-
    // démarrage ET l'appel explicite du navigateur de zone montaient tous
    // les deux).
    expect(base).toBe(1);

    // LA COURSE — une SECONDE page, fraîche : son cache de modules est vierge,
    // condition pour que `import(participate.<hash>.js)` reparte sur le
    // réseau et que la requête soit interceptable.
    const contexte = await contexteDuLecteur(browser);
    const page = await ouvreLaListe(contexte);
    await expect.poll(() => passerelle.socket.connectes(), { timeout: 10_000 }).toBeGreaterThan(0);

    // LA REQUÊTE DU MODULE PARTAGÉ, RETENUE — une seule interception suffit :
    // la dédup du loader garantit qu'une SEULE requête réseau part pour les
    // deux navigations vers `fil`, tant qu'elles visent la même URL.
    let requetesDeModule = 0;
    let routeRetenue: Route | null = null;
    const moduleRetenu = new Promise<void>((resoud) => {
      void page.route(/\/rt\/participate\.[^/]+\.js$/, async (route) => {
        requetesDeModule += 1;
        routeRetenue = route;
        resoud();
        // NE JAMAIS appeler `route.continue()` ici — c'est le test qui
        // décide du moment, via `routeRetenue.continue()` plus bas.
      });
    });

    // ALLER A — clic sur la première ligne de `/chats`.
    await page.locator('a.ligne').first().click();
    // Le GABARIT du fil arrive quel que soit le sort du module : le document
    // est servi indépendamment de son montage.
    await page.waitForFunction(() => document.querySelector('main[data-participation="fil"]') !== null);
    const conversationAffichA = await conversationAffichee(page);
    expect(conversationAffichA).not.toBeNull();
    expect(conversationAffichA).not.toBe(CONVERSATION_RICHE.id);

    // La requête du module A est partie et RETENUE — attendre CETTE preuve,
    // jamais une minuterie.
    await moduleRetenu;

    // ALLER B — PENDANT que le module de A est en vol, un second clic vers le
    // SECOND fil du bouchon, une conversation DISTINCTE et COMPLÈTE
    // (`CONVERSATION_RICHE`) — injecté comme un lien interne ordinaire, le
    // fil A lui-même n'affichant qu'un lien « retour » vers la liste.
    await page.evaluate((cle) => {
      const lien = document.createElement('a');
      lien.href = `/chats/${cle}`;
      lien.id = 'rejoue-vers-b';
      lien.textContent = 'conversation B';
      document.querySelector('main')?.append(lien);
    }, CONVERSATION_RICHE.id);
    await page.locator('#rejoue-vers-b').click();
    await page.waitForFunction(() => document.querySelector('main[data-participation="fil"]') !== null);
    await expect.poll(async () => conversationAffichee(page)).toBe(CONVERSATION_RICHE.id);
    const conversationAffichB = await conversationAffichee(page);

    // AUCUNE seconde requête réseau : la dédup du loader a tenu.
    expect(requetesDeModule).toBe(1);

    // ON RELÂCHE — les deux continuations retenues (celle de A, périmée, et
    // celle de B, actuelle) reprennent.
    await expect.poll(() => routeRetenue !== null).toBe(true);
    await (routeRetenue as unknown as Route).continue();

    // Le socket EXPLICITE de B (et l'auto-démarrage, qui tourne UNE fois pour
    // ce module, quel que soit celui des deux clics qui a déclenché sa
    // PREMIÈRE évaluation) doivent apparaître.
    await expect
      .poll(
        () => passerelle.socket.recus.filter(
          (e) => e.evenement === 'conversation:join'
            && (e.charge as { conversationId?: string } | null)?.conversationId === CONVERSATION_RICHE.id,
        ).length,
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);

    // Marge : si la continuation périmée de A devait monter malgré tout
    // (régression), c'est ICI qu'un socket EN SURPLUS de la base
    // apparaîtrait.
    await page.waitForTimeout(500);

    // LE VERDICT — un COMPTE ABSOLU depuis `unSeulMontageParEcran` : `base`
    // vaut 1 (asserté plus haut), et la course ne doit pas en laisser
    // DAVANTAGE. Sans le jeton de génération, la continuation périmée de A
    // ouvrirait un socket DE PLUS que la base — ici, sur LA CONVERSATION DE B.
    expect(passerelle.socket.connectes()).toBe(1);
    expect(passerelle.socket.connectes()).toBe(base);

    // Et le DOM ne montre toujours qu'UN fil, celui de B — jamais deux
    // montages concurrents laissant deux jeux d'écouteurs sur le même
    // `<main>`.
    expect(await page.locator('main[data-participation="fil"]').count()).toBe(1);
    expect(await conversationAffichee(page)).toBe(conversationAffichB);

    // LE SYMPTÔME UTILISATEUR, DIRECTEMENT : un double montage posait DEUX
    // écouteurs `submit` sur le MÊME `<form class="composeur">`
    // (`composeur.ts:428-432`) — envoyer un message en écrivait deux,
    // chacun avec son propre `clientMessageId`. Un seul clic sur « Envoyer »
    // doit produire UN SEUL `message:send`, jamais deux.
    await page.locator('#champ-texte').fill('un seul message, un seul envoi');
    await page.locator('form.composeur button.envoyer').click();
    const messagesEnvoyes = () => passerelle.socket.recus.filter(
      (e) => e.evenement === 'message:send'
        && (e.charge as { conversationId?: string } | null)?.conversationId === CONVERSATION_RICHE.id,
    ).length;
    await expect.poll(messagesEnvoyes, { timeout: 10_000 }).toBeGreaterThan(0);
    // Marge : si un second écouteur devait encore émettre (régression), lui
    // laisser le temps d'arriver avant de compter.
    await page.waitForTimeout(500);
    expect(messagesEnvoyes()).toBe(1);

    await contexte.close();
  });
});
