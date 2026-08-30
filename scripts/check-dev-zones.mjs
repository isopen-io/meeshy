#!/usr/bin/env node
// Les zones web VIVANTES sont câblées dans l'environnement de dev (issue #4399)
//
// Échoue (exit 1) si une zone web déclarée dans `apps/*` n'a pas sa fenêtre tmux
// là où ses jumelles en ont une, si son port n'est pas une origine navigateur
// acceptée par la passerelle, si une origine nomme un port que rien ne sert, ou
// si une fenêtre tmux pointe un répertoire qui n'existe pas.
//
// ── POURQUOI CE FICHIER EXISTE, ET POURQUOI IL DÉRIVE ──────────────────────
//
// Le témoin qu'il remplace (`apps/web-v3/__tests__/dev-environment.test.ts`)
// n'assertait que des ABSENCES : plus de `web_v2`, plus de `:3200`. Un garde qui
// n'interdit que le passé se lit comme s'il exigeait aussi le présent — et il a
// laissé passer exactement ce qu'il avait l'air de couvrir : le § 4.6 de la
// conception demandait l'origine `:3300` et la fenêtre `web_v3`, aucune des deux
// n'était là, et la suite était VERTE. Le coût n'était pas cosmétique : en dev
// les deux zones sont sur des PORTS différents, donc en cross-origin, et le
// premier écran v3 appelant la passerelle aurait été refusé par CORS.
//
// D'où la forme retenue : la liste des zones n'est pas écrite ici, elle est LUE
// dans `apps/*/package.json` (le port vient du script `dev`). La prochaine zone
// est attrapée sans que ce fichier soit rouvert. Un garde qui énumère les ports
// MORTS se périme ; un garde qui dérive les ports VIVANTS ne se périme pas.
//
// Il vit dans `scripts/` et non dans la suite jsdom d'une application, pour la
// raison que `scripts/check-lockfile-manifests.mjs` a écrite : il ne rend aucune
// surface, il gage le DÉPÔT, et le répertoire qui l'hébergeait est destiné à
// être renommé au lot L8. La racine vient de `git rev-parse --show-toplevel`.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = () =>
  execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

const ORIGIN_SITES = Object.freeze(['Makefile', 'docker-compose.dev.yml']);

// ── LECTURE DU DÉPÔT ───────────────────────────────────────────────────────

export const readWorld = (root) => {
  const zones = readdirSync(join(root, 'apps'))
    .filter((entry) => existsSync(join(root, 'apps', entry, 'package.json')))
    .flatMap((entry) => {
      const manifest = JSON.parse(readFileSync(join(root, 'apps', entry, 'package.json'), 'utf8'));
      const port = /next dev[^"]*-p\s+(\d+)/.exec(manifest.scripts?.dev ?? '')?.[1];
      return port === undefined ? [] : [{ dir: `apps/${entry}`, name: manifest.name, port }];
    });

  const sources = Object.fromEntries(
    ORIGIN_SITES.map((path) => [path, readFileSync(join(root, path), 'utf8')]),
  );

  return { zones, sources, root };
};

// ── FENÊTRES TMUX ──────────────────────────────────────────────────────────

const makeVariables = (source) =>
  new Map(
    source.split('\n').flatMap((line) => {
      const [, name, value] = /^([A-Z0-9_]+)\s*:?=\s*(\S+)\s*$/.exec(line) ?? [];
      return name !== undefined && value !== undefined ? [[name, value]] : [];
    }),
  );

const expandMakeReferences = (path, variables) => {
  const expanded = path.replace(/\$\(([A-Z0-9_]+)\)/g, (_, name) => variables.get(name) ?? ' ');
  return expanded.includes(' ') ? undefined : expanded;
};

const continuedFrom = (lines, start) => {
  const collected = [lines[start] ?? ''];
  let cursor = start;
  while ((lines[cursor] ?? '').trimEnd().endsWith('\\')) {
    cursor += 1;
    collected.push(lines[cursor] ?? '');
  }
  return collected.join('\n');
};

/** Les cibles make, avec pour chacune les fenêtres tmux que sa recette ouvre. */
export const tmuxTargets = (source) => {
  const lines = source.split('\n');
  const targets = [];
  let current = null;

  lines.forEach((line, index) => {
    const [, name] = /^([A-Za-z0-9_.-]+):(?!=)/.exec(line) ?? [];
    if (name !== undefined) {
      current = { target: name, windows: [] };
      targets.push(current);
      return;
    }
    if (current === null) return;

    const [, window] = /tmux (?:new-window|new-session)[^\n]*-n\s+([A-Za-z0-9_-]+)/.exec(line) ?? [];
    if (window === undefined) return;

    const body = continuedFrom(lines, index);
    const [, declared] = /cd\s+\$\(CURDIR\)\/(\S+)/.exec(body) ?? [];
    current.windows.push({ window, declared });
  });

  return targets.filter((target) => target.windows.length > 0);
};

/**
 * Fail-closed sur la FENÊTRE, jamais sur la variable : une fenêtre dont on ne
 * sait pas lire le répertoire est un ÉCHEC, pas un silence. Une fenêtre écrite
 * avec un chemin LITTÉRAL — la forme qu'aurait le copier-coller d'un bloc mort —
 * ne référence aucune variable et sortirait sinon VERTE.
 */
export const deadTmuxWindows = (source, root) => {
  const variables = makeVariables(source);

  return tmuxTargets(source).flatMap(({ windows }) =>
    windows.flatMap(({ window, declared }) => {
      if (declared === undefined) {
        return [`${window} -> aucun 'cd $(CURDIR)/<chemin>' lisible dans le corps de la fenetre`];
      }
      const path = expandMakeReferences(declared, variables);
      if (path === undefined) return [`${window} -> ${declared} : variable make non definie`];

      return existsSync(join(root, path)) ? [] : [`${window} -> ${path} : repertoire inexistant`];
    }),
  );
};

/**
 * Une cible qui lance UNE zone web les lance TOUTES. C'est la forme positive du
 * garde : elle attrape la zone jamais câblée, là où « plus de `web_v2` »
 * n'attrapait que la zone déjà retirée.
 */
const missingZoneWindows = ({ zones, sources }) => {
  const makefile = sources.Makefile;
  const variables = makeVariables(makefile);
  const found = [];

  const resolved = (declared) =>
    declared === undefined ? undefined : expandMakeReferences(declared, variables);

  for (const { target, windows } of tmuxTargets(makefile)) {
    const launched = new Set(windows.map(({ declared }) => resolved(declared)));
    if (!zones.some((zone) => launched.has(zone.dir))) continue;

    for (const zone of zones) {
      if (!launched.has(zone.dir)) {
        found.push(
          `Makefile ${target} : lance une zone web mais pas « ${zone.name} » (${zone.dir}, :${zone.port}) — aucun developpeur ne la voit tourner a cote des autres`,
        );
      }
    }
  }

  return found;
};

// ── ORIGINES NAVIGATEUR ────────────────────────────────────────────────────

const originLines = (sources) =>
  Object.entries(sources).flatMap(([path, source]) =>
    source
      .split('\n')
      .flatMap((line, index) =>
        /(CORS_ORIGINS|ALLOWED_ORIGINS)\s*[:=]/.test(line) && !/^\s*#/.test(line)
          ? [{ path, line: index + 1, text: line }]
          : [],
      ),
  );

const gatewayPort = (makefile) => /PORT=(\d+)"\s*>>\s*\$\(GATEWAY_DIR\)/.exec(makefile)?.[1];

const originProblems = ({ zones, sources }) => {
  const lines = originLines(sources);
  const found = [];

  const served = new Set(zones.map((zone) => zone.port));
  const gateway = gatewayPort(sources.Makefile);
  if (gateway !== undefined) served.add(gateway);

  for (const { path, line, text } of lines) {
    for (const [, port] of text.matchAll(/:(\d{4})\b/g)) {
      if (!served.has(port)) {
        found.push(
          `${path}:${line} : origine navigateur sur le port ${port}, qu'aucune zone web ni la passerelle ne sert`,
        );
      }
    }
  }

  for (const site of Object.keys(sources)) {
    const text = lines
      .filter((entry) => entry.path === site)
      .map((entry) => entry.text)
      .join('\n');
    if (text === '') {
      found.push(`${site} : aucune ligne d'origines navigateur — le site a disparu du garde`);
      continue;
    }
    for (const zone of zones) {
      if (!text.includes(`:${zone.port}`)) {
        found.push(
          `${site} : la zone « ${zone.name} » (:${zone.port}) n'est pas une origine navigateur — en dev les zones sont sur des ports differents, donc cross-origin, et son premier appel a la passerelle serait refuse par CORS`,
        );
      }
    }
  }

  return found;
};

// ── AGRÉGAT ────────────────────────────────────────────────────────────────

export const violations = (world) => [
  ...deadTmuxWindows(world.sources.Makefile, world.root).map(
    (line) => `Makefile : fenetre tmux morte — ${line}`,
  ),
  ...missingZoneWindows(world),
  ...originProblems(world),
];

// ── --self-test ────────────────────────────────────────────────────────────

const CASES = Object.freeze([
  [
    'une zone web sans fenetre tmux',
    (world) => ({
      ...world,
      sources: {
        ...world.sources,
        Makefile: world.sources.Makefile.replace(/\n\t@sleep 2\n\t@tmux new-window -t meeshy -n web_v3 \\\n[^\n]*\n/, '\n'),
      },
    }),
    'mais pas «',
  ],
  [
    'une zone web absente des origines navigateur',
    (world) => ({
      ...world,
      sources: { ...world.sources, Makefile: world.sources.Makefile.replaceAll(':3300', ':9999') },
    }),
    "n'est pas une origine navigateur",
  ],
  [
    'une origine sur un port que rien ne sert',
    (world) => ({
      ...world,
      sources: {
        ...world.sources,
        Makefile: world.sources.Makefile.replace(
          'CORS_ORIGINS=http://localhost:3100',
          'CORS_ORIGINS=http://localhost:3200,http://localhost:3100',
        ),
      },
    }),
    'port 3200',
  ],
  [
    'une fenetre tmux vers un repertoire litteral inexistant',
    (world) => ({
      ...world,
      sources: {
        ...world.sources,
        Makefile: world.sources.Makefile.replace(
          '"cd $(CURDIR)/$(WEB_DIR) && echo',
          '"cd $(CURDIR)/apps/web_v4 && echo',
        ),
      },
    }),
    'repertoire inexistant',
  ],
  [
    'une fenetre tmux vers une variable make non definie',
    (world) => ({
      ...world,
      sources: {
        ...world.sources,
        Makefile: world.sources.Makefile.replace(
          '"cd $(CURDIR)/$(WEB_DIR) && echo',
          '"cd $(CURDIR)/$(WEB_V4_DIR) && echo',
        ),
      },
    }),
    'variable make non definie',
  ],
]);

const selfTest = (world) => {
  const failures = [];

  const clean = violations(world);
  if (clean.length > 0) {
    failures.push(`self-test : le depot SAIN rend deja ${clean.length} violation(s) :\n    ${clean.join('\n    ')}`);
  }

  for (const [label, mutate, expected] of CASES) {
    const found = violations(mutate(world));
    if (!found.some((line) => line.includes(expected))) {
      failures.push(
        `self-test « ${label} » : la detection est CASSEE — « ${expected} » n'apparait pas dans :\n    ${found.join('\n    ') || '(aucune violation)'}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(`\x1b[0;31m✗ ${failures.length} cas de self-test en echec\x1b[0m`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }

  console.log(`\x1b[0;32m✓ self-test : ${CASES.length} cas, detection vivante\x1b[0m`);
};

const main = () => {
  const world = readWorld(repoRoot());

  if (process.argv.includes('--self-test')) return selfTest(world);

  const found = violations(world);

  if (found.length > 0) {
    console.error(`\x1b[0;31m✗ ${found.length} zone(s) web mal cablee(s) en developpement\x1b[0m`);
    for (const line of found) console.error(`  • ${line}`);
    process.exit(1);
  }

  console.log(
    `\x1b[0;32m✓ ${world.zones.length} zones web : fenetre tmux la ou leurs jumelles en ont une, port accepte en origine navigateur sur ${ORIGIN_SITES.length} sites, aucune fenetre morte\x1b[0m`,
  );
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
