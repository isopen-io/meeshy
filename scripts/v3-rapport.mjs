#!/usr/bin/env node
// LE RAPPORT UNIQUE de la machine de vérification de la v3 web [L-0.5].
//
//   node scripts/v3-rapport.mjs                        # les mesures qui n'exigent aucun serveur
//   node scripts/v3-rapport.mjs --base http://127.0.0.1:3300 --chemin /stories/<id>
//   node scripts/v3-rapport.mjs --json                 # la même chose, à donner à une machine
//   node scripts/v3-rapport.mjs --self-test            # les mutations que l'agrégation doit voir
//
// POURQUOI IL VIT À LA RACINE
//
// Il invoque SIX outils qui ne vivent pas ensemble : deux dans
// `docs/product/MeeshyWebV3Design/` (le gate d'ordre, le diff par région) et quatre
// dans `apps/web-v3/` (le budget de bundle, le poids réseau CDP, le gate axe, le
// gate de cycle de vie). Sa surface est le dépôt — règle de placement (B) de la
// conception, le même motif que `scripts/check-v3-pipeline.mjs`.
//
// POURQUOI L'ACCESSIBILITÉ EST LA CINQUIÈME, ET LE CYCLE DE VIE LA SIXIÈME
//
// Le § 9.2 range ces deux gates parmi les livrables de la machine de vérification,
// et cet agrégateur ne les CONNAISSAIT PAS : il rendait « 4/4 vertes, rapport
// complet » pendant que le gate axe n'avait jamais été regardé — c'est-à-dire
// exactement le « tout va bien alors que rien n'a été regardé » que l'en-tête
// ci-dessous dit combattre, une mesure en dessous. Un instrument absent de
// l'agrégation ne rougit jamais : il n'existe pas. Le gate de cycle de vie
// (§ 8.5 : « 0 requête pendant que l'onglet est hidden ») est entré par la MÊME
// porte, le jour où il a existé.
//
// POURQUOI « NON EXÉCUTÉE » N'EST PAS « VERT »
//
// C'est le seul point qui décide si ce rapport sert à quelque chose. Cinq des
// six mesures ont un prérequis : un build pour le budget, un serveur pour le
// rendu et pour le poids réseau, un build ET un navigateur pour l'accessibilité
// comme pour le cycle de vie.
// Un rapport qui les compterait vertes quand elles n'ont pas tourné rendrait
// exactement le verdict que l'on cherche à éviter — « tout va bien » alors que
// rien n'a été regardé. Une mesure qui n'a pas pu tourner sort donc en NON
// EXÉCUTÉE, avec son prérequis nommé, et le rapport rend rc=2 : ni un succès,
// ni un échec, un rapport INCOMPLET.
//
// CE QU'IL N'INVENTE PAS
//
// Rien. Chaque chiffre vient de la sortie d'un des six outils, et chaque
// ligne du rapport nomme la commande qui l'a produite. Ce qui n'a pas été mesuré
// est écrit « à établir », jamais 0.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CIBLES_PRODUCTION, verdictDeLigneDeBase } from '../apps/web-v3/scripts/baseline.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

const VERT = 'vert';
const ROUGE = 'rouge';
const ABSENTE = 'non exécutée';

export const agrege = (mesures) => {
  const rouges = mesures.filter((m) => m.statut === ROUGE);
  const absentes = mesures.filter((m) => m.statut === ABSENTE);
  return {
    total: mesures.length,
    vertes: mesures.filter((m) => m.statut === VERT).length,
    rouges: rouges.length,
    non_executees: absentes.length,
    complet: absentes.length === 0,
    rc: rouges.length > 0 ? 1 : absentes.length > 0 ? 2 : 0,
    mesures,
  };
};

export const formate = (rapport) =>
  [
    '── Meeshy web v3 — rapport de vérification ──────────────────────────────',
    ...rapport.mesures.flatMap((m) => [
      `${m.statut === VERT ? '✓' : m.statut === ROUGE ? '✗' : '·'} ${m.mesure.padEnd(22)} ${m.statut}${m.raison ? ` — ${m.raison}` : ''}`,
      `    ${m.commande}`,
      ...Object.entries(m.chiffres ?? {}).map(([cle, valeur]) => `    ${cle} = ${valeur}`),
      ...(m.chiffres && Object.keys(m.chiffres).length ? [] : ['    chiffres = à établir']),
    ]),
    `── ${rapport.vertes}/${rapport.total} verte(s), ${rapport.rouges} rouge(s), ${rapport.non_executees} non exécutée(s) — rc=${rapport.rc}`,
  ].join('\n');

const lance = (commande, args, options) => {
  const issue = spawnSync(commande, args, {
    cwd: options?.cwd ?? RACINE,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...(options?.env ?? {}) },
    timeout: options?.timeoutMs ?? 300000,
  });
  return {
    code: typeof issue.status === 'number' ? issue.status : 1,
    stdout: issue.stdout ? String(issue.stdout) : '',
    stderr: issue.stderr ? String(issue.stderr) : '',
    message: issue.error ? String(issue.error.message).split('\n')[0] : null,
  };
};

export const premiereLigne = (texte) =>
  String(texte ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? null;

// UN outil qui échoue proprement — message sur stderr, rc≠0, stdout VIDE — ne
// doit pas faire tomber l'agrégateur. `JSON.parse(stdout)` sans garde jetait une
// SyntaxError non rattrapée : aucun rapport n'était produit, aucune ligne
// « rouge » n'apparaissait, et le rc=1 obtenu venait du CRASH, indiscernable
// d'une mesure rouge. Le sous-gate échouait proprement ; l'agrégateur, non.
export const lectureDeSortie = ({ nom, commande, resultat }) => {
  try {
    return { valeur: JSON.parse(resultat.stdout) };
  } catch {
    return {
      echec: mesure(
        nom,
        commande,
        ROUGE,
        null,
        premiereLigne(resultat.stderr) ??
          resultat.message ??
          `sortie illisible (rc=${resultat.code}, ${resultat.stdout.length} octet(s) sur stdout)`,
      ),
    };
  }
};

const mesure = (nom, commande, statut, chiffres, raison) => ({
  mesure: nom,
  commande,
  statut,
  chiffres: chiffres ?? {},
  raison: raison ?? null,
});

const CODES_ORDRE = {
  1: 'cycle dans le graphe des dépendances',
  2: 'dépendance pendante',
  3: 'couverture planche ↔ matrice incorrecte',
  4: 'un écran P0 attend un écran de priorité inférieure',
};

const mesureOrdre = () => {
  const script = 'docs/product/MeeshyWebV3Design/ordre-des-ecrans.js';
  const commande = `node ${script}`;
  const { code } = lance('node', [script]);
  const matrice = JSON.parse(
    readFileSync(join(RACINE, 'docs/product/MeeshyWebV3Design/matrice.json'), 'utf8'),
  );
  const chiffres = {
    ecrans: matrice.ecrans.length,
    hors_planche: matrice.ecrans.filter((e) => e.hors_planche).length,
    lots: matrice.lots.length,
    P0: matrice.ecrans.filter((e) => e.priorite.startsWith('P0')).length,
  };
  return code === 0
    ? mesure("ordre des écrans", commande, VERT, chiffres)
    : mesure("ordre des écrans", commande, ROUGE, chiffres, CODES_ORDRE[code] ?? `rc=${code}`);
};

const mesureBudget = () => {
  const script = 'apps/web-v3/scripts/check-bundle-budget.mjs';
  const commande = `node ${script}`;
  if (!existsSync(join(RACINE, 'apps/web-v3/.next/app-build-manifest.json'))) {
    return mesure('budget de bundle', commande, ABSENTE, null, 'prérequis : bun run build dans apps/web-v3');
  }
  const resultat = lance('node', [script, '--json']);
  const lu = lectureDeSortie({ nom: 'budget de bundle', commande, resultat });
  if (lu.echec) return lu.echec;
  const { code } = resultat;
  const rapport = lu.valeur;
  const chiffres = {
    pages: rapport.pages,
    gestionnaires_de_route: rapport.gestionnaires,
    ...Object.fromEntries(
      rapport.groupes.flatMap((g) => [
        [`${g.groupe} socle_ko`, g.socle_ko],
        [`${g.groupe} ecran_le_plus_lourd_ko`, `${g.ecran_le_plus_lourd.ko} (${g.ecran_le_plus_lourd.route})`],
        [`${g.groupe} cumul_p95_ko`, g.cumul_p95_ko],
      ]),
    ),
    ...(rapport.groupes.length === 0 ? { js_client_ko: 0 } : {}),
    avertissements: rapport.avertissements.length,
  };
  return code === 0
    ? mesure('budget de bundle', commande, VERT, chiffres)
    : mesure(
        'budget de bundle',
        commande,
        ROUGE,
        chiffres,
        [...rapport.depassements, ...(rapport.regressions ?? []), ...rapport.anomalies].join(' ; '),
      );
};

const mesureRendu = (base) => {
  const script = 'docs/product/MeeshyWebV3Design/compare-rendu.js';
  const commande = `node ${script} --base ${base ?? '<base>'}`;
  if (!base) {
    return mesure('conformité du rendu', commande, ABSENTE, null, 'prérequis : --base <url> d\'une v3 servie');
  }
  const dossier = mkdtempSync(join(tmpdir(), 'v3-rapport-'));
  const sortie = join(dossier, 'conformite.json');
  try {
    const { code, message } = lance('node', [script, '--base', base, '--json', sortie]);
    if (!existsSync(sortie)) {
      return mesure('conformité du rendu', commande, ABSENTE, null, message ?? 'aucun rapport produit');
    }
    const rapport = JSON.parse(readFileSync(sortie, 'utf8'));
    const ecarts = rapport.rapport.map((r) => r.structure).filter((v) => typeof v === 'number');
    const chiffres = {
      vues_comparees: rapport.total,
      hors_cible_ou_budget: rapport.echecs,
      seuil_structure: rapport.seuil_structure,
      ecart_structurel_max: ecarts.length ? Math.max(...ecarts) : 'à établir',
    };
    return code === 0
      ? mesure('conformité du rendu', commande, VERT, chiffres)
      : mesure('conformité du rendu', commande, ROUGE, chiffres, `${rapport.echecs} vue(s) hors cible ou hors budget`);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
};

// Le poids réseau est la QUATRIÈME mesure, et c'était la seule qui ne pouvait
// pas rougir : elle sortait VERTE dès qu'elle avait tourné, un échec de mesure
// était classé « non exécutée », et sa cible par défaut était `/healthz` — un
// gestionnaire de route qui rend du JSON, dont aucun chiffre ne dit rien d'un
// écran. Elle compare désormais ses chiffres aux seuils de `budgets.json`, rend
// ROUGE sur un GATE franchi comme sur une url attendue qu'elle n'a pas pu
// joindre, et n'a plus de chemin par défaut : mesurer un point de santé pour
// afficher « vert » est pire que ne rien mesurer.
const mesureReseau = (base, chemins) => {
  const script = 'apps/web-v3/scripts/mesure-reseau.mjs';
  const urls = chemins.map((c) => `${base ?? ''}${c}`);
  const commande = `node ${script} --json ${urls.join(' ') || '<url…>'}`;
  if (!base) {
    return mesure('poids réseau (CDP)', commande, ABSENTE, null, 'prérequis : --base <url> d\'une v3 servie');
  }
  if (urls.length === 0) {
    return mesure(
      'poids réseau (CDP)',
      commande,
      ABSENTE,
      null,
      'aucun chemin à mesurer : passer --chemin /stories/<id> (autant de fois que nécessaire). La v3 n\'a encore aucun écran ; /healthz est un gestionnaire de route, ses chiffres ne budgètent rien',
    );
  }

  const resultat = lance('node', [script, '--json', ...urls]);
  const lu = lectureDeSortie({ nom: 'poids réseau (CDP)', commande, resultat });
  if (lu.echec) return lu.echec;

  const { mesures, depassements = [], avertissements = [], non_mesurees: absentes = [] } = lu.valeur;
  const prises = mesures.filter((m) => m.statut === 'mesuré');
  const chiffres = {
    urls: mesures.length,
    mesurees: prises.length,
    profil: lu.valeur.profil?.nom ?? 'à établir',
    octets_max_ko: prises.length ? Math.max(...prises.map((m) => Math.round(m.octets_transferes / 1024))) : 'à établir',
    requetes_avant_premier_pixel_max: prises.length
      ? Math.max(...prises.map((m) => m.requetes_avant_premier_pixel ?? 0))
      : 'à établir',
    requetes_pendantes_max: prises.length
      ? Math.max(...prises.map((m) => m.requetes_pendantes ?? 0))
      : 'à établir',
    lcp_max_ms: prises.length ? Math.max(...prises.map((m) => m.lcp_ms ?? 0)) : 'à établir',
    avertissements: avertissements.length,
  };
  return depassements.length > 0 || absentes.length > 0
    ? mesure('poids réseau (CDP)', commande, ROUGE, chiffres, [...depassements, ...absentes].join(' ; '))
    : mesure('poids réseau (CDP)', commande, VERT, chiffres);
};

// LES DEUX GATES DU § 8.5 QUI PASSENT PAR UN NAVIGATEUR — l'accessibilité
// (« 0 erreur axe serious/critical sur toute route (public) ») et le cycle de vie
// (« 0 requête pendant que l'onglet est hidden ; 1 seule requête de battement
// pour N onglets sur 10 min »).
//
// Leurs prérequis sont les MÊMES, et chacun se nomme : un `next build` — le
// manifeste que le balayage axe lit, et le serveur que `playwright.config.ts`
// lève — et un Chromium. Un prérequis manquant sort en NON EXÉCUTÉE, jamais en
// vert ; un navigateur introuvable est un prérequis, pas un échec du gate, et se
// distingue donc d'un test rouge.
//
// Une seule invocation les sert : deux copies de cette fonction auraient divergé
// au premier prérequis ajouté, et c'est exactement la jumelle que le § 9.2
// interdit à cet agrégateur de fabriquer.
const NOM_A11Y = 'accessibilité (axe)';

const NOM_CYCLE_DE_VIE = 'cycle de vie (réseau)';

const NAVIGATEUR_ABSENT =
  /Executable doesn't exist|playwright install|Please run the following command to download/i;

const messagesDePlaywright = (rapport) => {
  const dansSuite = (suite) => [
    ...(suite.suites ?? []).flatMap(dansSuite),
    ...(suite.specs ?? []).flatMap((spec) =>
      (spec.tests ?? []).flatMap((t) =>
        (t.results ?? []).flatMap((r) => (r.errors ?? []).map((e) => e?.message ?? '')),
      ),
    ),
  ];
  return [
    ...(rapport?.errors ?? []).map((e) => e?.message ?? String(e)),
    ...(rapport?.suites ?? []).flatMap(dansSuite),
  ].filter((message) => String(message).trim().length > 0);
};

export const classeExecutionDeSpec = ({ code, stats, messages }) => {
  if (messages.some((message) => NAVIGATEUR_ABSENT.test(message))) {
    return { statut: ABSENTE, raison: 'prérequis : npx playwright install --with-deps chromium' };
  }
  if (code === 0) return { statut: VERT, raison: null };
  return {
    statut: ROUGE,
    raison:
      premiereLigne(messages[0]) ??
      `${stats?.unexpected ?? 0} test(s) en échec (rc=${code})`,
  };
};

const mesureSpec = ({ nom, fichier }) => {
  const app = join(RACINE, 'apps/web-v3');
  const commande = `npx playwright test ${fichier} (dans apps/web-v3)`;

  if (!existsSync(join(app, '.next/app-build-manifest.json'))) {
    return mesure(nom, commande, ABSENTE, null, 'prérequis : bun run build dans apps/web-v3');
  }
  if (!existsSync(join(app, 'node_modules/@playwright/test'))) {
    return mesure(
      nom,
      commande,
      ABSENTE,
      null,
      'prérequis : bun install dans apps/web-v3 (@playwright/test absent)',
    );
  }

  const resultat = lance('npx', ['playwright', 'test', fichier, '--reporter=json'], {
    cwd: app,
    timeoutMs: 900000,
  });
  const lu = lectureDeSortie({ nom, commande, resultat });
  if (lu.echec) {
    return NAVIGATEUR_ABSENT.test(`${resultat.stderr}${resultat.stdout}`)
      ? mesure(
          nom,
          commande,
          ABSENTE,
          null,
          'prérequis : npx playwright install --with-deps chromium',
        )
      : lu.echec;
  }

  const stats = lu.valeur?.stats ?? {};
  const messages = messagesDePlaywright(lu.valeur);
  const { statut, raison } = classeExecutionDeSpec({ code: resultat.code, stats, messages });
  const chiffres = {
    tests: (stats.expected ?? 0) + (stats.unexpected ?? 0) + (stats.flaky ?? 0),
    verts: stats.expected ?? 0,
    rouges: stats.unexpected ?? 0,
    ignores: stats.skipped ?? 0,
  };
  return mesure(nom, commande, statut, statut === ABSENTE ? null : chiffres, raison);
};

const mesureA11y = () => mesureSpec({ nom: NOM_A11Y, fichier: 'e2e/visual/v3-a11y.spec.ts' });

// LA SIXIÈME MESURE — le gate de cycle de vie, pour la raison EXACTE qui a fait
// entrer l'accessibilité en cinquième : un instrument absent de l'agrégation ne
// rougit jamais. L'agrégateur aurait rendu « 5/5 vertes, rapport complet » sur un
// « 0 requête pendant que l'onglet est hidden » que personne n'aurait regardé.
const mesureCycleDeVie = () =>
  mesureSpec({ nom: NOM_CYCLE_DE_VIE, fichier: 'e2e/visual/v3-lifecycle.spec.ts' });

// LA SEPTIÈME MESURE — la ligne de base « AVANT », entrée par la MÊME porte que
// la cinquième et la sixième, et pour la même raison. Le § 9.2 la range parmi
// les livrables de la machine de vérification ; cet agrégateur ne la connaissait
// pas. Il rendait donc « 6/6 vertes, rapport complet » alors que la seule mesure
// du dépôt qui ne soit PAS prise — celle contre laquelle le § 8.2 dit que « le
// progrès se démontre, jamais contre une intuition » — n'avait jamais été
// regardée.
//
// Elle n'invoque aucun outil : elle LIT le fichier commité. Le verdict, lui,
// vit dans `apps/web-v3/scripts/baseline.mjs`, avec la donnée qu'il juge — une
// seconde lecture de `etablie` ici serait la jumelle que le § 9.2 interdit.
const NOM_LIGNE_DE_BASE = 'ligne de base (prod)';

const CHEMIN_LIGNE_DE_BASE = join(RACINE, 'apps/web-v3/e2e/visual/baseline.json');

const mesureLigneDeBase = () => {
  const commande = 'node apps/web-v3/scripts/baseline.mjs <les 6 urls de production>';
  const lu = (() => {
    try {
      return JSON.parse(readFileSync(CHEMIN_LIGNE_DE_BASE, 'utf8'));
    } catch {
      return null;
    }
  })();
  const { statut, raison, chiffres } = verdictDeLigneDeBase(lu);
  return mesure(NOM_LIGNE_DE_BASE, commande, statut, chiffres, raison);
};

const MUTATIONS = [
  ['une mesure rouge', [VERT, ROUGE, VERT, VERT, VERT, VERT, VERT], 1],
  ['une mesure non exécutée', [VERT, ABSENTE, VERT, VERT, VERT, VERT, VERT], 2],
  ['une rouge ET une non exécutée', [ROUGE, ABSENTE, VERT, VERT, VERT, VERT, VERT], 1],
  ['la CINQUIÈME mesure rouge — l’accessibilité', [VERT, VERT, VERT, VERT, ROUGE, VERT, VERT], 1],
  ['la CINQUIÈME mesure non exécutée', [VERT, VERT, VERT, VERT, ABSENTE, VERT, VERT], 2],
  ['la SIXIÈME mesure rouge — le cycle de vie', [VERT, VERT, VERT, VERT, VERT, ROUGE, VERT], 1],
  ['la SIXIÈME mesure non exécutée', [VERT, VERT, VERT, VERT, VERT, ABSENTE, VERT], 2],
  ['la SEPTIÈME mesure rouge — la ligne de base', [VERT, VERT, VERT, VERT, VERT, VERT, ROUGE], 1],
  ['la SEPTIÈME mesure non exécutée', [VERT, VERT, VERT, VERT, VERT, VERT, ABSENTE], 2],
  ['les sept vertes', [VERT, VERT, VERT, VERT, VERT, VERT, VERT], 0],
  ['aucune mesure', [], 0],
];

// LE VERDICT DE LA SEPTIÈME MESURE, sondé sur ses trois sorties. Il vit dans
// `baseline.mjs`, et c'est précisément pourquoi il est sondé ICI : un verdict
// dont l'agrégateur ne compterait pas le statut — une quatrième chaîne, une
// casse différente — sortirait ni vert, ni rouge, ni absent, et disparaîtrait de
// l'arithmétique sans que rien ne rougisse. La mutation « un statut que
// l'agrégation ne compte pas » ferme la seule couture que l'extraction ouvre.
//
// Trois de ces mutations disent ce qu'une ligne de base VERTE ne peut PAS être :
// prise ailleurs que sur la production, amputée d'un des six gestes du rôle
// premier, ou prise sans dire dans quelles conditions réseau. Sans elles, un
// fichier mesuré sur `127.0.0.1` — la commande même qu'on lance pour éprouver
// la chaîne — passait le rapport au vert.
const ligneDeBaseFictive = (surcharge = {}) => ({
  etablie: true,
  date: '2026-08-30',
  profil: { nom: 'Fast 3G — préréglage de Chrome DevTools', repetitions: 5, percentile: 75 },
  repetitions: 5,
  percentile: 75,
  mesures: CIBLES_PRODUCTION.map((cible) => ({
    statut: 'mesuré',
    url: cible.url.replace(/<[^>]+>/, 'abc123'),
    octets_transferes: 1024,
    lcp_ms: 1400,
    requetes_avant_premier_pixel: 3,
  })),
  ...surcharge,
});

const MUTATIONS_LIGNE_DE_BASE = [
  [
    "une ligne de base NON établie est un prérequis, pas un gate rouge",
    { etablie: false, date: '2026-08-30', mesures: [{ statut: 'à établir' }], point_ouvert: { a_rejouer: 'x', prerequis: ['un hôte qui atteint meeshy.me'] } },
    ABSENTE,
  ],
  [
    "une ligne de base qui se DÉCLARE établie sans chiffres",
    { etablie: true, date: '2026-08-30', mesures: [{ statut: 'à établir' }] },
    ROUGE,
  ],
  ['un baseline.json illisible', null, ROUGE],
  [
    'une ligne de base mesurée AILLEURS que sur la production',
    ligneDeBaseFictive({
      mesures: [
        {
          statut: 'mesuré',
          url: 'http://127.0.0.1:8931/',
          octets_transferes: 1024,
          lcp_ms: 28,
          requetes_avant_premier_pixel: 1,
        },
      ],
    }),
    ROUGE,
  ],
  [
    "une ligne de base à laquelle il manque un geste du rôle premier",
    ligneDeBaseFictive({ mesures: ligneDeBaseFictive().mesures.slice(0, 3) }),
    ROUGE,
  ],
  [
    "une ligne de base qui ne dit pas dans quelles conditions réseau",
    ligneDeBaseFictive({ profil: null }),
    ROUGE,
  ],
  ['une ligne de base établie, chiffrée, et prise sur les six gestes', ligneDeBaseFictive(), VERT],
];

// Les mutations de l'exécution d'un gate passant par un navigateur : un
// navigateur absent est un PRÉREQUIS (non exécutée), pas un gate rouge — les
// confondre rendrait rc=1 sur une machine sans Chromium et rc=2 sur une
// violation réelle, exactement à l'envers.
const MUTATIONS_A11Y = [
  [
    'aucun Chromium installé',
    { code: 1, stats: { unexpected: 1 }, messages: ["Executable doesn't exist at /root/.cache"] },
    ABSENTE,
    'playwright install',
  ],
  [
    'une violation axe',
    { code: 1, stats: { unexpected: 1 }, messages: ['2 violation(s) axe bloquante(s) sur /l'] },
    ROUGE,
    'violation(s) axe',
  ],
  [
    'une requête mutante partie pendant que l’onglet était caché',
    {
      code: 1,
      stats: { unexpected: 1 },
      messages: ["1 requête(s) émise(s) pendant que l'onglet était caché"],
    },
    ROUGE,
    "pendant que l'onglet était caché",
  ],
  ['tout est vert', { code: 0, stats: { expected: 4 }, messages: [] }, VERT, null],
];

// Les mutations ci-dessus ne sondent que l'ARITHMÉTIQUE des statuts. Elles
// laissaient passer la moitié du fichier : l'INVOCATION. Un outil qui échoue
// proprement — rc≠0, message sur stderr, stdout vide — faisait crasher
// l'agrégateur sur `JSON.parse('')`, exactement dans le scénario que le critère
// de fin nomme (« échoue proprement si apps/web-v3 n'a pas encore de route »).
const MUTATIONS_INVOCATION = [
  ['un outil rend rc≠0 avec une sortie VIDE', { code: 1, stdout: '', stderr: 'manifeste absent\ndétail' }, ROUGE, 'manifeste absent'],
  ['un outil rend un JSON TRONQUÉ', { code: 0, stdout: '{"pages":1', stderr: '' }, ROUGE, 'sortie illisible'],
  ['un outil rend un JSON complet', { code: 0, stdout: '{"pages":1}', stderr: '' }, null, null],
];

const selfTest = () => {
  const aveugles = MUTATIONS.filter(([, statuts, attendu]) => {
    const rapport = agrege(statuts.map((s, i) => mesure(`m${i}`, 'x', s)));
    return rapport.rc !== attendu;
  });
  aveugles.forEach(([titre, , attendu]) =>
    console.error(`AVEUGLE : « ${titre} » aurait dû rendre rc=${attendu}`),
  );

  const aveuglesInvocation = MUTATIONS_INVOCATION.filter(([, resultat, statut, extrait]) => {
    const lu = lectureDeSortie({ nom: 'm', commande: 'x', resultat: { ...resultat, message: null } });
    if (statut === null) return Boolean(lu.echec);
    return !lu.echec || lu.echec.statut !== statut || !String(lu.echec.raison).includes(extrait);
  });
  aveuglesInvocation.forEach(([titre]) =>
    console.error(`AVEUGLE : « ${titre} » n'est pas rendu en mesure, il fait tomber l'agrégateur`),
  );

  const aveuglesA11y = MUTATIONS_A11Y.filter(([, entree, statut, extrait]) => {
    const verdict = classeExecutionDeSpec(entree);
    if (verdict.statut !== statut) return true;
    return extrait !== null && !String(verdict.raison).includes(extrait);
  });
  aveuglesA11y.forEach(([titre]) =>
    console.error(
      `AVEUGLE : « ${titre} » n'est pas classé comme il doit l'être par un gate de navigateur`,
    ),
  );

  const aveuglesLigneDeBase = MUTATIONS_LIGNE_DE_BASE.filter(([, fichier, statut]) => {
    const verdict = verdictDeLigneDeBase(fichier);
    if (verdict.statut !== statut) return true;
    return agrege([mesure('m', 'x', verdict.statut)]).total !== 1
      ? true
      : ![VERT, ROUGE, ABSENTE].includes(verdict.statut);
  });
  aveuglesLigneDeBase.forEach(([titre]) =>
    console.error(`AVEUGLE : « ${titre} » n'est pas le statut que l'agrégation compte`),
  );

  const complet = agrege([mesure('m', 'x', ABSENTE)]).complet;
  if (complet) {
    console.error('AVEUGLE : un rapport portant une mesure non exécutée se déclare complet');
    return 1;
  }
  const total =
    MUTATIONS.length +
    MUTATIONS_INVOCATION.length +
    MUTATIONS_A11Y.length +
    MUTATIONS_LIGNE_DE_BASE.length;
  const manquees =
    aveugles.length + aveuglesInvocation.length + aveuglesA11y.length + aveuglesLigneDeBase.length;
  if (manquees > 0) {
    console.error(`\n${manquees}/${total} mutations passent sous l'agrégation.`);
    return 1;
  }
  console.log(`self-test : ${total}/${total} mutations détectées.`);
  return 0;
};

export const cheminsDemandes = (argv) =>
  argv.flatMap((a, i) => (a === '--chemin' && argv[i + 1] ? [argv[i + 1]] : []));

const main = () => {
  if (process.argv.includes('--self-test')) return selfTest();

  const i = process.argv.indexOf('--base');
  const base = i >= 0 ? process.argv[i + 1]?.replace(/\/$/, '') : undefined;
  const chemins = cheminsDemandes(process.argv);

  const rapport = agrege([
    mesureOrdre(),
    mesureBudget(),
    mesureRendu(base),
    mesureReseau(base, chemins),
    mesureA11y(),
    mesureCycleDeVie(),
    mesureLigneDeBase(),
  ]);

  process.stdout.write(
    process.argv.includes('--json') ? `${JSON.stringify(rapport, null, 1)}\n` : `${formate(rapport)}\n`,
  );
  return rapport.rc;
};

process.exit(main());
