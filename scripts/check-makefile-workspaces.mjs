#!/usr/bin/env node
// Garde des répertoires de travail déclarés par le Makefile [L-0.5]
//
// POURQUOI IL VIT À LA RACINE, ET PAS DANS UN WORKSPACE
//
// L'invariant porte sur le `Makefile` de la RACINE. Sa surface est le dépôt,
// pas une app — donc il est appelé par le job `quality`, à côté des autres
// gates de racine, et NON depuis les tests d'un paquet.
//
// Sa première écriture vivait dans les tests de l'ancienne refonte v3, retirée
// du dépôt depuis (#5994). Elle sortait de son propre workspace pour atteindre
// sa surface (`join(__dirname,'..','..','..')` — seul test du dossier à
// remonter de trois crans), et surtout elle ne tournait dans AUCUNE CI : la
// matrice `test:` de `.github/workflows/ci.yml` ne portait alors que `shared`,
// `web`, `gateway`, `agent`. Le garde était un CONTRÔLE
// INERTE : la régression qu'il prétendait fermer — le retour d'un précédent
// mort dans le Makefile — était rouverte au commit suivant sans que rien ne
// rougisse. Précédents retenus : `check-type-debt.sh`, `check-law-literals.sh`,
// `check-lockfile-alignment.mjs`, `check-swift-viewbuilder.sh`.
//
// POURQUOI L'ENTRÉE S'ARRÊTE À `apps|services|packages`
//
// Ce sont exactement les trois familles que la racine déclare en workspaces.
// Les autres `*_DIR` du Makefile ne sont pas du même ordre et rougiraient à
// tort : `PID_DIR := .pids` et `CERTS_DIR := $(COMPOSE_DIR)/certs` désignent
// des répertoires GÉNÉRÉS, absents d'un clone propre. Un garde qui rougit sur
// un clone neuf n'est pas un garde, c'est un bruit qu'on apprend à ignorer.
//
// POURQUOI LES CIBLES SONT DÉROULÉES PAR `make -n`
//
// Un `*_DIR` mort se voit dans le texte ; un `cd` vers un répertoire absent ne
// se voit qu'APRÈS expansion des variables. Les cibles tmux entrent dans leurs
// répertoires via `$(CURDIR)/$(X_DIR)`, donc le dry-run rend des chemins
// absolus valables quelle que soit la racine du checkout. C'est ce qui laissait
// passer `apps/web_v2` : la variable était morte, la ligne restait lisible.
//
// POURQUOI LE COMPOSE DE DEV ENTRE DANS CE MONDE [#4439]
//
// La question « quelles origines l'environnement de DÉV sert-il à la passerelle ? »
// a DEUX réponses dans le dépôt, pas une : le `.env` que le `Makefile` écrit
// (dev local, domaine, réseau) et les VALEURS PAR DÉFAUT de `docker-compose.dev.yml`
// (`${CORS_ORIGINS:-…}`), qui gouvernent tout lancement sans variable positionnée.
// Écrire la règle deux fois produirait deux jumelles qui divergeraient au premier
// ajout d'origine. Elles sont donc UN inventaire — `browserOriginListsOf` — que
// la règle qui INTERDIT le port de l'agent balaie en entier.
//
// POURQUOI IL N'Y A PLUS DE RÈGLE DE « ZONES »
//
// Le Makefile a lancé DEUX zones web en dév : le legacy (:3100) et l'ancienne
// refonte v3 (:3300). Cinq règles en tenaient la SYMÉTRIE — chaque session,
// chaque bannière d'URLs et chaque ratissage de ports qui touchait l'une
// touchait l'autre, et chaque liste d'origines servait :3300. Elles sont parties
// avec cette application (#5994) : une symétrie avec une zone qui n'existe plus
// ne garde rien, et la tenir obligerait à lancer un répertoire absent. Le
// chantier web (`apps/web-v3`, Vite) ne passe pas par ces cibles.
//
// POURQUOI LES INVENTAIRES SONT DÉRIVÉS, ET PLUS ÉCRITS À LA MAIN
//
// Première écriture : `TMUX_TARGETS = ['_dev-tmux-domain', 'dev-tmux-network']`
// et `URL_BANNER_TARGETS = ['_show-domain-urls', '_show-network-urls']`, deux
// PAIRES posées à la main. Une énumération porte toujours deux affirmations
// (leçon 261) : « ces sites tiennent la règle » — vérifié — et « ce sont les
// sites où la règle s'applique » — ici FAUX : `dev-tmux`, cible publique,
// n'entrait dans aucune des deux listes, ni `urls`, la SEULE bannière que
// `dev-tmux` et `dev-bg` appellent.
//
// Les deux inventaires se DÉDUISENT donc du `Makefile` :
//   · une CIBLE tmux = une cible dont la recette ouvre une fenêtre tmux ;
//   · une BANNIÈRE d'URLs = une cible qui titre « URLs d'accès ».

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEV_COMPOSE = 'docker-compose.dev.yml';

const WORKSPACE_DIR_ASSIGNMENT =
  /^([A-Z0-9_]+_DIR)\s*:=\s*((?:apps|services|packages)\/\S+)$/gm;
const ENTERED_DIRECTORY = /(?:^|[\s"'&;])cd\s+(\/[^\s"'&;]+)/gm;
const AGENT_PORT = /^\s*@echo\s+"PORT=(\d+)"\s*>>\s*\$\(AGENT_DIR\)\/\.env\s*$/gm;
const BROWSER_ORIGIN_LIST = /^\s*@echo\s+"(?:CORS_ORIGINS|ALLOWED_ORIGINS)=([^"]*)"/gm;
const COMPOSE_ORIGIN_ENTRY = /^\s*(CORS_ORIGINS|ALLOWED_ORIGINS):\s*(\S.*?)\s*$/gm;
const COMPOSE_SUBSTITUTION = /^\$\{[A-Z_]+:-(.*)\}$/;
const DEAD_PREDECESSOR = /web[\s_-]*v2/i;

const TARGET_HEADER = /^([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*:(?!=)/;
const OPENS_A_TMUX_WINDOW = /tmux\s+new-(?:session|window)\b/;
const ANNOUNCES_ACCESS_URLS = /URLs d'accès/;

const capturesOf = (pattern, source) =>
  [...source.matchAll(pattern)].map((match) => match.slice(1).map((group) => group ?? ''));

// Les recettes du `Makefile`, par cible. Une ligne de recette commence par une
// tabulation ; une ligne vide ou un commentaire n'interrompt pas la recette,
// n'importe quelle autre ligne de colonne 0 le fait.
const recipesByTarget = (makefile) => {
  const recipes = new Map();
  let current = null;
  for (const line of makefile.split('\n')) {
    if (line.startsWith('\t')) {
      if (current) recipes.get(current).push(line);
      continue;
    }
    if (line.trim() === '' || line.startsWith('#')) continue;
    const header = TARGET_HEADER.exec(line);
    current = header ? header[1] : null;
    if (current && !recipes.has(current)) recipes.set(current, []);
  }
  return recipes;
};

const targetsWhoseRecipe = (recipes, holds) =>
  [...recipes].filter(([, lines]) => holds(lines)).map(([target]) => target);

const dryRun = (target, root) =>
  execFileSync('make', ['-n', '--no-print-directory', target], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

const readWorld = async (root) => {
  const makefile = await readFile(join(root, 'Makefile'), 'utf8');
  const devCompose = await readFile(join(root, DEV_COMPOSE), 'utf8');
  const recipes = recipesByTarget(makefile);

  const tmuxTargets = targetsWhoseRecipe(recipes, (lines) => lines.some((l) => OPENS_A_TMUX_WINDOW.test(l)));
  const urlBanners = targetsWhoseRecipe(recipes, (lines) => lines.some((l) => ANNOUNCES_ACCESS_URLS.test(l)));

  const expansions = Object.fromEntries(
    [...new Set([...tmuxTargets, ...urlBanners])].map((target) => [target, dryRun(target, root)]),
  );
  return { root, makefile, devCompose, tmuxTargets, urlBanners, expansions };
};

const numberedLinesMatching = (pattern, source) =>
  source
    .split('\n')
    .flatMap((line, index) => (pattern.test(line) ? [`${index + 1}: ${line.trim()}`] : []));

const everyDeclaredWorkspaceDirectoryExists = (world) =>
  capturesOf(WORKSPACE_DIR_ASSIGNMENT, world.makefile)
    .filter(([, path]) => !existsSync(join(world.root, path)))
    .map(([name, path]) => `${name} := ${path} — ce répertoire n'existe pas dans le dépôt`);

const everyDirectoryEnteredByATmuxTargetExists = (world) =>
  world.tmuxTargets.flatMap((target) =>
    capturesOf(ENTERED_DIRECTORY, world.expansions[target])
      .map(([directory]) => directory)
      .filter((directory) => !existsSync(directory))
      .map((directory) => `${target} entre dans ${directory} — ce répertoire n'existe pas`),
  );

const noDeadPredecessorSurvivesInTheMakefile = (world) =>
  numberedLinesMatching(DEAD_PREDECESSOR, world.makefile).map(
    (line) => `le précédent mort apps/web_v2 survit dans le Makefile — ${line}`,
  );

const noDeadPredecessorIsAnnouncedByAUrlBanner = (world) =>
  world.urlBanners.flatMap((target) =>
    numberedLinesMatching(DEAD_PREDECESSOR, world.expansions[target]).map(
      (line) => `${target} annonce encore le précédent mort apps/web_v2 — ${line}`,
    ),
  );

// Ce que le compose SERT quand rien n'est positionné : le défaut d'une
// substitution, ou la valeur littérale quand il n'y en a pas. Les deux formes
// gouvernent le même lancement, donc les deux entrent dans l'inventaire.
const composeDefault = (value) => COMPOSE_SUBSTITUTION.exec(value)?.[1] ?? value;

// L'inventaire des listes d'origines que l'environnement de DÉV sert à la
// passerelle, quel que soit le chemin par lequel elles y arrivent : le `.env`
// écrit par le `Makefile`, et les défauts du compose de dev, qui gouvernent tout
// lancement sans variable positionnée. La règle du port de l'agent le balaie.
const browserOriginListsOf = (world) => [
  ...capturesOf(BROWSER_ORIGIN_LIST, world.makefile).map(([list]) => ({
    source: 'Makefile',
    list,
  })),
  ...capturesOf(COMPOSE_ORIGIN_ENTRY, world.devCompose).map(([name, value]) => ({
    source: `${DEV_COMPOSE} (défaut de ${name})`,
    list: composeDefault(value),
  })),
];

const agentPortsDeclaredBy = (world) =>
  capturesOf(AGENT_PORT, world.makefile).map(([port]) => port);

const theAgentPortIsDeclaredOnce = (world) => {
  const ports = [...new Set(agentPortsDeclaredBy(world))];
  return ports.length <= 1
    ? []
    : [`le port du service agent est déclaré à ${ports.length} valeurs : ${ports.join(', ')}`];
};

// Le port de l'agent n'est PAS une origine de navigateur : le service agent
// parle à la passerelle par ZMQ, jamais depuis un onglet. L'inscrire dans
// CORS_ORIGINS / ALLOWED_ORIGINS ouvrirait une origine qu'aucun navigateur
// n'utilise — une surface offerte sans consommateur.
const theAgentPortEntersNoBrowserOriginList = (world) => {
  const ports = new Set(agentPortsDeclaredBy(world));
  return browserOriginListsOf(world).flatMap(({ source, list }) =>
    [...ports]
      .filter((port) => list.includes(`:${port}`))
      .map(
        (port) =>
          `le port de l'agent (:${port}) entre dans une liste d'origines de navigateur — ${source} : ${list}`,
      ),
  );
};

const CHECKS = [
  ['chaque *_DIR de workspace désigne un répertoire existant', everyDeclaredWorkspaceDirectoryExists],
  ['chaque répertoire ouvert par une cible tmux existe', everyDirectoryEnteredByATmuxTargetExists],
  ['aucune ligne du Makefile ne nomme le précédent mort', noDeadPredecessorSurvivesInTheMakefile],
  ["aucune bannière d'URLs n'annonce le précédent mort", noDeadPredecessorIsAnnouncedByAUrlBanner],
  ['le port du service agent est déclaré à UNE valeur', theAgentPortIsDeclaredOnce],
  ["le port de l'agent n'entre dans aucune origine de navigateur", theAgentPortEntersNoBrowserOriginList],
];

const inspect = (world) =>
  CHECKS.flatMap(([title, check]) => check(world).map((failure) => `${title} → ${failure}`));

const mutate = (world, apply) => {
  const copy = structuredClone(world);
  apply(copy);
  return copy;
};

const appendLine = (world, line) => {
  world.makefile = `${world.makefile}\n${line}`;
};

// Un répertoire dont on veut la garantie qu'il n'existe pas, sans écrire sur le
// disque : les mutations restent en mémoire, le système de fichiers répond.
const ABSENT = '/zz-sonde-repertoire-absent';

const MUTATIONS = [
  [
    'un *_DIR de workspace pointant vers un répertoire mort',
    (world) => appendLine(world, 'ZZ_SONDE_DIR := apps/zz-sonde-morte'),
    "ZZ_SONDE_DIR := apps/zz-sonde-morte — ce répertoire n'existe pas",
  ],
  [
    'une cible tmux entrant dans un répertoire absent',
    (world) => {
      world.expansions['_dev-tmux-domain'] += `\ntmux new-window "cd ${ABSENT} && bun run dev"\n`;
    },
    `_dev-tmux-domain entre dans ${ABSENT}`,
  ],
  [
    'le précédent mort réintroduit dans une variable du Makefile',
    (world) => appendLine(world, 'WEB_V2_DIR := apps/web_v2'),
    'le précédent mort apps/web_v2 survit dans le Makefile',
  ],
  [
    "le précédent mort réintroduit dans une bannière d'URLs",
    (world) => {
      world.expansions['_show-domain-urls'] += '\necho "   Web v2: https://v2.meeshy.local"\n';
    },
    '_show-domain-urls annonce encore le précédent mort',
  ],
  [
    'un second port déclaré pour le service agent',
    (world) => appendLine(world, '\t@echo "PORT=9999" >> $(AGENT_DIR)/.env'),
    'le port du service agent est déclaré à 2 valeurs',
  ],
  [
    "le port de l'agent glissé dans une liste d'origines de navigateur",
    (world) =>
      appendLine(world, '\t@echo "CORS_ORIGINS=http://localhost:3200" >> $(GATEWAY_DIR)/.env'),
    "le port de l'agent (:3200) entre dans une liste d'origines de navigateur",
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
    `self-test : ${MUTATIONS.length}/${MUTATIONS.length} mutations détectées (${standing.length} échec(s) réel(s) en dehors des sondes).`,
  );
  return 0;
};

const main = async () => {
  let world;
  try {
    world = await readWorld(REPO_ROOT);
  } catch (error) {
    console.error(`impossible de dérouler le Makefile de la racine : ${error.message}`);
    console.error('Rejouer : make -n --no-print-directory <cible tmux ou bannière>');
    return 1;
  }
  if (process.argv.includes('--self-test')) {
    return selfTest(world);
  }
  const failures = inspect(world);
  if (failures.length > 0) {
    failures.forEach((failure) => console.error(failure));
    console.error(`\n${failures.length} défaut(s) dans les répertoires déclarés par le Makefile.`);
    return 1;
  }
  console.log(
    `Makefile : ${CHECKS.length} invariants tenus — ${world.tmuxTargets.length} cible(s) tmux et ` +
      `${world.urlBanners.length} bannière(s) d'URLs, inventaires DÉRIVÉS du fichier.`,
  );
  return 0;
};

process.exit(await main());
