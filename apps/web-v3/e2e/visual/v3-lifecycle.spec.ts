// GATE § 8.5 — « 0 requête pendant que l'onglet est `hidden` ; 1 seule requête de battement pour
// N onglets sur 10 min », et la ligne anti-régression du § 6.5 : « `visibilitychange:hidden` seul
// ⇒ ZÉRO requête mutante (assertion sur le journal réseau) ».
//
// Ce fichier ne PORTE pas la loi, il l'APPLIQUE : le verdict, les deux barres, le plafond de
// battements, la table de recette et le scénario fabriqué vivent dans `lib/lifecycle.ts`, gagés
// sans navigateur par `__tests__/lifecycle-gate.test.ts`. Ici il ne reste que ce qu'un navigateur
// seul peut faire — occulter un onglet, ouvrir deux pages dans un même contexte, et lire ce qui
// part.
//
// POURQUOI UN SCÉNARIO FABRIQUÉ, ET PAS UN ÉCRAN
//
// Aucun écran de la v3 ne tient encore de session invitée. Opposer ce gate au dépôt tel qu'il est
// rendrait un vert de VACUITÉ — précisément le défaut que l'issue #4442 corrige, et que le § 9.5
// a déjà payé pour le gate axe (« un `[]` prouve l'instrument en panne, pas l'absence de
// violation »). L'instrument se prouve donc sur QUATRE sujets qu'il fabrique, chacun étant le
// scénario conforme MOINS UNE loi — il mute sur `hidden`, il ne suspend pas son battement minuté,
// il n'élit pas de porteur, il bat trop souvent —, et sur le scénario conforme, où il doit PASSER.
// Un sujet qui enfreindrait deux lois à la fois rendrait le rouge juste et le rapport muet.
// Les six cas C→H de la recette arrivent avec l'écran `thread` (L2) ; la table `CAS_DE_RECETTE` dit
// lesquels, et le dernier témoin de ce fichier l'oppose au lecteur plutôt que de le taire.

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import {
  BATTEMENT,
  CHEMIN_DE_LA_PAGE_FABRIQUEE,
  CHEMIN_DU_SCENARIO,
  SCENARIO_CONFORME,
  SCENARIO_QUI_BAT_PAR_ONGLET,
  SCENARIO_QUI_BAT_TROP_SOUVENT,
  SCENARIO_QUI_MUTE_CACHE,
  SCENARIO_QUI_NE_SUSPEND_PAS,
  casAPorter,
  casPortes,
  estBattement,
  mutationsPendantOngletCache,
  pageFabriquee,
  plafondDeBattements,
  rapporteRequetesInterdites,
  requetesPendantOngletCache,
  estMutante,
  verdictDeBattement,
  type EntreeDeJournal,
  type FenetreFabriquee,
  type ScenarioFabrique,
} from './lib/lifecycle';
import {
  avance,
  avanceDeLaFenetreDeRecette,
  bascule,
  DELAI_D_OBSERVATION_MS,
  DELAI_DE_REPOS_MS,
  enregistre,
  figeLHorloge,
  installeLHorloge,
  occulte,
  revele,
} from './lib/navigateur-cycle';
import { porteInvitee } from './lib/porte-invitee';
import {
  CONVERSATION_DU_LECTEUR,
  IDENTIFIANT_DU_LIEN_PARTAGE,
  INVITE,
  passerelleDeBouchon,
  serveurDeLaV3,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './lib/serveurs';

// LE TEMPS DE LA PAGE EST VIRTUEL, ET C'EST CE QUI REND LE GATE VOYANT.
//
// Ce fichier observait l'occultation pendant 500 ms de temps MACHINE, face à une période de
// battement de 300 000 ms — un rapport de 600. La seule fuite qu'une telle fenêtre peut voir est
// celle qui part SYNCHRONEMENT du gestionnaire `visibilitychange` ; tout ce qui est minuté (un
// `setInterval` que personne n'a arrêté, une revalidation différée, une préchargeuse de fond) lui
// est structurellement hors de portée, et une page dont le battement n'est JAMAIS suspendu en sort
// VERTE — violation frontale du § 6.2 (« SUSPENDRE le battement et les requêtes de fond ») sous un
// gate que le § 8.5 déclare livré.
//
// L'argument qui avait écarté l'horloge accélérée — « elle rendrait le compte dépendant de la
// machine » — est juste pour une horloge RÉELLE accélérée et FAUX pour `page.clock`, qui est une
// horloge VIRTUELLE : elle fige le temps de la page à l'installation et ne l'avance que sur ordre.
// Un `setInterval` y fait exactement `floor(durée / période)` tours, sans qu'aucune seconde réelle
// ne s'écoule — c'est le temps machine qui n'est pas déterministe, pas celui-ci.
//
// Ce qui reste hors de portée, et qu'il faut dire : une fuite qui ne serait déclenchée ni par un
// événement ni par une minuterie (une réponse réseau qui en enchaîne une autre, par exemple) ne
// tombe pas dans cette fenêtre. La classe minutée, elle, y est désormais entière.

// Les gestes de navigateur — occulter, figer l'horloge, lire ce qui part — vivent dans
// `lib/navigateur-cycle.ts`, partagés avec l'écran réel (`v3-fil-invite.spec.ts`).

// LA CHAÎNE RÉELLE, pour les six cas C→H : le serveur de la v3 tel que `next build` l'a émis,
// la passerelle de bouchon et le bouchon socket — montés une fois pour le fichier, sur des ports
// libres. Le scénario fabriqué, lui, ne les touche pas : il est servi par l'interception.
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

// Chaque cas repart d'une place ACTIVE, d'un lien OUVERT, d'un `/sync` sans trou et d'un journal
// vide : les cas D, F et G mutent l'un ou l'autre, et un ordre de tests ne doit rien décider.
test.beforeEach(() => {
  passerelle.placesActives.add(INVITE.session);
  passerelle.lien.actif = true;
  passerelle.sync.curseur = 0;
  passerelle.oublie();
});

const ONGLETS = 2;

const UN_SEUL_ONGLET = 1;

// Le scénario est SERVI PAR L'INTERCEPTION, jamais par le serveur : il n'est donc ni une route
// émise, ni une page que `budgets.json` doit réclamer, ni quoi que ce soit qu'un autre gate
// puisse voir passer.
const sert = async (page: Page, scenario: ScenarioFabrique): Promise<void> => {
  await page.route(new RegExp(CHEMIN_DU_SCENARIO), async (route) => {
    const chemin = new URL(route.request().url()).pathname;
    await (chemin === CHEMIN_DE_LA_PAGE_FABRIQUEE
      ? route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: pageFabriquee(scenario),
        })
      : route.fulfill({ status: 204, body: '' }));
  });
  await page.goto(CHEMIN_DE_LA_PAGE_FABRIQUEE, { waitUntil: 'load' });
  await page.waitForTimeout(DELAI_DE_REPOS_MS);
};

// Un onglet servi sur une horloge installée puis figée — le geste complet, pour que les deux
// témoins du § 6.5 ne le recopient pas chacun de leur côté.
const ouvreUnOnglet = async (
  contexte: BrowserContext,
  scenario: ScenarioFabrique,
): Promise<Page> => {
  await installeLHorloge(contexte);
  const page = await contexte.newPage();
  await sert(page, scenario);
  await figeLHorloge(contexte);
  return page;
};

const porteur = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as FenetreFabriquee).__gatePorteur());

const battements = (entrees: readonly EntreeDeJournal[]): number =>
  entrees.filter(estBattement).length;

test.describe('§ 6.5 — `visibilitychange:hidden` seul ⇒ ZÉRO requête mutante', () => {
  // LE TÉMOIN DE CONTRÔLE. Un gate d'absence qui n'a jamais vu de présence ne prouve rien : celui-ci
  // commence par tomber sur une page qui fait EXACTEMENT ce que le § 6.2 interdit — muter sur
  // l'événement `hidden`, qui se déclenche à chaque bascule d'application, verrouillage d'écran et
  // tirage de notification, c'est-à-dire au geste même du rôle premier.
  test('TOMBE sur le scénario fabriqué qui mute pendant hidden', async ({ context }) => {
    const journal = enregistre(context);
    const page = await ouvreUnOnglet(context, SCENARIO_QUI_MUTE_CACHE);

    const fenetres = [await bascule(context, page)];
    const mutations = mutationsPendantOngletCache({ journal: journal(), fenetres });

    expect(
      mutations.map((entree) => `${entree.methode} ${new URL(entree.url).pathname}`),
      "l'instrument n'a pas vu la mutation fabriquée : c'est LUI qui est en panne, pas la page",
    ).toEqual(['POST /__gate-cycle-de-vie/anonymous/leave']);
    expect(rapporteRequetesInterdites('scénario défectueux', mutations, fenetres)).toContain(
      'anonymous/leave',
    );
  });

  // LE SECOND TÉMOIN DE CONTRÔLE, ET LE SEUL QUI OPPOSE LA BARRE « 0 REQUÊTE » DU § 8.5.
  //
  // Celui du dessus mute DANS le gestionnaire `hidden` : c'est la seule forme de fuite qu'une
  // fenêtre d'observation de 500 ms machine pouvait voir, et c'était donc la seule que le gate
  // savait faire rougir — un instrument taillé à la forme de son unique sujet. Ici la page ne mute
  // rien dans son gestionnaire : elle laisse simplement battre une minuterie que personne n'arrête,
  // ce que fait toute page qui oublie la première ligne du § 6.2. Sur la fenêtre de recette, le
  // journal doit porter ses battements — et s'il est vide, c'est l'INSTRUMENT qui est aveugle.
  test('TOMBE quand le battement n’est pas suspendu pendant hidden', async ({ context }) => {
    const journal = enregistre(context);
    const page = await ouvreUnOnglet(context, SCENARIO_QUI_NE_SUSPEND_PAS);

    const fenetres = [await bascule(context, page)];
    const pendant = requetesPendantOngletCache({ journal: journal(), fenetres });

    // Le compte EXACT, pas seulement « au moins un » : sur la fenêtre de recette, une page qui ne
    // suspend rien émet ce qu'un porteur émettrait à découvert. Un compte plus BAS dirait que la
    // fenêtre virtuelle n'a pas couvert les dix minutes qu'elle annonce — c'est-à-dire que
    // l'instrument est revenu, sans le dire, à une observation plus courte que la période.
    expect(
      pendant.length,
      "l'instrument n'a pas vu les battements d'une page qui ne suspend rien : sa fenêtre d'observation est plus courte que la période du battement",
    ).toBe(plafondDeBattements({ dureeMs: BATTEMENT.fenetreDeRecetteMs, periodeMs: BATTEMENT.periodeMs }));
    expect(pendant.every(estBattement), 'la fuite vue n’est pas le battement fabriqué').toBe(true);
    expect(rapporteRequetesInterdites('scénario qui ne suspend pas', pendant, fenetres)).toContain(
      'guest-sessions/me',
    );
  });

  // ET IL PASSE UNE FOIS CORRIGÉ — sans devenir inerte pour autant. Une page corrigée qui ne
  // demanderait plus RIEN passerait ce gate par inertie, et le vert ne dirait rien de la
  // suspension. Le second témoin est donc la REPRISE du § 6.2 : sur `visible`, le battement repart.
  test('PASSE sur le même scénario corrigé, et sa reprise le prouve vivant', async ({ context }) => {
    const journal = enregistre(context);
    const page = await ouvreUnOnglet(context, SCENARIO_CONFORME);

    const fenetres = [await bascule(context, page)];
    const pendant = requetesPendantOngletCache({ journal: journal(), fenetres });

    expect(
      pendant,
      rapporteRequetesInterdites('scénario corrigé (§ 8.5 : 0 requête)', pendant, fenetres),
    ).toEqual([]);
    expect(
      battements(journal()),
      'aucune reprise observée : le vert ci-dessus ne prouve que l’inertie de la page',
    ).toBeGreaterThan(0);
  });
});

test.describe('§ 8.5 — 1 seule requête de battement pour N onglets sur 10 min', () => {
  const ouvre = async (
    contexte: BrowserContext,
    scenario: ScenarioFabrique,
    onglets: number,
  ): Promise<readonly Page[]> => {
    await installeLHorloge(contexte);
    const pages: Page[] = [];
    for (let rang = 0; rang < onglets; rang += 1) {
      const page = await contexte.newPage();
      await sert(page, scenario);
      pages.push(page);
    }
    // UNE seule fois, quand TOUS les onglets sont chargés : l'horloge est celle du contexte, et la
    // figer par onglet la remettrait à l'instant de départ pour ceux déjà ouverts.
    await figeLHorloge(contexte);
    return pages;
  };

  // LA DURÉE OPPOSÉE EST CELLE QUE LE § 8.5 NOMME, jamais une durée déduite du compte observé.
  //
  // Elle valait `TICS * BATTEMENT.periodeMs` pendant que le scénario à porteur unique émettait
  // exactement `TICS` battements : `plafond = floor(TICS·P / P) = TICS`, donc `TICS <= TICS` — une
  // comparaison vraie par CONSTRUCTION, quelles que soient la valeur de TICS et la période réelle.
  // Le seul discriminant qui restait était l'ÉLECTION ; le RAPPORT que le § 8.5 énonce ne pouvait
  // pas tomber, et `BATTEMENT.fenetreDeRecetteMs` n'avait aucun appelant. Ici le plafond vient de
  // la fenêtre de recette (2 sur 10 min) et le compte vient de l'horloge : les deux nombres ont
  // des origines DIFFÉRENTES, ce qui est la condition pour qu'une comparaison signifie quelque chose.
  const verdict = (
    entrees: readonly EntreeDeJournal[],
    onglets: number,
  ): ReturnType<typeof verdictDeBattement> =>
    verdictDeBattement({
      battements: battements(entrees),
      onglets,
      dureeMs: BATTEMENT.fenetreDeRecetteMs,
      periodeMs: BATTEMENT.periodeMs,
    });

  // La fenêtre de recette entière s'écoule dans l'horloge VIRTUELLE du contexte — UNE avance pour
  // tous les onglets, comme un seul temps pour un seul navigateur. Le nombre de battements devient
  // une CONSÉQUENCE de la période, au lieu d'être une entrée du spec.
  const joue = async (
    contexte: BrowserContext,
    pages: readonly Page[],
  ): Promise<void> => {
    await avanceDeLaFenetreDeRecette(contexte);
    await pages[0]?.waitForTimeout(DELAI_D_OBSERVATION_MS);
  };

  test('TOMBE quand chacun des deux onglets bat pour soi', async ({ context }) => {
    const journal = enregistre(context);
    const pages = await ouvre(context, SCENARIO_QUI_BAT_PAR_ONGLET, ONGLETS);
    await joue(context, pages);

    const resultat = verdict(journal(), ONGLETS);

    expect(resultat.observes).toBe(resultat.plafond * ONGLETS);
    expect(resultat.conforme, "l'instrument n'a pas vu les N écritures d'une seule personne").toBe(
      false,
    );
    expect(resultat.raison).toContain(`${ONGLETS} onglet`);
  });

  // LE RAPPORT, OPPOSÉ SANS L'ÉLECTION. Un porteur UNIQUE dans un onglet UNIQUE, qui bat cinq fois
  // trop vite : le seul défaut est le TAUX. Sans ce témoin, la barre du § 8.5 n'aurait jamais de
  // sujet qui la fasse rougir autrement que par une élection ratée.
  test('TOMBE sur un porteur unique qui bat trop souvent', async ({ context }) => {
    const journal = enregistre(context);
    const pages = await ouvre(context, SCENARIO_QUI_BAT_TROP_SOUVENT, UN_SEUL_ONGLET);
    await joue(context, pages);

    const resultat = verdict(journal(), UN_SEUL_ONGLET);

    expect(resultat.observes).toBeGreaterThan(resultat.plafond);
    expect(resultat.conforme, 'un porteur qui bat cinq fois trop vite passe le gate').toBe(false);
    expect(resultat.raison).toContain('trop souvent');
  });

  test('PASSE quand les deux onglets élisent un seul porteur', async ({ context }) => {
    const journal = enregistre(context);
    const pages = await ouvre(context, SCENARIO_CONFORME, ONGLETS);

    // L'élection est un ÉTAT, pas un instant : on attend qu'elle ait convergé avant de jouer, et
    // cette attente EST le témoin — deux porteurs, ou zéro, sont l'un et l'autre une élection
    // ratée.
    await expect
      .poll(async () => (await Promise.all(pages.map(porteur))).filter(Boolean).length)
      .toBe(1);

    await joue(context, pages);
    const resultat = verdict(journal(), ONGLETS);

    // Le porteur unique émet EXACTEMENT le plafond, jamais moins : un vert obtenu par un battement
    // qui ne part pas serait le bail que le serveur libère sous les pieds de l'invité (§ 6.4).
    expect(resultat.observes).toBe(resultat.plafond);
    expect(resultat.conforme, resultat.raison ?? '').toBe(true);
  });
});

test.describe('§ 6.5 — les six cas sur l’écran thread', () => {
  test('cas C — 10 min en arrière-plan puis retour : rien ne part, aucune modale, aucun re-join, et le message reçu pendant l’absence apparaît', async ({ browser }) => {
    const contexte = await porte.contexteDeLInvite(browser);
    await installeLHorloge(contexte);
    const page = await porte.ouvre(contexte);
    await figeLHorloge(contexte);
    await page.waitForTimeout(DELAI_DE_REPOS_MS);
    passerelle.oublie();
    const journal = enregistre(contexte);

    const fenetres = [
      await bascule(contexte, page, () => {
        // Un autre a écrit pendant l'absence : la liste ET `/sync` le servent, le socket ne le rejoue pas.
        passerelle.ajouteUnMessage(porte.messageDIbrahim('m301', 'Écrit pendant votre absence'));
      }),
    ];

    const pendant = requetesPendantOngletCache({ journal: journal(), fenetres });
    expect(pendant, rapporteRequetesInterdites('cas C — onglet caché 10 min', pendant, fenetres)).toEqual([]);

    await expect(page.locator('li[data-id="m301"]')).toBeVisible({ timeout: 10_000 });
    expect(await page.locator('dialog').count()).toBe(0);
    await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'connecte', { timeout: 10_000 });

    // Au retour, dans l'ordre du § 6.3.C : `refresh`, puis `GET /sync` depuis le curseur — une fois chacun.
    const apres = journal().filter((e) => e.emiseA >= (fenetres[0]?.fin ?? 0));
    expect(apres.filter(estBattement)).toHaveLength(1);
    expect(apres.filter((e) => e.url.includes('/api/v1/sync'))).toHaveLength(1);
    expect(apres.filter(estMutante).map((e) => new URL(e.url).pathname)).toEqual(['/api/v1/guest-sessions/me']);
    expect(porte.aucuneJonction()).toBe(true);
    await contexte.close();
  });

  test('cas D — réseau coupé 5 min, deux messages écrits hors ligne : ils partent dans l’ordre, GET /sync rattrape depuis le curseur — sans trou, la passerelle n’en mesure aucun pour une session anonyme —, le jeton est le même', async ({ browser }) => {
    const contexte = await porte.contexteDeLInvite(browser);
    await installeLHorloge(contexte);
    const page = await porte.ouvre(contexte);
    await figeLHorloge(contexte);
    const jetonAvant = (await porte.cookieDeLaPlace(contexte))?.value;
    const miensAvant = await page.locator('li.mien[data-id]').count();
    passerelle.oublie();

    await contexte.setOffline(true);
    await expect(page.locator('#bandeau-hors-ligne')).toBeVisible();
    await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'hors-ligne');

    await porte.ecrit(page, 'Premier');
    await porte.ecrit(page, 'Second');
    const enFile = page.locator('li.mien.envoi-hors-ligne');
    await expect(enFile).toHaveCount(2);
    // Optimiste, avec son horloge — et le composeur reste actif.
    await expect(enFile.first().locator('.attente')).toBeVisible();
    await expect(page.locator('form.composeur')).toBeVisible();

    // Le curseur du compte est creusé au-delà de `GAP_THRESHOLD` pendant l'absence.
    // Pour un MEMBRE qui annonce son `seq`, le prochain `/sync` rendrait `hasGap`
    // (gagé par `v3-fil.spec.ts`) ; pour une session ANONYME, `checkpointSeq` vaut
    // 0 par la loi de la passerelle (`routes/sync/index.ts:274-279`) et aucun trou
    // n'existe — un bouchon qui en peignait un ici racontait une chaîne que la
    // production ne produit jamais.
    passerelle.creuseUnTrou();
    await avance(contexte, 5 * 60_000);
    // Hors ligne : aucun appel, aucune destruction de jeton (§ 7).
    expect(passerelle.journal.filter((a) => a.methode === 'POST')).toEqual([]);
    expect((await porte.cookieDeLaPlace(contexte))?.value).toBe(jetonAvant);

    await contexte.setOffline(false);
    await expect(page.locator('#bandeau-hors-ligne')).toBeHidden();
    await expect(page.locator('li.mien.envoi-hors-ligne')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('li.mien.envoi-echec')).toHaveCount(0);
    await expect(page.locator('li.mien[data-id]')).toHaveCount(miensAvant + 2);

    // Dans l'ORDRE d'écriture, par le transport qui était là (socket ou REST).
    const envois = [
      ...passerelle.journal
        .filter((a) => a.methode === 'POST' && a.chemin.includes('/messages'))
        .map((a) => ({ a: a.a, texte: String(JSON.parse(a.corps).content) })),
      ...passerelle.socket.recus
        .filter((e) => e.evenement === 'message:send')
        .map((e) => ({ a: e.a, texte: String((e.charge as { content: string }).content) })),
    ]
      .sort((x, y) => x.a - y.a)
      .map((e) => e.texte);
    expect(envois).toEqual(['Premier', 'Second']);

    // Le rattrapage est parti depuis le curseur, avec la session — et rien n'a été inventé.
    const rattrapages = passerelle.journal.filter((a) => a.chemin.startsWith('/api/v1/sync'));
    expect(rattrapages).toHaveLength(1);
    expect(new URL(rattrapages[0]?.chemin ?? '', 'http://bouchon').searchParams.get('since')).not.toBeNull();
    expect(await page.locator('li.trou').count()).toBe(0);
    expect((await porte.cookieDeLaPlace(contexte))?.value).toBe(jetonAvant);
    expect(porte.aucuneJonction()).toBe(true);
    await contexte.close();
  });

  test('cas E — deux onglets sur le même lien : un seul porteur bat sur 10 min ; l’onglet qui reste émet et reçoit après la fermeture de l’autre', async ({ browser }) => {
    const contexte = await porte.contexteDeLInvite(browser);
    await installeLHorloge(contexte);
    const a = await porte.ouvre(contexte);
    const b = await porte.ouvre(contexte);
    await figeLHorloge(contexte);
    await a.waitForTimeout(DELAI_DE_REPOS_MS);
    const journal = enregistre(contexte);
    passerelle.oublie();
    expect(passerelle.socket.connectes()).toBe(2);

    await avance(contexte, BATTEMENT.fenetreDeRecetteMs);
    await a.waitForTimeout(DELAI_D_OBSERVATION_MS);
    const verdict = verdictDeBattement({
      battements: battements(journal()),
      onglets: 2,
      dureeMs: BATTEMENT.fenetreDeRecetteMs,
      periodeMs: BATTEMENT.periodeMs,
    });
    expect(verdict.conforme, verdict.raison ?? '').toBe(true);
    // Le porteur unique émet EXACTEMENT le plafond, jamais moins : un vert obtenu par un
    // battement qui ne part pas serait le bail que le serveur libère sous les pieds de l'invité.
    expect(verdict.observes).toBe(verdict.plafond);
    // Dix minutes de page ont passé, et les DEUX transports sont restés vivants : aucune
    // reconnexion, aucun `conversation:join` de plus. Un harnais qui laissait tomber le
    // socket sous l'horloge virtuelle (#4836) faisait ici une tempête de reconnexions que
    // seule la chance refermait — l'onglet restait « creux » une fois sur trois.
    expect(passerelle.socket.connectes()).toBe(2);
    expect(passerelle.socket.recus.filter((e) => e.evenement === 'conversation:join')).toHaveLength(0);

    passerelle.oublie();
    await b.close();
    // L'onglet qui reste est DANS la room, sans rien avoir à reprendre.
    await expect(a.locator('.etat')).toHaveAttribute('data-etat', 'connecte');
    await expect.poll(() => passerelle.socket.connectes(), { timeout: 15_000 }).toBe(1);

    passerelle.socket.emets(CONVERSATION_DU_LECTEUR.id, 'message:new', porte.messageDIbrahim('m401', 'Toujours là ?'));
    await expect(a.locator('li[data-id="m401"]')).toBeVisible({ timeout: 10_000 });
    await porte.ecrit(a, 'Toujours là.');
    await expect.poll(() => passerelle.socket.recus.filter((e) => e.evenement === 'message:send').length, { timeout: 10_000 }).toBe(1);
    expect(porte.cheminsRecus().some((c) => c.includes('/anonymous/leave'))).toBe(false);
    await contexte.close();
  });

  test('cas F — la place fermée en base : bandeau à BOUTON, la lecture reste, AUCUNE re-jonction sans clic', async ({ browser }) => {
    const contexte = await porte.contexteDeLInvite(browser);
    await installeLHorloge(contexte);
    const page = await porte.ouvre(contexte);
    await figeLHorloge(contexte);
    const lues = await page.locator('li.ligne').count();

    passerelle.placesActives.delete(INVITE.session);
    passerelle.oublie();
    const journal = enregistre(contexte);
    await avance(contexte, BATTEMENT.periodeMs);

    await expect(page.locator('#bandeau-place-fermee')).toBeVisible({ timeout: 10_000 });
    const bouton = page.locator('#bandeau-place-fermee a.action');
    await expect(bouton).toBeVisible();
    expect(await bouton.getAttribute('href')).toBe(`/chat/${IDENTIFIANT_DU_LIEN_PARTAGE}?pseudo=Tolu`);
    await expect(page.locator('form.composeur')).toBeHidden();
    await expect(page.locator('#composeur-ferme')).toBeVisible();
    expect(await page.locator('li.ligne').count()).toBe(lues);

    // Le battement, puis son CONTRÔLE — et rien d'autre de mutant.
    expect(journal().filter(estBattement)).toHaveLength(2);
    expect(journal().filter(estMutante).every(estBattement)).toBe(true);
    expect(porte.aucuneJonction()).toBe(true);
    expect(await porte.cookieDeLaPlace(contexte)).toBeUndefined();

    // Le bouton refait le CHOIX, pseudo pré-rempli — sur un CLIC, jamais avant.
    await bouton.click();
    await page.waitForLoadState('load');
    await expect(page.locator('dialog[open] #pseudo')).toHaveValue('Tolu');
    expect(porte.aucuneJonction()).toBe(true);
    await contexte.close();
  });

  /**
   * CAS F, À DEUX ONGLETS — la place a DEUX projections (§ 12.3) : le cookie, que le
   * serveur lit, et le stockage `meeshy.guest.<lien>`, que les onglets voisins écoutent.
   * Le porteur bat, constate la place fermée, l'efface sur les deux supports ; l'onglet
   * qui ne bat JAMAIS (il n'est pas porteur) apprend la fermeture par `storage`
   * (`jeton-externe`, valeur nulle) — bandeau à bouton, composeur fermé, lecture
   * conservée — sans un battement de plus, sans jonction. Avant ce témoin, rien
   * n'écrivait la projection de stockage : la transition était un chemin mort.
   */
  test('cas F bis — deux onglets, la place fermée : le porteur bat, l’autre apprend par le stockage — deux battements en tout, aucune jonction', async ({ browser }) => {
    const contexte = await porte.contexteDeLInvite(browser);
    await installeLHorloge(contexte);
    const a = await porte.ouvre(contexte);
    const b = await porte.ouvre(contexte);
    await figeLHorloge(contexte);
    const luesDansA = await a.locator('li.ligne').count();

    passerelle.placesActives.delete(INVITE.session);
    passerelle.oublie();
    const journal = enregistre(contexte);
    await avance(contexte, BATTEMENT.periodeMs);

    await expect(a.locator('#bandeau-place-fermee')).toBeVisible({ timeout: 10_000 });
    await expect(b.locator('#bandeau-place-fermee')).toBeVisible({ timeout: 10_000 });
    await expect(a.locator('form.composeur')).toBeHidden();
    await expect(b.locator('form.composeur')).toBeHidden();
    expect(await a.locator('li.ligne').count()).toBe(luesDansA);

    expect(journal().filter(estBattement)).toHaveLength(2);
    expect(journal().filter(estMutante).every(estBattement)).toBe(true);
    expect(porte.aucuneJonction()).toBe(true);
    expect(await porte.cookieDeLaPlace(contexte)).toBeUndefined();
    await contexte.close();
  });

  test('cas G — le lien désactivé pendant la lecture : composeur fermé avec sa raison, contenu conservé, file annulée et VISIBLE', async ({ browser }) => {
    const contexte = await porte.contexteDeLInvite(browser);
    await installeLHorloge(contexte);
    const page = await porte.ouvre(contexte);
    await figeLHorloge(contexte);
    const lues = await page.locator('li.ligne').count();

    await contexte.setOffline(true);
    await expect(page.locator('#bandeau-hors-ligne')).toBeVisible();
    await porte.ecrit(page, 'Parti trop tard');
    await expect(page.locator('li.mien.envoi-hors-ligne')).toHaveCount(1);

    passerelle.lien.actif = false;
    passerelle.oublie();
    await contexte.setOffline(false);

    await expect(page.locator('#composeur-ferme')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#composeur-ferme .raison')).toHaveText('Ce lien a été fermé par son auteur.');
    await expect(page.locator('form.composeur')).toBeHidden();
    const echouee = page.locator('li.mien.envoi-echec');
    await expect(echouee).toHaveCount(1);
    await expect(echouee.locator('.echec .raison')).toHaveText('Ce lien a été fermé par son auteur.');
    await expect(echouee.locator('.echec')).toBeVisible();
    expect(await page.locator('li.ligne').count()).toBe(lues + 1);
    // Aucune redirection : un lecteur au milieu d'un message ne voit pas son écran changer sous lui.
    expect(page.url()).toBe(porte.adresse);
    expect(passerelle.journal.filter((a) => a.methode === 'POST' && a.chemin.includes('/messages'))).toEqual([]);
    await contexte.close();
  });

  test('cas H — fermer l’onglet : zéro POST /anonymous/leave ; la place est libérée par le SERVEUR (§ 6.4, passerelle)', async ({ browser }) => {
    const contexte = await porte.contexteDeLInvite(browser);
    const page = await porte.ouvre(contexte);
    passerelle.oublie();
    const journal = enregistre(contexte);

    await page.close({ runBeforeUnload: true });
    await expect.poll(() => passerelle.socket.connectes(), { timeout: 10_000 }).toBe(0);
    await new Promise((resoud) => setTimeout(resoud, DELAI_D_OBSERVATION_MS));

    expect(journal().filter((e) => e.url.includes('/anonymous/leave'))).toEqual([]);
    expect(journal().filter(estMutante)).toEqual([]);
    expect(porte.cheminsRecus().some((c) => c.includes('/anonymous/leave'))).toBe(false);
    // « la place se libère après N minutes » est le bail SERVEUR du § 6.4 — une transition
    // compare-and-set de la passerelle, hors de portée de ce spec, dite ici plutôt que tue.
    await contexte.close();
  });

  test('anti-régression — visibilitychange:hidden seul ⇒ ZÉRO requête mutante, sur l’écran réel', async ({ browser }) => {
    const contexte = await porte.contexteDeLInvite(browser);
    const page = await porte.ouvre(contexte);
    await page.waitForTimeout(DELAI_DE_REPOS_MS);
    const journal = enregistre(contexte);

    const debut = Date.now();
    await occulte(page);
    await page.waitForTimeout(DELAI_D_OBSERVATION_MS);
    const fin = Date.now();
    await revele(page);

    const fenetres = [{ debut, fin }];
    const pendant = requetesPendantOngletCache({ journal: journal(), fenetres });
    expect(pendant, rapporteRequetesInterdites('écran réel, onglet caché', pendant, fenetres)).toEqual([]);
    await contexte.close();
  });
});

// CE QUE CET INSTRUMENT PORTE — dit au lecteur du rapport : les six cas du § 6.5 ont leur sujet, le
// fil (`thread`) à sa porte d'invité, et ils sont joués ci-dessus, sur la chaîne réelle (serveur de
// la v3 + passerelle de bouchon + bouchon socket). Le scénario fabriqué reste le témoin de contrôle
// de la ligne anti-régression et du rapport de battement.
test('§ 6.5 — les six cas C→H sont portés par l’écran thread', () => {
  expect(casAPorter()).toEqual([]);
  expect(casPortes().map((cas) => cas.id)).toEqual(['C', 'D', 'E', 'F', 'G', 'H']);
});
