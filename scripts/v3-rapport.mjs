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
// Il invoque QUATRE outils qui ne vivent pas ensemble : deux dans
// `docs/product/MeeshyWebV3Design/` (le gate d'ordre, le diff par région) et deux
// dans `apps/web-v3/scripts/` (le budget de bundle, le poids réseau CDP). Sa
// surface est le dépôt — règle de placement (B) de la conception, le même motif
// que `scripts/check-v3-pipeline.mjs`.
//
// POURQUOI « NON EXÉCUTÉE » N'EST PAS « VERT »
//
// C'est le seul point qui décide si ce rapport sert à quelque chose. Trois des
// quatre mesures ont un prérequis : un build pour le budget, un serveur pour le
// rendu et pour le poids réseau. Un rapport qui les compterait vertes quand
// elles n'ont pas tourné rendrait exactement le verdict que l'on cherche à
// éviter — « tout va bien » alors que rien n'a été regardé. Une mesure qui n'a
// pas pu tourner sort donc en NON EXÉCUTÉE, avec son prérequis nommé, et le
// rapport rend rc=2 : ni un succès, ni un échec, un rapport INCOMPLET.
//
// CE QU'IL N'INVENTE PAS
//
// Rien. Chaque chiffre vient de la sortie d'un des quatre outils, et chaque
// ligne du rapport nomme la commande qui l'a produite. Ce qui n'a pas été mesuré
// est écrit « à établir », jamais 0.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    cwd: RACINE,
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

const MUTATIONS = [
  ['une mesure rouge', [VERT, ROUGE, VERT, VERT], 1],
  ['une mesure non exécutée', [VERT, ABSENTE, VERT, VERT], 2],
  ['une rouge ET une non exécutée', [ROUGE, ABSENTE, VERT, VERT], 1],
  ['les quatre vertes', [VERT, VERT, VERT, VERT], 0],
  ['aucune mesure', [], 0],
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

  const complet = agrege([mesure('m', 'x', ABSENTE)]).complet;
  if (complet) {
    console.error('AVEUGLE : un rapport portant une mesure non exécutée se déclare complet');
    return 1;
  }
  const total = MUTATIONS.length + MUTATIONS_INVOCATION.length;
  const manquees = aveugles.length + aveuglesInvocation.length;
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

  const rapport = agrege([mesureOrdre(), mesureBudget(), mesureRendu(base), mesureReseau(base, chemins)]);

  process.stdout.write(
    process.argv.includes('--json') ? `${JSON.stringify(rapport, null, 1)}\n` : `${formate(rapport)}\n`,
  );
  return rapport.rc;
};

process.exit(main());
