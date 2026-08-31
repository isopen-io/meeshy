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

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
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
  casBloquesHorsWeb,
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
import { COLONNES_DE_THEME, rapporteViolations, violationsBloquantes } from './lib/a11y';
import {
  BEAUCOUP,
  CHEMIN_DU_FIL,
  DERNIER_ANCIEN,
  IBRAHIM,
  MANQUE,
  MARTA,
  TOLU,
  appels,
  envois,
  jetonDuNavigateur,
  monte,
  ouvreLeFil,
} from './lib/fil-recette';
import { NOM_DU_LIEN, RACINE_V3 } from './lib/serveurs';
import { THEME_STORAGE_KEY } from '../../app/theme-script';

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

// Ce qu'attend un lecteur qui NE FAIT QUE LIRE : la cadence de rattrapage de l'écran, une fois.
// Elle est plus courte que celle du battement — la preuve de place ne part qu'un tour sur cinq —
// et c'est elle qui rend le cas `C-visible` jouable sans masquer l'onglet.
const PERIODE_DU_RATTRAPAGE_MS = 60_000;

// `fastForward`, PAS `runFor` — et la raison est la même que celle qui a rendu ce cas rouge la
// première fois. `runFor` fait battre TOUTES les minuteries dues à l'intérieur de la fenêtre, y
// compris celles CRÉÉES pendant qu'elle avance : le `fetch` du rattrapage naît avec son
// `AbortSignal.timeout`, et si le battement tombe au début de la fenêtre, l'avortement tombe
// dedans aussi — la requête est annulée avant que le réseau réel n'ait répondu. `fastForward`
// saute à la fin en ne réveillant chaque minuterie qu'une fois : le battement part, son délai
// d'avortement reste dans le futur, et le test observe ensuite en temps MACHINE.
const avanceDUnRattrapage = (contexte: BrowserContext): Promise<void> =>
  contexte.clock.fastForward(PERIODE_DU_RATTRAPAGE_MS);

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

// CE QUE CET INSTRUMENT PORTE — opposé au lecteur du rapport, jamais laissé à sa bonne foi.
//
// La table `CAS_DE_RECETTE` disait « à porter » sur cinq cas ; l'écran `thread` (L2) leur a donné
// un sujet, et ce fichier les joue. Le témoin vérifie qu'il ne reste RIEN sans sujet : un cas
// ajouté à la recette sans fichier pour le jouer fait rougir ici, plutôt que de sortir vert en se
// taisant — c'est la forme exacte du défaut que l'issue #4442 corrige.
test('§ 6.5 — aucun cas de la recette ne reste sans sujet', () => {
  expect(casAPorter().map((cas) => cas.id)).toEqual([]);
});

// ET CE QU'AUCUN SUJET WEB NE PEUT PRODUIRE EST DIT, pas tu. Un registre qui
// annoncerait « écran » sur un énoncé dont la moitié est structurellement
// intestable est pire qu'un registre incomplet : il atteste ce qu'il n'a pas vu
// (le défaut que l'issue #4442 corrige). Ces deux-là attendent une issue
// HORS-WEB, chacune nommée.
test('§ 6.5 — ce qui est bloqué hors du web est DÉCLARÉ, jamais annoncé couvert', () => {
  expect(casBloquesHorsWeb().map((cas) => cas.id)).toEqual(['D-hasGap', 'H-bail']);
  casBloquesHorsWeb().forEach((cas) => {
    expect(cas.statut).toBe('à porter');
    expect(cas.bloqueParHorsWeb).toContain('gw:');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LA RECETTE DU § 6.5, SUR L'ÉCRAN QUI LA REND VRAIE
// ════════════════════════════════════════════════════════════════════════════
//
// Les six cas C→H attendaient un sujet : « ils arrivent avec `thread` (L2) ».
// Il est là (matrice ordre 5, issue #4524), et ce qui suit les joue sur LUI —
// une vraie place invitée, un vrai cookie, une vraie passerelle de bouchon, le
// serveur `next start` que la production lance.
//
// Ce que les scénarios FABRIQUÉS ci-dessus deviennent : des témoins de CONTRÔLE
// de l'instrument, et ils le restent. Un gate d'absence qui n'a jamais vu de
// présence ne prouve rien, et l'écran conforme ne peut pas jouer ce rôle-là —
// par construction, il ne fuit pas.


test.describe('§ 6.5 — la recette du cycle de vie, jouée sur l’écran thread', () => {
  /**
   * CAS C — « basculer d'application 10 min puis revenir ⇒ conversation ouverte,
   * AUCUNE modale, AUCUN re-join, et le premier message reçu pendant l'absence
   * apparaît ».
   *
   * Les dix minutes sont VIRTUELLES : `page.clock` fige le temps de la page et
   * ne l'avance que sur ordre. C'est ce qui rend le cas jouable — et ce qui
   * fait battre, au passage, les minuteries que dix minutes de temps machine
   * auraient fait battre.
   */
  test('C — dix minutes en arrière-plan : rien à re-rejoindre, et le message manqué apparaît', async ({
    context,
    page,
  }) => {
    const chaine = await monte();

    try {
      await installeLHorloge(context);
      await ouvreLeFil(page, chaine);
      await expect(page.locator('main')).toContainText(IBRAHIM.content);

      chaine.passerelle.regle({ rattrapage: { ajoutes: [MANQUE] } });
      chaine.passerelle.oublie();
      await figeLHorloge(context);

      await bascule(context, page);

      // Le message manqué entre par `GET /sync`, et il entre DANS LA LANGUE DU
      // LECTEUR : le prisme descend, l'espagnol d'origine cède au français servi.
      await expect(page.locator('main')).toContainText('Parfait, je le relis cet après-midi.');
      // Ce qui était lu est resté lu — aucun écran de re-jonction, aucune modale.
      await expect(page.locator('main')).toContainText(IBRAHIM.content);
      expect(await page.locator('dialog').count()).toBe(0);
      await expect(page.locator('#pseudo')).toHaveCount(0);
      expect(appels(chaine, '/anonymous/join/'), 'un re-join a eu lieu sans clic').toBe(0);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * CAS D — « couper le réseau 5 min, envoyer 2 messages hors-ligne, revenir ⇒
   * les 2 partent DANS L'ORDRE, `hasGap` peint son séparateur, LE JETON EST LE
   * MÊME ».
   *
   * Les trois moitiés du cas se tiennent : l'ordre est la propriété de la file,
   * le séparateur celle du rattrapage, et le jeton inchangé est la preuve que
   * rien — ni la coupure, ni le 401 qu'on aurait pu confondre avec elle — n'a
   * effacé la place (§ 7, « erreur réseau ≠ 401 »).
   */
  test('D — deux messages écrits hors-ligne repartent dans l’ordre, restent SOUS LES YEUX, et le jeton ne bouge pas', async ({
    context,
    page,
  }) => {
    // TRENTE bulles, et c'est le point. Les fixtures de ce fichier tenaient
    // toutes dans le viewport, donc rien n'exerçait le PLI : le fil pouvait
    // s'ouvrir sur le plus ancien et la bulle optimiste naître hors champ.
    const chaine = await monte({ messages: BEAUCOUP });

    try {
      await ouvreLeFil(page, chaine);

      // LE PLI, à l'ouverture : le lecteur arrive sur le PRÉSENT, pas sur une
      // conversation d'il y a des jours.
      await expect(page.getByText(DERNIER_ANCIEN.content, { exact: true })).toBeInViewport();

      const jetonAvant = await jetonDuNavigateur(context);

      await context.setOffline(true);
      await expect(page.locator('[role="status"]')).toContainText('Hors ligne');

      for (const texte of ['premier hors ligne', 'second hors ligne']) {
        await page.getByLabel('Votre message').fill(texte);
        await page.getByRole('button', { name: 'Envoyer' }).click();
      }

      // Les deux bulles sont là AVANT le réseau — c'est l'optimistic update —
      // et la dernière est VISIBLE : une bulle appendue sous le pli ne produit
      // aucun retour pour celui qui vient de l'écrire.
      await expect(page.locator('main')).toContainText('premier hors ligne');
      await expect(page.getByText('second hors ligne', { exact: true })).toBeInViewport();
      expect(envois(chaine), 'un envoi est parti alors que le réseau était coupé').toEqual([]);

      // TOUCHER LE COMPOSEUR HORS-LIGNE N'OUVRE AUCUN TRANSPORT. `fill()` donne
      // le focus, donc la fuite était déjà exercée par ce test — elle n'était
      // simplement jamais assertée : 12,8 Ko téléchargés sur un réseau qui
      // n'existe pas, puis une boucle de reconnexion 1 s → 30 s pendant toute
      // la coupure, sur un téléphone en 3G.
      //
      // CE TÉMOIN NE DISCRIMINE PAS À LUI SEUL, et il faut le dire :
      // `setOffline` coupe AUSSI le chunk asynchrone du transport, donc l'import
      // échoue de lui-même et l'écran retombe au même état avec ou sans la garde
      // (mesuré : ce cas passe dans les deux sens). Le défaut réel se produit
      // quand le module est DÉJÀ en cache — une seconde coupure —, ce qu'un
      // navigateur piloté ne met pas en scène. La règle est donc gardée en
      // fonction PURE (`engagement.ts`, `__tests__/fil-engagement.test.ts`), et
      // ce qui reste ici est ce que l'écran MONTRE : jamais « Reconnexion en
      // cours » sous une bannière qui dit déjà « Hors ligne » — deux messages
      // pour un seul fait.
      await expect(page.getByRole('img', { name: 'Reconnexion en cours' })).toHaveCount(0);

      await context.setOffline(false);

      await expect
        .poll(() => envois(chaine))
        .toEqual(['premier hors ligne', 'second hors ligne']);
      expect(await jetonDuNavigateur(context), 'la coupure a effacé le jeton').toBe(jetonAvant);

      // ET L'ENGAGEMENT EST REJOUÉ AU RETOUR. Le souhait de participer n'est pas
      // ANNULÉ par la coupure, il est REPORTÉ : sans ce second témoin, la garde
      // ci-dessus pourrait être satisfaite en n'ouvrant plus jamais de transport.
      await expect
        .poll(() => appels(chaine, 'socket.io'), { timeout: 15_000 })
        .toBeGreaterThan(0);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * CAS C-VISIBLE — « un onglet VISIBLE, jamais masqué, dont on ne touche pas le
   * composeur ⇒ un message arrivé côté serveur apparaît quand même ».
   *
   * C'est le comportement NOMINAL du titre du lot, et il n'avait aucun témoin :
   * le cas C ne rattrape que parce qu'il MASQUE puis réaffiche l'onglet. Sans
   * cette ligne, un lecteur qui lit — sans basculer d'application, sans perdre
   * le réseau, sans toucher le champ — n'affichait rien de neuf, indéfiniment.
   */
  test('C-visible — un lecteur qui ne fait que LIRE voit arriver les messages', async ({
    context,
    page,
  }) => {
    const chaine = await monte();

    try {
      await installeLHorloge(context);
      await ouvreLeFil(page, chaine);
      await expect(page.locator('main')).toContainText(IBRAHIM.content);
      await figeLHorloge(context);

      chaine.passerelle.regle({ rattrapage: { ajoutes: [MANQUE] } });

      // Aucun masquage, aucune coupure, aucun focus : seulement le temps qui
      // passe sur un onglet resté à l'écran.
      await avanceDUnRattrapage(context);

      await expect(page.locator('main')).toContainText('Parfait, je le relis cet après-midi.');
      expect(await page.locator('dialog').count()).toBe(0);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * CAS D-LACUNE — le séparateur du § 7, par le SEUL déclencheur qu'un invité
   * puisse rencontrer.
   *
   * Il était joué contre `hasGap`, que le bouchon posait à la main et que la
   * production ne lèvera JAMAIS pour une session anonyme (`checkpointSeq` vaut
   * 0 en dur, `GAP_THRESHOLD` vaut 10 000, et le client n'envoie pas de `seq`).
   * Ce qui le lève vraiment, c'est une fenêtre TRONQUÉE que la pagination n'a
   * pas pu résorber — et là, il manque réellement quelque chose.
   */
  test('D-lacune — une fenêtre de rattrapage non couverte peint son séparateur', async ({
    context,
    page,
  }) => {
    const chaine = await monte({ rattrapage: { tronque: true } });

    try {
      await installeLHorloge(context);
      await ouvreLeFil(page, chaine);
      await figeLHorloge(context);

      await bascule(context, page);

      await expect(page.locator('main')).toContainText('Des messages manquent ici');
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * CE QUE LE DOCUMENT TRANSPORTE — et le § 8.3 pose la question en octets :
   * « combien avant le premier pixel utile ».
   *
   * Le tableau des messages entrait TEL QUEL en propriété d'un composant
   * client : l'original, la langue d'origine et la carte COMPLÈTE des
   * traductions traversaient la frontière pour qu'une seule langue soit lue,
   * et le paquet Flight comme le HTML en portaient chacun une copie.
   * `check-bundle-budget.mjs` ne pouvait pas le voir — il mesure des chunks JS,
   * pas le document.
   */
  test('le document ne transporte QUE la langue servie, jamais l’original ni la carte', async ({
    page,
  }) => {
    const chaine = await monte({ messages: [MARTA] });

    try {
      await ouvreLeFil(page, chaine);
      await expect(page.locator('main')).toContainText('Parfait, je le relis cet après-midi.');

      const document = await page.content();

      expect(
        document.includes(MARTA.content),
        'l’original espagnol traverse encore la frontière serveur→client',
      ).toBe(false);
      // Et on l'a demandé à la passerelle, plutôt que de le jeter après coup :
      // `languages=` est l'opt-in de bande passante qu'elle offre.
      expect(
        chaine.passerelle.journal.some(
          (appel) => appel.methode === 'GET' && appel.chemin.includes('languages='),
        ),
        'la lecture du fil ne borne pas les traductions au prisme du lecteur',
      ).toBe(true);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * LES QUATRE ÉLÉMENTS DE LA CIBLE QUI MANQUAIENT — avatar, fantôme,
   * « anonyme », heure — plus le fantôme de l'EN-TÊTE, que
   * `packages/icons/critique.json` justifie nommément par cet écran et qui
   * occupait une des huit places du sous-sprite critique sans rien rendre.
   */
  test('la ligne d’une bulle porte ce que la cible y pose', async ({ page }) => {
    const chaine = await monte({ messages: [IBRAHIM, TOLU] });

    try {
      await ouvreLeFil(page, chaine);

      // L'heure de chaque bulle (« 12:01 » sur la cible), en `<time>`.
      await expect(page.locator('main time')).toHaveCount(2);
      await expect(page.locator('main time').first()).toHaveAttribute(
        'datetime',
        IBRAHIM.createdAt,
      );

      // Le mot « anonyme » à côté du pseudo de l'auteur sans compte.
      await expect(page.locator('main')).toContainText('anonyme');

      // Le fantôme : dans l'en-tête ET sur l'auteur sans compte.
      expect(
        await page.locator('main use[href="#ph-ghost"], header use[href="#ph-ghost"]').count(),
      ).toBeGreaterThan(1);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * LES TROIS FILS VIDES, DISTINGUÉS (dimension 8). Une lecture indisponible
   * rendait EXACTEMENT le même écran qu'une conversation neuve : un `<ol>`
   * vide, sans un mot.
   */
  test('un fil vide INVITE à écrire', async ({ page }) => {
    const chaine = await monte({ messages: [] });

    try {
      await ouvreLeFil(page, chaine);
      await expect(page.locator('main')).toContainText('Personne n’a encore écrit');
    } finally {
      await chaine.ferme();
    }
  });

  test('une lecture qui TOMBE le dit, et ne se fait pas passer pour une conversation neuve', async ({
    page,
  }) => {
    const chaine = await monte({ lecture: { statut: 500 } });

    try {
      await ouvreLeFil(page, chaine);
      await expect(page.locator('main')).toContainText('n’ont pas pu être chargés');
      await expect(page.locator('main')).not.toContainText('Personne n’a encore écrit');
      // Ce n'est pas un refus : la place tient, le composeur reste ouvert.
      await expect(page.getByLabel('Votre message')).toBeVisible();
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * CAS F — « forcer `isActive:false` en base ⇒ bandeau à BOUTON, la lecture
   * reste, AUCUN `POST /anonymous/join` observé sans clic ».
   *
   * Le 401 arrive par la porte de la place, au retour d'arrière-plan. Ce que le
   * § 6.3 F interdit est le re-join SILENCIEUX : le retour coûte une identité
   * neuve, un pseudo suffixé, la paternité des messages et +1 sur trois
   * compteurs. Le bouton, lui, est un geste.
   */
  test('F — place fermée : un bandeau, un bouton, la lecture conservée, et zéro re-join', async ({
    context,
    page,
  }) => {
    const chaine = await monte();

    try {
      await installeLHorloge(context);
      await ouvreLeFil(page, chaine);
      await figeLHorloge(context);

      chaine.passerelle.regle({ revalidation: { statut: 401 } });
      chaine.passerelle.oublie();

      await bascule(context, page);

      // L'alerte est cherchée DANS `main` : Next monte son propre annonceur de
      // route (`#__next-route-announcer__`), lui aussi `role="alert"`, et un
      // sélecteur global le ramasserait — un rouge de harnais sur un écran juste.
      await expect(page.locator('main [role="alert"]')).toContainText('Votre place a été fermée');
      await expect(page.getByRole('button', { name: 'Reprendre ma place' })).toBeVisible();
      // « Ce qui est déjà lu reste lu » : on ne vide pas l'écran de quelqu'un.
      await expect(page.locator('main')).toContainText(IBRAHIM.content);
      // Le composeur se ferme, avec sa raison — jamais un champ grisé sans mot.
      await expect(page.getByLabel('Votre message')).toHaveCount(0);
      expect(appels(chaine, '/anonymous/join/'), 'un re-join silencieux a eu lieu').toBe(0);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * CAS G — « désactiver le lien pendant la lecture ⇒ composeur fermé AVEC SA
   * RAISON, contenu lu conservé, file annulée et VISIBLE ».
   *
   * Le refus arrive sur l'ENVOI, c'est-à-dire au moment où le visiteur a écrit
   * quelque chose : c'est précisément le cas où une file annulée en silence
   * ferait disparaître un message que son auteur croit parti.
   */
  test('G — lien révoqué : le composeur dit pourquoi, et l’envoi annulé reste visible', async ({
    page,
  }) => {
    const chaine = await monte({ envoi: { statut: 410, code: 'LINK_DEACTIVATED' } });

    try {
      await ouvreLeFil(page, chaine);

      await page.getByLabel('Votre message').fill('et si on décalait ?');
      await page.getByRole('button', { name: 'Envoyer' }).click();

      await expect(page.locator('main')).toContainText('Non envoyé');
      await expect(page.locator('main')).toContainText('et si on décalait ?');
      await expect(page.getByLabel('Votre message')).toHaveCount(0);
      await expect(page.locator('main')).toContainText('Ce lien a été fermé');
      await expect(page.locator('main')).toContainText(IBRAHIM.content);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * CAS H — « fermer l'onglet ⇒ ZÉRO `POST /anonymous/leave` observé ».
   *
   * C'est la décision du § 6.2 tout entière : la place est un BAIL SERVEUR.
   * `leave` est une porte à SENS UNIQUE et n'est pas idempotent — deux beacons
   * font −2 sur le compteur qui GARDE l'admission, et il peut passer négatif.
   *
   * CE QUE CE TEST NE PROUVE PAS, et que l'énoncé du cas H affirmait : que la
   * place se LIBÈRE après N minutes. C'est une transition SERVEUR, et le
   * balayage qui la produit n'existe pas (`gw:bail-anonyme`, « Bloqué par (hors
   * web) » dans l'issue #4524 elle-même). L'énoncé est donc scindé — cas
   * `H-bail`, statut « à porter » —, faute de quoi la moitié assertée ici
   * couvrirait la moitié que rien ne peut asserter.
   */
  test('H — fermer l’onglet n’appelle RIEN : la place est un bail serveur', async ({ page }) => {
    const chaine = await monte();

    try {
      await ouvreLeFil(page, chaine);
      chaine.passerelle.oublie();

      await page.close();

      expect(appels(chaine, '/anonymous/leave'), 'la fermeture a libéré la place').toBe(0);
    } finally {
      await chaine.ferme();
    }
  });
});

test.describe('§ 8.5 / § 6.5 — les deux barres, opposées à l’écran RÉEL', () => {
  /**
   * CAS E — « deux onglets sur le même lien : UNE seule requête de battement
   * sur 10 min ».
   *
   * Le « une seule » est un RAPPORT, jamais un compte absolu : la période est de
   * cinq minutes, donc un porteur unique en émet DEUX sur la fenêtre de recette.
   * Le plafond vient de la fenêtre (`plafondDeBattements`), le compte de
   * l'horloge virtuelle : deux origines différentes, ce qui est la condition
   * pour qu'une comparaison signifie quelque chose.
   */
  test('E — deux onglets, un seul porteur : le battement d’une seule personne', async ({
    context,
  }) => {
    const chaine = await monte();

    try {
      const journal = enregistre(context);
      await installeLHorloge(context);

      const premier = await context.newPage();
      await ouvreLeFil(premier, chaine);

      const second = await context.newPage();
      await second.goto(`${chaine.serveur.base}${CHEMIN_DU_FIL}`, { waitUntil: 'domcontentloaded' });
      await expect(second.getByRole('heading', { level: 1 })).toHaveText(NOM_DU_LIEN);

      await figeLHorloge(context);
      await avanceDeLaFenetreDeRecette(context);
      await premier.waitForTimeout(DELAI_D_OBSERVATION_MS);

      const resultat = verdictDeBattement({
        battements: journal().filter(estBattement).length,
        onglets: ONGLETS,
        dureeMs: BATTEMENT.fenetreDeRecetteMs,
        periodeMs: BATTEMENT.periodeMs,
      });

      expect(resultat.observes, 'aucun battement : le bail du § 6.4 n’est plus prouvé').toBe(
        resultat.plafond,
      );
      expect(resultat.conforme, resultat.raison ?? '').toBe(true);

      // CAS E-SURVIE — l'autre moitié de l'énoncé du cas E, et elle n'était
      // jouée par rien : le test n'avait JAMAIS fermé d'onglet. Un porteur qui
      // meurt sans successeur laisse le bail sans preuve de présence, ce qui
      // est le défaut `H-bail` vu du côté client.
      const avantFermeture = journal().filter(estBattement).length;
      await second.close();
      await avanceDeLaFenetreDeRecette(context);
      await premier.waitForTimeout(DELAI_D_OBSERVATION_MS);

      expect(
        journal().filter(estBattement).length,
        'le survivant n’a pas repris le battement : la place cesse d’être prouvée',
      ).toBeGreaterThan(avantFermeture);
    } finally {
      await chaine.ferme();
    }
  });

  /**
   * L'ANTI-RÉGRESSION du § 6.5 et la barre « 0 requête » du § 8.5, opposées à
   * l'écran conforme — la seule des deux erreurs possibles qui reste ici est le
   * faux ROUGE, et c'est celle qu'on préfère.
   *
   * Ce témoin n'est pas le doublon des scénarios fabriqués : ceux-là prouvent
   * que l'instrument VOIT, celui-ci prouve que l'écran ne fuit pas. L'un sans
   * l'autre est soit un instrument sans sujet, soit un vert sur parole.
   */
  test('un onglet caché ne fait RIEN partir — l’écran thread sur la fenêtre de recette', async ({
    context,
    page,
  }) => {
    const chaine = await monte();

    try {
      const journal = enregistre(context);
      await installeLHorloge(context);
      await ouvreLeFil(page, chaine);
      await figeLHorloge(context);
      await page.waitForTimeout(DELAI_DE_REPOS_MS);

      const fenetres = [await bascule(context, page)];
      const pendant = requetesPendantOngletCache({ journal: journal(), fenetres });

      expect(pendant, rapporteRequetesInterdites('écran thread', pendant, fenetres)).toEqual([]);
      // Et il repart au retour : un vert d'inertie ne prouverait pas la suspension.
      await expect.poll(() => journal().filter(estBattement).length).toBeGreaterThan(0);
    } finally {
      await chaine.ferme();
    }
  });
});

/**
 * § 8.5 — « 0 erreur `axe` serious/critical sur toute route `(public)` », sur
 * l'ÉTAT que le balayage découvert ne peut pas atteindre.
 *
 * `v3-a11y.spec.ts` balaie ce que `next build` a ÉMIS, c'est-à-dire l'URL
 * `/chats/:lien` — et il l'atteint sans cookie, donc dans son état `join`. Le
 * FIL est le même chemin dans un autre état, derrière une place et un marqueur
 * d'entrée : aucun balayage d'URL ne peut l'y trouver. Le gate le suit donc ici,
 * où la chaîne qui l'ouvre existe déjà.
 *
 * Les quatre colonnes de thème comptent : `color-contrast` est d'impact
 * `serious` — la barre exacte de ce gate — et c'est la seule règle d'`axe` dont
 * le verdict dépende entièrement du thème.
 */
test.describe('§ 8.5 — accessibilité du fil, dans les quatre colonnes de thème', () => {
  COLONNES_DE_THEME.forEach((theme) => {
    test(`0 violation axe serious/critical (${theme.id})`, async ({ page }) => {
      const chaine = await monte();

      try {
        if (theme.stockage !== null) {
          await page.addInitScript(
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
        await page.emulateMedia({ colorScheme: theme.colorScheme });
        await ouvreLeFil(page, chaine);

        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme.classeAttendue}\\b`));

        const { violations } = await new AxeBuilder({ page }).analyze();
        const bloquantes = violationsBloquantes(violations);

        expect(
          bloquantes,
          rapporteViolations(`${CHEMIN_DU_FIL} [${theme.id}]`, bloquantes),
        ).toEqual([]);
      } finally {
        await chaine.ferme();
      }
    });
  });
});

/**
 * « `lang=` PRÉSENT SUR CHAQUE BULLE TRADUITE » — la dernière ligne du critère
 * de fin, et la seule qui ne se voit pas à l'œil.
 *
 * C'est ce qui « part À CÔTÉ » du texte résolu (cycle 123) : sans `lang`, un
 * lecteur d'écran francophone prononce une bulle yoruba en phonétique
 * française. Le § 2 l'a MESURÉ absent de `apps/web` — `TranslationToggle` n'en
 * pose dans AUCUNE branche de rendu.
 *
 * Les deux moitiés comptent, et la seconde est celle qui empêche un gate
 * paresseux : `lang` est posé quand la langue SERVIE diffère de celle du
 * document, et il est ABSENT quand elle ne diffère pas. Un écran qui
 * l'estampillerait partout ferait annoncer un changement de langue à chaque
 * bulle — une redondance que les lecteurs d'écran prononcent.
 */
test('chaque bulle traduite porte SA langue, et celles qui ne le sont pas n’en portent aucune', async ({
  page,
}) => {
  const chaine = await monte({
    messages: [
      IBRAHIM,
      {
        id: 'm-3',
        senderId: 'participant-9',
        content: 'Ça me va.',
        originalLanguage: 'fr',
        translations: [{ targetLanguage: 'yo', translatedContent: 'Ó dára fún mi.' }],
        createdAt: '2026-08-30T12:03:00.000Z',
        auteur: 'Marta Ruiz',
      },
    ],
  });

  try {
    await ouvreLeFil(page, chaine);

    // Le lecteur a déclaré `yo` (le bouchon le sert sur la place) : le rang 1 de
    // son prisme est le yoruba, et c'est la traduction qui est servie.
    const traduite = page.locator('main li p[lang]');
    await expect(traduite).toHaveText('Ó dára fún mi.');
    await expect(traduite).toHaveAttribute('lang', 'yo');

    // Et le message servi dans la langue du document n'en porte AUCUN.
    await expect(page.locator('main li').filter({ hasText: IBRAHIM.content }).locator('p[lang]')).toHaveCount(0);
  } finally {
    await chaine.ferme();
  }
});

/**
 * « `socket.io-client` ABSENT DU CHUNK AVANT LE TAP » — assertion sur
 * `app-build-manifest.json`, comme le critère de fin l'écrit.
 *
 * Elle se mesure sur le BUILD et pas sur un navigateur, et c'est ce qui la rend
 * opposable : ce que le manifeste liste pour une page est ce que le navigateur
 * charge AVANT toute interaction. Un test qui compterait des requêtes prouverait
 * qu'un parcours donné n'a pas tiré le paquet ; celui-ci prouve qu'AUCUN
 * parcours ne le peut sans un geste.
 *
 * Les deux moitiés comptent, et la seconde est celle qui empêche un vert de
 * vacuité : le paquet doit être ABSENT des chunks de la page ET PRÉSENT dans un
 * chunk asynchrone du build. Sans elle, retirer `participate.ts` du dépôt ferait
 * passer le gate.
 */
test('le transport n’est dans AUCUN chunk que la page réclame, et il existe pourtant', () => {
  const manifeste = join(RACINE_V3, '.next', 'app-build-manifest.json');
  expect(existsSync(manifeste), 'apps/web-v3 n’est pas construit — `bun run build` d’abord').toBe(
    true,
  );

  const pages = (JSON.parse(readFileSync(manifeste, 'utf8')) as {
    readonly pages: Readonly<Record<string, readonly string[]>>;
  }).pages;

  const cle = Object.keys(pages).find((page) => page.includes('chats/[lien]'));
  expect(cle, 'la page du fil n’est pas dans le manifeste de build').toBeDefined();

  /**
   * Le marqueur est un LITTÉRAL DE CHAÎNE du transport, pas un nom de paquet :
   * `"/engine.io"` et `"/socket.io"` sont les chemins par défaut qu'Engine.IO et
   * Socket.IO posent dans leurs options, et une chaîne survit à la minification
   * là où un nom de module disparaît. Chercher `engine.io-client` rendait ZÉRO
   * chunk — c'est-à-dire un gate qui aurait ROUGI sur un dépôt conforme, la pire
   * des deux erreurs.
   */
  const marqueur = /"\/engine\.io"|"\/socket\.io"/;
  const contenu = (fichier: string): string => {
    const chemin = join(RACINE_V3, '.next', fichier);
    return existsSync(chemin) ? readFileSync(chemin, 'utf8') : '';
  };

  const coupables = (pages[cle ?? ''] ?? []).filter((fichier) => marqueur.test(contenu(fichier)));
  expect(coupables, 'le transport est chargé AVANT le tap').toEqual([]);

  const racine = join(RACINE_V3, '.next', 'static', 'chunks');
  const asynchrones = readdirSync(racine).filter(
    (fichier) => fichier.endsWith('.js') && marqueur.test(readFileSync(join(racine, fichier), 'utf8')),
  );
  expect(
    asynchrones.length,
    'aucun chunk ne porte le transport : le gate serait vert par ABSENCE de code',
  ).toBeGreaterThan(0);
});
