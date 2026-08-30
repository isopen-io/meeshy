import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BATTEMENT,
  CAS_DE_RECETTE,
  CHEMIN_DE_LA_FUITE_FABRIQUEE,
  CHEMIN_DU_SCENARIO,
  MARGE_DE_CHARGEMENT_MS,
  METHODES_MUTANTES,
  SCENARIO_CONFORME,
  SCENARIO_QUI_BAT_PAR_ONGLET,
  SCENARIO_QUI_BAT_TROP_SOUVENT,
  SCENARIO_QUI_MUTE_CACHE,
  SCENARIO_QUI_NE_SUSPEND_PAS,
  SCENARIOS_DEFECTUEUX,
  casAPorter,
  emisePendant,
  estBattement,
  estMutante,
  instructionsSurHidden,
  loisEnfreintes,
  mutationsPendantOngletCache,
  pageFabriquee,
  plafondDeBattements,
  rapporteRequetesInterdites,
  requetesPendantOngletCache,
  verdictDeBattement,
  type EntreeDeJournal,
  type FenetreCachee,
} from '../e2e/visual/lib/lifecycle';

const ROOT = join(__dirname, '..');
const SPEC = join(ROOT, 'e2e', 'visual', 'v3-lifecycle.spec.ts');
const CONCEPTION = join(
  ROOT,
  '..',
  '..',
  'docs',
  'product',
  'MeeshyWebV3Design',
  'conception-web-v3.md',
);

const entree = (attributs: Partial<EntreeDeJournal> = {}): EntreeDeJournal => ({
  methode: 'POST',
  url: 'http://127.0.0.1:3300/api/v1/anonymous/refresh',
  emiseA: 1_000,
  ...attributs,
});

const CACHE: readonly FenetreCachee[] = [{ debut: 1_000, fin: 2_000 }];

describe('ce qui MUTE — la ligne que `visibilitychange:hidden` ne franchit jamais', () => {
  it('retient les quatre méthodes qui écrivent', () => {
    expect([...METHODES_MUTANTES]).toEqual(['POST', 'PUT', 'PATCH', 'DELETE']);
  });

  it('classe POST, PUT, PATCH et DELETE comme mutantes', () => {
    METHODES_MUTANTES.forEach((methode) => {
      expect(estMutante(entree({ methode }))).toBe(true);
    });
  });

  it('ne classe pas une lecture comme une mutation', () => {
    ['GET', 'HEAD', 'OPTIONS'].forEach((methode) => {
      expect(estMutante(entree({ methode }))).toBe(false);
    });
  });

  it("lit la méthode sans se laisser prendre à sa casse — `sendBeacon` la rend telle que le navigateur l'écrit", () => {
    expect(estMutante(entree({ methode: 'post' }))).toBe(true);
  });
});

describe("la fenêtre d'occultation — ce qui est émis PENDANT, jamais ce qui était déjà en vol", () => {
  it("retient une requête émise à l'instant même où l'onglet passe caché", () => {
    expect(emisePendant(entree({ emiseA: 1_000 }), CACHE)).toBe(true);
  });

  it("écarte une requête émise avant l'occultation", () => {
    expect(emisePendant(entree({ emiseA: 999 }), CACHE)).toBe(false);
  });

  it("écarte la reprise, émise à l'instant du retour : c'est ce que le § 6.2 EXIGE", () => {
    expect(emisePendant(entree({ emiseA: 2_000 }), CACHE)).toBe(false);
  });

  it('reste ouverte tant que le retour n’a pas été observé', () => {
    expect(emisePendant(entree({ emiseA: 9_000 }), [{ debut: 1_000, fin: null }])).toBe(true);
  });

  it('balaie plusieurs bascules — le geste du rôle premier se répète', () => {
    const fenetres: readonly FenetreCachee[] = [
      { debut: 1_000, fin: 2_000 },
      { debut: 5_000, fin: 6_000 },
    ];

    expect(emisePendant(entree({ emiseA: 5_500 }), fenetres)).toBe(true);
    expect(emisePendant(entree({ emiseA: 3_000 }), fenetres)).toBe(false);
  });
});

// Le § 8.5 gate ZÉRO requête, le § 6.5 gate ZÉRO requête MUTANTE : deux barres, dont la seconde
// est la plus grave. Les confondre en une seule fonction ferait passer une préchargeuse de fond
// pour une fuite d'écriture, ou l'inverse — et le rapport ne dirait plus laquelle des deux lignes
// vient de tomber.
describe('les deux barres du gate : 0 requête (§ 8.5) et 0 mutation (§ 6.5)', () => {
  const journal: readonly EntreeDeJournal[] = [
    entree({ methode: 'GET', url: 'https://x/sync', emiseA: 1_200 }),
    entree({ methode: 'POST', url: 'https://x/anonymous/leave', emiseA: 1_400 }),
    entree({ methode: 'POST', url: 'https://x/anonymous/refresh', emiseA: 2_500 }),
  ];

  it('compte toute requête émise pendant que l’onglet est caché', () => {
    expect(requetesPendantOngletCache({ journal, fenetres: CACHE }).map((e) => e.url)).toEqual([
      'https://x/sync',
      'https://x/anonymous/leave',
    ]);
  });

  it('isole les seules MUTATIONS — la ligne anti-régression du § 6.5', () => {
    expect(mutationsPendantOngletCache({ journal, fenetres: CACHE }).map((e) => e.url)).toEqual([
      'https://x/anonymous/leave',
    ]);
  });

  it('laisse la reprise tranquille : elle est émise après le retour', () => {
    expect(requetesPendantOngletCache({ journal, fenetres: CACHE })).toHaveLength(2);
  });
});

describe('le rapport — un gate qui tombe doit dire QUELLE requête est partie et QUAND', () => {
  const rapport = (): string =>
    rapporteRequetesInterdites('scénario fabriqué', [
      entree({ methode: 'POST', url: 'https://x/anonymous/leave', emiseA: 1_400 }),
    ], CACHE);

  it('nomme le scénario, la méthode, l’URL', () => {
    expect(rapport()).toContain('scénario fabriqué');
    expect(rapport()).toContain('POST');
    expect(rapport()).toContain('https://x/anonymous/leave');
  });

  it("situe la requête DANS l'occultation, en millisecondes depuis son début", () => {
    expect(rapport()).toContain('400');
  });

  it('compte ce qui est parti', () => {
    expect(rapport()).toContain('1');
  });
});

// « 1 seule requête de battement pour N onglets sur 10 min » (§ 8.5). Le nombre à opposer n'est
// donc PAS un littéral : c'est ce qu'émet UN SEUL porteur sur la fenêtre observée. La période du
// battement est de 5 min (§ 5, et § 6.4 : « N = 10 min, soit deux battements manqués ») — sur
// 10 min un porteur unique en émet donc DEUX, pas un. Le gate oppose le nombre calculé, jamais
// le littéral de la phrase, sans quoi il rougirait sur une v3 conforme.
describe('le battement — un seul porteur, quel que soit le nombre d’onglets', () => {
  it('bat toutes les 5 minutes et s’observe sur 10', () => {
    expect(BATTEMENT.periodeMs).toBe(5 * 60_000);
    expect(BATTEMENT.fenetreDeRecetteMs).toBe(10 * 60_000);
  });

  it('reconnaît un battement à son chemin, jamais à son rang dans le journal', () => {
    expect(estBattement(entree({ url: 'https://gate/api/v1/anonymous/refresh' }))).toBe(true);
    expect(estBattement(entree({ url: 'https://gate/api/v1/anonymous/join/abc' }))).toBe(false);
  });

  // La marge de chargement est ce qui rend le compte déterministe malgré un temps de chargement
  // qu'on ne connaît pas : elle doit être plus GRANDE que tout chargement réel (sinon la pause
  // remonterait le temps) et strictement plus PETITE que la période (sinon la page aurait déjà
  // battu avant que la fenêtre d'observation ne s'ouvre, et le premier battement compterait deux
  // fois — le gate rougirait sur un scénario conforme).
  it('fige l’horloge dans la PREMIÈRE période, après tout chargement plausible', () => {
    expect(MARGE_DE_CHARGEMENT_MS).toBeLessThan(BATTEMENT.periodeMs);
    expect(MARGE_DE_CHARGEMENT_MS).toBeGreaterThan(10_000);
  });

  it('calcule ce qu’un porteur unique émet sur la fenêtre de recette', () => {
    expect(
      plafondDeBattements({
        dureeMs: BATTEMENT.fenetreDeRecetteMs,
        periodeMs: BATTEMENT.periodeMs,
      }),
    ).toBe(2);
  });

  it('tombe quand N onglets battent chacun pour soi', () => {
    const verdict = verdictDeBattement({ battements: 4, onglets: 2, dureeMs: 20, periodeMs: 10 });

    expect(verdict.conforme).toBe(false);
    expect(verdict.raison).toContain('2 onglet');
    expect(verdict.raison).toContain('4');
  });

  // Un dépassement de plafond a DEUX causes possibles — N onglets qui battent chacun pour soi, ou
  // UN porteur qui bat trop souvent — et le verdict ne peut pas savoir laquelle. Nommer la première
  // seule ferait lire au lecteur du rapport un diagnostic que la mesure ne porte pas.
  it('tombe aussi sur UN seul onglet qui bat trop souvent, sans sur-diagnostiquer la cause', () => {
    const verdict = verdictDeBattement({ battements: 10, onglets: 1, dureeMs: 20, periodeMs: 10 });

    expect(verdict.conforme).toBe(false);
    expect(verdict.raison).toContain('10');
    expect(verdict.raison).toContain('trop souvent');
  });

  it('passe quand les mêmes N onglets n’en élisent qu’un', () => {
    expect(verdictDeBattement({ battements: 2, onglets: 2, dureeMs: 20, periodeMs: 10 }).conforme).toBe(
      true,
    );
  });

  // Un gate de battement vert par ABSENCE ne prouve rien : il rendrait le même verdict sur une v3
  // dont le battement ne part jamais — c'est-à-dire sur un bail que le serveur libère sous les
  // pieds de l'invité.
  it('ne sort pas vert sur un journal où aucun battement n’a été vu', () => {
    const verdict = verdictDeBattement({ battements: 0, onglets: 2, dureeMs: 20, periodeMs: 10 });

    expect(verdict.conforme).toBe(false);
    expect(verdict.raison).toContain('aucun battement');
  });
});

// La page fabriquée n'est PAS l'implémentation de la v3 : c'est le sujet que l'instrument doit
// voir tomber. Deux axes orthogonaux, un par ligne du § 6.2 — « hidden ne mute rien » et « un seul
// porteur de battement ».
describe('le scénario fabriqué — l’instrument ne peut pas se prouver sans sujet', () => {
  it("émet une mutation SUR l'événement hidden quand il est défectueux", () => {
    expect(pageFabriquee(SCENARIO_QUI_MUTE_CACHE)).toContain('anonymous/leave');
  });

  it('ne connaît aucune mutation à opposer à hidden quand il est corrigé', () => {
    expect(pageFabriquee(SCENARIO_CONFORME)).not.toContain('anonymous/leave');
  });

  // LE BATTEMENT EST MINUTÉ, PLUS APPELÉ. Tant qu'il était appelé par le spec (`__gateTic`), la
  // seule fuite qu'un scénario pouvait produire pendant `hidden` était celle qu'il émettait
  // SYNCHRONEMENT dans le gestionnaire `visibilitychange` — et l'instrument, taillé à la forme de
  // ce sujet, ne pouvait rien voir d'autre. Un battement minuté rend le scénario capable de fuir
  // comme fuit une vraie page : par une minuterie que personne n'a arrêtée.
  it('minute son battement sur la période du § 5, au lieu de le faire appeler par le spec', () => {
    expect(pageFabriquee(SCENARIO_CONFORME)).toContain(`setInterval(bat, ${BATTEMENT.periodeMs})`);
    expect(pageFabriquee(SCENARIO_CONFORME)).not.toContain('__gateTic');
  });

  it('ARRÊTE sa minuterie à hidden quand il est corrigé — la première ligne du § 6.2', () => {
    expect(instructionsSurHidden(SCENARIO_CONFORME)).toEqual(['arrete();', 'return;']);
  });

  // LE SUJET SANS LEQUEL LA BARRE « 0 requête pendant hidden » N'A RIEN À FAIRE ROUGIR : une page
  // qui ne suspend RIEN. Elle ne mute pas dans le gestionnaire — son gestionnaire ne fait RIEN,
  // exactement comme une page qui n'en aurait pas ; elle laisse simplement battre sa minuterie.
  it('ne fait RIEN à hidden quand il ne suspend pas, et laisse donc battre', () => {
    expect(instructionsSurHidden(SCENARIO_QUI_NE_SUSPEND_PAS)).toEqual(['return;']);
    expect(pageFabriquee(SCENARIO_QUI_NE_SUSPEND_PAS)).not.toContain('anonymous/leave');
    expect(pageFabriquee(SCENARIO_QUI_NE_SUSPEND_PAS)).toContain('anonymous/refresh');
  });

  it('mute AVANT d’arrêter quand il est défectueux — l’ordre que lira le rapport rouge', () => {
    expect(instructionsSurHidden(SCENARIO_QUI_MUTE_CACHE)).toEqual([
      `mute('${CHEMIN_DE_LA_FUITE_FABRIQUEE}');`,
      'arrete();',
      'return;',
    ]);
  });

  // LE SUJET DU RAPPORT, distinct de celui de l'ÉLECTION. Un porteur unique qui bat trop souvent
  // dépasse le plafond du § 8.5 sans qu'aucun second onglet n'existe : sans lui, le seul
  // discriminant du gate serait l'élection, jamais le RAPPORT que la barre énonce.
  it('bat plus souvent que le plafond ne l’autorise quand il bat trop souvent', () => {
    expect(SCENARIO_QUI_BAT_TROP_SOUVENT.periodeDeBattementMs).toBeLessThan(BATTEMENT.periodeMs);
    expect(
      Math.floor(BATTEMENT.fenetreDeRecetteMs / SCENARIO_QUI_BAT_TROP_SOUVENT.periodeDeBattementMs),
    ).toBeGreaterThan(
      plafondDeBattements({
        dureeMs: BATTEMENT.fenetreDeRecetteMs,
        periodeMs: BATTEMENT.periodeMs,
      }),
    );
  });

  // Un scénario qui enfreindrait DEUX lois à la fois rendrait le gate incapable de dire LAQUELLE
  // vient de tomber : le rouge serait juste et le rapport muet. Chaque sujet défectueux est donc le
  // scénario conforme, moins UNE loi — et cette table est ce qui l'oppose.
  it('n’enfreint qu’UNE loi par sujet défectueux', () => {
    SCENARIOS_DEFECTUEUX.forEach((scenario) => {
      expect(loisEnfreintes(scenario)).toHaveLength(1);
    });
  });

  it('couvre les quatre lois du § 6.2 et du § 8.5, une par sujet', () => {
    expect(SCENARIOS_DEFECTUEUX.flatMap((scenario) => loisEnfreintes(scenario)).sort()).toEqual([
      'elitUnPorteur',
      'muteSurHidden',
      'periodeDeBattementMs',
      'suspendLeBattementQuandCache',
    ]);
  });

  it('ne tient aucune loi pour enfreinte sur le scénario conforme', () => {
    expect(loisEnfreintes(SCENARIO_CONFORME)).toEqual([]);
  });

  // Une page corrigée qui ne demanderait PLUS RIEN passerait le gate par inertie. Le témoin de
  // contrôle du § 6.2 est la REPRISE : sur `visible`, le battement repart.
  it('reprend sur `visible`, dans les deux variantes — sinon le vert ne prouve que l’inertie', () => {
    [SCENARIO_CONFORME, SCENARIO_QUI_MUTE_CACHE].forEach((scenario) => {
      expect(pageFabriquee(scenario)).toContain('anonymous/refresh');
    });
  });

  it("élit un porteur par BroadcastChannel('meeshy-guest') quand il est corrigé", () => {
    expect(pageFabriquee(SCENARIO_CONFORME)).toContain("BroadcastChannel('meeshy-guest')");
  });

  it('laisse chaque onglet battre pour soi quand il est défectueux', () => {
    expect(pageFabriquee(SCENARIO_QUI_BAT_PAR_ONGLET)).not.toContain('BroadcastChannel');
  });

  it('sert ses requêtes sous un chemin que rien de la v3 ne réclame', () => {
    expect(CHEMIN_DU_SCENARIO).toMatch(/^\/__/);
    expect(pageFabriquee(SCENARIO_CONFORME)).toContain(CHEMIN_DU_SCENARIO);
  });

  it('reste du HTML sémantique — le gate ne fabrique pas ce que la v3 s’interdit', () => {
    expect(pageFabriquee(SCENARIO_CONFORME)).toContain('<main');
    expect(pageFabriquee(SCENARIO_CONFORME)).toContain('lang=');
  });
});

// Les six cas C→H du § 6.5 ont besoin d'un ÉCRAN pour avoir un sujet : ils arrivent avec `thread`
// (L2). Ce qui est posé aujourd'hui, c'est l'instrument et la ligne anti-régression, sur scénario
// fabriqué. La table le DIT — un instrument qui laisserait croire qu'il porte les six rendrait un
// vert sur cinq cas que personne n'a joués.
describe('la recette du § 6.5 — ce que cet instrument porte, et ce qu’il ne porte pas encore', () => {
  it('énumère les six cas C→H et la ligne anti-régression', () => {
    expect(CAS_DE_RECETTE.map((cas) => cas.id)).toEqual([
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
      'anti-régression',
    ]);
  });

  it('ne déclare porté que ce qui a un sujet aujourd’hui : un scénario fabriqué', () => {
    expect(CAS_DE_RECETTE.filter((cas) => cas.statut === 'fabriqué').map((cas) => cas.id)).toEqual([
      'E',
      'anti-régression',
    ]);
  });

  it('renvoie chaque cas restant à l’écran qui lui donnera un sujet', () => {
    casAPorter().forEach((cas) => {
      expect(cas.statut).toBe('à porter');
      expect(cas.porteurAttendu).toContain('thread');
    });
    expect(casAPorter().map((cas) => cas.id)).toEqual(['C', 'D', 'F', 'G', 'H']);
  });

  it('porte l’énoncé de chaque cas, pour qu’un cas ne se perde pas en changeant de lettre', () => {
    CAS_DE_RECETTE.forEach((cas) => {
      expect(cas.enonce.length).toBeGreaterThan(20);
    });
  });
});

// UN INSTRUMENT DÉCLARÉ N'EST PAS UN INSTRUMENT LANCÉ (leçon déjà payée par le gate axe, dont la
// chaîne `test:a11y` n'apparaissait que dans sa propre définition et dans le témoin qui vérifiait
// cette définition).
describe("le gate est BRANCHÉ — un instrument qu'aucune commande ne lance n'en est pas un", () => {
  const manifeste = (): unknown => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  const script = (nom: string): unknown => {
    const paquet = manifeste();
    const scripts =
      typeof paquet === 'object' && paquet !== null && 'scripts' in paquet ? paquet.scripts : {};
    return typeof scripts === 'object' && scripts !== null && nom in scripts
      ? (scripts as Record<string, unknown>)[nom]
      : undefined;
  };

  const lisRacine = (...segments: readonly string[]): string =>
    readFileSync(join(ROOT, '..', '..', ...segments), 'utf8');

  it('expose une commande qui lance le spec', () => {
    expect(script('test:lifecycle')).toContain('e2e/visual/v3-lifecycle.spec.ts');
  });

  it("est LANCÉ par ci.yml, pas seulement défini par package.json", () => {
    expect(lisRacine('.github', 'workflows', 'ci.yml')).toContain('test:lifecycle');
  });

  it("entre dans le rapport unique : l'agrégateur ne peut plus se dire complet sans lui", () => {
    const rapport = lisRacine('scripts', 'v3-rapport.mjs');

    expect(rapport).toContain('mesureCycleDeVie');
    expect(rapport).toMatch(/agrege\(\[[^\]]*mesureCycleDeVie\(/s);
  });
});

describe('le spec APPLIQUE la loi, il ne la réécrit pas', () => {
  const source = (): string => readFileSync(SPEC, 'utf8');

  it('lit son verdict dans le module, jamais dans une boucle recopiée', () => {
    expect(source()).toContain("from './lib/lifecycle'");
    expect(source()).toContain('mutationsPendantOngletCache');
    expect(source()).toContain('requetesPendantOngletCache');
  });

  it('joue les DEUX faces du scénario fabriqué — celle qui tombe et celle qui passe', () => {
    expect(source()).toContain('SCENARIO_QUI_MUTE_CACHE');
    expect(source()).toContain('SCENARIO_CONFORME');
  });

  it('oppose N onglets à un seul porteur', () => {
    expect(source()).toContain('SCENARIO_QUI_BAT_PAR_ONGLET');
    expect(source()).toContain('verdictDeBattement');
  });

  // LA FENÊTRE D'OBSERVATION EST VIRTUELLE, ET C'EST CE QUI REND LE GATE VOYANT. Une fenêtre de
  // temps MACHINE de 500 ms opposée à une période de battement de 300 000 ms (rapport 600) ne peut
  // voir qu'une fuite ÉMISE SYNCHRONEMENT dans le gestionnaire `visibilitychange` : tout ce qui est
  // minuté — un `setInterval` que personne n'a arrêté, une revalidation différée, une préchargeuse
  // de fond — lui est structurellement hors de portée, et une page qui ne suspend RIEN en sort
  // verte. `page.clock` fige l'horloge de la page et ne l'avance que sur ordre : les dix minutes du
  // § 8.5 s'y jouent en quelques millisecondes de temps machine. Et l'argument qui l'avait écartée
  // — « une horloge accélérée rendrait le compte dépendant de la machine » — est FAUX pour une
  // horloge VIRTUELLE : c'est l'horloge machine qui n'est pas déterministe, pas celle-ci.
  it('installe une horloge virtuelle AVANT de naviguer, et avance la fenêtre de recette', () => {
    expect(source()).toContain('clock.install({ time: INSTANT_DE_DEPART })');
    expect(source()).toContain('clock.runFor(BATTEMENT.fenetreDeRecetteMs)');
  });

  // `install()` seul laisse le temps COULER — c'est ce qui permet aux pages de se charger, et c'est
  // aussi ce qui rendrait le compte de battements dépendant de la machine (mesuré : 2, 3 puis 7
  // tours pour la même fenêtre). Le temps ne se fige qu'à `pauseAt`.
  it('FIGE l’horloge après le chargement, au lieu de se contenter de l’installer', () => {
    expect(source()).toContain(
      'clock.pauseAt(INSTANT_DE_DEPART + MARGE_DE_CHARGEMENT_MS)',
    );
  });

  // L'horloge est celle du CONTEXTE : deux onglets d'un même navigateur partagent un temps. La
  // piloter par PAGE la réinitialise pour tout le monde et l'avance autant de fois qu'il y a
  // d'onglets — un gate ROUGE sur un scénario conforme, la pire des deux erreurs.
  it('pilote l’horloge du CONTEXTE, jamais celle d’une page', () => {
    expect(source()).toContain('contexte.clock.');
    expect(source()).not.toContain('page.clock.');
  });

  it('oppose un sujet à CHACUNE des deux barres — la mutation ET le battement non suspendu', () => {
    expect(source()).toContain('SCENARIO_QUI_MUTE_CACHE');
    expect(source()).toContain('SCENARIO_QUI_NE_SUSPEND_PAS');
  });

  it('oppose le RAPPORT du § 8.5, pas seulement l’élection', () => {
    expect(source()).toContain('SCENARIO_QUI_BAT_TROP_SOUVENT');
  });

  // UN CONTRÔLE INERTE EST PIRE QU'UN CONTRÔLE ABSENT. `verdict()` passait `dureeMs: TICS *
  // BATTEMENT.periodeMs` pendant que le scénario à porteur unique émettait exactement `TICS`
  // battements : `plafond = floor(TICS·P / P) = TICS`, donc `conforme = TICS <= TICS` — vrai par
  // construction, quels que soient TICS et le taux réel. La durée opposée doit être celle que le
  // § 8.5 nomme, jamais une durée inventée à partir du nombre de tics observés.
  it('oppose la fenêtre de recette du § 8.5, jamais une durée déduite du compte observé', () => {
    expect(source()).toContain('dureeMs: BATTEMENT.fenetreDeRecetteMs');
    expect(source()).not.toMatch(/dureeMs:\s*TICS/);
  });
});

describe('le § 8.5 de la conception nomme son instrument', () => {
  const ligneCycleDeVie = (): string => {
    const ligne = readFileSync(CONCEPTION, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('- ') && l.includes('hidden') && l.includes('battement'));
    if (ligne === undefined) throw new Error('§ 8.5 : la puce du gate de cycle de vie est introuvable');
    return ligne;
  };

  it("cite le fichier qui porte le gate, au lieu d'annoncer un gate sans porteur", () => {
    expect(ligneCycleDeVie()).toContain('apps/web-v3/e2e/visual/v3-lifecycle.spec.ts');
  });

  it('nomme le module où vit son verdict et le témoin qui le gage sans navigateur', () => {
    expect(ligneCycleDeVie()).toContain('e2e/visual/lib/lifecycle.ts');
    expect(ligneCycleDeVie()).toContain('__tests__/lifecycle-gate.test.ts');
  });

  it('dit sur QUOI le gate porte aujourd’hui : un scénario fabriqué, pas un écran', () => {
    expect(ligneCycleDeVie()).toMatch(/fabriqu/);
  });

  // La conception déclarait cette couverture LIVRÉE alors que l'instrument ne voyait qu'une fuite
  // synchrone du gestionnaire `visibilitychange`. Ce qui rend la déclaration vraie est la fenêtre
  // VIRTUELLE : sans elle, la barre « 0 requête pendant hidden » n'a aucun sujet minuté à faire
  // rougir. Un document qui la tairait redeviendrait une source de vérité en avance sur son gate.
  it('dit COMMENT il observe : une fenêtre virtuelle, pas 500 ms de temps machine', () => {
    expect(ligneCycleDeVie()).toContain('page.clock');
    expect(ligneCycleDeVie()).toMatch(/VIRTUELLE|virtuelle/);
  });

  it('nomme la durée opposée au plafond — jamais une durée déduite du compte observé', () => {
    expect(ligneCycleDeVie()).toContain('BATTEMENT.fenetreDeRecetteMs');
  });

  it('nomme ses porteurs — un instrument que rien ne lance n’en est pas un', () => {
    expect(ligneCycleDeVie()).toContain('ci.yml');
    expect(ligneCycleDeVie()).toContain('v3-rapport.mjs');
  });
});
