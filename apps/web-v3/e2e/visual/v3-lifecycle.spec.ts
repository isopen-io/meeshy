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
  INSTANT_DE_DEPART,
  MARGE_DE_CHARGEMENT_MS,
  SCENARIO_CONFORME,
  SCENARIO_QUI_BAT_PAR_ONGLET,
  SCENARIO_QUI_BAT_TROP_SOUVENT,
  SCENARIO_QUI_MUTE_CACHE,
  SCENARIO_QUI_NE_SUSPEND_PAS,
  casAPorter,
  estBattement,
  mutationsPendantOngletCache,
  pageFabriquee,
  plafondDeBattements,
  rapporteRequetesInterdites,
  requetesPendantOngletCache,
  verdictDeBattement,
  type EntreeDeJournal,
  type FenetreCachee,
  type FenetreFabriquee,
  type ScenarioFabrique,
} from './lib/lifecycle';

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

// Le temps machine qu'on laisse aux requêtes émises pendant la fenêtre virtuelle pour remonter au
// processus de test. Un gate qui asserte une ABSENCE ne peut pas attendre un événement : il attend
// une durée, et celle-ci n'a plus à couvrir la PÉRIODE du battement — seulement le trajet d'un
// `fetch` vers une route interceptée (quelques millisecondes).
const DELAI_D_OBSERVATION_MS = 500;

// Le temps laissé au réseau du chargement pour retomber avant qu'on ouvre la fenêtre d'occultation.
// Sans lui, une requête de chargement encore en vol serait imputée à l'occultation — un gate rouge
// sur un comportement juste, ce qui est la pire des deux erreurs.
const DELAI_DE_REPOS_MS = 250;

const ONGLETS = 2;

const UN_SEUL_ONGLET = 1;

type Journal = () => readonly EntreeDeJournal[];

const enregistre = (contexte: BrowserContext): Journal => {
  const entrees: EntreeDeJournal[] = [];
  contexte.on('request', (requete) => {
    entrees.push({ methode: requete.method(), url: requete.url(), emiseA: Date.now() });
  });
  return () => [...entrees];
};

// L'HORLOGE EST CELLE DU CONTEXTE, PAS D'UNE PAGE — et c'est le modèle juste : deux onglets d'un
// même navigateur partagent UN temps, comme les deux onglets d'une personne réelle. `page.clock`
// délègue au contexte ; l'installer une fois par onglet la RÉINITIALISE pour tout le monde, et
// `runFor` appelé par onglet avance la même horloge autant de fois qu'il y a d'onglets (mesuré :
// 900 000 ms au lieu de 660 000, donc 3 battements par onglet là où la période n'en autorise 2 —
// un gate ROUGE sur un scénario conforme, la pire des deux erreurs).
//
// Elle s'installe AVANT toute navigation (une minuterie posée au chargement doit être créée par
// l'horloge virtuelle) et ne se FIGE qu'après : `install()` seul laisse le temps couler, ce qui est
// voulu — c'est ce qui permet aux pages de se charger — et ce qui rendrait le compte dépendant de
// la machine si on s'y arrêtait.
const installeLHorloge = (contexte: BrowserContext): Promise<void> =>
  contexte.clock.install({ time: INSTANT_DE_DEPART });

const figeLHorloge = (contexte: BrowserContext): Promise<void> =>
  contexte.clock.pauseAt(INSTANT_DE_DEPART + MARGE_DE_CHARGEMENT_MS);

const avanceDeLaFenetreDeRecette = (contexte: BrowserContext): Promise<void> =>
  contexte.clock.runFor(BATTEMENT.fenetreDeRecetteMs);

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

// `visibilitychange` ne s'émule pas par une option de contexte : Playwright n'expose aucun réglage
// de visibilité de document. On pose donc l'état que le navigateur poserait, puis on émet
// l'événement — et on le REND au retour, sinon toute la suite du test lit un onglet caché.
const occulte = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

const revele = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

// La borne GAUCHE est stampée AVANT l'aller-retour d'`evaluate`, jamais après. Le choix n'est pas
// neutre : l'événement `request` remonte au processus de test de façon asynchrone, et une requête
// partie du gestionnaire `visibilitychange` peut arriver avant que la promesse d'`evaluate` ne se
// résolve. Stamper après ferait donc RATER la fuite — un faux vert. Stamper avant peut, au pire,
// imputer à l'occultation une requête partie quelques millisecondes plus tôt : un faux rouge, que
// le repos de `sert()` rend improbable. Entre les deux erreurs, un gate se ferme du côté du lecteur.
// L'onglet reste caché la FENÊTRE DE RECETTE ENTIÈRE — les 10 minutes que le § 8.5 et le cas E du
// § 6.5 nomment — et non les 500 ms qu'un temps machine pouvait payer. `runFor` fait battre toutes
// les minuteries dues, là où `fastForward` n'en réveillerait qu'une : c'est bien une page laissée
// en arrière-plan qu'on joue, pas un couvercle rabattu.
const bascule = async (contexte: BrowserContext, page: Page): Promise<FenetreCachee> => {
  const debut = Date.now();
  await occulte(page);
  await avanceDeLaFenetreDeRecette(contexte);
  await page.waitForTimeout(DELAI_D_OBSERVATION_MS);
  const fin = Date.now();
  await revele(page);
  await page.waitForTimeout(DELAI_D_OBSERVATION_MS);
  return { debut, fin };
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
      'anonymous/refresh',
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

// CE QUE CET INSTRUMENT NE PORTE PAS ENCORE — dit au lecteur du rapport, jamais passé sous silence.
//
// Cinq des six cas de la recette du § 6.5 exigent un écran qui tienne une session invitée : ils
// arrivent avec `thread` (L2). Un gate qui laisserait croire qu'il les porte rendrait un vert sur
// cinq cas que personne n'a joués — c'est la forme exacte du défaut que l'issue #4442 corrige.
test('§ 6.5 — les cas C, D, F, G et H attendent l’écran thread (L2)', () => {
  expect(casAPorter().map((cas) => cas.id)).toEqual(['C', 'D', 'F', 'G', 'H']);
});
