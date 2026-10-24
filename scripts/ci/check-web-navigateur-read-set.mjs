#!/usr/bin/env node
// Le CLIQUET de la zone « Web · gardes navigateur » : la carte de ce que le job LIT est tenue, pas devinée.
//
// `scripts/ci-affected.mjs` saute le job `web-navigateur` de ci.yml quand aucun fichier changé n'appartient à
// `DOMAINES.web_navigateur`. Cette carte n'est sûre que si elle contient tout ce que les gardes du job lisent :
// une garde qui lit `docs/product/cadres-de-gloire/` et dont la zone l'ignore resterait verte sur une PR qui
// casse ce qu'elle garde, jusqu'à la prochaine PR web.
//
// Ce que fait le cliquet : il lit le job `web-navigateur` de ci.yml, relève les scripts que ses étapes lancent,
// SUIT leurs imports locaux sous `apps/web/scripts/`, extrait de chacun les chemins du dépôt situés HORS de
// `apps/web` (littéraux, et segments de `join`/`resolve`), y ajoute les paquets du dépôt dont `apps/web`
// dépend (`workspace:*`), et ROUGIT pour tout chemin que la zone ne couvre pas.
//
// Limite assumée : un chemin construit sans aucun littéral échappe au cliquet. En cas de doute, élargir la zone.
//
// Usage :
//   node scripts/ci/check-web-navigateur-read-set.mjs             # le cliquet
//   node scripts/ci/check-web-navigateur-read-set.mjs --self-test # prouve qu'il tombe

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DOMAINES, couvre } from '../ci-affected.mjs';
import { jobsOf, stepsOf } from '../lib/lecture-workflow.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const JOB = 'web-navigateur';
const WEB = 'apps/web';

export const PLANCHER_SCRIPTS = 50;
export const CHEMINS_EXTERNES_CONNUS = [
  'docs/product/cadres-de-gloire',
  'services/gateway',
  'packages/shared',
  'packages/design-tokens',
];

const RACINES_DU_DEPOT = /^(?:apps\/(?!web(?:\/|$))[\w.-]+|packages|services|docs|scripts|tasks|infrastructure|\.github)(?:\/|$)/;
const EXTENSIONS = ['', '.mjs', '.ts', '.js', '.tsx', '.json'];

const sansCommentaires = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;,(])\/\/.*$/gm, '$1');

// `node`/`bun`, des drapeaux éventuels, puis un chemin qui passe par un dossier `scripts/` :
// `node scripts/x.mjs` après `cd apps/web`, `node apps/web/scripts/x.mjs` depuis la racine,
// `node --no-warnings scripts/x.mjs`, `bun ../../scripts/x.ts`.
const INVOCATION = /\b(?:node|bun)\s+(?:--?[\w-]+(?:=\S+)?\s+)*((?:[\w.-]+\/)*scripts\/[\w./-]+)/g;

/** Les scripts que les étapes du job lancent, relatifs à la racine du dépôt. */
export const scriptsDuJob = (workflow) => {
  const job = jobsOf(workflow).find((candidat) => candidat.name === JOB);
  if (!job) return [];
  const scripts = stepsOf(job).flatMap((etape) => {
    const run = etape.run ?? '';
    const base = /^\s*cd\s+(\S+)/m.exec(run)?.[1] ?? etape.workingDirectory ?? '.';
    return [...run.matchAll(INVOCATION)].map((m) => join(base, m[1]));
  });
  return [...new Set(scripts)].sort();
};

/** Les fichiers dont le cliquet suit les imports et relève les chemins : les scripts d'apps/web et ceux de la racine. */
const estUnScriptLu = (chemin) => chemin.startsWith(`${WEB}/scripts/`) || chemin.startsWith('scripts/');

const resoudre = (fichier, specifieur) => {
  const cible = resolve(dirname(fichier), specifieur);
  return EXTENSIONS.map((ext) => cible + ext).find((candidat) => existsSync(candidat) && !existsSync(candidat + '/'));
};

/** Les scripts lancés et tous leurs imports locaux sous apps/web/scripts/. */
export const fichiersLus = (racine, scripts) => {
  const vus = new Set();
  const aVisiter = scripts.map((script) => resolve(racine, script));
  while (aVisiter.length > 0) {
    const fichier = aVisiter.pop();
    if (vus.has(fichier) || !existsSync(fichier)) continue;
    vus.add(fichier);
    if (!estUnScriptLu(relative(racine, fichier))) continue;
    const source = sansCommentaires(readFileSync(fichier, 'utf8'));
    for (const m of source.matchAll(/(?:from|import|require)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const suite = resoudre(fichier, m[1]);
      if (suite) aVisiter.push(suite);
    }
  }
  return [...vus].map((fichier) => relative(racine, fichier)).sort();
};

const normalise = (segments) => {
  const pile = [];
  segments.join('/').split('/').forEach((segment) => {
    if (segment === '..') pile.pop();
    else if (segment !== '.' && segment !== '') pile.push(segment);
  });
  return pile.join('/');
};

const LITTERAL = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;

/**
 * Les chemins du dépôt, hors apps/web, qu'un fichier épelle : littéraux (interpolations retirées, donc
 * `${ROOT}apps/ios/x` se lit `apps/ios/x`), littéraux relatifs (`../../../packages/x`, résolus depuis le
 * fichier) et segments de `join`/`resolve`.
 */
export const cheminsExternes = (source, { fichier = `${WEB}/scripts/x.mjs` } = {}) => {
  const texte = sansCommentaires(source);
  const litteraux = [...texte.matchAll(LITTERAL)].map((m) => m[2].replace(/\$\{[^}]*\}/g, ''));
  const absolus = litteraux.map((s) => s.replace(/^\/+/, '')).filter((s) => s.includes('/') && RACINES_DU_DEPOT.test(s));
  const relatifs = litteraux
    .filter((s) => /^\.\.\//.test(s))
    .map((s) => normalise([dirname(fichier), s]))
    .filter((chemin) => RACINES_DU_DEPOT.test(chemin));
  const construits = [...texte.matchAll(/\b(?:join|resolve)\(([^()\n]*)\)/g)]
    .map((m) => [...m[1].matchAll(LITTERAL)].map((piece) => piece[2]))
    .map(normalise)
    .filter((chemin) => RACINES_DU_DEPOT.test(chemin));
  return [...new Set([...absolus, ...relatifs, ...construits])].map((chemin) => chemin.replace(/[*{].*$/, '').replace(/\/+$/, ''));
};

/** Les paquets du dépôt dont apps/web dépend par `workspace:*`. */
export const paquetsDuDepot = (racine) => {
  const manifeste = JSON.parse(readFileSync(join(racine, WEB, 'package.json'), 'utf8'));
  const dependances = { ...manifeste.dependencies, ...manifeste.devDependencies };
  const noms = Object.entries(dependances).filter(([, v]) => String(v).startsWith('workspace:')).map(([nom]) => nom);
  return readdirSync(join(racine, 'packages'), { withFileTypes: true })
    .filter((entree) => entree.isDirectory() && existsSync(join(racine, 'packages', entree.name, 'package.json')))
    .filter((entree) => noms.includes(JSON.parse(readFileSync(join(racine, 'packages', entree.name, 'package.json'), 'utf8')).name))
    .map((entree) => `packages/${entree.name}`);
};

const couvert = (zone, chemin) => couvre(zone, chemin) || couvre(zone, `${chemin}/`);

/** Les violations : chaque chemin lu que la zone ne couvre pas, avec ce qui le lit. */
export const violations = ({ lectures, zone }) =>
  Object.entries(lectures)
    .filter(([chemin]) => !couvert(zone, chemin))
    .map(([chemin, lecteurs]) => `« ${chemin} » est lu par ${lecteurs.slice(0, 3).join(', ')} mais DOMAINES.web_navigateur ne le couvre pas`);

export const mesurer = (racine) => {
  const workflow = readFileSync(join(racine, '.github/workflows/ci.yml'), 'utf8');
  const scripts = scriptsDuJob(workflow);
  const fichiers = fichiersLus(racine, scripts);
  const lectures = {};
  const noter = (chemin, lecteur) => {
    lectures[chemin] = [...(lectures[chemin] ?? []), lecteur];
  };
  const relatifAWeb = (fichier, chemin) => fichier.startsWith(`${WEB}/`) && existsSync(join(racine, WEB, chemin));
  fichiers
    .filter((fichier) => estUnScriptLu(fichier) && existsSync(join(racine, fichier)))
    .forEach((fichier) =>
      cheminsExternes(readFileSync(join(racine, fichier), 'utf8'), { fichier })
        .filter((chemin) => !relatifAWeb(fichier, chemin))
        .forEach((chemin) => noter(chemin, fichier)),
    );
  paquetsDuDepot(racine).forEach((paquet) => noter(paquet, `${WEB}/package.json`));
  fichiers.filter((fichier) => !fichier.startsWith(`${WEB}/`)).forEach((fichier) => noter(fichier, 'import local'));
  return { scripts, fichiers, lectures };
};

const planchers = ({ fichiers, lectures }) => [
  ...(fichiers.length < PLANCHER_SCRIPTS ? [`seulement ${fichiers.length} fichiers lus (plancher ${PLANCHER_SCRIPTS}) : la lecture est aveugle`] : []),
  ...CHEMINS_EXTERNES_CONNUS.filter((connu) => !Object.keys(lectures).some((chemin) => chemin === connu || chemin.startsWith(`${connu}/`)))
    .map((connu) => `le chemin connu « ${connu} » n'a pas été retrouvé : la lecture est aveugle`),
];

const JOB_SYNTHETIQUE = [
  'jobs:',
  `  ${JOB}:`,
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - name: depuis la racine',
  `        run: node ${WEB}/scripts/racine.mjs`,
  '      - name: avec un drapeau',
  '        run: |',
  `          cd ${WEB}`,
  '          node --no-warnings scripts/drapeau.mjs',
  '      - name: un outil de la racine',
  '        run: node scripts/outil.mjs',
  '',
].join('\n');

/** Un script lancé depuis la racine, avec un drapeau, ou un outil de la racine reste LU, imports compris. */
const invocationsAutoTest = () => {
  const echecs = [];
  const attendus = [`${WEB}/scripts/drapeau.mjs`, `${WEB}/scripts/racine.mjs`, 'scripts/outil.mjs'];
  const invoques = scriptsDuJob(JOB_SYNTHETIQUE);
  if (!attendus.every((script) => invoques.includes(script))) {
    echecs.push(`les invocations ne sont pas toutes relevées : ${JSON.stringify(invoques)}`);
  }
  const depot = mkdtempSync(join(tmpdir(), 'zone-web-navigateur-'));
  const ecrire = (chemin, contenu) => {
    mkdirSync(dirname(join(depot, chemin)), { recursive: true });
    writeFileSync(join(depot, chemin), contenu);
  };
  try {
    ecrire('.github/workflows/ci.yml', JOB_SYNTHETIQUE);
    ecrire(`${WEB}/package.json`, '{"name":"@meeshy/web"}');
    ecrire(`${WEB}/scripts/racine.mjs`, "import { lire } from './lib/aide.mjs';\n");
    ecrire(`${WEB}/scripts/lib/aide.mjs`, "export const lire = () => '../../../../packages/MeeshySDK/Sources/X.swift';\n");
    ecrire(`${WEB}/scripts/drapeau.mjs`, '');
    ecrire('scripts/outil.mjs', "import { lire } from './lib/outil-aide.mjs';\n");
    ecrire('scripts/lib/outil-aide.mjs', "export const lire = () => readFileSync('apps/ios/Meeshy/Loi.swift');\n");
    mkdirSync(join(depot, 'packages'), { recursive: true });
    const { lectures } = mesurer(depot);
    ['packages/MeeshySDK/Sources/X.swift', 'apps/ios/Meeshy/Loi.swift', 'scripts/outil.mjs', 'scripts/lib/outil-aide.mjs']
      .filter((chemin) => !(chemin in lectures))
      .forEach((chemin) => echecs.push(`« ${chemin} » n'est pas relevé dans un dépôt synthétique : ${JSON.stringify(Object.keys(lectures))}`));
  } finally {
    rmSync(depot, { recursive: true, force: true });
  }
  return echecs;
};

const autoTest = (racine) => {
  const mesure = mesurer(racine);
  const base = [...violations({ lectures: mesure.lectures, zone: DOMAINES.web_navigateur }), ...planchers(mesure)];
  const echecs = [];
  if (base.length > 0) echecs.push(`l'état réel devrait être conforme : ${base.join(' ; ')}`);
  const sans = (prefixe) => DOMAINES.web_navigateur.filter((chemin) => chemin !== prefixe);
  const mutations = [
    ['docs/product/cadres-de-gloire/', /check-glory-frames/],
    ['services/gateway/', /services\/gateway/],
    ['packages/shared/', /packages\/shared/],
  ];
  mutations.forEach(([prefixe, attendu]) => {
    const rouges = violations({ lectures: mesure.lectures, zone: sans(prefixe) });
    if (!rouges.some((message) => attendu.test(message))) echecs.push(`retirer ${prefixe} de la zone ne rougit pas (${rouges.length} violation(s))`);
  });
  const synthetique = cheminsExternes("const lu = join(RACINE, '..', '..', 'docs', 'product', 'x.md'); // packages/morte/y.ts");
  if (!synthetique.includes('docs/product/x.md') || synthetique.some((chemin) => chemin.startsWith('packages/morte'))) {
    echecs.push(`l'extraction ne tient pas ses cas : ${JSON.stringify(synthetique)}`);
  }
  echecs.push(...invocationsAutoTest());
  if (echecs.length > 0) {
    echecs.forEach((echec) => console.error(`ÉCHEC : ${echec}`));
    return 1;
  }
  console.log(`self-test : ${mesure.fichiers.length} fichiers lus, ${Object.keys(mesure.lectures).length} chemins relevés, ${mutations.length} mutations détectées`);
  return 0;
};

const main = () => {
  if (process.argv.includes('--self-test')) return autoTest(RACINE);
  const mesure = mesurer(RACINE);
  if (process.argv.includes('--liste')) console.log(JSON.stringify(mesure.lectures, null, 1));
  const trouvees = [...violations({ lectures: mesure.lectures, zone: DOMAINES.web_navigateur }), ...planchers(mesure)];
  if (trouvees.length > 0) {
    trouvees.forEach((message) => console.error(`::error title=Zone web_navigateur::${message}`));
    return 1;
  }
  console.log(`Zone web_navigateur : ${mesure.fichiers.length} fichiers lus, ${Object.keys(mesure.lectures).length} chemins hors apps/web, tous couverts.`);
  return 0;
};

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());
