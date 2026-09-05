#!/usr/bin/env node
// Garde des répertoires de travail déclarés par le Makefile [L-0.5]
//
// POURQUOI IL VIT À LA RACINE, ET PAS DANS UN WORKSPACE
//
// L'invariant porte sur le `Makefile` de la RACINE. Sa surface est le dépôt,
// pas une app — donc il est appelé par le job `quality`, à côté des autres
// gates de racine, et NON depuis les tests d'un paquet.
//
// Sa première écriture vivait dans `apps/web-v3/__tests__/makefile-workspaces.test.ts`.
// Elle sortait de son propre workspace pour atteindre sa surface
// (`join(__dirname,'..','..','..')` — seul test du dossier à remonter de trois
// crans), et surtout elle ne tournait dans AUCUNE CI : la matrice `test:` de
// `.github/workflows/ci.yml` ne porte que `shared`, `web`, `gateway`, `agent`
// (`grep web-v3 .github/workflows/ci.yml` = rien). Le garde était un CONTRÔLE
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
// deux règles balaient : celle qui INTERDIT le port de l'agent, et sa symétrique
// qui EXIGE le port de la v3.
//
// POURQUOI UNE ZONE NON LANCÉE EST UN INVARIANT
//
// Les cinq sous-issues du lot L-0.5 pouvaient toutes fermer vertes pendant que
// `make dev-tmux-domain` ne lançait jamais la v3 : rien ne reliait « le paquet
// existe et se construit » à « on peut l'ouvrir ». La règle est relationnelle —
// une cible qui démarre le serveur de dév du legacy démarre celui de la v3 — et
// non « la chaîne web_v3 figure quelque part » : c'est la SYMÉTRIE des deux
// zones en dev (dimension 6) qui doit tenir, pas la présence d'un mot.
//
// POURQUOI LES INVENTAIRES SONT DÉRIVÉS, ET PLUS ÉCRITS À LA MAIN
//
// Première écriture : `TMUX_TARGETS = ['_dev-tmux-domain', 'dev-tmux-network']`
// et `URL_BANNER_TARGETS = ['_show-domain-urls', '_show-network-urls']`, deux
// PAIRES posées à la main. Une énumération porte toujours deux affirmations
// (leçon 261) : « ces sites tiennent la règle » — vérifié — et « ce sont les
// sites où la règle s'applique » — ici FAUX, trois fois :
//
//   · `dev-tmux` (cible publique, `## Lancer tous les services dans tmux`)
//     ouvrait une fenêtre `web` et aucune `web_v3` — exactement le cas que la
//     règle prétend interdire, invisible du garde ;
//   · `urls` — la SEULE bannière que `dev-tmux` et `dev-bg` appellent —
//     n'entrait dans aucun invariant, donc son omission de la v3 était
//     structurellement indétectable ;
//   · les trois cibles d'arrière-plan (`_dev-bg-domain`, `dev-bg-network`,
//     `dev-bg`) lançaient le legacy seul tout en AFFICHANT une bannière qui
//     annonce `:3300` — une URL qu'aucun serveur ne sert.
//
// Les trois inventaires se DÉDUISENT donc du `Makefile` :
//   · une SESSION de dév = une cible qui démarre le serveur de dév d'au moins
//     DEUX workspaces (`cd $(X_DIR) … run dev`). Le seuil de deux est ce qui
//     distingue une session d'un lancement mono-service (`dev-web`,
//     `dev-gateway`), pour qui exiger la v3 serait faux ;
//   · une CIBLE tmux = une cible dont la recette ouvre une fenêtre tmux ;
//   · une BANNIÈRE d'URLs = une cible qui titre « URLs d'accès ».
//
// La règle de zone porte sur les SESSIONS et non sur les fenêtres tmux, pour la
// seconde moitié du même défaut : une règle indexée sur le nom de fenêtre `web`
// s'ÉTEINT en silence au premier renommage, et ne voit rien de ce qui se lance
// sans tmux. Les deux formes muettes restent signalées explicitement — une
// session ou une bannière qui ne connaît NI zone est un interrupteur, pas une
// exemption.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEV_COMPOSE = 'docker-compose.dev.yml';

const V3_PORT = '3300';
const LEGACY_ZONE_DIR = 'WEB_DIR';
const V3_ZONE_DIR = 'WEB_V3_DIR';

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
const DEV_SERVER_OF = /cd\s+(?:\$\(CURDIR\)\/)?\$\(([A-Z0-9_]+_DIR)\)[^\n]*run\s+dev(?::https)?\b/;

const URL_LINE = /https?:\/\//;
const V3_MARK = new RegExp(`:${V3_PORT}\\b|\\bv3\\b`, 'i');
const LEGACY_WEB_LABEL = /\b(web|frontend)\b/i;

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

// Une SESSION de dév démarre le serveur de dév d'au moins DEUX workspaces. Le
// seuil est ce qui sépare une session d'un lancement mono-service.
const devServerDirectories = (lines) =>
  new Set(lines.flatMap((line) => DEV_SERVER_OF.exec(line)?.slice(1) ?? []));

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

  const devSessions = targetsWhoseRecipe(recipes, (lines) => devServerDirectories(lines).size >= 2)
    .map((target) => ({ target, zones: [...devServerDirectories(recipes.get(target))] }));
  const tmuxTargets = targetsWhoseRecipe(recipes, (lines) => lines.some((l) => OPENS_A_TMUX_WINDOW.test(l)));
  const urlBanners = targetsWhoseRecipe(recipes, (lines) => lines.some((l) => ANNOUNCES_ACCESS_URLS.test(l)));

  const expansions = Object.fromEntries(
    [...new Set([...tmuxTargets, ...urlBanners])].map((target) => [target, dryRun(target, root)]),
  );
  return { root, makefile, devCompose, devSessions, tmuxTargets, urlBanners, expansions };
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
// lancement sans variable positionnée. Deux règles opposées le balaient.
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

// La symétrique de la règle ci-dessus, et la moitié CORS de #4439 : en dev les
// deux zones vivent sur des ports différents (donc cross-origin) alors qu'en
// prod elles sont same-origin.
//
// CE QUE CETTE RÈGLE FAIT VRAIMENT AUJOURD'HUI — mesuré, à ne pas romancer.
// Elle n'empêche AUCUN refus actuel : la passerelle court-circuite sa propre
// liste en dév. `services/gateway/src/config/cors-origins.ts` porte depuis #4480
// la règle UNIQUE des deux portes (CORS HTTP et Socket.IO), et son court-circuit
// `everyOriginIsAllowed` rend `true` sur le mot EXACT `development` — donc en dév
// TOUTE origine passe et ni `CORS_ORIGINS` ni `ALLOWED_ORIGINS` ne sont lus. Or
// chacun des chemins balayés ici pose précisément `NODE_ENV=development` dans le
// MÊME fichier que la liste (`Makefile` :311, :1122, :1451 ;
// `docker-compose.dev.yml` :228, deux lignes au-dessus des défauts).
//
// L'entrée `:3300` est donc une PROVISION, pas un correctif : elle vaut le jour
// où ce court-circuit tombe (durcissement de la passerelle de dév) ou pour un
// lancement en `NODE_ENV` ≠ `development` avec ces mêmes fichiers. Ce que le
// garde protège est l'OUBLI de cette provision quand une liste est retouchée —
// rien de plus. Écrire ici « sans la liste, la passerelle refuse la v3 » serait
// installer dans le dépôt une justification fausse qu'un futur lecteur croirait.
// Le témoin qui prouve l'EFFET vit désormais côté passerelle (#4480) :
// `services/gateway/src/__tests__/unit/config/cors-origins.test.ts` fait servir
// une origine :3300 déclarée dans `CORS_ORIGINS` aux DEUX portes, aux rangs
// `production` ET `staging`, et refuse ce qui n'est pas déclaré.
const originsWithoutWebV3 = (world) =>
  browserOriginListsOf(world)
    .filter(({ list }) => !list.includes(`:${V3_PORT}`))
    .map(
      ({ source, list }) =>
        `une liste d'origines ne sert pas la zone v3 (:${V3_PORT}) — ${source} : ${list}`,
    );

// Relationnelle, et indexée sur le RÉPERTOIRE lancé — pas sur un nom de fenêtre
// tmux, qui ne dit rien des lancements en arrière-plan et s'éteint au premier
// renommage. Elle porte sur les SESSIONS de dév (≥ 2 serveurs), donc jamais sur
// `dev-web` ou `dev-gateway`, où exiger la seconde zone serait faux.
const everyDevSessionServingTheLegacyAlsoServesTheV3 = (world) =>
  world.devSessions.flatMap(({ target, zones }) =>
    zones.includes(LEGACY_ZONE_DIR) && !zones.includes(V3_ZONE_DIR)
      ? [
          `${target} démarre le serveur de dév de $(${LEGACY_ZONE_DIR}) sans celui de $(${V3_ZONE_DIR}) — workspaces lancés : ${zones.join(', ')}`,
        ]
      : [],
  );

// L'interrupteur silencieux de la règle ci-dessus : une session qui ne lance NI
// zone n'est pas une exemption, c'est une règle éteinte (renommage de variable,
// lancement déplacé dans un sous-make). Elle est signalée, pas tolérée.
const noDevSessionIgnoresBothZones = (world) =>
  world.devSessions.flatMap(({ target, zones }) =>
    zones.includes(LEGACY_ZONE_DIR) || zones.includes(V3_ZONE_DIR)
      ? []
      : [
          `${target} est une session de dév qui ne lance AUCUNE des deux zones web — workspaces lancés : ${zones.join(', ')}`,
        ],
  );

const urlLinesOf = (world, target) =>
  world.expansions[target].split('\n').filter((line) => URL_LINE.test(line));

const announcesV3 = (lines) => lines.some((line) => V3_MARK.test(line));
const announcesLegacyWeb = (lines) =>
  lines.some((line) => LEGACY_WEB_LABEL.test(line) && !V3_MARK.test(line));

// `urls` — la seule bannière que `dev-tmux` et `dev-bg` appellent — n'entrait
// dans aucun invariant tant que la liste était écrite à la main.
const everyUrlBannerAnnouncingTheLegacyAlsoAnnouncesTheV3 = (world) =>
  world.urlBanners.flatMap((target) => {
    const lines = urlLinesOf(world, target);
    return announcesLegacyWeb(lines) && !announcesV3(lines)
      ? [`${target} annonce la zone legacy sans annoncer la zone v3 (:${V3_PORT})`]
      : [];
  });

const noUrlBannerIgnoresBothZones = (world) =>
  world.urlBanners.flatMap((target) => {
    const lines = urlLinesOf(world, target);
    return announcesLegacyWeb(lines) || announcesV3(lines)
      ? []
      : [`${target} est une bannière d'URLs qui n'annonce AUCUNE des deux zones web`];
  });

// Ce que `make stop` et `make kill` ratissent en repli. Un `next-server` v3
// survivant fait mourir en EADDRINUSE la fenêtre du lancement suivant, pendant
// que les quatre autres démarrent — une zone à moitié ouverte, sans témoin.
const SWEPT_PORT = /lsof\s+-ti:(\d+)\s*\|\s*xargs\s+kill/;
const LEGACY_WEB_PORT = '3100';

const everyPortSweepTakingTheLegacyAlsoTakesTheV3 = (world) => {
  const recipes = recipesByTarget(world.makefile);
  return [...recipes].flatMap(([target, lines]) => {
    const ports = lines.flatMap((line) => SWEPT_PORT.exec(line)?.slice(1) ?? []);
    return ports.includes(LEGACY_WEB_PORT) && !ports.includes(V3_PORT)
      ? [`${target} tue le port du legacy (:${LEGACY_WEB_PORT}) sans tuer celui de la v3 (:${V3_PORT}) — ports ratissés : ${ports.join(', ')}`]
      : [];
  });
};

const CHECKS = [
  ['chaque *_DIR de workspace désigne un répertoire existant', everyDeclaredWorkspaceDirectoryExists],
  ['chaque répertoire ouvert par une cible tmux existe', everyDirectoryEnteredByATmuxTargetExists],
  ['aucune ligne du Makefile ne nomme le précédent mort', noDeadPredecessorSurvivesInTheMakefile],
  ["aucune bannière d'URLs n'annonce le précédent mort", noDeadPredecessorIsAnnouncedByAUrlBanner],
  ['le port du service agent est déclaré à UNE valeur', theAgentPortIsDeclaredOnce],
  ["le port de l'agent n'entre dans aucune origine de navigateur", theAgentPortEntersNoBrowserOriginList],
  ["chaque liste d'origines de dev sert la zone v3", originsWithoutWebV3],
  ['chaque session de dev qui lance le legacy lance la v3', everyDevSessionServingTheLegacyAlsoServesTheV3],
  ['aucune session de dev ne lance ni le legacy ni la v3', noDevSessionIgnoresBothZones],
  ["chaque bannière d'URLs qui annonce le legacy annonce la v3", everyUrlBannerAnnouncingTheLegacyAlsoAnnouncesTheV3],
  ["aucune bannière d'URLs n'ignore les deux zones", noUrlBannerIgnoresBothZones],
  ['chaque ratissage de ports qui tue le legacy tue la v3', everyPortSweepTakingTheLegacyAlsoTakesTheV3],
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
  [
    'une liste du Makefile qui oublie la zone v3',
    (world) =>
      appendLine(world, '\t@echo "CORS_ORIGINS=http://localhost:3100" >> $(GATEWAY_DIR)/.env'),
    "une liste d'origines ne sert pas la zone v3 (:3300) — Makefile",
  ],
  [
    'un défaut du compose de dev qui oublie la zone v3',
    (world) => {
      world.devCompose = `${world.devCompose}\n      CORS_ORIGINS: \${CORS_ORIGINS:-http://localhost:3100}\n`;
    },
    `une liste d'origines ne sert pas la zone v3 (:3300) — ${DEV_COMPOSE} (défaut de CORS_ORIGINS)`,
  ],
  [
    'un littéral du compose de dev qui oublie la zone v3',
    (world) => {
      world.devCompose = `${world.devCompose}\n      ALLOWED_ORIGINS: http://localhost:3100\n`;
    },
    `une liste d'origines ne sert pas la zone v3 (:3300) — ${DEV_COMPOSE} (défaut de ALLOWED_ORIGINS) : http://localhost:3100`,
  ],
  [
    'une session de dév qui lance le legacy sans la v3',
    (world) => {
      const session = world.devSessions.find(({ target }) => target === 'dev-tmux-network');
      session.zones = session.zones.filter((zone) => zone !== V3_ZONE_DIR);
    },
    `dev-tmux-network démarre le serveur de dév de $(${LEGACY_ZONE_DIR}) sans celui de $(${V3_ZONE_DIR})`,
  ],
  // La sonde du point d'aveuglement trouvé en revue : `dev-tmux` et les trois
  // cibles d'arrière-plan n'entraient dans AUCUN inventaire écrit à la main.
  // Chacune de ces quatre mutations échoue si l'inventaire cesse d'être dérivé.
  ...['dev-tmux', '_dev-bg-domain', 'dev-bg-network', 'dev-bg'].map((target) => [
    `la session « ${target} », invisible de l'inventaire écrit à la main, qui lance le legacy sans la v3`,
    (world) => {
      const session = world.devSessions.find((candidate) => candidate.target === target);
      session.zones = session.zones.filter((zone) => zone !== V3_ZONE_DIR);
    },
    `${target} démarre le serveur de dév de $(${LEGACY_ZONE_DIR}) sans celui de $(${V3_ZONE_DIR})`,
  ]),
  [
    'une session de dév qui ne lance aucune des deux zones — la règle éteinte en silence',
    (world) => {
      const session = world.devSessions.find(({ target }) => target === 'dev-tmux');
      session.zones = session.zones.filter(
        (zone) => zone !== LEGACY_ZONE_DIR && zone !== V3_ZONE_DIR,
      );
    },
    'dev-tmux est une session de dév qui ne lance AUCUNE des deux zones web',
  ],
  [
    "la bannière « urls », appelée par dev-tmux et dev-bg, qui oublie la v3",
    (world) => {
      world.expansions['urls'] = world.expansions['urls']
        .split('\n')
        .filter((line) => !V3_MARK.test(line))
        .join('\n');
    },
    'urls annonce la zone legacy sans annoncer la zone v3',
  ],
  [
    "une bannière d'URLs qui n'annonce plus aucune zone web — la règle éteinte par un renommage",
    (world) => {
      world.expansions['_show-domain-urls'] = world.expansions['_show-domain-urls']
        .split('\n')
        .filter((line) => !URL_LINE.test(line) || !(LEGACY_WEB_LABEL.test(line) || V3_MARK.test(line)))
        .join('\n');
    },
    "_show-domain-urls est une bannière d'URLs qui n'annonce AUCUNE des deux zones web",
  ],
  [
    'un ratissage de ports qui tue le legacy et laisse la v3 en vie',
    (world) => {
      world.makefile = world.makefile.replace(
        '\t@lsof -ti:3300 | xargs kill -9 2>/dev/null || true\n',
        '',
      );
    },
    'tue le port du legacy (:3100) sans tuer celui de la v3 (:3300)',
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
    `Makefile : ${CHECKS.length} invariants tenus — ${world.devSessions.length} session(s) de dév, ` +
      `${world.tmuxTargets.length} cible(s) tmux et ${world.urlBanners.length} bannière(s) d'URLs, ` +
      'inventaires DÉRIVÉS du fichier.',
  );
  return 0;
};

process.exit(await main());
