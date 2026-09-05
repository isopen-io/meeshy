#!/usr/bin/env node
// Garde de l'ORDRE DE CONSTRUCTION des workspaces dans .github/workflows/ci.yml
// [#4761]
//
// CE QU'IL FERME
//
// Le dépôt DÉCLARE la dépendance de build à deux endroits, et correctement :
//
//   turbo.json                  "build": { "dependsOn": ["^build"], … }
//   apps/web-v3/package.json    "@meeshy/shared": "workspace:*"
//
// `turbo run build --filter=@meeshy/web-v3` construirait donc `packages/shared`
// d'abord, tout seul. Mesuré sur les 1 638 lignes du fichier, au 2026-09-02 :
//
//   • zéro invocation DIRECTE de l'orchestrateur dans les seize workflows du
//     dépôt (`turbo run`, `npx turbo`, `bunx turbo`, `turbo --`) ;
//   • mais il EST atteint, indirectement, par cinq étapes qui lancent un script
//     de la RACINE : `lint`, `lint --filter=@meeshy/web-v3`,
//     `type-check --filter=…` et les deux `test:coverage --filter=…`. Les trois
//     tâches correspondantes déclarent `dependsOn: ["^build"]` dans `turbo.json`,
//     donc CELLES-LÀ construisent `packages/shared` toutes seules ;
//   • et la seule tâche dont le graphe compte VRAIMENT — `build`, l'unique qui
//     émette `dist/` — est justement celle qui n'est jamais lancée depuis la
//     racine. Les 25 étapes qui entrent dans un workspace par `cd apps/…` ou
//     `cd services/…` y lancent le script du PAQUET (`next build`, `tsc`), sans
//     aucun graphe derrière ;
//   • 11 étapes « construis le paquet partagé » écrites à la main, une par job
//     qui en a besoin, recopiées.
//
// L'asymétrie EST le défaut : ces onze étapes sont une réimplémentation de
// `^build`, une copie par job, tenue à la main parce que le `cd` a fait sortir
// la commande du graphe qui l'aurait déduite.
//
// Ce que la recopie a coûté : `01c49fcfee` a fait importer `@meeshy/shared` par
// `apps/web-v3`. Les trois jobs qui construisent la v3 (`a11y-v3`,
// `lifecycle-v3`, `chaines-v3`) n'avaient pas leur étape à la main — trois jobs
// rouges, réparés par `b975ec3c7e` en AJOUTANT les trois étapes manquantes,
// c'est-à-dire la neuvième, dixième et onzième copie de la même ligne.
// `packages/shared/dist` étant gitignore (`packages/shared/.gitignore:2`), rien
// ne peut compenser l'oubli, et LE JOB QUI CASSE N'EST PAS CELUI QUI A AJOUTÉ
// L'IMPORT : la personne qui écrit l'`import` ne touche aucun fichier de CI.
//
// REJOUÉ SUR LE DÉFAUT LUI-MÊME, et pas seulement raconté : remis
// `.github/workflows/ci.yml` et `apps/web-v3/package.json` dans l'état de
// `f73f3c525e^` — l'arbre exact qui a rougi — ce garde rend rc=1 et NOMME les
// trois jobs, les trois étapes et la raison :
//
//   job « a11y-v3 » · étape « Build apps/web-v3 (le manifeste que le balayage
//   lit) » (l.308) : construit @meeshy/web-v3 sans qu'aucune étape antérieure
//   n'ait construit @meeshy/shared, déclaré workspace:* et PRODUCTEUR
//   (scripts.build → tsc --project tsconfig.json).
//
// … puis les mêmes lignes pour `lifecycle-v3` et `chaines-v3`, dans les deux
// scénarios. Six défauts, dans le job `quality`, avant qu'un seul `next build`
// n'ait tourné.
//
// Ce garde ne change RIEN à la façon dont les jobs s'exécutent — c'est
// délibéré : basculer `ci.yml` sur `turbo run` changerait le mode d'exécution
// de vingt-cinq étapes sans personne pour observer le premier run réel. Il fait
// seulement ROUGIR l'oubli, à l'endroit et au moment où il est écrit.
//
// POURQUOI IL VIT À LA RACINE, ET PAS DANS LA MATRICE DE TESTS D'UN PAQUET
//
// L'invariant porte sur `.github/workflows/ci.yml`, sur `turbo.json` et sur les
// manifestes des workspaces que la racine déclare : des fichiers de la RACINE.
// Il est donc appelé par le job `quality` de `ci.yml`, à côté de
// `check-type-debt.sh`, `check-lockfile-alignment.mjs`,
// `check-makefile-workspaces.mjs` et `check-v3-pipeline.mjs`, et son témoin est
// son propre `--self-test` — même forme que ses quatre voisins. Un garde de la
// CI écrit dans les tests d'un paquet que la CI porte est un garde qui remonte
// de trois crans pour atteindre sa surface : c'est exactement le défaut que
// `check-makefile-workspaces.mjs` documente en tête, et il a déjà coûté un
// cycle à ce dépôt.
//
// CE QU'IL LIT, ET SUR QUELLE SURFACE
//
// Les SEIZE workflows de `.github/workflows/`, pas seulement `ci.yml` — parce
// que « les autres ne construisent rien sur le runner » est une mesure du jour,
// pas une propriété. Mesuré au 2026-09-02 : `ci.yml` porte les 34 étapes de
// construction du dépôt, les quinze autres n'en portent AUCUNE. `docker.yml` et
// `release.yml` bâtissent par `docker/build-push-action`, où l'ordre est tenu
// par les Dockerfiles et non par des étapes de runner ; `v3-baseline.yml` mesure
// la PRODUCTION (`https://meeshy.me`) et n'a même pas d'étape d'installation ;
// les douze autres sont iOS, Android, SDK ou pilotage. Aucune exclusion à
// écrire, donc — et le jour où l'un d'eux gagne un
// `cd services/gateway && bun run build`, il entre sous la même règle sans
// qu'une ligne d'ici n'ait été touchée.
//
// LA NUANCE QUI DÉCIDE DE LA QUALITÉ DE CE GARDE
//
// Une dépendance `workspace:*` n'a besoin d'être CONSTRUITE que si elle PRODUIT
// quelque chose que le consommateur importe. Mesuré sur les trois paquets que
// `apps/web-v3` déclare :
//
//   @meeshy/shared         scripts.build = "tsc --project tsconfig.json"
//                          main/exports  → ./dist/…            ⇒ PRODUIT
//   @meeshy/design-tokens  aucun script  (le manifeste n'a pas de "scripts")
//                          exports       → ./tokens.css, ./dark.css, ./light.css
//                          — trois fichiers COMMITÉS, lus comme des fichiers  ⇒ NE PRODUIT PAS
//   @meeshy/icons          scripts = { sprite, verifie } — pas de "build"
//                          exports       → ./sprite.svg, ./critical.svg, …
//                          — également commités                 ⇒ NE PRODUIT PAS
//
// (`apps/web-v3/next.config.ts` lit d'ailleurs
// `./node_modules/@meeshy/icons/critical.svg` comme un FICHIER SUR LE DISQUE,
// jamais comme un module.)
//
// Un garde qui exigerait de construire un paquet d'actifs crierait au loup sur
// les trois quarts de ses cas et serait désarmé dans le mois. Le critère retenu
// est donc « ce workspace a-t-il un script `build` dont la SORTIE est ce que le
// consommateur importe ? », et il n'est pas écrit à la main : la sortie d'un
// build est ce que `turbo.json` DÉCLARE comme telle (`tasks.build.outputs`,
// aujourd'hui `dist/**` et `.next/**`). Un paquet produit donc si — et seulement
// si — il a un script `build` ET qu'au moins un de ses points d'entrée
// (`main`, `module`, `types`, `typings`, `bin`, feuilles d'`exports`) tombe sous
// l'un de ces globs. Le jour où `@meeshy/icons` gagnera un `build` qui émet
// `dist/sprite.svg` et pointera ses `exports` dessus, ce garde réclamera son
// étape sans qu'une ligne d'ici n'ait été touchée.
//
// POURQUOI « LE MÊME JOB », ET PAS « UN JOB DONT CELUI-CI DÉPEND »
//
// Aucun `dist/` ne voyage entre les jobs de `ci.yml` : les huit
// `actions/upload-artifact` du fichier publient des traces Playwright, des
// rapports de tests et des couvertures — mesuré, zéro `dist`. Chaque job
// réinstalle et reconstruit pour lui-même. La dépendance se tient donc DANS le
// job, entre deux étapes ordonnées, ou elle ne se tient pas.
//
// POURQUOI LES ÉTAPES SONT RENDUES PAR SCÉNARIO PLUTÔT QUE LUES
//
// « L'étape est là » et « l'étape tourne » sont deux affirmations différentes,
// et c'est la seconde qui construit le paquet. `ci.yml` se lance sous DEUX
// gestionnaires de paquets — `workflow_dispatch.inputs.package_manager`, options
// `bun` et `pnpm` — et la moitié de ses étapes portent un `if:` qui les réserve
// à l'un des deux. Un garde qui se contenterait de trouver l'étape « Build
// shared package (bun) » plus haut dans le job la compterait pour le scénario
// `pnpm`, où elle est SAUTÉE.
//
// Chaque étape est donc RENDUE une fois par scénario déclaré (expressions
// `${{ … }}` évaluées, `if:` résolu, matrice développée), puis le script rendu
// est déroulé comme un shell minimal qui suit les `cd`. C'est le même parti que
// `make -n` dans `check-makefile-workspaces.mjs` et que le déroulement bash de
// `check-v3-pipeline.mjs` : DÉROULER plutôt que relire.
//
// Ce rendu a rendu visible un second défaut, du même genre que celui de #4761 et
// invisible à la lecture : les trois jobs de la v3 écrivaient `bun run build` EN
// DUR pour `packages/shared`, alors que `Setup bun` porte
// `if: env.PACKAGE_MANAGER == 'bun'`. Sous `package_manager: pnpm`, `bun` n'est
// pas installé : l'étape qui construit la dépendance ÉCHOUE, et l'étape suivante
// — qui, elle, s'adapte au gestionnaire — construisait la v3 sans son paquet.
// D'où le second invariant : une étape ne peut invoquer un gestionnaire de
// paquets que dans les scénarios où une étape antérieure du même job l'installe.
//
// POURQUOI PAS DE BIBLIOTHÈQUE YAML
//
// Mesuré avant d'importer quoi que ce soit : `node -e "require('js-yaml')"` et
// `node -e "require('yaml')"` rendent tous deux MODULE_NOT_FOUND à la racine du
// dépôt — aucune des deux n'est une dépendance de la racine, et le job `quality`
// lance ce garde AVANT tout `install` de workspace. Les quatre gardes voisins de
// la racine font le même choix pour la même raison. La lecture indentée qui en
// tient lieu vit dans `scripts/lib/lecture-workflow.mjs` — son en-tête dit ce
// qu'elle rend, et à quel analyseur elle a été CONFRONTÉE avant d'être crue.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  commandsOf,
  jobsOf,
  managerInvoked,
  matrixContextsOf,
  optionsUnder,
  render,
  scriptRun,
  stepRuns,
  stepsOf,
} from './lib/lecture-workflow.mjs';
import { workspaceDirectories } from './lib/v3-disque.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const WORKFLOWS_DIRECTORY = '.github/workflows';
const WORKFLOW = `${WORKFLOWS_DIRECTORY}/ci.yml`;

// Le gestionnaire par DÉFAUT quand un workflow ne déclare pas le choix. Mesuré :
// `ci.yml` et `docker.yml` posent tous deux
// `PACKAGE_MANAGER: ${{ github.event.inputs.package_manager || 'bun' }}`, et
// l'en-tête de `release.yml` le dit en toutes lettres — « bun is the canonical
// package manager across the pipelines ».
const GESTIONNAIRE_PAR_DEFAUT = 'bun';

// Les bornes de NON-VACUITÉ. Un garde qui balaie zéro job, zéro étape de
// construction ou zéro dépendance productrice passe vert en n'ayant rien vu :
// c'est le mode de panne d'un garde qui LIT un fichier plutôt que d'en recevoir
// un, et il est SILENCIEUX — rien ne distingue « tout va bien » de « je ne vois
// plus rien ». Mesuré au 2026-09-02 : 16 workflows, 41 jobs, 2 scénarios,
// 8 workspaces dont 3 producteurs et 4 consommateurs, 34 étapes de construction.
// Les planchers sont ces mesures arrondies vers le bas — assez bas pour qu'un
// retrait légitime ne les frôle pas, assez haut pour qu'une lecture cassée les
// traverse. Ils se relèvent quand le dépôt grossit ; jamais ils ne se baissent
// en silence.
const MINIMA = {
  workflows: 10,
  jobs: 30,
  scenarios: 2,
  workspaces: 6,
  producers: 1,
  consumers: 3,
  buildSteps: 20,
};

// --- le graphe des workspaces, lu comme une DONNÉE ---------------------------

const ENTRY_FIELDS = ['main', 'module', 'types', 'typings', 'browser'];
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

const exportLeaves = (node) => {
  if (typeof node === 'string') return [node];
  if (node === null || typeof node !== 'object') return [];
  return Object.values(node).flatMap(exportLeaves);
};

const entryPaths = (manifest) => [
  ...ENTRY_FIELDS.map((field) => manifest[field]).filter((value) => typeof value === 'string'),
  ...Object.values(manifest.bin ?? {}).filter((value) => typeof value === 'string'),
  ...exportLeaves(manifest.exports),
];

/** Les racines de sortie que `turbo.json` DÉCLARE pour la tâche `build`. */
const buildOutputRoots = (turbo) =>
  (turbo.tasks?.build?.outputs ?? [])
    .filter((glob) => !glob.startsWith('!'))
    .map((glob) => glob.split('/')[0])
    .filter((root) => root !== '' && root !== '*' && root !== '**');

const produces = (manifest, outputRoots) => {
  if (typeof manifest.scripts?.build !== 'string') return false;
  return entryPaths(manifest).some((path) =>
    outputRoots.includes(path.replace(/^\.\//, '').split('/')[0]),
  );
};

const workspaceDependenciesOf = (manifest) =>
  DEPENDENCY_FIELDS.flatMap((field) =>
    Object.entries(manifest[field] ?? {})
      .filter(([, range]) => typeof range === 'string' && range.startsWith('workspace:'))
      .map(([name]) => name),
  );

/** La fermeture transitive, dont on ne RETIENT que les paquets qui produisent. */
const producingClosure = (name, byName) => {
  const seen = new Set();
  const queue = [...(byName.get(name)?.dependencies ?? [])];
  const producers = [];
  while (queue.length > 0) {
    const next = queue.shift();
    if (seen.has(next)) continue;
    seen.add(next);
    const workspace = byName.get(next);
    if (workspace === undefined) continue;
    if (workspace.produces) producers.push(workspace);
    queue.push(...workspace.dependencies);
  }
  return producers;
};

// --- le monde ----------------------------------------------------------------

const readWorld = (root) => {
  const workspaces = workspaceDirectories(root).map(({ name, directory }) => ({
    name,
    directory,
    manifest: JSON.parse(readFileSync(join(root, directory, 'package.json'), 'utf8')),
  }));
  const workflows = readdirSync(join(root, WORKFLOWS_DIRECTORY))
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .sort()
    .map((file) => ({
      file: `${WORKFLOWS_DIRECTORY}/${file}`,
      text: readFileSync(join(root, WORKFLOWS_DIRECTORY, file), 'utf8'),
    }));
  return {
    root,
    workflows,
    turbo: JSON.parse(readFileSync(join(root, 'turbo.json'), 'utf8')),
    workspaces,
  };
};

/** Le graphe dérivé : par nom, par répertoire, avec la productivité résolue. */
const graphOf = (world) => {
  const outputRoots = buildOutputRoots(world.turbo);
  const nodes = world.workspaces.map((workspace) => ({
    ...workspace,
    produces: produces(workspace.manifest, outputRoots),
    dependencies: workspaceDependenciesOf(workspace.manifest),
  }));
  return {
    outputRoots,
    nodes,
    byName: new Map(nodes.map((node) => [node.name, node])),
    byDirectory: new Map(nodes.map((node) => [node.directory, node])),
  };
};

// --- le rendu : une exécution par job × contexte de matrice × scénario -------

const setupUses = { bun: 'oven-sh/setup-bun', pnpm: 'pnpm/action-setup' };

const renderRun = (world, graph) => {
  const executions = [];
  const scenarios = new Set();
  for (const workflow of world.workflows) {
    const declared = optionsUnder(workflow.text, 'package_manager');
    const workflowScenarios = declared.length > 0 ? declared : [GESTIONNAIRE_PAR_DEFAUT];
    workflowScenarios.forEach((scenario) => scenarios.add(scenario));
    for (const job of jobsOf(workflow.text)) {
      const steps = stepsOf(job);
      for (const matrix of matrixContextsOf(job)) {
        for (const scenario of workflowScenarios) {
          const context = { env: { PACKAGE_MANAGER: scenario }, matrix };
          const rendered = steps
            .map((step) => renderStep(step, context))
            .filter((step) => step.runs);
          executions.push({
            workflow: workflow.file,
            declaredScenarios: declared.length > 0,
            job: job.name,
            matrix,
            scenario,
            steps: rendered,
            graph,
          });
        }
      }
    }
  }
  return { scenarios: [...scenarios], executions };
};

/**
 * Le rendu d'UNE étape dans UN scénario. Une expression dont la forme n'est pas
 * comprise ne fait pas tomber le garde en marche : elle rend l'étape ILLISIBLE,
 * ce que l'invariant (0) rapporte. Une lecture qui plante et une lecture qui
 * ment sont deux façons de ne rien voir ; celle-ci le DIT.
 */
const renderStep = (step, context) => {
  try {
    const runs = stepRuns(step.condition, context);
    if (!runs) return { ...step, runs: false, commands: [], indetermine: false, illisible: null };
    const script = step.run === null ? null : render(step.run, context);
    return {
      ...step,
      runs: true,
      renderedName: render(step.name, context),
      illisible: null,
      ...(script === null
        ? { commands: [], indetermine: false }
        : commandsOf(script, step.workingDirectory ?? '')),
    };
  } catch (error) {
    return {
      ...step,
      runs: true,
      renderedName: step.name,
      commands: [],
      indetermine: false,
      illisible: error.message,
    };
  }
};

// --- ce que chaque exécution BÂTIT et ce qu'elle CONSOMME --------------------

const buildsIn = (step, graph) =>
  step.commands.flatMap(({ directory, command }) => {
    const run = scriptRun(command);
    if (run === null || run.script !== 'build') return [];
    const workspace = graph.byDirectory.get(directory);
    return workspace === undefined ? [] : [workspace];
  });

const workspaceRunsIn = (step, graph) =>
  step.commands.flatMap(({ directory, command }) => {
    const run = scriptRun(command);
    if (run === null) return [];
    const workspace = graph.byDirectory.get(directory);
    return workspace === undefined ? [] : [{ workspace, ...run }];
  });

// --- les invariants ----------------------------------------------------------

/**
 * (1) L'ORDRE. Toute étape qui construit un workspace doit être précédée, DANS
 * LE MÊME JOB et DANS LE MÊME SCÉNARIO, d'une étape qui construit chacune de ses
 * dépendances `workspace:*` productrices (transitivement).
 */
const lOrdreDeConstruction = ({ executions }) =>
  executions.flatMap((execution) => {
    const built = new Set();
    return execution.steps.flatMap((step) => {
      const targets = buildsIn(step, execution.graph);
      const failures = targets.flatMap((target) =>
        producingClosure(target.name, execution.graph.byName)
          .filter((producer) => !built.has(producer.name))
          .map(
            (producer) =>
              `${situate(execution, step)} : construit ${target.name} ` +
              `sans qu'aucune étape antérieure n'ait construit ${producer.name}, ` +
              `déclaré workspace:* et PRODUCTEUR (scripts.build → ${producer.manifest.scripts.build}).`,
          ),
      );
      targets.forEach((target) => built.add(target.name));
      return failures;
    });
  });

/**
 * (2) L'ÉTAPE TOURNE-T-ELLE ? Une étape ne peut invoquer `bun` ou `pnpm` que
 * dans les scénarios où une étape ANTÉRIEURE du même job l'installe. Sans cet
 * invariant, (1) compterait pour acquise une étape que le scénario saute.
 */
const leGestionnaireEstInstalle = ({ executions }) =>
  executions.flatMap((execution) => {
    const installed = new Set();
    return execution.steps.flatMap((step) => {
      const failures = [...new Set(step.commands.map(({ command }) => managerInvoked(command)))]
        .filter((manager) => manager !== null && setupUses[manager] !== undefined)
        .filter((manager) => !installed.has(manager))
        .map(
          (manager) =>
            `${situate(execution, step)} : invoque ${manager}, ` +
            `qu'aucune étape antérieure du job n'installe dans ce scénario ` +
            `(${setupUses[manager]} y est sauté).`,
        );
      if (step.uses !== null) {
        Object.entries(setupUses).forEach(([manager, action]) => {
          if (step.uses.startsWith(action)) installed.add(manager);
        });
      }
      return failures;
    });
  });

/**
 * (3) NON-VACUITÉ. Ce que le garde a réellement VU. Sans ces bornes, la première
 * dérive de `ci.yml` qui casserait la lecture rendrait un balayage vide — donc
 * vert.
 */
const laLectureEstNonVide = ({ scenarios, executions, graph }) => {
  const jobs = new Set(executions.map((execution) => `${execution.workflow}#${execution.job}`));
  const workflows = new Set(executions.map((execution) => execution.workflow));
  const buildSteps = executions.flatMap((execution) =>
    execution.steps.filter((step) => buildsIn(step, execution.graph).length > 0),
  );
  const consumers = graph.nodes.filter(
    (node) => producingClosure(node.name, graph.byName).length > 0,
  );
  const producers = graph.nodes.filter((node) => node.produces);
  const measured = {
    workflows: workflows.size,
    jobs: jobs.size,
    scenarios: scenarios.length,
    workspaces: graph.nodes.length,
    producers: producers.length,
    consumers: consumers.length,
    buildSteps: buildSteps.length,
  };
  const failures = Object.entries(MINIMA)
    .filter(([key, minimum]) => measured[key] < minimum)
    .map(
      ([key, minimum]) =>
        `non-vacuité : ${key} = ${measured[key]}, en dessous du plancher ${minimum} — ` +
        `la lecture de ${WORKFLOWS_DIRECTORY}/ ou des manifestes a cessé de voir ce qu'elle voyait.`,
    );
  const ci = executions.filter((execution) => execution.workflow === WORKFLOW);
  if (ci.length === 0) {
    failures.push(
      `non-vacuité : aucune exécution lue dans ${WORKFLOW} — c'est LE fichier ` +
        'qui construit les workspaces sur le runner (mesuré : les quinze autres ' +
        "n'y lancent aucun script de paquet), donc l'ignorer vide le garde.",
    );
  }
  if (graph.outputRoots.length === 0) {
    failures.push(
      'non-vacuité : turbo.json ne déclare aucune sortie pour la tâche `build` — ' +
        'le critère « ce paquet PRODUIT-il ? » n\'a plus de source.',
    );
  }
  return failures;
};

/** Où le défaut se lit : fichier, job, entrée de matrice, scénario, ligne. */
const situate = (execution, step) =>
  `${execution.workflow} · job « ${execution.job} »${matrixLabel(execution)}` +
  `${execution.declaredScenarios ? ` · scénario ${execution.scenario}` : ''}` +
  ` · étape « ${step.renderedName} » (l.${step.line})`;

const matrixLabel = (execution) =>
  Object.keys(execution.matrix).length === 0
    ? ''
    : ` (${Object.entries(execution.matrix)
        .map(([key, value]) => `${key}=${typeof value === 'object' ? value.name ?? JSON.stringify(value) : value}`)
        .join(', ')})`;

/**
 * (0) LE SCRIPT EST-IL LISIBLE ? Un `run:` dont le répertoire courant dépend
 * d'une branche prise à l'exécution ne dit pas dans quel workspace ses commandes
 * tournent — donc (1) n'y voit rien, et un garde qui ne voit rien passe vert.
 * Il vaut mieux refuser de lire que lire de travers.
 */
const leScriptEstLisible = ({ executions }) =>
  executions.flatMap((execution) =>
    execution.steps.flatMap((step) => {
      if (step.illisible !== null) {
        return [
          `${situate(execution, step)} : une expression de l'étape n'a pas été comprise ` +
            `(${step.illisible}) — le garde refuse de lire ce qu'il ne sait pas évaluer. ` +
            "Étendre l'évaluateur de `check-ci-build-order.mjs`, ou simplifier l'expression.",
        ];
      }
      if (!step.indetermine) return [];
      return [
        `${situate(execution, step)} : le script de l'étape n'est pas lisible — ` +
          "un `cd` pris dans une branche de shell est suivi d'un `run` hors de cette branche, " +
          'si bien que le workspace où il tourne dépend de la branche prise. ' +
          'Sortir le `cd` de la branche, ou donner à chaque branche son propre `cd`.',
      ];
    }),
  );

const CHECKS = [
  ['le script est lisible', leScriptEstLisible],
  ["l'ordre de construction", lOrdreDeConstruction],
  ['le gestionnaire de paquets est installé', leGestionnaireEstInstalle],
  ['la lecture est non vide', laLectureEstNonVide],
];

const inspect = (world) => {
  const graph = graphOf(world);
  const { scenarios, executions } = renderRun(world, graph);
  const state = { scenarios, executions, graph };
  return CHECKS.flatMap(([title, check]) => {
    try {
      return check(state);
    } catch (error) {
      return [`${title} → le contrôle n'a pas pu être déroulé : ${error.message}`];
    }
  });
};

// --- l'inventaire, pour l'humain qui relit le balayage -----------------------

const inventory = (world) => {
  const graph = graphOf(world);
  const { executions } = renderRun(world, graph);
  const rows = [];
  for (const execution of executions) {
    const built = new Set();
    for (const step of execution.steps) {
      const runs = workspaceRunsIn(step, execution.graph);
      for (const { workspace, script, manager } of runs) {
        const producers = producingClosure(workspace.name, execution.graph.byName);
        rows.push({
          job: `${execution.job}${matrixLabel(execution)}`,
          sc: execution.scenario,
          ligne: step.line,
          repertoire: workspace.directory,
          script,
          gestionnaire: manager,
          productrices: producers.map((producer) => producer.name).join(' ') || '—',
          construites: producers.map((producer) => (built.has(producer.name) ? '✓' : '✗')).join(' ') || '—',
        });
      }
      buildsIn(step, execution.graph).forEach((target) => built.add(target.name));
    }
  }
  console.table(rows);
  console.log(
    `\nworkflows lus : ${[...new Set(executions.map((execution) => execution.workflow))]
      .map(
        (file) =>
          `${file.split('/').pop()} (${
            new Set(
              executions.filter((execution) => execution.workflow === file).map((e) => e.job),
            ).size
          } jobs)`,
      )
      .join(', ')}`,
  );
  console.log(
    `\n${graph.nodes.length} workspaces ; producteurs : ` +
      `${graph.nodes.filter((node) => node.produces).map((node) => node.name).join(', ')} ; ` +
      `sorties de build déclarées par turbo.json : ${graph.outputRoots.join(', ')}.`,
  );
  return 0;
};

// --- self-test ---------------------------------------------------------------

const mutate = (world, apply) => {
  const copy = {
    ...world,
    workflows: world.workflows.map((entry) => ({ ...entry })),
    workspaces: world.workspaces.map((workspace) => ({
      ...workspace,
      manifest: structuredClone(workspace.manifest),
    })),
    turbo: structuredClone(world.turbo),
  };
  apply(copy);
  return copy;
};

const manifestOf = (world, name) =>
  world.workspaces.find((workspace) => workspace.name === name).manifest;

const workflowOf = (world, name) => {
  const entry = world.workflows.find((candidate) => candidate.file.endsWith(`/${name}`));
  if (entry === undefined) throw new Error(`workflow « ${name} » introuvable`);
  return entry;
};

const ciOf = (world) => workflowOf(world, 'ci.yml');

/**
 * Une substitution CONFINÉE à un job de `ci.yml`. Les noms d'étapes se répètent
 * d'un job à l'autre (« Build shared package (bun) » apparaît quatre fois) : une
 * sonde non ancrée frapperait la première occurrence — dans `quality`, où rien
 * ne consomme — et passerait sous le garde en croyant l'avoir désarmé.
 */
const inJob = (world, job, needle, replacement) => {
  const ci = ciOf(world);
  const header = `\n  ${job}:\n`;
  const start = ci.text.indexOf(header);
  if (start === -1) throw new Error(`job « ${job} » introuvable`);
  const head = ci.text.slice(0, start);
  const tail = ci.text.slice(start);
  const end = tail.slice(1).search(/\n {2}[A-Za-z0-9_-]+:\n/);
  const body = end === -1 ? tail : tail.slice(0, end + 1);
  const rest = end === -1 ? '' : tail.slice(end + 1);
  ci.text = head + body.replace(needle, replacement) + rest;
};

const MUTATIONS = [
  [
    "l'étape « Build packages/shared » retirée du job a11y-v3 (le défaut de 01c49fcfee)",
    (world) =>
      inJob(
        world,
        'a11y-v3',
        /      - name: Build packages\/shared[^\n]*\n        run: \|\n          cd packages\/shared\n[^\n]*\n/,
        '',
      ),
    'job « a11y-v3 » · scénario bun · étape « Build apps/web-v3',
  ],
  [
    'une dépendance workspace:* PRODUCTRICE ajoutée sans son étape (le scénario que #4761 ferme)',
    (world) => {
      const tokens = manifestOf(world, '@meeshy/design-tokens');
      tokens.scripts = { ...tokens.scripts, build: 'node scripts/build-tokens.mjs' };
      tokens.main = './dist/tokens.js';
    },
    '@meeshy/design-tokens',
  ],
  [
    // L'ORDRE, et pas seulement la présence : l'étape reste dans le job, elle
    // passe simplement en DERNIER. Un garde qui se contenterait de chercher
    // « une étape construit-elle le paquet partagé quelque part dans ce job ? »
    // laisserait cette mutation passer.
    'le paquet partagé construit APRÈS ses consommateurs, dans le job build',
    (world) => {
      const step =
        "      - name: Build shared package (bun)\n        if: env.PACKAGE_MANAGER == 'bun'\n" +
        '        run: |\n          cd packages/shared\n          bun run build\n';
      inJob(world, 'build', step, '');
      inJob(world, 'build', /$/, `\n${step}`);
    },
    "sans qu'aucune étape antérieure n'ait construit @meeshy/shared",
  ],
  [
    'le `run build` du paquet partagé changé en `run compile` dans le job build',
    (world) =>
      inJob(
        world,
        'build',
        /(- name: Build shared package \(bun\)\n        if[^\n]*\n        run: \|\n          cd packages\/shared\n          bun run )build/,
        '$1compile',
      ),
    "sans qu'aucune étape antérieure n'ait construit @meeshy/shared",
  ],
  [
    "l'étape « Setup bun » du job build réservée au scénario pnpm",
    (world) =>
      inJob(
        world,
        'build',
        /(- name: Setup bun\n        if: env\.PACKAGE_MANAGER == )'bun'/,
        "$1'pnpm'",
      ),
    "invoque bun, qu'aucune étape antérieure du job n'installe",
  ],
  [
    "la v3 construite par un `cd` pris dans une branche de shell",
    (world) =>
      inJob(
        world,
        'a11y-v3',
        /      - name: Build apps\/web-v3[^\n]*\n        run: \|\n          cd apps\/web-v3\n/,
        '      - name: Build apps/web-v3 (branche)\n        run: |\n          if true; then cd apps/web-v3; fi\n',
      ),
    "n'est pas lisible",
  ],
  [
    // La sonde qui prouve que le garde va bien AU-DELÀ de `ci.yml` : sans elle,
    // « les seize workflows sont couverts » resterait une affirmation de
    // l'en-tête, et rien ne tomberait le jour où la lecture cesserait d'en
    // atteindre quinze.
    "le « Setup bun » de release.yml retiré, alors que le job y lance bun et bunx",
    (world) => {
      const release = workflowOf(world, 'release.yml');
      release.text = release.text.replace(
        /^ +- name: Setup bun\n +uses: oven-sh\/setup-bun@[^\n]*\n(?: +with:\n(?: +[^\n]*\n)*)?/m,
        '',
      );
    },
    'release.yml',
  ],
  [
    'turbo.json cesse de déclarer les sorties de la tâche build',
    (world) => {
      delete world.turbo.tasks.build.outputs;
    },
    'non-vacuité',
  ],
  [
    'ci.yml amputé de tous ses jobs sauf le premier',
    (world) => {
      const ci = ciOf(world);
      ci.text = ci.text.slice(0, ci.text.indexOf('\n  a11y-v3:\n') + 1);
    },
    'non-vacuité',
  ],
];

const selfTest = (world) => {
  const standing = inspect(world);
  const blind = MUTATIONS.filter(
    ([, apply, expected]) =>
      !inspect(mutate(world, apply)).some((failure) => failure.includes(expected)),
  );
  blind.forEach(([title, , expected]) =>
    console.error(`AVEUGLE : « ${title} » n'a produit aucun échec contenant « ${expected} »`),
  );
  if (blind.length > 0) {
    console.error(`\n${blind.length}/${MUTATIONS.length} mutations passent sous le garde.`);
    return 1;
  }
  console.log(
    `self-test : ${MUTATIONS.length}/${MUTATIONS.length} mutations détectées ` +
      `(${standing.length} échec(s) réel(s) en dehors des sondes).`,
  );
  return 0;
};

// --- main --------------------------------------------------------------------

const main = () => {
  let world;
  try {
    world = readWorld(REPO_ROOT);
  } catch (error) {
    console.error(`impossible de lire l'ordre de construction : ${error.message}`);
    return 1;
  }
  if (process.argv.includes('--inventaire')) return inventory(world);
  if (process.argv.includes('--self-test')) return selfTest(world);
  const failures = inspect(world);
  if (failures.length > 0) {
    failures.forEach((failure) => console.error(failure));
    console.error(
      `\n${failures.length} défaut(s) dans l'ordre de construction de ${WORKFLOW}. ` +
        'Une dépendance workspace:* PRODUCTRICE se construit AVANT son consommateur, ' +
        'dans le même job et dans le même scénario de gestionnaire de paquets.',
    );
    return 1;
  }
  const graph = graphOf(world);
  const { scenarios, executions } = renderRun(world, graph);
  const buildSteps = executions.flatMap((execution) =>
    execution.steps.filter((step) => buildsIn(step, execution.graph).length > 0),
  );
  const perWorkflow = [...new Set(executions.map((execution) => execution.workflow))]
    .map((file) => {
      const steps = executions
        .filter((execution) => execution.workflow === file)
        .flatMap((execution) => execution.steps.filter((step) => buildsIn(step, graph).length > 0));
      return steps.length === 0 ? null : `${file.split('/').pop()}=${steps.length}`;
    })
    .filter((entry) => entry !== null);
  console.log(
    `${WORKFLOWS_DIRECTORY}/ : ordre de construction tenu sur ` +
      `${new Set(executions.map((e) => `${e.workflow}#${e.job}`)).size} jobs de ` +
      `${new Set(executions.map((e) => e.workflow)).size} workflows, ` +
      `${executions.length} exécutions (${scenarios.join(' / ')}), ` +
      `${buildSteps.length} étapes de construction (${perWorkflow.join(', ')}), ` +
      `${graph.nodes.filter((node) => node.produces).length} paquet(s) producteur(s) sur ${graph.nodes.length} workspaces.`,
  );
  return 0;
};

process.exit(main());
