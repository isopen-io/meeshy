#!/usr/bin/env node
// Cohérence de la chaîne d'images — garde de dépôt (issue #4399)
//
// Échoue (exit 1) si la sélection des services de `docker.yml` ne distingue pas
// les zones web, si le job `quality` ne rend pas un verdict de types PROPRE à la
// zone v3, si `next build` de cette zone ne tourne nulle part avant un merge, si
// les deux usines à images (`docker.yml`, `release.yml`) ne versionnent pas les
// mêmes services, ou si un service déclaré dans le compose de production n'est
// démarré par aucune voie de déploiement du dépôt.
//
// ── POURQUOI CE FICHIER EXISTE, ET POURQUOI ICI ────────────────────────────
//
// L'invariant porte sur le DÉPÔT : deux workflows, un compose de production, un
// script de synchronisation de versions et quatre scripts de déploiement. Il ne
// rend aucune surface. Il ne peut donc pas vivre dans la suite jsdom d'une
// application — la première version de ce témoin le faisait
// (`apps/web-v3/__tests__/pipeline.test.ts`), avec un
// `resolve(__dirname, '..', '..', '..')` à trois crans, dans un répertoire
// (`apps/web-v3`) destiné à être renommé au lot L8 : renommer la zone aurait
// supprimé EN SILENCE le seul garde de la sélection docker des cinq services.
// C'est la règle que `scripts/check-lockfile-manifests.mjs` a écrite pour
// lui-même ; elle vaut ici mot pour mot. La racine du dépôt est résolue par
// `git rev-parse --show-toplevel`, jamais par un compte de `..`.
//
// Second effet du placement : dans `quality`, ce garde tourne en PREMIÈRE vague,
// sans dépendre d'un `node_modules`. Sous la matrice `test` il ne tournait
// qu'après `quality`, et sous une clé de matrice (`web-v3`) qui n'a rien à voir
// avec ce qu'il protège.
//
// ── CE QUE CHAQUE FAMILLE GAGE ─────────────────────────────────────────────
//
// 1. SÉLECTION      `scripts/docker-detect-services.sh` exécuté pour de vrai :
//                   le piège de nommage (`*"web"*` attrapant `web-v3`) ne peut
//                   revenir sans faire rougir ce garde.
// 2. VERDICT        le type-check de la zone v3 est unique, bloquant, sans
//                   amnistie, et AVANT le cliquet de dette de la zone legacy.
// 3. BUILD          `next build` de la zone tourne dans le job `build` de
//                   `ci.yml`. Sans lui, la seule compilation de la zone était
//                   celle du `Dockerfile` — après le merge.
// 4. DÉCLENCHEMENT  `docker.yml` surveille `apps/web-v3/**` et délègue au script.
// 5. ROUTAGE        le compose de prod sert la zone par PRÉFIXE au-dessus du
//                   plancher attrape-tout, sans toucher au routeur legacy.
// 6. VERSIONNEMENT  `release.yml` et `scripts/sync-versions.js` gouvernent le
//                   MÊME ensemble de services, chacun avec le même fichier
//                   VERSION. Deux schémas de versionnement pour un déploiement,
//                   c'est une zone sans retour arrière vers une image antérieure.
// 7. DÉMARRAGE      toute voie qui monte l'application (passerelle + frontend)
//                   monte CHAQUE zone frontend déclarée par le compose. Un
//                   service déclaré que rien ne démarre est un contrôle inerte :
//                   le routeur ne s'enregistre jamais et ses chunks retombent
//                   sur le plancher attrape-tout.
//
// Les listes de services et de scripts sont DÉRIVÉES (du compose, du workflow,
// du manifeste), jamais écrites à la main : un garde qui énumère se périme au
// prochain ajout, et le prix de l'oubli est un silence.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = () =>
  execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

const GOVERNED = Object.freeze([
  '.github/workflows/ci.yml',
  '.github/workflows/docker.yml',
  '.github/workflows/release.yml',
  'docker-compose.prod.yml',
  'scripts/check-type-debt.sh',
  'scripts/sync-versions.js',
  'scripts/docker-detect-services.sh',
]);

const readSources = (root) => {
  const sources = {};
  for (const path of GOVERNED) sources[path] = readFileSync(join(root, path), 'utf8');
  for (const path of shellScripts(root)) sources[path] = readFileSync(join(root, path), 'utf8');
  return sources;
};

const shellScripts = (root) => {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== 'node_modules') walk(full);
      } else if (entry.endsWith('.sh')) {
        found.push(relative(root, full));
      }
    }
  };
  walk(join(root, 'scripts'));
  return found.sort();
};

// ── LECTURE DES SOURCES ────────────────────────────────────────────────────
//
// Les fichiers d'infrastructure CITENT en commentaire les motifs cherchés ici
// (« apps/web-v3 », « frontend-v3 »). Les retirer avant toute assertion évite
// qu'une prose satisfasse un garde que le YAML ne satisfait plus.
const withoutComments = (source) =>
  source
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

const blockAt = (source, header, indent) => {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => header.test(line));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const boundary = new RegExp(`^ {0,${indent}}\\S`);
  const end = rest.findIndex((line) => boundary.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
};

const stepsOf = (jobBody) => {
  const lines = jobBody.split('\n');
  const starts = lines.flatMap((line, index) => (/^ {6}- /.test(line) ? [index] : []));
  return starts.map((start, position) => {
    const next = starts[position + 1];
    const body = lines.slice(start, next ?? lines.length).join('\n');
    return {
      name: (/^\s*(?:- )?name:\s*(.+)$/m.exec(body)?.[1] ?? '').trim().replace(/^['"]|['"]$/g, ''),
      body,
    };
  });
};

const V3_TYPE_CHECK = 'Type-check (apps/web-v3 — blocking, no ratchet)';
const WEB_RATCHET = 'Type-check (apps/web — debt ratchet)';

// ── 2. VERDICT DE TYPES ────────────────────────────────────────────────────

const checkTypeVerdict = (sources) => {
  const found = [];
  const ci = withoutComments(sources['.github/workflows/ci.yml']);
  const quality = blockAt(ci, /^ {2}quality:$/, 2);

  if (quality === null) return ['ci.yml : job `quality` introuvable'];

  const steps = stepsOf(quality);
  const named = steps.filter((step) => step.name === V3_TYPE_CHECK);

  if (named.length !== 1) {
    found.push(`ci.yml quality : ${named.length} étape « ${V3_TYPE_CHECK} », attendu exactement 1`);
    return found;
  }

  const [step] = named;
  if (!step.body.includes('@meeshy/web-v3')) {
    found.push('ci.yml quality : le type-check v3 ne filtre pas `@meeshy/web-v3`');
  }
  if (step.body.includes('continue-on-error')) {
    found.push('ci.yml quality : amnistie `continue-on-error` sur le type-check de la zone v3');
  }

  const names = steps.map((step) => step.name);
  if (!names.includes(WEB_RATCHET)) {
    found.push('ci.yml quality : le cliquet de dette de la zone legacy a disparu');
  } else if (names.indexOf(V3_TYPE_CHECK) > names.indexOf(WEB_RATCHET)) {
    found.push(
      'ci.yml quality : le type-check v3 passe APRÈS le cliquet — une dette legacy masquerait son verdict',
    );
  }

  if (withoutComments(sources['scripts/check-type-debt.sh']).includes('web-v3')) {
    found.push('check-type-debt.sh : le cliquet de dette a absorbé la zone v3, qui naît à zéro erreur');
  }

  return found;
};

// ── 3. BUILD DE LA ZONE ────────────────────────────────────────────────────

const checkZoneBuild = (sources) => {
  const ci = withoutComments(sources['.github/workflows/ci.yml']);
  const build = blockAt(ci, /^ {2}build:$/, 2);

  if (build === null) return ['ci.yml : job `build` introuvable'];

  const found = [];
  for (const manager of ['bun', 'pnpm']) {
    const builds = stepsOf(build).some(
      (step) => step.body.includes('cd apps/web-v3') && step.body.includes(`${manager} run build`),
    );
    if (!builds) {
      found.push(
        `ci.yml build : aucune étape ne lance \`${manager} run build\` dans apps/web-v3 — ` +
          "`next build` de la zone ne tournerait nulle part avant un merge",
      );
    }
  }
  return found;
};

// ── 4. DÉCLENCHEMENT ───────────────────────────────────────────────────────

const checkDockerTriggers = (sources) => {
  const docker = withoutComments(sources['.github/workflows/docker.yml']);
  const found = [];

  const paths = blockAt(docker, /^ {4}paths:$/, 4) ?? '';
  if (!paths.includes("- 'apps/web-v3/**'")) {
    found.push("docker.yml : `paths` ne surveille pas 'apps/web-v3/**' — le glob d'apps/web ne la couvre pas");
  }

  const options = blockAt(docker, /^ {8}options:$/, 8) ?? '';
  if (!options.includes('- web-v3')) {
    found.push("docker.yml : le déclenchement manuel n'offre pas 'web-v3'");
  }

  if (!docker.includes('scripts/docker-detect-services.sh')) {
    found.push('docker.yml : la sélection est redevenue du bash inline, donc inexécutable hors GitHub');
  }

  const detect = blockAt(docker, /^ {2}detect:$/, 2) ?? '';
  const [step] = stepsOf(detect).filter((candidate) =>
    candidate.body.includes('scripts/docker-detect-services.sh'),
  );
  if (step !== undefined && !step.body.includes('shell: bash')) {
    found.push(
      "docker.yml detect : sans `shell: bash`, pas de pipefail — l'échec du script serait avalé par le `tee` et la matrice sortirait VIDE",
    );
  }

  return found;
};

// ── 5. ROUTAGE DE PRODUCTION ───────────────────────────────────────────────

const priorityOf = (block, router) =>
  Number(new RegExp(`traefik\\.http\\.routers\\.${router}\\.priority=(\\d+)`).exec(block)?.[1] ?? NaN);

const checkProdRouting = (sources) => {
  const compose = withoutComments(sources['docker-compose.prod.yml']);
  const v3 = blockAt(compose, /^ {2}frontend-v3:$/, 2);
  const legacy = blockAt(compose, /^ {2}frontend:$/, 2);
  const found = [];

  if (v3 === null) return ['docker-compose.prod.yml : service `frontend-v3` absent'];
  if (legacy === null) return ['docker-compose.prod.yml : service `frontend` absent'];

  if (!v3.includes('PathPrefix(`/__v3`)')) {
    found.push(
      "docker-compose.prod.yml : la règle frontend-v3 ne porte pas PathPrefix(`/__v3`) — c'est l'assetPrefix de la zone, donc l'adresse de ses chunks",
    );
  }
  if (!v3.includes('traefik.http.services.frontend-v3.loadbalancer.server.port=3300')) {
    found.push('docker-compose.prod.yml : frontend-v3 ne sert pas le port 3300');
  }
  if (!v3.includes('meeshy-web-v3')) {
    found.push("docker-compose.prod.yml : frontend-v3 ne tire pas l'image que docker.yml pousse");
  }
  if (!(priorityOf(v3, 'frontend-v3') > priorityOf(legacy, 'frontend'))) {
    found.push('docker-compose.prod.yml : frontend-v3 ne supplante pas le plancher attrape-tout legacy');
  }
  if (priorityOf(legacy, 'frontend') !== 1) {
    found.push('docker-compose.prod.yml : le routeur legacy n\'est plus le plancher (priority=1)');
  }
  if (legacy.includes('PathPrefix')) {
    found.push("docker-compose.prod.yml : le routeur legacy a gagné un PathPrefix — il doit rester l'attrape-tout");
  }

  return found;
};

// ── 6. VERSIONNEMENT — LES DEUX USINES DISENT LA MÊME CHOSE ────────────────

const releaseMatrix = (source) => {
  const entries = [];
  for (const match of source.matchAll(
    /- service:\s*(\S+)[\s\S]*?version_file:\s*(\S+)/g,
  )) {
    entries.push({ service: match[1], versionFile: match[2] });
  }
  return entries;
};

const syncVersionsEntries = (source) => {
  const entries = [];
  for (const match of source.matchAll(
    /versionPath:\s*'([^']+)'[\s\S]{0,200}?name:\s*'([^']+)'/g,
  )) {
    entries.push({ service: match[2], versionFile: match[1] });
  }
  return entries;
};

const checkVersioning = (sources) => {
  const release = releaseMatrix(withoutComments(sources['.github/workflows/release.yml']));
  const sync = syncVersionsEntries(sources['scripts/sync-versions.js']);
  const found = [];

  const asMap = (entries) => new Map(entries.map((entry) => [entry.service, entry.versionFile]));
  const releaseBy = asMap(release);
  const syncBy = asMap(sync);

  for (const [service, versionFile] of syncBy) {
    if (!releaseBy.has(service)) {
      found.push(
        `versionnement : sync-versions.js écrit ${versionFile} pour « ${service} », mais release.yml ne coupe aucune image pour lui — l'image ne pourrait revenir à une version antérieure`,
      );
    } else if (releaseBy.get(service) !== versionFile) {
      found.push(
        `versionnement : « ${service} » lit ${releaseBy.get(service)} dans release.yml et ${versionFile} dans sync-versions.js`,
      );
    }
  }

  for (const [service, versionFile] of releaseBy) {
    if (!syncBy.has(service)) {
      found.push(
        `versionnement : release.yml lit ${versionFile} pour « ${service} », mais rien ne l'écrit — le fichier n'existera jamais et la release retombera sur son repli`,
      );
    }
  }

  return found;
};

// ── 7. DÉMARRAGE DES ZONES ─────────────────────────────────────────────────

// Les ZONES, pas les volumes : `frontend_uploads` est déclaré sous `volumes:`
// avec exactement la même indentation qu'un service. Sans borner la lecture au
// bloc `services:`, le garde exigerait qu'une voie de déploiement « démarre »
// un volume — un garde faux est pire qu'aucun garde.
const frontendServicesOf = (compose) => {
  const services = blockAt(compose, /^services:$/, 0) ?? '';
  return services
    .split('\n')
    .flatMap((line) => /^ {2}(frontend[\w-]*):$/.exec(line)?.slice(1, 2) ?? [])
    .filter((service, index, all) => all.indexOf(service) === index);
};

const startedServices = (script) =>
  new Set([...script.matchAll(/up\s+-d\s+([\w\s-]+)/g)].flatMap((match) => match[1].trim().split(/\s+/)));

// Une voie qui monte l'APPLICATION, par opposition à un redémarrage ciblé :
// elle nomme la passerelle ET un frontend. C'est ce qui distingue
// `deploy-start-services.sh` d'un `deploy-upload-migration.sh`, qui ne fait que
// relancer le frontend après une migration d'uploads et n'éteint aucune zone.
const bringsUpApplication = (started) =>
  started.has('gateway') && [...started].some((service) => service.startsWith('frontend'));

const checkZoneStartup = (sources) => {
  const compose = withoutComments(sources['docker-compose.prod.yml']);
  const zones = frontendServicesOf(compose);
  const found = [];

  for (const [path, source] of Object.entries(sources)) {
    if (!path.endsWith('.sh')) continue;
    const started = startedServices(source);
    if (!bringsUpApplication(started)) continue;

    for (const zone of zones) {
      if (!started.has(zone)) {
        found.push(
          `${path} : monte l'application sans démarrer « ${zone} », déclaré par le compose de production — le routeur Traefik de cette zone ne s'enregistrerait jamais`,
        );
      }
    }
  }

  return found;
};

// ── 8. LE LEVIER D'ÉPINGLAGE A UN PRODUCTEUR ───────────────────────────────

const checkImageVariables = (sources) => {
  const compose = withoutComments(sources['docker-compose.prod.yml']);
  const generator = 'scripts/production/meeshy-generate-production-variables.sh';
  const found = [];

  if (sources[generator] === undefined) return [];

  for (const zone of frontendServicesOf(compose)) {
    const block = blockAt(compose, new RegExp(`^ {2}${zone}:$`), 2) ?? '';
    const variable = /image:\s*\$\{([A-Z0-9_]+)/.exec(block)?.[1];
    if (variable === undefined) continue;

    if (!new RegExp(`^${variable}=`, 'm').test(sources[generator])) {
      found.push(
        `${generator} : n'émet pas ${variable}, que le compose lit pour « ${zone} » — le levier d'épinglage d'image n'a pas de producteur`,
      );
    }
  }

  return found;
};

// ── 1. SÉLECTION DES SERVICES ──────────────────────────────────────────────

const detect = (root, env) => {
  const stdout = execFileSync('bash', [join(root, 'scripts/docker-detect-services.sh')], {
    cwd: root,
    env: { ...process.env, EVENT_NAME: 'push', SERVICES_INPUT: '', REF: '', CHANGED: '', ...env },
    encoding: 'utf8',
  });
  const lines = stdout.trim().split('\n');
  const value = (key) => {
    const line = lines.find((candidate) => candidate.startsWith(`${key}=`));
    if (line === undefined) throw new Error(`sortie sans '${key}=' : ${lines.join(' | ')}`);
    return line.slice(key.length + 1);
  };
  return { services: JSON.parse(value('result')).include, hasChanges: value('has_changes') === 'true' };
};

const SELECTION_CASES = Object.freeze([
  ["un fichier d'apps/web-v3 ne réveille QUE la zone v3", { CHANGED: 'apps/web-v3/app/layout.tsx' }, ['web-v3']],
  ["un fichier d'apps/web ne réveille QUE la zone legacy", { CHANGED: 'apps/web/app/page.tsx' }, ['web']],
  [
    'le paquet partagé réveille les deux zones (avec tout ce qui en dépend)',
    { CHANGED: 'packages/shared/types/index.ts' },
    ['web', 'web-v3', 'gateway', 'agent', 'translator'],
  ],
  ['un tag de version construit tout', { REF: 'refs/tags/v1.32.1' }, ['web', 'web-v3', 'gateway', 'agent', 'translator']],
  [
    "demander 'web-v3' ne construit QUE la zone v3",
    { EVENT_NAME: 'workflow_dispatch', SERVICES_INPUT: 'web-v3' },
    ['web-v3'],
  ],
  [
    "demander 'web' ne construit QUE la zone legacy",
    { EVENT_NAME: 'workflow_dispatch', SERVICES_INPUT: 'web' },
    ['web'],
  ],
  [
    'demander les deux les construit toutes les deux',
    { EVENT_NAME: 'workflow_dispatch', SERVICES_INPUT: 'web,web-v3' },
    ['web', 'web-v3'],
  ],
  [
    "'all' n'oublie pas la zone v3",
    { EVENT_NAME: 'workflow_dispatch', SERVICES_INPUT: 'all' },
    ['web', 'web-v3', 'gateway', 'agent', 'translator'],
  ],
  [
    'les services hors zone web restent intacts',
    { EVENT_NAME: 'workflow_dispatch', SERVICES_INPUT: 'gateway,translator' },
    ['gateway', 'translator'],
  ],
  ['rien de servi ne change : rien ne se construit', { CHANGED: 'docs/product/MeeshyWebV3Design/ordre.md' }, []],
  [
    "un chemin qui CONTIENT 'apps/web/' sans en etre ne reveille rien",
    { CHANGED: 'docs/apps/web/capture.md' },
    [],
  ],
]);

const checkSelection = (root) => {
  const found = [];

  for (const [label, env, expected] of SELECTION_CASES) {
    let actual;
    try {
      actual = detect(root, env).services.map((entry) => entry.service);
    } catch (error) {
      found.push(`sélection « ${label} » : le script a échoué — ${error.message}`);
      continue;
    }
    if (actual.join(',') !== expected.join(',')) {
      found.push(`sélection « ${label} » : attendu [${expected.join(', ')}], obtenu [${actual.join(', ')}]`);
    }
  }

  try {
    const entry = detect(root, { CHANGED: 'apps/web-v3/app/layout.tsx' }).services[0];
    const expected = {
      service: 'web-v3',
      image: 'meeshy-web-v3',
      dockerfile: './apps/web-v3/Dockerfile',
      context: '.',
    };
    for (const [key, value] of Object.entries(expected)) {
      if (entry?.[key] !== value) {
        found.push(`sélection : l'entrée de la zone v3 porte ${key}=${entry?.[key]}, attendu ${value}`);
      }
    }
    if (detect(root, { CHANGED: 'docs/product/MeeshyWebV3Design/ordre.md' }).hasChanges) {
      found.push("sélection : has_changes vaut true alors qu'aucun service n'est construit");
    }
  } catch (error) {
    found.push(`sélection : forme de la matrice illisible — ${error.message}`);
  }

  return found;
};

// ── AGRÉGAT ────────────────────────────────────────────────────────────────

const CONTENT_CHECKS = Object.freeze([
  checkTypeVerdict,
  checkZoneBuild,
  checkDockerTriggers,
  checkProdRouting,
  checkVersioning,
  checkZoneStartup,
  checkImageVariables,
]);

export const violations = (sources) => CONTENT_CHECKS.flatMap((check) => check(sources));

// ── --self-test ────────────────────────────────────────────────────────────
//
// La base saine est le dépôt LUI-MÊME : mesurer la détection sur une copie
// synthétique prouverait que le garde sait lire la copie. Chaque cas mute UNE
// source et exige que la violation attendue apparaisse — c'est ce qui distingue
// un garde vivant d'un garde qui rend vert tout ce qu'on lui donne.

const CASES = Object.freeze([
  [
    'type-check de la zone v3 amnistié',
    (s) => {
      s['.github/workflows/ci.yml'] = s['.github/workflows/ci.yml'].replace(
        `- name: ${V3_TYPE_CHECK}`,
        `- name: ${V3_TYPE_CHECK}\n        continue-on-error: true`,
      );
      return s;
    },
    'amnistie',
  ],
  [
    'type-check de la zone v3 rangé APRÈS le cliquet',
    (s) => {
      // Les deux étapes échangent leur NOM : l'ordre s'inverse sans dépendre de
      // la forme exacte de leur corps, qui n'est pas ce que le cas mesure.
      s['.github/workflows/ci.yml'] = s['.github/workflows/ci.yml']
        .replace(`- name: ${V3_TYPE_CHECK}`, '- name: __ECHANGE__')
        .replace(`- name: ${WEB_RATCHET}`, `- name: ${V3_TYPE_CHECK}`)
        .replace('- name: __ECHANGE__', `- name: ${WEB_RATCHET}`);
      return s;
    },
    'APRÈS le cliquet',
  ],
  [
    'la zone v3 versée dans le cliquet de dette legacy',
    (s) => {
      s['scripts/check-type-debt.sh'] += '\nWEB_V3_DIR="apps/web-v3"\n';
      return s;
    },
    'cliquet de dette a absorbé',
  ],
  [
    'aucun `next build` de la zone v3 en CI',
    (s) => {
      s['.github/workflows/ci.yml'] = s['.github/workflows/ci.yml'].replace(/cd apps\/web-v3\n          bun run build/, 'cd apps/web\n          bun run build');
      return s;
    },
    'bun run build` dans apps/web-v3',
  ],
  [
    "docker.yml ne surveille plus apps/web-v3",
    (s) => {
      s['.github/workflows/docker.yml'] = s['.github/workflows/docker.yml'].replace(
        "      - 'apps/web-v3/**'\n",
        '',
      );
      return s;
    },
    "ne surveille pas 'apps/web-v3/**'",
  ],
  [
    'le routeur legacy gagne un PathPrefix',
    (s) => {
      s['docker-compose.prod.yml'] = s['docker-compose.prod.yml'].replace(
        'traefik.http.routers.frontend.priority=1',
        'traefik.http.routers.frontend.rule=PathPrefix(`/`)\n      - "traefik.http.routers.frontend.priority=1',
      );
      return s;
    },
    'PathPrefix',
  ],
  [
    'une zone versionnée par sync-versions et absente de release.yml',
    (s) => {
      s['.github/workflows/release.yml'] = s['.github/workflows/release.yml'].replace(
        /          - service: web-v3\n(?:.*\n)*?            version_file: apps\/web-v3\/VERSION\n/,
        '',
      );
      return s;
    },
    'ne coupe aucune image',
  ],
  [
    'une voie de déploiement qui monte l’application sans la zone v3',
    (s) => {
      s['scripts/deployment/deploy-start-services.sh'] = s[
        'scripts/deployment/deploy-start-services.sh'
      ].replace('docker compose up -d frontend-v3', 'true');
      return s;
    },
    'sans démarrer « frontend-v3 »',
  ],
  [
    "le levier d'épinglage de la zone v3 sans producteur",
    (s) => {
      s['scripts/production/meeshy-generate-production-variables.sh'] = s[
        'scripts/production/meeshy-generate-production-variables.sh'
      ].replace(/^FRONTEND_V3_IMAGE=.*$/m, '');
      return s;
    },
    "n'a pas de producteur",
  ],
]);

const SELECTION_SELF_TEST = Object.freeze([
  [
    'le piège de nommage : une recherche en SOUS-CHAÎNE',
    (script) =>
      script.replace(
        '[[ ",${SERVICES_INPUT// /}," == *",${service},"* ]]',
        '[[ "${SERVICES_INPUT}" == *"${service}"* ]]',
      ),
    "demander 'web-v3' ne construit QUE la zone v3",
  ],
  [
    'un préfixe de chemin non ancré',
    (script) => script.replace('grep -q "^${prefix}"', 'grep -q "${prefix}"'),
    "un chemin qui CONTIENT 'apps/web/' sans en etre ne reveille rien",
  ],
]);

const selfTestSelection = (root) => {
  const found = [];
  const original = readFileSync(join(root, 'scripts/docker-detect-services.sh'), 'utf8');

  for (const [label, mutate, expected] of SELECTION_SELF_TEST) {
    const tree = mkdtempSync(join(tmpdir(), 'docker-pipeline-'));
    try {
      mkdirSync(join(tree, 'scripts'), { recursive: true });
      writeFileSync(join(tree, 'scripts/docker-detect-services.sh'), mutate(original), 'utf8');
      for (const versionFile of ['apps/web/VERSION', 'services/gateway/VERSION', 'services/translator/VERSION']) {
        mkdirSync(join(tree, dirname(versionFile)), { recursive: true });
        writeFileSync(join(tree, versionFile), '1.0.0\n', 'utf8');
      }
      mkdirSync(join(tree, 'apps/web-v3'), { recursive: true });
      writeFileSync(join(tree, 'apps/web-v3/package.json'), '{"version":"0.0.0"}', 'utf8');
      mkdirSync(join(tree, 'services/agent'), { recursive: true });
      writeFileSync(join(tree, 'services/agent/package.json'), '{"version":"1.0.0"}', 'utf8');

      const detected = checkSelection(tree);
      if (!detected.some((line) => line.includes(expected))) {
        found.push(
          `self-test « ${label} » : la détection est CASSÉE — « ${expected} » n'apparaît pas dans :\n    ${detected.join('\n    ') || '(aucune violation)'}`,
        );
      }
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  }

  return found;
};

const selfTest = (root) => {
  const healthy = readSources(root);
  const failures = [];

  const clean = violations(healthy);
  if (clean.length > 0) {
    failures.push(`self-test : le dépôt SAIN rend déjà ${clean.length} violation(s) :\n    ${clean.join('\n    ')}`);
  }

  for (const [label, mutate, expected] of CASES) {
    const mutated = mutate({ ...healthy });
    const found = violations(mutated);
    if (!found.some((line) => line.includes(expected))) {
      failures.push(
        `self-test « ${label} » : la détection est CASSÉE — « ${expected} » n'apparaît pas dans :\n    ${found.join('\n    ') || '(aucune violation)'}`,
      );
    }
  }

  failures.push(...selfTestSelection(root));

  if (failures.length > 0) {
    console.error(`\x1b[0;31m✗ ${failures.length} cas de self-test en échec\x1b[0m`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }

  console.log(
    `\x1b[0;32m✓ self-test : ${CASES.length + SELECTION_SELF_TEST.length} cas, détection vivante\x1b[0m`,
  );
};

const main = () => {
  const root = repoRoot();

  if (process.argv.includes('--self-test')) return selfTest(root);

  const found = [...violations(readSources(root)), ...checkSelection(root)];

  if (found.length > 0) {
    console.error(`\x1b[0;31m✗ ${found.length} incohérence(s) dans la chaîne d'images\x1b[0m`);
    for (const line of found) console.error(`  • ${line}`);
    process.exit(1);
  }

  console.log(
    `\x1b[0;32m✓ chaîne d'images cohérente : ${SELECTION_CASES.length} cas de sélection, verdict de types propre à la zone v3, build en CI, routage et démarrage de chaque zone frontend\x1b[0m`,
  );
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
