#!/usr/bin/env node
// Garde de la chaîne d'intégration de apps/web-v3 [L-0.5]
//
// POURQUOI IL VIT À LA RACINE, ET PAS DANS apps/web-v3/__tests__
//
// L'invariant porte sur `.github/workflows/ci.yml`, `.github/workflows/docker.yml`
// et les composes de DÉPLOIEMENT (`docker-compose.prod.yml`,
// `docker-compose.staging.yml` — cf. DEPLOIEMENTS) : des fichiers de la RACINE.
// Sa surface est le
// dépôt (règle de placement (B) de la conception), donc il est appelé par le job
// `quality` de `ci.yml`, à côté de `check-type-debt.sh`, `check-lockfile-alignment.mjs`
// et `check-makefile-workspaces.mjs`. Un garde de la CI écrit DANS la matrice de
// tests d'un paquet que la CI ne porte pas serait inerte — c'est exactement le
// défaut que `check-makefile-workspaces.mjs` documente en tête.
//
// POURQUOI LE DÉTECTEUR EST DÉROULÉ PAR BASH, PAS LU PAR UNE EXPRESSION RÉGULIÈRE
//
// La question que pose ce garde n'est pas « la chaîne `apps/web-v3/` figure-t-elle
// dans docker.yml ? » mais « un commit qui ne touche QUE apps/web-v3 construit-il
// l'image de la v3, et LAISSE-T-IL le legacy tranquille ? ». Ces deux réponses ne
// se lisent pas dans le texte : elles se mesurent en exécutant le script du
// détecteur avec ses entrées. C'est le même parti que `make -n` dans le garde du
// Makefile — dérouler plutôt que relire.
//
// Le piège que ça attrape : `docker.yml` sélectionnait ses services par
// SOUS-CHAÎNE (`[[ "$SERVICES" == *"web"* ]]`). Une option `web-v3` y déclenche
// AUSSI le build du legacy, et rien dans le texte ne le dit — seule l'exécution
// le rend. Symétriquement, le détecteur de push teste `*"apps/web/"*`, qui ne
// contient PAS `apps/web-v3/` : la v3 ne se construisait jamais.
//
// POURQUOI LE RATCHET DE DETTE EST GARDÉ EN NÉGATIF
//
// `scripts/check-type-debt.sh` porte `WEB_BASELINE`, la dette de types de
// `apps/web` LEGACY. La v3 naît à zéro erreur : son type-check va dans l'étape
// BLOQUANTE. L'y faire entrer par le ratchet lui offrirait un budget d'erreurs
// qu'elle n'a pas à avoir — le garde vérifie donc l'ABSENCE de la v3 dans le
// ratchet autant que sa PRÉSENCE dans l'étape bloquante.
//
// POURQUOI LA RÈGLE DU ROUTEUR EST GARDÉE DANS LES DEUX SENS
//
// Le § 4.4 de la conception pose le corollaire : « tout chemin absent de la
// règle `frontend-v3` est servi par apps/web ». Il a d'abord été lu comme une
// règle sur les ROUTES ; il vaut aussi, et surtout, pour les ACTIFS.
// `assetPrefix: '/__v3'` préfixe les URL que Next FABRIQUE pour ses bundles,
// et rien d'autre — mesuré sur le serveur standalone que l'image lance :
//   /_next/…/main-<hash>.js → 200   /__v3/_next/…/main-<hash>.js → 200
//   /probe.txt (public/)    → 200   /__v3/probe.txt              → 404
//   /robots.txt (app/)      → 200   /__v3/robots.txt             → 404
// Un fichier de `public/` et un fichier de métadonnées de l'App Router sont
// donc servis à la RACINE de l'URL et retombent sur le routeur attrape-tout :
// le sprite Phosphor ou une image OG de la v3 seraient servis par le LEGACY.
// C'est le SENS (a) : rien de ce que la zone sert à la racine n'échappe à la
// règle.
//
// Le SENS (b) est son symétrique, et il est aussi cher : un chemin réclamé par
// la règle est PRIS au legacy, priority=100. `next build` n'émettant aujourd'hui
// aucune PAGE d'App Router, la zone répond à tout chemin inconnu par le 404
// ANGLAIS du routeur Pages — sans `<html lang>`, sans le script anti-flash de
// thème. Une règle en `PathPrefix('/__v3')` nu publiait donc cette page-là.
// D'où : un chemin ne se réclame qu'une fois qu'il est servi.
//
// Les deux sens se mesurent sur le DISQUE (ce que `apps/web-v3/` contient) et
// sur le TEXTE de la règle — jamais sur une intention.
//
// POURQUOI CE QUE LA V3 IMPORTE HORS D'ELLE-MÊME EST GARDÉ ICI
//
// `apps/web-v3/app/globals.css` a importé la table de jetons par CHEMIN RELATIF
// (`../../../packages/design-tokens/tokens.css`). L'étage builder ne copie que
// `COPY apps/web-v3/ ./` : `packages/` n'entre pas dans l'image, et `next build`
// y rend « Module not found ». Le défaut était INVISIBLE pour deux raisons qui
// se renforcent — la v3 n'émet aucune PAGE, donc webpack ne compile jamais
// `globals.css` ; et la mesure de l'implémenteur avait été faite en local,
// monorepo intact, c'est-à-dire dans la SEULE disposition où elle ne peut pas
// échouer. La disposition qui EXPÉDIE est celle de l'image.
//
// Symétriquement, une dépendance inter-paquets crée une entrée de build que la
// chaîne de publication doit connaître : `docker.yml` ne déclenchait `web_v3`
// que sur `apps/web-v3/**` et `packages/shared/**`. Une correction de la table
// ne reconstruisait AUCUNE image et la production continuait de servir
// l'ancienne feuille, sans témoin. « Un champ ajouté en amont et pas relayé ».
//
// D'où trois invariants, dans cet ordre de sévérité :
//   (i)   aucun fichier de la v3 n'atteint le disque hors de `apps/web-v3/` par
//         un chemin RELATIF — un franchissement de frontière se DÉCLARE dans le
//         manifeste, où le reste de la chaîne peut le lire ;
//   (ii)  tout paquet de workspace que le manifeste déclare est COPIÉ par le
//         Dockerfile — sinon l'image ne le contient pas ;
//   (iii) tout paquet de workspace que le manifeste déclare DÉCLENCHE l'image
//         de la v3, filtre `paths:` compris — sinon un correctif de ce paquet
//         ne sort jamais.
// Les trois se mesurent sur le disque et sur le déroulement réel du détecteur ;
// aucun `next build` local ne pouvait les rendre.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// La lecture du disque vit à côté : ce fichier tient les LOIS, pas la façon de
// les mesurer (voir le doc-comment de scripts/lib/v3-disque.mjs).
import {
  declaredWorkspaceDependencies,
  escapingRequests,
  filesUnder,
  runtimeEnvChains,
  splitName,
} from './lib/v3-disque.mjs';

// La règle Traefik du routeur `frontend-v3` n'a qu'UN parseur, et il vit du côté
// CONTRAINT — l'invariant (i) ci-dessous interdit à `apps/web-v3/` d'atteindre
// `scripts/` par un chemin relatif, alors que ce garde descend sans rien casser.
// Ce fichier en portait un second (`claimedPathsOf` + `captures`) : les deux ne
// dupliquaient pas seulement la lecture, ils se CONTREDISAIENT — celui d'en face
// jetait `Path(…)` en silence et cassait sur `PathPrefix(`/`)`, c'est-à-dire à
// l'étape 7 du § 4.9 [revue #4414].
import {
  capture,
  cheminsReclames,
  PREFIXE_DE_ZONE,
  regleDuRouteur,
  ZONE_DACTIFS,
} from '../apps/web-v3/scripts/lib/perimetre-de-zone.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const V3_WORKSPACE = '@meeshy/web-v3';
const V3_DIRECTORY = 'apps/web-v3';
const V3_IMAGE = 'meeshy-web-v3';
const V3_PORT = '3300';
const V3_ROUTER = 'frontend-v3';
// Le préfixe de la zone et sa part d'ACTIFS viennent du même site unique que le
// parseur : trois déclarations de la même donnée valent une jumelle de plus.
const V3_PATH_PREFIX = PREFIXE_DE_ZONE;
const V3_ASSET_ZONE = ZONE_DACTIFS;
const V3_APP_DIRECTORY = `${V3_DIRECTORY}/app`;
const V3_PUBLIC_DIRECTORY = `${V3_DIRECTORY}/public`;
const LEGACY_ROUTER = 'frontend';

// Le SECOND aiguilleur de l'origine. `apps/web` enregistre ce worker sur
// `scope: '/'`, donc sur l'origine ENTIÈRE, zone v3 comprise.
const WORKER_LEGACY = 'apps/web/public/sw.js';

// L'App Router du LEGACY — ce que la zone peut lui VOLER sans le vouloir.
const LEGACY_APP_DIRECTORY = 'apps/web/app';

/**
 * **Les DEUX déploiements qui servent la zone.**
 *
 * Ce garde n'a longtemps connu que `docker-compose.prod.yml`, et son en-tête le
 * disait — « trois fichiers de la RACINE ». Il était vert, et il avait raison
 * sur ce qu'il regardait : la v3 n'était simplement déployée sur AUCUN staging
 * (#4630), donc aucune de ses issues ne pouvait satisfaire la règle « on ne
 * ferme que si les tests sur staging sont concluants ».
 *
 * C'est la forme classique — une énumération de sites porte deux affirmations :
 * « ces sites tiennent l'invariant » (vérifiable, et vérifiée) et « ce sont les
 * sites où l'invariant s'applique » (jamais vérifiée). Les invariants de
 * routage valent pour TOUT déploiement qui sert la zone ; ils sont donc
 * paramétrés par le déploiement plutôt que recopiés, sans quoi le troisième
 * repartirait du même angle mort.
 */
const DEPLOIEMENTS = [
  {
    fichier: 'docker-compose.prod.yml',
    source: (world) => world.prod,
    v3: V3_ROUTER,
    legacy: LEGACY_ROUTER,
  },
  {
    fichier: 'docker-compose.staging.yml',
    source: (world) => world.staging,
    v3: `${V3_ROUTER}-staging`,
    legacy: `${LEGACY_ROUTER}-staging`,
  },
];

// --- ce que la zone SERT, lu sur le disque -----------------------------------

// Conventions de fichier de l'App Router servies à la RACINE de l'URL. Elles
// ne passent PAS par `assetPrefix` — mesuré : `app/robots.txt` répond à
// `/robots.txt` (200) et pas à `/__v3/robots.txt` (404).
const ROOT_SERVED_METADATA = new Set([
  'favicon',
  'icon',
  'apple-icon',
  'opengraph-image',
  'twitter-image',
  'robots',
  'sitemap',
  'manifest',
]);

// Les variantes générées (`robots.ts`, `sitemap.ts`, `manifest.ts`) ne sont pas
// servies sous leur nom de fichier mais sous celui que Next leur donne.
const GENERATED_METADATA_URL = {
  robots: 'robots.txt',
  sitemap: 'sitemap.xml',
  manifest: 'manifest.webmanifest',
};

const GENERATED_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx']);

// `(groupe)` et `@slot` ne produisent pas de segment d'URL ; un dossier `_privé`
// sort entièrement du routage.
const routeSegmentsOf = (directory) =>
  directory === ''
    ? []
    : directory
        .split('/')
        .filter((segment) => !segment.startsWith('(') && !segment.startsWith('@'));

const isRoutable = (directory) =>
  directory === '' || !directory.split('/').some((segment) => segment.startsWith('_'));

const urlOf = (segments) => `/${segments.filter((segment) => segment !== '').join('/')}`;

const appUrls = (root) =>
  filesUnder(join(root, V3_APP_DIRECTORY)).reduce(
    (served, relative) => {
      const slash = relative.lastIndexOf('/');
      const directory = slash === -1 ? '' : relative.slice(0, slash);
      const name = relative.slice(slash + 1);
      if (!isRoutable(directory)) return served;

      const segments = routeSegmentsOf(directory);
      const { stem, extension } = splitName(name);

      if (stem === 'page' || stem === 'route') {
        return { ...served, routeUrls: [...served.routeUrls, urlOf(segments)] };
      }

      const convention = stem.replace(/\d+$/, '');
      if (!ROOT_SERVED_METADATA.has(convention)) return served;

      const servedName = GENERATED_EXTENSIONS.has(extension)
        ? (GENERATED_METADATA_URL[convention] ?? convention)
        : name;
      return { ...served, metadataUrls: [...served.metadataUrls, urlOf([...segments, servedName])] };
    },
    { routeUrls: [], metadataUrls: [] },
  );

// Un fichier SOURCE de la v3 qu'une règle d'ignore de la RACINE emporte manque
// au clone — et c'est le type-check BLOQUANT qui tombe, pas le fichier qui
// manque bruyamment. Le discriminant est la SOURCE de la règle : ce que le
// `.gitignore` du paquet demande est voulu (`.next/`, `coverage/`,
// `next-env.d.ts`, `*.tsbuildinfo`) ; ce qu'une règle d'ailleurs emporte ne
// l'est pas. Les répertoires de cache (`.turbo/`) restent hors du champ : le
// contrôle ne regarde que des FICHIERS d'extension source.
const SOURCE_EXTENSIONS = new Set([
  'ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'json', 'css',
]);

const gitIgnoredSources = (root) => {
  const listed = execFileSync(
    'git',
    ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', V3_DIRECTORY],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\n')
    .filter((line) => line !== '');
  if (listed.length === 0) return [];

  return execFileSync('git', ['check-ignore', '-v', '--stdin'], {
    cwd: root,
    encoding: 'utf8',
    input: listed.join('\n'),
  })
    .split('\n')
    .flatMap((line) => {
      const parsed = /^([^:]*):(\d+):(.*)\t(.*)$/.exec(line);
      if (parsed === null) return [];
      const [, source, , pattern, path] = parsed;
      if (source === `${V3_DIRECTORY}/.gitignore` || path.endsWith('/')) return [];
      return SOURCE_EXTENSIONS.has(splitName(path).extension) ? [{ path, source, pattern }] : [];
    });
};

const zoneInventory = (root) => ({
  ...appUrls(root),
  publicFiles: filesUnder(join(root, V3_PUBLIC_DIRECTORY)).map((relative) => `/${relative}`),
  gitIgnoredSources: gitIgnoredSources(root),
});


const readWorld = async (root) => ({
  root,
  ci: await readFile(join(root, '.github/workflows/ci.yml'), 'utf8'),
  docker: await readFile(join(root, '.github/workflows/docker.yml'), 'utf8'),
  prod: await readFile(join(root, 'docker-compose.prod.yml'), 'utf8'),
  staging: await readFile(join(root, 'docker-compose.staging.yml'), 'utf8'),
  worker: await readFile(join(root, WORKER_LEGACY), 'utf8'),
  legacyRoutes: readdirSync(join(root, LEGACY_APP_DIRECTORY), { withFileTypes: true })
    .filter(
      (entree) =>
        entree.isDirectory() && !entree.name.startsWith('(') && !entree.name.startsWith('_'),
    )
    .map((entree) => `/${entree.name}`),
  typeDebt: await readFile(join(root, 'scripts/check-type-debt.sh'), 'utf8'),
  dockerfile: await readFile(join(root, `${V3_DIRECTORY}/Dockerfile`), 'utf8'),
  zone: zoneInventory(root),
  outside: declaredWorkspaceDependencies(root, V3_DIRECTORY),
  escapes: escapingRequests(root, V3_DIRECTORY),
  envChains: runtimeEnvChains(root, V3_DIRECTORY),
  v3Package: await readFile(join(root, `${V3_DIRECTORY}/package.json`), 'utf8'),
  playwright: await readFile(join(root, `${V3_DIRECTORY}/playwright.config.ts`), 'utf8'),
  suites: readdirSync(join(root, `${V3_DIRECTORY}/e2e/visual`))
    .filter((nom) => nom.endsWith('.spec.ts')),
});

// --- lecture structurée du peu de YAML dont ce garde a besoin ----------------

const stepsOf = (workflow) => {
  const collected = [];
  let current = null;
  for (const line of workflow.split('\n')) {
    const header = /^(\s*)- name: (.+)$/.exec(line);
    if (header && header[1].length >= 6) {
      if (current) collected.push(current);
      current = { name: header[2].trim(), indent: header[1].length, lines: [line] };
      continue;
    }
    if (!current) continue;
    const indentation = line.search(/\S/);
    if (indentation !== -1 && indentation <= current.indent) {
      collected.push(current);
      current = null;
      continue;
    }
    current.lines.push(line);
  }
  if (current) collected.push(current);
  return collected.map(({ name, lines }) => ({ name, body: lines.join('\n') }));
};

const dedent = (lines) => {
  const filled = lines.filter((line) => line.trim() !== '');
  const margin = Math.min(...filled.map((line) => line.search(/\S/)));
  return lines.map((line) => line.slice(margin)).join('\n');
};

const runScriptOf = (step) => {
  const lines = step.body.split('\n');
  const start = lines.findIndex((line) => /^\s*run:\s*\|\s*$/.test(line));
  if (start === -1) return '';
  const block = lines.slice(start + 1);
  return block.some((line) => line.trim() !== '') ? dedent(block) : '';
};

const blockOf = (yaml, header) => {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line === header);
  if (start === -1) return null;
  const indent = header.search(/\S/);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim() !== '' && line.search(/\S/) <= indent);
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
};

const listValues = (yaml, header) => {
  const block = blockOf(yaml, header);
  if (block === null) return [];
  return block
    .split('\n')
    .flatMap((line) => {
      const item = /^\s*-\s+(.+?)\s*$/.exec(line);
      return item ? [item[1].replace(/^['"]|['"]$/g, '')] : [];
    });
};

// --- déroulement réel des deux étapes de docker.yml --------------------------

const substitute = (script, bindings) =>
  script.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, expression) => bindings[expression] ?? '');

const runBash = (script, root) => {
  const directory = mkdtempSync(join(tmpdir(), 'v3-pipeline-'));
  const scriptPath = join(directory, 'step.sh');
  const outputPath = join(directory, 'outputs');
  writeFileSync(scriptPath, script);
  writeFileSync(outputPath, '');
  try {
    execFileSync('bash', [scriptPath], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: outputPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return Object.fromEntries(
      readFileSync(outputPath, 'utf8')
        .split('\n')
        .flatMap((line) => {
          const pair = /^([A-Za-z0-9_-]+)=(.*)$/.exec(line);
          return pair ? [[pair[1], pair[2]]] : [];
        }),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const stepNamed = (workflow, name) => stepsOf(workflow).find((step) => step.name === name);

const detect = (world, bindings, changedFiles) => {
  const step = stepNamed(world.docker, 'Detect changes');
  if (!step) throw new Error("l'étape « Detect changes » est introuvable dans docker.yml");
  const script = substitute(runScriptOf(step), bindings)
    .split('\n')
    .map((line) =>
      changedFiles !== undefined && /^\s*CHANGED=\$\(/.test(line)
        ? `${' '.repeat(line.search(/\S/))}CHANGED=${JSON.stringify(changedFiles.join('\n'))}`
        : line,
    )
    .join('\n');
  return runBash(script, world.root);
};

const detectOnPush = (world, changedFiles) =>
  detect(
    world,
    { 'github.event_name': 'push', 'github.ref': 'refs/heads/dev' },
    changedFiles,
  );

const detectOnDispatch = (world, services) =>
  detect(world, {
    'github.event_name': 'workflow_dispatch',
    'github.ref': 'refs/heads/dev',
    'github.event.inputs.services': services,
    'github.event.inputs.custom_services': '',
  });

const buildServicesList = (world, changes) => {
  const step = stepNamed(world.docker, 'Build services list');
  if (!step) throw new Error("l'étape « Build services list » est introuvable dans docker.yml");
  const bindings = Object.fromEntries(
    Object.entries(changes).map(([key, value]) => [`steps.changes.outputs.${key}`, value]),
  );
  const outputs = runBash(substitute(runScriptOf(step), bindings), world.root);
  return JSON.parse(outputs.result ?? '{"include":[]}').include ?? [];
};

const dispatchOptions = (world) =>
  listValues(world.docker, '        options:').filter((option) => option !== 'all');

// --- les invariants ---------------------------------------------------------

const stepsMentioning = (workflow, needle) =>
  stepsOf(workflow).filter((step) => step.body.includes(needle));

const isAmnestied = (step) => /continue-on-error:\s*true/.test(step.body);

const theV3TypeCheckIsBlocking = (world) => {
  const typeChecks = stepsMentioning(world.ci, V3_WORKSPACE).filter((step) =>
    /type-check/.test(step.body),
  );
  if (typeChecks.length === 0) {
    return [`aucune étape de ci.yml ne lance le type-check de ${V3_WORKSPACE}`];
  }
  return typeChecks
    .filter(isAmnestied)
    .map((step) => `l'étape « ${step.name} » type-checke la v3 avec continue-on-error: true`);
};

const theV3LintIsBlocking = (world) => {
  const lints = stepsMentioning(world.ci, V3_WORKSPACE).filter(
    (step) => / lint\b/.test(step.body) && !/type-check/.test(step.body),
  );
  return lints.length === 0
    ? [`aucune étape de ci.yml ne lint ${V3_WORKSPACE} hors de l'amnistie du legacy`]
    : [];
};

const noV3StepIsAmnestied = (world) =>
  stepsMentioning(world.ci, V3_DIRECTORY)
    .concat(stepsMentioning(world.ci, V3_WORKSPACE))
    .filter(isAmnestied)
    .map((step) => `l'étape « ${step.name} » nomme la v3 et porte continue-on-error: true`);

const theDebtRatchetIgnoresTheV3 = (world) => {
  const ratchetSteps = stepsMentioning(world.ci, 'check-type-debt.sh').filter((step) =>
    step.body.includes(V3_DIRECTORY) || step.body.includes(V3_WORKSPACE),
  );
  const ratchetScript = world.typeDebt.includes(V3_DIRECTORY)
    ? [`scripts/check-type-debt.sh nomme ${V3_DIRECTORY} — le ratchet est gagé sur le legacy`]
    : [];
  return ratchetSteps
    .map((step) => `l'étape « ${step.name} » fait entrer la v3 dans le ratchet de dette`)
    .concat(ratchetScript);
};

const theTestMatrixCarriesTheV3 = (world) => {
  const failures = [];
  if (!/path:\s*apps\/web-v3\s*$/m.test(world.ci)) {
    failures.push(`aucune entrée de la matrice de tests ne porte path: ${V3_DIRECTORY}`);
  }
  if (!world.ci.includes(`filter: '${V3_WORKSPACE}'`)) {
    failures.push(`aucune entrée de la matrice de tests ne porte filter: '${V3_WORKSPACE}'`);
  }
  return failures;
};

const theDockerPathFilterCoversBothZones = (world) => {
  const paths = listValues(world.docker, '    paths:');
  return [
    ['apps/web/**', 'le legacy'],
    ['apps/web-v3/**', 'la v3'],
  ]
    .filter(([glob]) => !paths.includes(glob))
    .map(([glob, zone]) => `le filtre paths de docker.yml ne couvre pas ${zone} (${glob} absent)`);
};

const expectSelection = (label, outputs, expected) =>
  Object.entries(expected)
    .filter(([key, value]) => outputs[key] !== String(value))
    .map(
      ([key, value]) =>
        `${label} → ${key}=${outputs[key] ?? '(absent)'} au lieu de ${value}`,
    );

const aV3CommitBuildsOnlyTheV3 = (world) =>
  expectSelection(
    'un push ne touchant que apps/web-v3/',
    detectOnPush(world, ['apps/web-v3/app/layout.tsx']),
    { web_v3: true, web: false },
  );

const aLegacyCommitBuildsOnlyTheLegacy = (world) =>
  expectSelection(
    'un push ne touchant que apps/web/',
    detectOnPush(world, ['apps/web/app/page.tsx']),
    { web: true, web_v3: false },
  );

const aSharedCommitBuildsBothZones = (world) =>
  expectSelection(
    'un push touchant packages/shared/',
    detectOnPush(world, ['packages/shared/types/index.ts']),
    { web: true, web_v3: true, gateway: true },
  );

const theV3DispatchLeavesTheLegacyAlone = (world) =>
  expectSelection(
    'un dispatch « web-v3 »',
    detectOnDispatch(world, 'web-v3'),
    { web_v3: true, web: false },
  );

const theLegacyDispatchLeavesTheV3Alone = (world) =>
  expectSelection('un dispatch « web »', detectOnDispatch(world, 'web'), {
    web: true,
    web_v3: false,
  });

const theAllDispatchBuildsTheV3 = (world) =>
  expectSelection('un dispatch « all »', detectOnDispatch(world, 'all'), { web_v3: true });

// (i) — un franchissement de frontière se DÉCLARE, il ne se traverse pas par le
// disque. C'est le seul témoin qui pouvait rougir sur le défaut d'origine :
// `next build` en local ne le peut pas, le monorepo y étant intact.
const noV3SourceReachesOutsideItsPackage = (world) =>
  world.escapes.map(
    ({ file, request, target }) =>
      `${file} atteint ${target} par le chemin relatif « ${request} » : ` +
      `hors de ${V3_DIRECTORY}/, donc absent de l'image (l'étage builder ne copie que ` +
      `${V3_DIRECTORY}/). Déclarer le paquet dans ${V3_DIRECTORY}/package.json et l'importer ` +
      `par spécificateur`,
  );

const escapeRegExp = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// (ii) — ce que le manifeste déclare voyage dans l'image.
const everyDeclaredPackageTravelsInTheImage = (world) =>
  world.outside.flatMap(({ name, directory }) => {
    if (directory === null) {
      return [`${V3_DIRECTORY} déclare ${name} en workspace, qu'aucun glob de la racine ne rend`];
    }
    return new RegExp(`^COPY\\s+${escapeRegExp(directory)}/`, 'm').test(world.dockerfile)
      ? []
      : [
          `${V3_DIRECTORY}/Dockerfile ne copie pas ${directory}/ : ${name} est déclaré mais ` +
            `n'entre jamais dans l'image, et le build y échoue au premier fichier qui l'importe`,
        ];
  });

// (iii) — et une correction de ce paquet reconstruit bien l'image de la v3.
const everyDeclaredPackageRebuildsTheV3Image = (world) => {
  const paths = listValues(world.docker, '    paths:');
  return world.outside.flatMap(({ name, directory }) => {
    if (directory === null) return [];
    const failures = paths.includes(`${directory}/**`)
      ? []
      : [`le filtre paths de docker.yml ne couvre pas ${directory}/** (dépendance ${name} de la v3)`];
    return failures.concat(
      expectSelection(
        `un push ne touchant que ${directory}/`,
        detectOnPush(world, [`${directory}/tokens.css`]),
        { web_v3: true },
      ),
    );
  });
};

const everyDispatchOptionSelectsAService = (world) =>
  dispatchOptions(world)
    .filter((option) =>
      Object.values(detectOnDispatch(world, option)).every((value) => value !== 'true'),
    )
    .map((option) => `l'option « ${option} » du dispatch ne sélectionne aucun service`);

const theV3ImageIsBuiltFromAnExistingDockerfile = (world) => {
  const entries = buildServicesList(world, {
    web: 'false',
    web_v3: 'true',
    gateway: 'false',
    agent: 'false',
    translator: 'false',
  });
  const entry = entries.find((candidate) => candidate.image === V3_IMAGE);
  if (!entry) {
    return [`la matrice d'images de docker.yml ne produit aucune entrée ${V3_IMAGE}`];
  }
  return existsSync(join(world.root, entry.dockerfile))
    ? []
    : [`${V3_IMAGE} est construite depuis ${entry.dockerfile}, qui n'existe pas`];
};

const theV3ImageIsNeverBuiltForTheLegacyAlone = (world) => {
  const entries = buildServicesList(world, {
    web: 'true',
    web_v3: 'false',
    gateway: 'false',
    agent: 'false',
    translator: 'false',
  });
  return entries.some((entry) => entry.image === V3_IMAGE)
    ? [`la matrice produit ${V3_IMAGE} alors que seul le legacy a changé`]
    : [];
};

const labelsOf = (compose, service) => {
  const block = blockOf(compose, `  ${service}:`);
  return block === null ? null : listValues(block, '    labels:');
};

const v3RuleOf = (world, dep) => regleDuRouteur(dep.source(world), dep.v3);

// SENS (a) — rien de ce que la zone sert à la RACINE n'échappe à la règle.
const noRootServedAssetEscapesTheZone = (dep) => (world) => {
  const rule = v3RuleOf(world, dep);
  if (rule === null) return [];
  const claimed = cheminsReclames(rule);
  const remedy =
    `l'ajouter nommément à la règle du routeur ${dep.v3} (il est alors VOLÉ au legacy), ` +
    `ou le faire passer par le pipeline webpack pour qu'il atterrisse sous ${V3_ASSET_ZONE}/static/media/`;
  return [
    ...world.zone.publicFiles.map((url) => [
      url,
      `${V3_PUBLIC_DIRECTORY}${url} est servi à la RACINE`,
    ]),
    ...world.zone.metadataUrls.map((url) => [
      url,
      `${url} est un fichier de métadonnées servi à la RACINE`,
    ]),
  ]
    .filter(([url]) => !claimed.some((claim) => capture(claim, url)))
    .map(
      ([url, constat]) =>
        `${constat} de l'URL — assetPrefix ne préfixe que ${V3_ASSET_ZONE} — donc derrière Traefik ` +
        `c'est le LEGACY qui répond à ${url}. Remède : ${remedy}.`,
    );
};

// SENS (b) — la règle ne réclame au legacy que des chemins que la zone SERT.
const theRouterClaimsNothingTheZoneDoesNotServe = (dep) => (world) => {
  const rule = v3RuleOf(world, dep);
  if (rule === null) return [];
  const served = [
    ...world.zone.routeUrls,
    ...world.zone.metadataUrls,
    ...world.zone.publicFiles,
  ];
  return cheminsReclames(rule)
    .filter((claim) => !claim.valeur.startsWith(V3_ASSET_ZONE))
    .filter((claim) => !served.some((url) => capture(claim, url)))
    .map((claim) =>
      claim.valeur === V3_PATH_PREFIX
        ? `la règle réclame ${V3_PATH_PREFIX} nu alors que la zone n'y sert que ${V3_ASSET_ZONE} : ` +
          `tout autre chemin sous ${V3_PATH_PREFIX} répondrait le 404 anglais du routeur Pages ` +
          `(sans <html lang>, sans le script anti-flash de thème)`
        : `la règle réclame ${claim.valeur}, que rien dans ${V3_DIRECTORY}/app ne sert : ` +
          `ce chemin est pris au legacy pour y répondre 404`,
    );
};

// Le COPY du runner et l'existence de public/ vont ENSEMBLE, dans les deux sens.
/**
 * LE WORKER LEGACY S'EFFACE DEVANT TOUT CE QUE LE ROUTEUR RÉCLAME (§ 4.4 bis).
 *
 * Traefik n'est pas le seul aiguilleur de l'origine : `apps/web/public/sw.js`
 * est enregistré sur `scope: '/'` et sa branche « App Shell » répond
 * `cachedResponse || fetchPromise` à toute NAVIGATION. Un chemin basculé côté
 * routeur mais absent de `V3_ZONE_PREFIXES` est donc servi par la v3 aux
 * navigateurs NEUFS et par le cache du legacy aux REVENANTS — et le retour
 * arrière du § 4.3 y est inerte.
 *
 * CE QUE CE GARDE AJOUTE À CELUI QUI EXISTAIT. `apps/web/__tests__/public/
 * sw.v3-zone.test.ts` posait déjà la question, avec deux angles morts que la
 * bascule de staging a traversés tous les deux :
 *
 *   1. il ne lit que `docker-compose.prod.yml` et le routeur `frontend-v3`,
 *      alors que la bascule se joue sur `frontend-v3-staging` ;
 *   2. son extraction ne connaît que `PathPrefix(…)` et jette `Path(…)` sans
 *      un mot — or `Path(`/`)` est précisément la forme de l'étape « la
 *      vitrine ».
 *
 * Résultat mesuré : `/` a été réclamé par le routeur de staging sans jamais
 * entrer dans `V3_ZONE_PREFIXES`, et aucun témoin n'a rougi. C'est le défaut
 * de #4630 rejoué sur un autre axe — un garde paramétré par le DÉPLOIEMENT ne
 * suffit pas si le second lecteur de la même donnée, lui, ne l'est pas.
 *
 * LE PRÉDICAT N'EST PAS RECOPIÉ : il est EXÉCUTÉ. `belongsToV3Zone` et sa
 * liste sont extraits de la source de production et évalués tels quels — une
 * réécriture ici serait la quatrième lecture de cette donnée, et la plus
 * dangereuse, puisqu'elle prétendrait garder la divergence.
 */
const zoneDuWorker = (source) => {
  const bloc = source.match(
    /const V3_ZONE_PREFIXES = \[[^\]]*\];[\s\S]*?function belongsToV3Zone\(pathname\) \{[\s\S]*?\n\}/,
  );
  if (bloc === null) return null;
  return new Function(
    `${bloc[0]}\nreturn { prefixes: V3_ZONE_PREFIXES, couvre: belongsToV3Zone };`,
  )();
};

const leWorkerLegacySEfface = (dep) => (world) => {
  const rule = v3RuleOf(world, dep);
  if (rule === null) return [];

  const zone = zoneDuWorker(world.worker);
  if (zone === null) {
    return [
      `${WORKER_LEGACY} : ni V3_ZONE_PREFIXES ni belongsToV3Zone ne s'y lisent sous la forme ` +
        `attendue — la frontière de zone du worker ne peut plus être opposée à la règle du ` +
        `routeur ${dep.v3}, et son absence de verdict ressemblerait à un verdict favorable`,
    ];
  }

  return cheminsReclames(rule)
    .filter(({ valeur }) => !zone.couvre(valeur))
    .map(
      ({ matcher, valeur }) =>
        `${dep.fichier} : le routeur ${dep.v3} réclame ${matcher}(\`${valeur}\`) que ` +
        `V3_ZONE_PREFIXES de ${WORKER_LEGACY} ne couvre pas (${zone.prefixes.join(', ')}). ` +
        `Le worker legacy, enregistré sur scope:'/', continue d'intercepter cette navigation ` +
        `chez tout visiteur revenant : la v3 est servie aux navigateurs NEUFS seulement, et le ` +
        `retour arrière du § 4.3 y est inerte. Remède (§ 4.4 bis, ordre dans UN sens) : ajouter ` +
        `le préfixe à V3_ZONE_PREFIXES dans un commit ANTÉRIEUR, le DÉPLOYER, puis seulement ` +
        `l'ajouter au routeur`,
    );
};

/**
 * AUCUN `PathPrefix` NE VOLE UNE ROUTE VOISINE DU LEGACY.
 *
 * `PathPrefix` de Traefik est un préfixe de CHAÎNE, pas de SEGMENTS : la règle
 * qui réclame `PathPrefix(`/l`)` pour l'écran d'un lien réclame aussi `/login`,
 * `/links` et `/lien`. Mesuré sur staging le 2026-09-01 — les trois étaient
 * servis par la zone, donc par le 404 du routeur Pages de la v3, alors que le
 * legacy les sert. `/login` est l'appel à l'action de la vitrine : il était mort
 * depuis la bascule de l'étape 2, et la production n'y échappait que parce que
 * sa règle n'a pas encore franchi l'étape 1.
 *
 * POURQUOI RIEN NE L'AVAIT VU. Les trois lecteurs de cette règle modélisaient
 * `PathPrefix` comme un préfixe SEGMENTÉ — un modèle plus prudent que la
 * réalité, donc un modèle qui DÉCLARE une frontière que l'aiguilleur ne trace
 * pas. L'invariant « la règle ne réclame que des chemins servis » regardait les
 * VALEURS réclamées (`/l` est bien servi) ; celui-ci regarde ce que ces valeurs
 * EMPORTENT. C'est la question du § 4.4 bis posée dans l'autre sens : non pas
 * « ce que je bascule est-il servi ? » mais « qu'est-ce qui bascule AVEC ? ».
 *
 * Le remède est dans l'écriture de la règle : un `PathPrefix` destiné à un
 * sous-chemin porte sa barre finale (`/l/`), qui rend le préfixe de chaîne et le
 * préfixe de segments équivalents.
 */
const aucunPrefixeNeVoleUneRouteVoisine = (dep) => (world) => {
  const rule = v3RuleOf(world, dep);
  if (rule === null) return [];

  const servies = new Set(world.zone.routeUrls);

  return cheminsReclames(rule)
    .filter(({ matcher }) => matcher === 'PathPrefix')
    .flatMap(({ valeur }) =>
      world.legacyRoutes
        .filter((route) => route !== valeur && route.startsWith(valeur) && !servies.has(route))
        .map(
          (route) =>
            `${dep.fichier} : le routeur ${dep.v3} réclame PathPrefix(\`${valeur}\`), et ` +
            `PathPrefix de Traefik est un préfixe de CHAÎNE — il emporte donc ${route}, que ` +
            `${LEGACY_APP_DIRECTORY} sert et que la zone NE sert pas. Le visiteur y reçoit le 404 ` +
            `du routeur Pages de la v3. Remède : écrire le préfixe avec sa barre finale ` +
            `(PathPrefix(\`${valeur}/\`)), ou servir ${route} depuis la zone`,
        ),
    );
};

const theRunnerShipsWhatPublicHolds = (world) => {
  const copies = /^COPY --from=builder[^\n]*\/app\/public\s+\.\/public\s*$/m.test(world.dockerfile);
  const held = world.zone.publicFiles.length;
  if (held > 0 && !copies) {
    return [
      `${V3_PUBLIC_DIRECTORY}/ contient ${held} fichier(s) et l'étage runner ne les copie pas : ` +
        `output:'standalone' ne recopie pas public/, donc ils n'entrent pas dans l'image`,
    ];
  }
  if (held === 0 && copies) {
    return [
      `l'étage runner copie /app/public alors que ${V3_PUBLIC_DIRECTORY}/ n'existe pas — ` +
        `le docker build échouera sur ce COPY`,
    ];
  }
  return [];
};

const noSourceFileOfTheV3IsGitIgnored = (world) =>
  world.zone.gitIgnoredSources.map(
    ({ path, source, pattern }) =>
      `${path} est emporté par « ${pattern} » (${source}) : il manque au clone, et c'est ` +
      `le type-check BLOQUANT de ${V3_WORKSPACE} qui tombe. Poser une négation ciblée, ou ` +
      `demander cet ignore depuis ${V3_DIRECTORY}/.gitignore si le fichier est vraiment un artefact`,
  );

const leDeploiementRouteLaV3 = (dep) => (world) => {
  const labels = labelsOf(dep.source(world), dep.v3);
  if (labels === null) {
    return [`${dep.fichier} ne déclare aucun service ${dep.v3}`];
  }
  const rule = labels.find((label) =>
    label.startsWith(`traefik.http.routers.${dep.v3}.rule=`),
  );
  const failures = [];
  if (rule === undefined || !rule.includes(`PathPrefix(\`${V3_ASSET_ZONE}\`)`)) {
    failures.push(`le routeur ${dep.v3} ne porte pas PathPrefix(\`${V3_ASSET_ZONE}\`)`);
  }
  if (!labels.includes(`traefik.http.routers.${dep.v3}.priority=100`)) {
    failures.push(`le routeur ${dep.v3} ne prend pas le pas sur le plancher legacy`);
  }
  if (
    !labels.includes(
      `traefik.http.services.${dep.v3}.loadbalancer.server.port=${V3_PORT}`,
    )
  ) {
    failures.push(`le service ${dep.v3} n'est pas servi sur le port ${V3_PORT}`);
  }
  if (!labels.includes(`traefik.http.routers.${dep.v3}.entrypoints=websecure`)) {
    failures.push(`le routeur ${dep.v3} n'entre pas par websecure`);
  }
  return failures;
};

const theLegacyRouterKeepsItsFloor = (dep) => (world) => {
  const labels = labelsOf(dep.source(world), dep.legacy);
  if (labels === null) {
    return [`${dep.fichier} ne déclare plus le service ${dep.legacy}`];
  }
  const rule = labels.find((label) =>
    label.startsWith(`traefik.http.routers.${dep.legacy}.rule=`),
  );
  const failures = [];
  if (!labels.includes(`traefik.http.routers.${dep.legacy}.priority=1`)) {
    failures.push(`le routeur ${dep.legacy} a perdu sa priorité de plancher (1)`);
  }
  if (rule !== undefined && rule.includes('PathPrefix')) {
    failures.push(`le routeur ${dep.legacy} restreint ses chemins — il doit rester attrape-tout`);
  }
  return failures;
};

/**
 * Les variables dont l'ABSENCE du service est SÛRE — nommées ici, une par une,
 * avec leur raison. Une exemption qui se tait ne se relit pas.
 */
const ENV_REPLI_SUR = new Map([
  ['NODE_ENV', "posée par le Dockerfile (ENV NODE_ENV=production) et par Next lui-même"],
]);

const environmentOf = (compose, service) => {
  const block = blockOf(compose, `  ${service}:`);
  return block === null ? null : listValues(block, '    environment:').map((entry) => entry.split('=')[0]);
};

// Le CONTRAT D'ENVIRONNEMENT de la zone, gardé comme le sont ses chemins servis.
//
// Le défaut qui l'appelle : `/l/:token` est le premier code v3 qui lit
// l'environnement à l'exécution, et le service n'en déclarait aucune variable.
// `baseDeLaPasserelle()` retombait donc sur `http://localhost:3000` — dans le
// conteneur, le conteneur LUI-MÊME —, et la route rendait 503 pour tout le
// monde. Le manque de `PathPrefix('/l')` le MASQUAIT : le jour où la règle du
// routeur réclame ce chemin, la route devient joignable et échoue partout, sans
// qu'aucun autre invariant ne dise pourquoi.
//
// La question n'est donc pas « la variable est-elle lue ? » mais « le repli qui
// s'applique quand elle manque est-il celui du DÉPLOIEMENT ? ». Un repli codé en
// dur dans une source est, par construction, celui du poste de développement :
// il ne peut pas répondre pour l'image. D'où la règle — chaque chaîne de replis
// lue par `app/` ou `lib/` a au moins une variable déclarée sur le service —, et
// une exemption qui se NOMME plutôt qu'un silence.
const theV3ServiceDeclaresWhatItsCodeReads = (dep) => (world) => {
  const declared = environmentOf(dep.source(world), dep.v3);
  if (declared === null) return [];
  return world.envChains
    .filter(
      ({ variables }) =>
        !variables.some((name) => declared.includes(name) || ENV_REPLI_SUR.has(name)),
    )
    .map(
      ({ file, variables }) =>
        `${file} lit ${variables.join(' ?? ')} et aucune de ces variables n'est déclarée sur le ` +
        `service ${dep.v3} de ${dep.fichier} : dans le conteneur c'est le repli codé ` +
        `en dur de la source qui s'applique, c'est-à-dire celui du poste de développement`,
    );
};

const theV3ContainerIsDisjointFromTheLegacy = (dep) => (world) => {
  const block = blockOf(dep.source(world), `  ${dep.v3}:`);
  if (block === null) return [];
  const failures = [];
  if (!new RegExp(`^\\s*image:.*${V3_IMAGE}`, 'm').test(block)) {
    failures.push(`le service ${dep.v3} ne tire pas l'image ${V3_IMAGE}`);
  }
  if (!new RegExp(`^\\s*container_name:\\s*meeshy-${dep.v3}\\s*$`, 'm').test(block)) {
    failures.push(`le service ${dep.v3} ne porte pas son propre nom de conteneur`);
  }
  return failures;
};

/**
 * **Une suite e2e qui existe est une suite e2e LANCÉE.**
 *
 * Le dépôt a payé cette leçon deux fois — les commentaires des jobs `a11y-v3`
 * et `lifecycle-v3` la portent mot pour mot : « un instrument déclaré n'est pas
 * un instrument lancé ». Elle n'avait pourtant pas été appliquée à la troisième
 * famille : `v3-network-vitals.spec.ts` et `v3-lien-expire.spec.ts` vivaient
 * dans le dépôt, passaient (19/19 en local), et AUCUN job ne les lançait. Elles
 * portent les critères de fin de #4495 et #4496 — deux issues qu'aucun gate ne
 * pouvait donc prouver.
 *
 * Ce contrôle ne compte pas les suites : il les DÉRIVE du disque et vérifie que
 * chacune est atteinte. Une énumération aurait rejoué le défaut au premier
 * fichier suivant.
 *
 * La couverture se calcule comme Playwright la calcule : une suite est atteinte
 * si un script invoqué par ci.yml la nomme, ou si elle appartient au projet
 * qu'il lance — `pages` par sa liste, `chaines` par le complément de cette même
 * liste (`testIgnore`), qui est ce qui fait entrer d'office toute suite neuve.
 */
const everyV3SuiteIsLaunched = (world) => {
  const listeDePages = /const SUITES_DE_PAGE\s*=\s*\[([^\]]*)\]/.exec(world.playwright);
  if (listeDePages === null) {
    return ["playwright.config.ts ne déclare plus SUITES_DE_PAGE : la couverture par projet n'est plus calculable"];
  }
  const suitesDePage = new Set(
    [...listeDePages[1].matchAll(/([A-Za-z0-9._-]+\.spec\.ts)/g)].map((m) => m[1]),
  );
  if (world.suites.length === 0) {
    return ['aucune suite e2e trouvée sous e2e/visual : le contrôle garderait le vide'];
  }

  const scripts = JSON.parse(world.v3Package).scripts ?? {};
  // Les CORPS D'ÉTAPES, jamais le fichier entier : le commentaire du job
  // `chaines-v3` nomme `test:chaines` pour expliquer pourquoi il existe, et un
  // `world.ci.includes(...)` le prenait pour une invocation. Ce contrôle est
  // né mort à sa première écriture, et c'est son propre doc-comment qui
  // l'aveuglait — vérifié en retirant l'invocation : la garde restait verte.
  const etapes = stepsOf(world.ci);
  const lances = Object.entries(scripts).filter(
    ([nom, corps]) => /playwright|run e2e/.test(corps) && etapes.some((e) => e.body.includes(nom)),
  );

  const atteintes = new Set();
  for (const [, corps] of lances) {
    for (const suite of world.suites) {
      if (corps.includes(suite)) atteintes.add(suite);
    }
    if (/--project=pages/.test(corps)) {
      for (const suite of world.suites) if (suitesDePage.has(suite)) atteintes.add(suite);
    }
    if (/--project=chaines/.test(corps)) {
      for (const suite of world.suites) if (!suitesDePage.has(suite)) atteintes.add(suite);
    }
  }

  return world.suites
    .filter((suite) => !atteintes.has(suite))
    .map((suite) => `la suite e2e ${suite} n'est lancée par aucune étape de ci.yml`);
};

const CHECKS = [
  ['le type-check de la v3 est BLOQUANT', theV3TypeCheckIsBlocking],
  ['le lint de la v3 est BLOQUANT', theV3LintIsBlocking],
  ['toute suite e2e de la v3 est LANCÉE', everyV3SuiteIsLaunched],
  ["aucune étape nommant la v3 n'est amnistiée", noV3StepIsAmnestied],
  ['le ratchet de dette ne connaît pas la v3', theDebtRatchetIgnoresTheV3],
  ['la matrice de tests porte la v3', theTestMatrixCarriesTheV3],
  ['le filtre de chemins de docker.yml couvre les deux zones', theDockerPathFilterCoversBothZones],
  ["aucune source de la v3 n'atteint le disque hors de son paquet", noV3SourceReachesOutsideItsPackage],
  ["tout paquet déclaré par la v3 voyage dans son image", everyDeclaredPackageTravelsInTheImage],
  ["tout paquet déclaré par la v3 reconstruit son image", everyDeclaredPackageRebuildsTheV3Image],
  ['un push sur la v3 construit la v3, et elle seule', aV3CommitBuildsOnlyTheV3],
  ['un push sur le legacy construit le legacy, et lui seul', aLegacyCommitBuildsOnlyTheLegacy],
  ['un push sur packages/shared construit les deux zones', aSharedCommitBuildsBothZones],
  ['le dispatch de la v3 laisse le legacy tranquille', theV3DispatchLeavesTheLegacyAlone],
  ['le dispatch du legacy laisse la v3 tranquille', theLegacyDispatchLeavesTheV3Alone],
  ['le dispatch « all » construit la v3', theAllDispatchBuildsTheV3],
  ['chaque option du dispatch sélectionne un service', everyDispatchOptionSelectsAService],
  ["l'image de la v3 se construit depuis un Dockerfile existant", theV3ImageIsBuiltFromAnExistingDockerfile],
  ["l'image de la v3 ne se construit pas pour le legacy seul", theV3ImageIsNeverBuiltForTheLegacyAlone],
  // Les invariants de ROUTAGE, une fois par déploiement qui sert la zone.
  // Déroulés plutôt que recopiés : c'est la recopie qui avait laissé staging
  // hors surface (#4630), et un troisième déploiement repartirait du même
  // angle mort.
  ...DEPLOIEMENTS.flatMap((dep) => [
    [`${dep.fichier} route la v3 derrière son PathPrefix`, leDeploiementRouteLaV3(dep)],
    [`${dep.fichier} : le routeur legacy garde son plancher attrape-tout`, theLegacyRouterKeepsItsFloor(dep)],
    [`${dep.fichier} : le conteneur de la v3 est disjoint du legacy`, theV3ContainerIsDisjointFromTheLegacy(dep)],
    [`${dep.fichier} : le service de la v3 déclare ce que son code lit`, theV3ServiceDeclaresWhatItsCodeReads(dep)],
    [`${dep.fichier} : aucun actif servi à la racine n'échappe à la zone`, noRootServedAssetEscapesTheZone(dep)],
    [`${dep.fichier} : la règle ne réclame que des chemins servis`, theRouterClaimsNothingTheZoneDoesNotServe(dep)],
    [`${dep.fichier} : le worker legacy s'efface devant ce que la règle réclame`, leWorkerLegacySEfface(dep)],
    [`${dep.fichier} : aucun PathPrefix ne vole une route voisine du legacy`, aucunPrefixeNeVoleUneRouteVoisine(dep)],
  ]),
  ["l'image embarque ce que public/ contient", theRunnerShipsWhatPublicHolds],
  ["aucun fichier source de la v3 n'est ignoré par git", noSourceFileOfTheV3IsGitIgnored],
];

const inspect = (world) =>
  CHECKS.flatMap(([title, check]) => {
    try {
      return check(world).map((failure) => `${title} → ${failure}`);
    } catch (error) {
      return [`${title} → le contrôle n'a pas pu être déroulé : ${error.message}`];
    }
  });

// --- self-test --------------------------------------------------------------

const mutate = (world, apply) => {
  const copy = structuredClone(world);
  apply(copy);
  return copy;
};

const replaceIn = (world, key, needle, replacement) => {
  world[key] = world[key].replace(needle, replacement);
};

const MUTATIONS = [
  [
    // La sonde attendait `/login` tant que le legacy le servait seul. Depuis
    // que la zone le sert, l'invariant ne le compte PLUS comme volé — et il a
    // raison. `/links`, lui, reste au legacy : c'est la victime qui subsiste,
    // et la sonde suit la réalité plutôt que sa formulation d'origine.
    'la barre finale retirée du PathPrefix de /l/ sur staging',
    (world) => replaceIn(world, 'staging', 'PathPrefix(`/l/`)', 'PathPrefix(`/l`)'),
    'il emporte donc /links',
  ],
  [
    'un préfixe retiré de V3_ZONE_PREFIXES sans être retiré du routeur',
    (world) => replaceIn(world, 'worker', /'\/l'/, "'/rien'"),
    "réclame PathPrefix(`/l/`) que V3_ZONE_PREFIXES",
  ],
  [
    'le type-check de la v3 retiré de ci.yml',
    (world) =>
      replaceIn(world, 'ci', /^\s*run:.*type-check.*$/m, (line) =>
        line.replace(` --filter=${V3_WORKSPACE}`, ''),
      ),
    `aucune étape de ci.yml ne lance le type-check de ${V3_WORKSPACE}`,
  ],
  [
    'le type-check de la v3 amnistié',
    (world) =>
      replaceIn(
        world,
        'ci',
        /( +)- name: (Type-check[^\n]*blocking[^\n]*)\n/,
        '$1- name: $2\n$1  continue-on-error: true\n',
      ),
    'type-checke la v3 avec continue-on-error: true',
  ],
  [
    'le lint de la v3 rendu à l\'amnistie du legacy',
    (world) =>
      replaceIn(world, 'ci', /^ +- name: Lint \(apps\/web-v3[^\n]*\n +run:[^\n]*\n/m, ''),
    `aucune étape de ci.yml ne lint ${V3_WORKSPACE}`,
  ],
  [
    'la v3 glissée dans le ratchet de dette',
    (world) =>
      replaceIn(
        world,
        'ci',
        'bash scripts/check-type-debt.sh --self-test',
        `bash scripts/check-type-debt.sh --self-test ${V3_DIRECTORY}`,
      ),
    'fait entrer la v3 dans le ratchet de dette',
  ],
  [
    'la v3 retirée de la matrice de tests',
    (world) => replaceIn(world, 'ci', `filter: '${V3_WORKSPACE}'`, "filter: '@meeshy/zz'"),
    `aucune entrée de la matrice de tests ne porte filter: '${V3_WORKSPACE}'`,
  ],
  [
    'le glob de la v3 retiré des paths de docker.yml',
    (world) => replaceIn(world, 'docker', "      - 'apps/web-v3/**'\n", ''),
    'le filtre paths de docker.yml ne couvre pas la v3',
  ],
  [
    'la table de jetons ré-importée par chemin relatif hors du paquet',
    (world) =>
      world.escapes.push({
        file: `${V3_DIRECTORY}/app/globals.css`,
        request: '../../../packages/design-tokens/tokens.css',
        target: 'packages/design-tokens/tokens.css',
      }),
    'par le chemin relatif',
  ],
  [
    'le paquet déclaré retiré du Dockerfile',
    (world) => replaceIn(world, 'dockerfile', /^COPY packages\/[^\n]*\n/m, ''),
    "n'entre jamais dans l'image",
  ],
  [
    'le paquet déclaré retiré des paths de docker.yml',
    (world) => replaceIn(world, 'docker', /^ +- 'packages\/design-tokens\/\*\*'\n/m, ''),
    'le filtre paths de docker.yml ne couvre pas packages/design-tokens/**',
  ],
  [
    'le détecteur de push aveugle au paquet déclaré',
    (world) => replaceIn(world, 'docker', /\*"packages\/design-tokens\/"\*/g, '*"packages/zz/"*'),
    'un push ne touchant que packages/design-tokens/',
  ],
  [
    'le détecteur de push aveugle à la v3',
    (world) => replaceIn(world, 'docker', /\*"apps\/web-v3\/"\*/g, '*"apps/zz-absent/"*'),
    'un push ne touchant que apps/web-v3/',
  ],
  [
    'la sélection du dispatch revenue à la sous-chaîne',
    (world) => replaceIn(world, 'docker', /\*",web,"\*/g, '*"web"*'),
    'un dispatch « web-v3 »',
  ],
  [
    "l'entrée d'image de la v3 retirée de la matrice",
    (world) => replaceIn(world, 'docker', new RegExp(`"image":"${V3_IMAGE}"`, 'g'), '"image":"zz"'),
    `la matrice d'images de docker.yml ne produit aucune entrée ${V3_IMAGE}`,
  ],
  [
    'la v3 construite depuis un Dockerfile absent',
    (world) =>
      replaceIn(
        world,
        'docker',
        `./${V3_DIRECTORY}/Dockerfile`,
        `./${V3_DIRECTORY}/Dockerfile.absent`,
      ),
    "qui n'existe pas",
  ],
  [
    'le PathPrefix de la v3 retiré du routeur de production',
    (world) => replaceIn(world, 'prod', ` && (PathPrefix(\`${V3_ASSET_ZONE}\`))`, ''),
    `le routeur ${V3_ROUTER} ne porte pas PathPrefix`,
  ],
  [
    "un actif déposé dans public/ sans être réclamé par la règle",
    (world) => world.zone.publicFiles.push('/sprite.svg'),
    `${V3_PUBLIC_DIRECTORY}/sprite.svg est servi à la RACINE`,
  ],
  [
    "un actif déposé dans public/ sans entrer dans l'image",
    (world) => world.zone.publicFiles.push('/sprite.svg'),
    "n'entrent pas dans l'image",
  ],
  [
    "un fichier de métadonnées de l'App Router ajouté hors de la règle",
    (world) => world.zone.metadataUrls.push('/robots.txt'),
    '/robots.txt est un fichier de métadonnées servi à la RACINE',
  ],
  [
    'la règle élargie au /__v3 nu, que rien ne sert',
    (world) =>
      replaceIn(
        world,
        'prod',
        `PathPrefix(\`${V3_ASSET_ZONE}\`)`,
        `PathPrefix(\`${V3_PATH_PREFIX}\`)`,
      ),
    `la règle réclame ${V3_PATH_PREFIX} nu`,
  ],
  [
    // La sonde portait `/l` — jusqu'à ce que la zone SERVE `/l/:token`, et elle
    // est devenue muette sans rien dire. Un fusible qui teste un chemin que le
    // paquet peut se mettre à servir s'éteint le jour où il le sert : il porte
    // donc un chemin que la zone ne sert PAS encore, et le déplacer fait partie
    // du lot qui publie ce chemin-là.
    'un chemin humain réclamé avant que la zone ne le serve',
    (world) =>
      replaceIn(
        world,
        'prod',
        `(PathPrefix(\`${V3_ASSET_ZONE}\`))`,
        `(PathPrefix(\`${V3_ASSET_ZONE}\`) || PathPrefix(\`/stories\`))`,
      ),
    'la règle réclame /stories, que rien dans',
  ],
  [
    "une déclaration de types de la v3 emportée par un ignore de la racine",
    (world) =>
      world.zone.gitIgnoredSources.push({
        path: `${V3_DIRECTORY}/scripts/check-app-router-built.d.mts`,
        source: '.gitignore',
        pattern: '**/*/*.d.*',
      }),
    'il manque au clone, et c\'est le type-check BLOQUANT',
  ],
  [
    'le COPY du public ajouté alors que la v3 n\'a pas de public/',
    (world) =>
      replaceIn(
        world,
        'dockerfile',
        'COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static',
        'COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static\n' +
          'COPY --from=builder --chown=nextjs:nodejs /app/public ./public',
      ),
    'le docker build échouera sur ce COPY',
  ],
  [
    'la v3 rendue à la priorité du plancher',
    (world) =>
      replaceIn(
        world,
        'prod',
        `traefik.http.routers.${V3_ROUTER}.priority=100`,
        `traefik.http.routers.${V3_ROUTER}.priority=1`,
      ),
    `le routeur ${V3_ROUTER} ne prend pas le pas sur le plancher legacy`,
  ],
  [
    'le routeur legacy restreint à un préfixe',
    (world) =>
      replaceIn(
        world,
        'prod',
        `traefik.http.routers.${LEGACY_ROUTER}.rule=Host(\`\${DOMAIN:-localhost}\`)`,
        `traefik.http.routers.${LEGACY_ROUTER}.rule=PathPrefix(\`/legacy\`) && Host(\`\${DOMAIN:-localhost}\`)`,
      ),
    'il doit rester attrape-tout',
  ],
  [
    "une variable d'environnement lue par la v3 et déclarée nulle part",
    (world) =>
      world.envChains.push({
        file: `${V3_DIRECTORY}/lib/api/zz.ts`,
        variables: ['MEESHY_ZZ_URL'],
      }),
    "aucune de ces variables n'est déclarée sur le service",
  ],
  [
    'la base de la passerelle retirée du service de production',
    (world) => replaceIn(world, 'prod', /^ +- MEESHY_GATEWAY_URL=[^\n]*\n/m, ''),
    'MEESHY_GATEWAY_URL',
  ],
  [
    "l'origine publique retirée du service de production",
    // Le legacy déclare la MÊME variable, plus haut dans le fichier : une
    // substitution non globale n'aurait retiré que la sienne, et la sonde
    // serait passée en croyant avoir désarmé la v3.
    (world) => replaceIn(world, 'prod', /^ +- NEXT_PUBLIC_FRONTEND_URL=[^\n]*\n/gm, ''),
    'NEXT_PUBLIC_FRONTEND_URL',
  ],
  [
    'le service v3 servi sur le port du legacy',
    (world) =>
      replaceIn(
        world,
        'prod',
        `traefik.http.services.${V3_ROUTER}.loadbalancer.server.port=${V3_PORT}`,
        `traefik.http.services.${V3_ROUTER}.loadbalancer.server.port=3100`,
      ),
    `n'est pas servi sur le port ${V3_PORT}`,
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
    console.error(`impossible de lire la chaîne d'intégration : ${error.message}`);
    return 1;
  }
  if (process.argv.includes('--self-test')) {
    return selfTest(world);
  }
  const failures = inspect(world);
  if (failures.length > 0) {
    failures.forEach((failure) => console.error(failure));
    console.error(`\n${failures.length} défaut(s) dans la chaîne d'intégration de ${V3_DIRECTORY}.`);
    return 1;
  }
  console.log(
    `${V3_DIRECTORY} : ${CHECKS.length} invariants tenus sur ci.yml, docker.yml, ` +
      `${DEPLOIEMENTS.map((dep) => dep.fichier).join(' et ')}.`,
  );
  return 0;
};

process.exit(await main());
