#!/usr/bin/env node
// Garde d'alignement bun.lock ↔ manifestes de workspace [L-0.5, issue #4397]
//
// POURQUOI IL VIT À LA RACINE, ET PAS DANS UN WORKSPACE
//
// L'invariant porte sur le `bun.lock` de la RACINE et sur TOUS les manifestes
// que la racine déclare comme workspaces. Sa surface est donc le dépôt, pas une
// app. Sa première écriture vivait dans les tests de l'ancienne refonte v3
// (retirée du dépôt depuis, #5994) : elle sortait de son propre workspace
// (`join(__dirname,'..','..','..')`), ne tournait dans AUCUNE CI, et serait
// morte en silence au premier renommage de son application. Un garde d'infrastructure
// hébergé par l'app la plus jeune du dépôt. Précédent retenu :
// `scripts/check-type-debt.sh`, gate de racine appelé par le job `quality`.
//
// POURQUOI L'ENTRÉE EST CALCULÉE DEPUIS LES GLOBS, ET PAS PAR UN PARCOURS DISQUE
//
// Un parcours du disque ramassait `tests/package.json` — que la racine ne
// déclare dans aucun glob (`apps/*`, `services/*`, `packages/*`), dont bun ne
// connaît aucune entrée et qui n'a pas de `node_modules` — et
// `packages/shared/prisma/client/package.json`, un manifeste GÉNÉRÉ et
// GITIGNORÉ. L'entrée du garde variait donc selon qu'un `prisma generate` avait
// tourné, et il exigeait un alignement sur un manifeste que bun n'installe
// jamais. L'ensemble est désormais exactement le graphe que bun gouverne.
// Le sort de `tests/` — l'y faire entrer, ou le supprimer — est l'issue #4418.
//
// POURQUOI LES DEUX SENS SONT TESTÉS
//
// La première écriture itérait les workspaces que `bun.lock` connaît DÉJÀ, puis
// lisait leur manifeste. Un manifeste que le lock n'a jamais vu n'était donc
// contrôlé par personne — le sens « manifeste → lock », c'est-à-dire le sens
// que le critère de fin nomme. Ce n'était pas théorique : `apps/web-v2` était
// exactement dans cet état, et le garde certifiait « aligné ».
//
// Les deux sens ensemble ont un effet de bord voulu : un `bun.lock` commité
// SANS l'arbre de fichiers qu'il décrit (ou l'inverse) rougit. Le lock et le
// disque ne peuvent plus diverger sur un clone propre sans que la CI le dise.
//
// POURQUOI LE CHAMP `version` D'UN WORKSPACE N'EST PLUS COMPARÉ [issue #5740]
//
// Il l'a été, et c'est ce qui a rendu le Quality gate rouge sur `main` à
// chaque commit `chore(release): version packages [skip ci]` (changesets bump
// les manifestes, jamais `bun.lock`). Mesuré avant de trancher : ni
// `bun install --ignore-scripts` ni `bun install --force --lockfile-only` ne
// réécrivent ce champ pour un paquet de workspace LOCAL — bun ne le traite
// simplement pas comme une donnée qu'un `install` rafraîchit. L'option
// « faire committer bun.lock par le processus de release » n'a donc pas de
// commande qui la rende vraie.
// Et la comparaison ne protégeait rien : `version` d'un workspace n'est
// référencé par AUCUNE autre entrée du lock (les dépendances internes
// résolvent en `workspace:*`, jamais par numéro), donc rien ne peut résoudre
// différemment selon sa valeur. Ce que la comparaison gardait, c'était du
// bruit de CI répété à chaque release, pas un invariant de résolution.
// `name`, lui, reste comparé : il compose `resolutionKeyFor` plus bas et une
// divergence dirait un workspace mal apparié — un fait de résolution, pas
// seulement de métadonnée.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

const INSTALLED_FIELDS = ['dependencies', 'devDependencies'];

// Ce que cette liste NOMME, la garde le protege ; le reste passe (#7294). Le
// lot #7277 a produit DEUX duplications de meme nature : celle de
// `@playwright/test` a fait rougir la CI parce qu'il etait inscrit ici, celle
// du virtualiseur est passee sans un mot. La difference n'etait pas une
// difference de danger, c'etait une difference d'inscription.
//
// Le critere d'entree, ecrit ici parce qu'il n'existait nulle part : un paquet
// entre dans cette liste quand DEUX copies de lui ne se valent pas une seule —
// parce qu'il porte un etat de module (React et son rendu), un cache partage
// (`idb-keyval`), un binaire telecharge (`@playwright/test`), ou l'etat de
// defilement d'une liste (`@tanstack/react-virtual`).
const TRACKED_PACKAGES = [
  'react',
  'react-dom',
  '@playwright/test',
  '@tanstack/react-virtual',
];

// Épingles de `overrides` posées SOUS une portée qu'un workspace déclare. Les
// monter change ce qui est installé pour tous les consommateurs transitifs :
// c'est un bump de dépendances avec ses propres gates, pas un alignement de
// lock. La dette est donc DÉCLARÉE ici et gardée dans les deux sens — une
// entrée qui cesse de contredire ses manifestes fait rougir ce garde, pour que
// la liste ne pourrisse pas en amnistie permanente. Sa résorption est l'issue
// #4417 ; cette liste doit finir vide.
const OVERRIDES_LAGGING_BEHIND_THEIR_MANIFESTS = ['dompurify', 'uuid'];

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const rangesAt = (document, field) =>
  Object.fromEntries(
    Object.entries(isRecord(document?.[field]) ? document[field] : {}).filter(
      ([, range]) => typeof range === 'string',
    ),
  );

const JSON_STRING = /("(?:\\.|[^"\\])*")/;

const stripTrailingCommas = (source) =>
  source
    .split(JSON_STRING)
    .map((chunk, index) => (index % 2 === 1 ? chunk : chunk.replace(/,(\s*[}\]])/g, '$1')))
    .join('');

const readJson = (absolutePath, transform = (source) => source) => {
  const parsed = JSON.parse(transform(readFileSync(absolutePath, 'utf8')));
  if (!isRecord(parsed)) {
    throw new Error(`${absolutePath} n'est pas un objet JSON`);
  }
  return parsed;
};

const expandWorkspaceGlobs = (patterns, root) =>
  patterns.flatMap((pattern) => {
    const segments = pattern.split('/');
    const star = segments.indexOf('*');
    if (star === -1) {
      return existsSync(join(root, pattern, 'package.json')) ? [pattern] : [];
    }
    if (star !== segments.length - 1) {
      throw new Error(`motif de workspace non géré par ce garde : ${pattern}`);
    }
    const parent = segments.slice(0, -1).join('/');
    if (!existsSync(join(root, parent))) {
      return [];
    }
    return readdirSync(join(root, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${parent}/${entry.name}`)
      .filter((directory) => existsSync(join(root, directory, 'package.json')))
      .sort();
  });

/**
 * **LE SECOND LOCKFILE** (#7303). Ce dépôt en porte DEUX : `bun.lock`, que la
 * CI installe par défaut, et `pnpm-lock.yaml`, dont Turborepo dépend
 * (`packageManager: pnpm@9.15.0`) et que le workflow prépare à chaque run.
 * Le second n'était gardé par RIEN — et il a dérivé en silence : au
 * 2026-09-21, il déclarait encore `vitest ^4.1.10` quand le manifeste disait
 * `^5.0.0`, **un majeur entier de retard**, sans qu'aucun rouge ne l'ait
 * jamais dit.
 *
 * On ne réécrit pas la question pour lui : c'est la MÊME — *chaque dépendance
 * déclarée résout-elle dans la portée que son manifeste annonce ?* Seul le
 * format diffère, et pnpm la rend plus directe que bun : il enregistre, à côté
 * de chaque version résolue, le `specifier:` du manifeste AU MOMENT DE
 * L'INSTALL. Une divergence entre ce champ et le manifeste EST la dérive, sans
 * aucune inférence.
 *
 * Analyseur minimal plutôt qu'une dépendance YAML : la section `importers:`
 * d'un lockfile v9 a une indentation strictement régulière (2 = répertoire,
 * 4 = champ, 6 = paquet, 8 = `specifier`/`version`), et ajouter un paquet à la
 * racine pour lire un fichier que cette garde surveille serait circulaire.
 */
const unquoteYaml = (value) =>
  /^'.*'$/.test(value) || /^".*"$/.test(value) ? value.slice(1, -1) : value;

const readPnpmImporters = (root) => {
  const absolutePath = join(root, 'pnpm-lock.yaml');
  if (!existsSync(absolutePath)) {
    return null;
  }
  const importers = {};
  let inside = false;
  let directory = null;
  let field = null;
  let name = null;
  for (const raw of readFileSync(absolutePath, 'utf8').split('\n')) {
    if (/^importers:\s*$/.test(raw)) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (raw.trim() === '') continue;
    if (/^\S/.test(raw)) break;
    const indent = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (indent === 2 && text.endsWith(':')) {
      directory = unquoteYaml(text.slice(0, -1));
      importers[directory] = {};
      field = null;
      name = null;
    } else if (indent === 4 && text.endsWith(':') && directory !== null) {
      field = text.slice(0, -1);
      importers[directory][field] = {};
      name = null;
    } else if (indent === 6 && text.endsWith(':') && field !== null) {
      name = unquoteYaml(text.slice(0, -1));
      importers[directory][field][name] = {};
    } else if (indent === 8 && name !== null) {
      const match = /^(specifier|version):\s*(.*)$/.exec(text);
      if (match !== null) {
        importers[directory][field][name][match[1]] = unquoteYaml(match[2].trim());
      }
    }
  }
  return importers;
};

const readWorld = (root) => {
  const rootManifest = readJson(join(root, 'package.json'));
  const patterns = Array.isArray(rootManifest.workspaces) ? rootManifest.workspaces : [];
  const manifests = [
    { directory: '', document: rootManifest },
    ...expandWorkspaceGlobs(patterns, root).map((directory) => ({
      directory,
      document: readJson(join(root, directory, 'package.json')),
    })),
  ];
  return {
    manifests,
    lock: readJson(join(root, 'bun.lock'), stripTrailingCommas),
    pnpm: readPnpmImporters(root),
  };
};

const manifestPathOf = (directory) =>
  directory === '' ? 'package.json' : `${directory}/package.json`;

const lockWorkspacesOf = (world) =>
  isRecord(world.lock.workspaces) ? world.lock.workspaces : {};

const lockPackagesOf = (world) => (isRecord(world.lock.packages) ? world.lock.packages : {});

const parseVersion = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
};

const isAtLeast = (version, floor) =>
  version[0] !== floor[0]
    ? version[0] > floor[0]
    : version[1] !== floor[1]
      ? version[1] > floor[1]
      : version[2] >= floor[2];

const sharesTheCaretLine = (version, floor) =>
  floor[0] !== 0
    ? version[0] === floor[0]
    : floor[1] !== 0
      ? version[0] === 0 && version[1] === floor[1]
      : version[0] === 0 && version[1] === 0 && version[2] === floor[2];

const sharesTheTildeLine = (version, floor) =>
  version[0] === floor[0] && version[1] === floor[1];

// `null` = portée que ce garde ne sait pas comparer (`>=`, `*`, alias, URL).
// Elle est alors ignorée plutôt que de faire planter le garde : un verdict
// absent est honnête, un faux verdict ne l'est pas.
const satisfies = (version, range) => {
  const resolved = parseVersion(version);
  if (resolved === null) {
    return null;
  }
  if (range.startsWith('^') || range.startsWith('~')) {
    const floor = parseVersion(range.slice(1));
    if (floor === null) {
      return null;
    }
    const line = range.startsWith('^')
      ? sharesTheCaretLine(resolved, floor)
      : sharesTheTildeLine(resolved, floor);
    return line && isAtLeast(resolved, floor);
  }
  return /^\d/.test(range) ? range === version : null;
};

const isInstallableRange = (range) => !range.startsWith('workspace:');

const floorOf = (range) => (/^[\^~]/.test(range) ? range.slice(1) : range);

const resolvedVersionOf = (entry) => {
  const specifier = Array.isArray(entry) ? entry[0] : undefined;
  return typeof specifier === 'string'
    ? specifier.slice(specifier.lastIndexOf('@') + 1)
    : undefined;
};

const dependencyNameOf = (lockKey) => {
  const segments = lockKey.split('/');
  const last = segments[segments.length - 1] ?? lockKey;
  const beforeLast = segments[segments.length - 2];
  return beforeLast !== undefined && beforeLast.startsWith('@') ? `${beforeLast}/${last}` : last;
};

const isNestedKey = (lockKey) =>
  lockKey.split('/').length > (lockKey.startsWith('@') ? 2 : 1);

const versionsResolvedFor = (world, dependency) => {
  const packages = lockPackagesOf(world);
  const keys = Object.keys(packages).filter(
    (key) => key === dependency || (isNestedKey(key) && dependencyNameOf(key) === dependency),
  );
  return [...new Set(keys.map((key) => resolvedVersionOf(packages[key])))]
    .filter((version) => version !== undefined)
    .sort();
};

const declarationsOf = (world, dependency) =>
  world.manifests.flatMap(({ directory, document }) =>
    [...DEPENDENCY_FIELDS, 'overrides'].flatMap((field) => {
      const range = rangesAt(document, field)[dependency];
      return range === undefined
        ? []
        : [{ site: `${manifestPathOf(directory)} ${field}`, range }];
    }),
  );

const everyWorkspaceOnDiskIsLocked = (world) => {
  const locked = lockWorkspacesOf(world);
  return world.manifests
    .filter(({ directory }) => !(directory in locked))
    .map(
      ({ directory }) =>
        `manifeste de workspace absent de bun.lock : ${manifestPathOf(directory)} — le lock n'a jamais vu ce workspace`,
    );
};

const everyLockedWorkspaceIsOnDisk = (world) => {
  const onDisk = new Set(world.manifests.map(({ directory }) => directory));
  return Object.keys(lockWorkspacesOf(world))
    .filter((directory) => !onDisk.has(directory))
    .map(
      (directory) =>
        `bun.lock déclare un workspace absent du graphe sur disque : ${directory || '.'} — arbre de fichiers et lock ont divergé`,
    );
};

const pairedWorkspaces = (world) => {
  const locked = lockWorkspacesOf(world);
  return world.manifests
    .filter(({ directory }) => isRecord(locked[directory]))
    .map(({ directory, document }) => ({ directory, document, locked: locked[directory] }));
};

// `version` en est exclu : voir « POURQUOI LE CHAMP version D'UN WORKSPACE
// N'EST PLUS COMPARÉ » en tête de fichier (#5740). `name`, lui, est comparé —
// il compose `resolutionKeyFor` plus bas, une divergence est un fait de
// résolution.
const lockRepeatsTheIdentityOfEachManifest = (world) =>
  pairedWorkspaces(world).flatMap(({ directory, document, locked }) =>
    ['name'].flatMap((field) =>
      document[field] === locked[field] ||
      document[field] === undefined ||
      locked[field] === undefined
        ? []
        : [
            `${manifestPathOf(directory)} ${field} : manifeste=${String(document[field])} lock=${String(locked[field] ?? '(absent)')}`,
          ],
    ),
  );

const lockRepeatsTheRangesOfEachManifest = (world) =>
  pairedWorkspaces(world).flatMap(({ directory, document, locked }) =>
    DEPENDENCY_FIELDS.flatMap((field) => {
      const declared = rangesAt(document, field);
      const inLock = rangesAt(locked, field);
      return [...new Set([...Object.keys(declared), ...Object.keys(inLock)])]
        .filter((name) => declared[name] !== inLock[name])
        .map(
          (name) =>
            `${manifestPathOf(directory)} ${field} ${name} : manifeste=${declared[name] ?? '(absent)'} lock=${inLock[name] ?? '(absent)'}`,
        );
    }),
  );

const rootOverridesOf = (world) => {
  const root = world.manifests.find(({ directory }) => directory === '');
  return root === undefined ? {} : rangesAt(root.document, 'overrides');
};

const lockRepeatsTheOverridesOfTheRoot = (world) => {
  const declared = rootOverridesOf(world);
  const inLock = rangesAt(world.lock, 'overrides');
  return [...new Set([...Object.keys(declared), ...Object.keys(inLock)])]
    .filter((name) => declared[name] !== inLock[name])
    .map(
      (name) =>
        `overrides ${name} : package.json=${declared[name] ?? '(absent)'} bun.lock=${inLock[name] ?? '(absent)'}`,
    );
};

const resolutionKeyFor = (world, workspaceName, dependency) => {
  const packages = lockPackagesOf(world);
  return [`${workspaceName}/${dependency}`, dependency].find(
    (key) => packages[key] !== undefined,
  );
};

const everyDirectDependencyResolvesInsideItsRange = (world) =>
  pairedWorkspaces(world).flatMap(({ directory, locked }) =>
    INSTALLED_FIELDS.flatMap((field) =>
      Object.entries(rangesAt(locked, field))
        .filter(([, range]) => isInstallableRange(range))
        .filter(([name]) => !OVERRIDES_LAGGING_BEHIND_THEIR_MANIFESTS.includes(name))
        .flatMap(([name, range]) => {
          const key = resolutionKeyFor(world, String(locked.name ?? ''), name);
          if (key === undefined) {
            return [`${manifestPathOf(directory)} ${name}@${range} : aucune résolution dans bun.lock`];
          }
          const version = resolvedVersionOf(lockPackagesOf(world)[key]);
          return version === undefined || satisfies(version, range) !== false
            ? []
            : [`${manifestPathOf(directory)} ${name} : déclare ${range}, résout ${version}`];
        }),
    ),
  );

const trackedPackagesShareOneFloor = (world) =>
  TRACKED_PACKAGES.flatMap((dependency) => {
    const sites = declarationsOf(world, dependency);
    const floors = new Set(sites.map(({ range }) => floorOf(range)));
    return floors.size <= 1
      ? []
      : [
          `${dependency} est déclaré sur ${floors.size} planchers : ${sites
            .map(({ site, range }) => `${site}=${range}`)
            .join(' · ')}`,
        ];
  });

const trackedPackagesResolveOnce = (world) =>
  TRACKED_PACKAGES.flatMap((dependency) => {
    const versions = versionsResolvedFor(world, dependency);
    return versions.length === 1
      ? []
      : [`${dependency} est résolu ${versions.length} fois dans bun.lock : ${versions.join(', ')}`];
  });

const trackedPackagesSatisfyEverySite = (world) =>
  TRACKED_PACKAGES.flatMap((dependency) => {
    const [version] = versionsResolvedFor(world, dependency);
    return declarationsOf(world, dependency)
      .filter(({ range }) => isInstallableRange(range))
      .filter(({ range }) => version === undefined || satisfies(version, range) === false)
      .map(({ site, range }) => `${site} déclare ${range}, résolu ${version ?? '(rien)'}`);
  });

const overridesContradictingAManifest = (world) =>
  [
    ...new Set(
      Object.entries(rootOverridesOf(world)).flatMap(([name, pinned]) =>
        world.manifests.flatMap(({ document }) =>
          DEPENDENCY_FIELDS.flatMap((field) => {
            const range = rangesAt(document, field)[name];
            return range === undefined ||
              !isInstallableRange(range) ||
              !/^\d/.test(pinned) ||
              satisfies(pinned, range) !== false
              ? []
              : [name];
          }),
        ),
      ),
    ),
  ].sort();

const noUndeclaredOverrideContradictsAManifest = (world) =>
  overridesContradictingAManifest(world)
    .filter((name) => !OVERRIDES_LAGGING_BEHIND_THEIR_MANIFESTS.includes(name))
    .map(
      (name) =>
        `overrides ${name} est épinglé sous une portée déclarée par un workspace, sans être inscrit dans OVERRIDES_LAGGING_BEHIND_THEIR_MANIFESTS`,
    );

const everyDeclaredLaggardStillLags = (world) => {
  const contradicting = new Set(overridesContradictingAManifest(world));
  return OVERRIDES_LAGGING_BEHIND_THEIR_MANIFESTS.filter(
    (name) => !contradicting.has(name),
  ).map(
    (name) =>
      `overrides ${name} ne contredit plus aucun manifeste : retirer ${name} de OVERRIDES_LAGGING_BEHIND_THEIR_MANIFESTS`,
  );
};

/**
 * LA MÊME QUESTION, POSÉE AU SECOND LOCKFILE (#7303).
 *
 * pnpm enregistre le `specifier:` du manifeste à côté de chaque version
 * résolue. La dérive se lit donc SANS inférence : le champ enregistré n'est
 * plus celui que le manifeste déclare. C'est exactement ce qui était vrai le
 * 2026-09-21 pour `vitest` (lock `^4.1.10`, manifeste `^5.0.0`) et `fastify`,
 * avant même le lot qui a élargi l'écart.
 *
 * `workspace:` est exclu comme ailleurs (`isInstallableRange`) : pnpm y écrit
 * `link:…`, qui ne se compare à aucune portée sémantique.
 */
const pnpmImporterOf = (world, directory) =>
  world.pnpm === null ? undefined : world.pnpm[directory === '' ? '.' : directory];

/**
 * DEUX SILENCES DE pnpm QUI SONT CORRECTS, et qu'il faut savoir avant de lire
 * ce garde — les deux ont fait rougir cette sonde à tort le jour où elle a été
 * écrite, et les deux ont été vérifiés dans le lockfile plutôt que devinés :
 *
 * 1. **un paquet déclaré dans DEUX champs n'est enregistré qu'une fois.**
 *    `apps/web` déclare `dotenv` en `dependencies` (^17.4.2) ET en
 *    `devDependencies` (^17.2.1) ; pnpm ne garde que le premier, ce qui est la
 *    règle. On cherche donc le paquet dans TOUS les champs de l'importer avant
 *    de le dire absent. (Que le manifeste se contredise est un défaut à part,
 *    dans le legacy, et ce n'est pas à ce garde de le juger.)
 * 2. **un workspace SANS dépendance JS n'a pas d'importer.**
 *    `services/translator` (Python) et `packages/design-tokens` (généré) en
 *    déclarent zéro. Un importer absent n'est donc un défaut que si le
 *    manifeste demande quelque chose.
 */
const pnpmEntryOf = (importer, name) => {
  for (const field of Object.keys(importer)) {
    const bucket = importer[field];
    if (isRecord(bucket) && isRecord(bucket[name])) {
      return bucket[name];
    }
  }
  return undefined;
};

/**
 * LES PORTÉES QUE LE GESTIONNAIRE HONORE RÉELLEMENT — dédupliquées par nom,
 * `INSTALLED_FIELDS` faisant foi dans son ordre (`dependencies` avant
 * `devDependencies`). Ce n'est pas un confort : npm, pnpm et bun appliquent
 * tous cette règle, et un lockfile n'enregistre donc qu'UNE portée par paquet.
 * Comparer la seconde déclaration ferait rougir ce garde pour une divergence
 * que le gestionnaire a, lui, déjà tranchée.
 *
 * Mesuré : `apps/web` déclare `dotenv` en `dependencies` (^17.4.2) ET en
 * `devDependencies` (^17.2.1). La seconde est MORTE — elle n'installe rien et
 * ment sur ce qui tourne. C'est un défaut de manifeste, pas de lockfile, et il
 * a son propre suivi ; ce garde-ci mesure l'alignement, pas la cohérence
 * interne d'un manifeste.
 */
const installableRangesOf = (document) => {
  const seen = new Set();
  return INSTALLED_FIELDS.flatMap((field) =>
    Object.entries(rangesAt(document, field))
      .filter(([, range]) => isInstallableRange(range))
      .filter(([name]) => (seen.has(name) ? false : seen.add(name))),
  );
};

const pnpmLockRepeatsTheRangesOfEachManifest = (world) =>
  world.pnpm === null
    ? []
    : world.manifests.flatMap(({ directory, document }) => {
        const declared = installableRangesOf(document);
        const importer = pnpmImporterOf(world, directory);
        if (importer === undefined) {
          return declared.length === 0
            ? []
            : [`${manifestPathOf(directory)} : aucun importer dans pnpm-lock.yaml`];
        }
        return declared.flatMap(([name, range]) => {
          const entry = pnpmEntryOf(importer, name);
          if (entry === undefined) {
            return [`${manifestPathOf(directory)} ${name}@${range} : absent de pnpm-lock.yaml`];
          }
          return entry.specifier === range || entry.specifier === undefined
            ? []
            : [
                `${manifestPathOf(directory)} ${name} : déclare ${range}, pnpm-lock.yaml a enregistré ${entry.specifier}`,
              ];
        });
      });

/** La version que pnpm a figée, débarrassée de ses suffixes de pair
 *  (`2.31.0(@types/node@26.1.1)`) — c'est la version installée qu'on compare. */
const pnpmResolvedVersionOf = (entry) => {
  const version = typeof entry.version === 'string' ? entry.version : undefined;
  if (version === undefined) return undefined;
  const cut = version.indexOf('(');
  return cut === -1 ? version : version.slice(0, cut);
};

const everyPnpmDependencyResolvesInsideItsRange = (world) =>
  world.pnpm === null
    ? []
    : world.manifests.flatMap(({ directory, document }) => {
        const importer = pnpmImporterOf(world, directory);
        if (importer === undefined) return [];
        return installableRangesOf(document).flatMap(([name, range]) => {
          const entry = pnpmEntryOf(importer, name);
          if (entry === undefined) return [];
          const version = pnpmResolvedVersionOf(entry);
          return version === undefined || satisfies(version, range) !== false
            ? []
            : [`${manifestPathOf(directory)} ${name} : déclare ${range}, pnpm-lock.yaml résout ${version}`];
        });
      });

const CHECKS = [
  ['chaque manifeste de workspace a son entrée dans bun.lock', everyWorkspaceOnDiskIsLocked],
  ['chaque workspace de bun.lock existe sur le disque', everyLockedWorkspaceIsOnDisk],
  ["bun.lock recopie le nom et la version de chaque manifeste", lockRepeatsTheIdentityOfEachManifest],
  ['bun.lock recopie les portées de chaque manifeste', lockRepeatsTheRangesOfEachManifest],
  ['bun.lock recopie les overrides de la racine', lockRepeatsTheOverridesOfTheRoot],
  [
    'chaque dépendance directe résout dans la portée déclarée',
    everyDirectDependencyResolvesInsideItsRange,
  ],
  ['un paquet suivi est déclaré sur UN plancher', trackedPackagesShareOneFloor],
  ['un paquet suivi est résolu à UNE version', trackedPackagesResolveOnce],
  ['un paquet suivi satisfait chaque site déclarant', trackedPackagesSatisfyEverySite],
  ['aucun override non déclaré ne contredit un manifeste', noUndeclaredOverrideContradictsAManifest],
  ['chaque retard déclaré est encore un retard', everyDeclaredLaggardStillLags],
  ['pnpm-lock.yaml recopie les portées de chaque manifeste', pnpmLockRepeatsTheRangesOfEachManifest],
  [
    'chaque dépendance directe résout dans la portée déclarée (pnpm)',
    everyPnpmDependencyResolvesInsideItsRange,
  ],
];

const inspect = (world) =>
  CHECKS.flatMap(([title, check]) => check(world).map((failure) => `${title} → ${failure}`));

const mutate = (world, apply) => {
  const copy = structuredClone(world);
  apply(copy);
  return copy;
};

/**
 * LA VERSION QUE TOUS LES MANIFESTES ACCEPTERAIENT, DÉRIVÉE — jamais écrite en
 * dur.
 *
 * La sonde « un retard déclaré qui a cessé de retarder » doit poser un override
 * qu'AUCUN manifeste ne contredit, pour vérifier que le garde réclame alors le
 * retrait du paquet de `OVERRIDES_LAGGING_BEHIND_THEIR_MANIFESTS`. Cette
 * version était un littéral, `8.5.26` — exactement ce qu'`apps/web` déclarait
 * le jour où la sonde a été écrite. Le jour où ce manifeste est passé à
 * `^8.5.28`, `8.5.26` a cessé de le satisfaire : la sonde est devenue AVEUGLE,
 * et le garde a perdu, en silence, le seul témoin qui surveillait sa propre
 * liste de retards déclarés.
 *
 * Un littéral qui encode une portée du moment rend l'écart permanent et
 * invisible (leçon 594). On dérive donc la version des manifestes, comme le
 * garde dérive déjà tout le reste : le plancher le plus haut parmi les portées
 * déclarées satisfait toutes les portées de la même ligne majeure.
 */
const versionEveryManifestWouldAccept = (world, name) => {
  const floors = world.manifests
    .flatMap(({ document }) =>
      DEPENDENCY_FIELDS.flatMap((field) => {
        const range = rangesAt(document, field)[name];
        return range === undefined || !isInstallableRange(range) ? [] : [range];
      }),
    )
    .map((range) => parseVersion(/^[\^~]/.test(range) ? range.slice(1) : range))
    .filter((version) => version !== null);
  const highest = floors.reduce(
    (winner, version) => (winner === null || isAtLeast(version, winner) ? version : winner),
    null,
  );
  return (highest ?? [0, 0, 0]).join('.');
};

/**
 * LA CIBLE DES SONDES pnpm, DÉRIVÉE — jamais un nom écrit en dur.
 *
 * Même raison que la version dérivée juste au-dessus (leçon 594) : un littéral
 * encode l'état du dépôt le jour où la sonde est écrite, et le jour où ce
 * paquet change de champ ou disparaît, la sonde devient AVEUGLE en silence.
 * On prend donc la première dépendance qui soit À LA FOIS déclarée par un
 * manifeste et enregistrée par `pnpm-lock.yaml` — s'il n'y en a aucune, il n'y
 * a rien à mesurer.
 */
const firstPnpmProbeTarget = (world) => {
  if (world.pnpm === null) return null;
  for (const { directory, document } of world.manifests) {
    const importer = pnpmImporterOf(world, directory);
    if (importer === undefined) continue;
    for (const [name] of installableRangesOf(document)) {
      for (const field of Object.keys(importer)) {
        const bucket = importer[field];
        if (isRecord(bucket) && isRecord(bucket[name])) {
          return { key: directory === '' ? '.' : directory, field, name };
        }
      }
    }
  }
  return null;
};

const MUTATIONS = [
  [
    "un manifeste de workspace que le lock n'a jamais vu",
    (world) => {
      world.manifests.push({
        directory: 'packages/zz-sonde',
        document: { name: '@meeshy/zz-sonde', version: '0.0.0' },
      });
    },
    'manifeste de workspace absent de bun.lock',
  ],
  [
    'une entrée de workspace retirée du lock',
    (world) => {
      delete world.lock.workspaces['apps/web'];
    },
    'manifeste de workspace absent de bun.lock',
  ],
  [
    'un workspace loqué mais absent du disque',
    (world) => {
      world.lock.workspaces['apps/zz-fantome'] = { name: '@meeshy/zz-fantome', version: '0.0.0' };
    },
    'bun.lock déclare un workspace absent du graphe sur disque',
  ],
  [
    'une portée de manifeste que le lock ne suit pas',
    (world) => {
      world.manifests.find(({ directory }) => directory === 'apps/web').document.dependencies[
        'idb-keyval'
      ] = '^0.0.1';
    },
    'idb-keyval : manifeste=^0.0.1',
  ],
  [
    'un override de la racine que le lock ne suit pas',
    (world) => {
      world.lock.overrides.react = '0.0.1';
    },
    'overrides react : package.json=',
  ],
  [
    'une résolution hors de la portée déclarée',
    (world) => {
      world.lock.packages.react = ['react@18.0.0', '', {}, 'sha512-sonde'];
    },
    'déclare 19.2.8, résout 18.0.0',
  ],
  [
    'un paquet suivi déclaré sur deux planchers',
    (world) => {
      world.manifests.find(({ directory }) => directory === 'packages/shared').document.devDependencies =
        {
          ...world.manifests.find(({ directory }) => directory === 'packages/shared').document
            .devDependencies,
          react: '^18.0.0',
        };
    },
    'react est déclaré sur 2 planchers',
  ],
  [
    'un paquet suivi résolu deux fois',
    (world) => {
      world.lock.packages['@meeshy/zz/react'] = ['react@18.0.0', '', {}, 'sha512-sonde'];
    },
    'react est résolu 2 fois',
  ],
  [
    'un override non déclaré qui contredit un manifeste',
    (world) => {
      const root = world.manifests.find(({ directory }) => directory === '');
      root.document.overrides = { ...root.document.overrides, preact: '1.0.0' };
    },
    'overrides preact est épinglé sous une portée déclarée',
  ],
  [
    'un retard déclaré qui a cessé de retarder',
    (world) => {
      const root = world.manifests.find(({ directory }) => directory === '');
      root.document.overrides = {
        ...root.document.overrides,
        uuid: versionEveryManifestWouldAccept(world, 'uuid'),
      };
    },
    'overrides uuid ne contredit plus aucun manifeste',
  ],
  [
    "une portée que pnpm-lock.yaml n'a pas suivie (la dérive de #7303)",
    (world) => {
      const target = firstPnpmProbeTarget(world);
      if (target === null) return;
      world.pnpm[target.key][target.field][target.name].specifier = '^0.0.0-sonde';
    },
    'pnpm-lock.yaml a enregistré',
  ],
  [
    'une dépendance déclarée que pnpm-lock.yaml ne connaît pas',
    (world) => {
      const target = firstPnpmProbeTarget(world);
      if (target === null) return;
      delete world.pnpm[target.key][target.field][target.name];
    },
    'absent de pnpm-lock.yaml',
  ],
  [
    'une version que pnpm-lock.yaml résout hors de la portée déclarée',
    (world) => {
      const target = firstPnpmProbeTarget(world);
      if (target === null) return;
      world.pnpm[target.key][target.field][target.name].version = '0.0.1';
    },
    'pnpm-lock.yaml résout',
  ],
];

// Le pendant positif de MUTATIONS : une divergence que ce garde doit TOLÉRER.
// Sans ce témoin, rien n'empêche une réécriture future de
// `lockRepeatsTheIdentityOfEachManifest` de réintroduire `version` en
// silence — #5740 redeviendrait rouge à chaque `chore(release)` sans qu'aucun
// self-test ne le voie venir.

const TOLERATED_MUTATIONS = [
  [
    'une version de manifeste que le lock ne suit pas (#5740 — aucune conséquence de résolution)',
    (world) => {
      world.manifests.find(({ directory }) => directory === 'apps/web').document.version =
        '999.0.0-sonde';
    },
  ],
];

const selfTest = (world) => {
  const blind = MUTATIONS.filter(
    ([, apply, expected]) =>
      !inspect(mutate(world, apply)).some((failure) => failure.includes(expected)),
  );
  blind.forEach(([title, , expected]) =>
    console.error(`AVEUGLE : « ${title} » n'a produit aucun échec contenant « ${expected} »`),
  );

  const overzealous = TOLERATED_MUTATIONS.filter(([, apply]) => inspect(mutate(world, apply)).length > 0);
  overzealous.forEach(([title]) =>
    console.error(`TROP STRICT : « ${title} » aurait dû rester silencieuse`),
  );

  const failing = blind.length + overzealous.length;
  const total = MUTATIONS.length + TOLERATED_MUTATIONS.length;
  if (failing > 0) {
    console.error(`\n${failing}/${total} sondes échouent.`);
    return 1;
  }
  console.log(`self-test : ${total}/${total} sondes correctes (${MUTATIONS.length} détectées, ${TOLERATED_MUTATIONS.length} tolérées).`);
  return 0;
};

const main = () => {
  const world = readWorld(REPO_ROOT);
  if (process.argv.includes('--self-test')) {
    return selfTest(world);
  }
  const failures = inspect(world);
  if (failures.length > 0) {
    failures.forEach((failure) => console.error(failure));
    console.error(
      `\n${failures.length} désalignement(s) entre les lockfiles et les manifestes de workspace.`,
    );
    console.error(
      "Rejouer : bun install --ignore-scripts ET pnpm install --lockfile-only, puis committer LES DEUX lockfiles avec l'arbre qu'ils décrivent.",
    );
    return 1;
  }
  console.log(
    `${world.pnpm === null ? 'bun.lock est aligné' : 'bun.lock ET pnpm-lock.yaml sont alignés'} sur les ${world.manifests.length} manifestes de workspace déclarés par la racine.`,
  );
  return 0;
};

process.exit(main());
