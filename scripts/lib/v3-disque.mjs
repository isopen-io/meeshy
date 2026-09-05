// La LECTURE DU DISQUE dont le garde de la chaîne d'intégration a besoin
// [correctif du lot des jetons].
//
// POURQUOI CE MODULE EXISTE
//
// `scripts/check-v3-pipeline.mjs` tient les INVARIANTS ; ce fichier tient la
// façon de les MESURER sur l'arbre de fichiers. La séparation n'est pas
// esthétique : le garde était à 1 092 lignes après l'ajout des trois invariants
// de frontière de paquet, c'est-à-dire à huit lignes du budget de 1 100
// (`CLAUDE.md` § Code Style). Le prochain invariant l'aurait fait déborder, et
// « on extrait d'abord, on ajoute ensuite ».
//
// Ce que le module rend est de la DONNÉE — des chemins, des noms de paquets,
// des requêtes relatives. Aucune loi n'est écrite ici.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const filesUnder = (directory, prefix = '') =>
  existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        return entry.isDirectory()
          ? filesUnder(join(directory, entry.name), relative)
          : [relative];
      })
    : [];

export const splitName = (name) => {
  const dot = name.lastIndexOf('.');
  return dot === -1
    ? { stem: name, extension: '' }
    : { stem: name.slice(0, dot), extension: name.slice(dot + 1) };
};

// --- ce que la v3 atteint HORS de son propre paquet --------------------------

const MODULE_EXTENSIONS = new Set(['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'css']);

const SKIPPED_TREES = new Set(['node_modules', '.next', 'coverage', '.swc', '.turbo']);

// `@import '…'` (CSS), `from '…'`, `import '…'`, `require('…')` — les quatre
// façons d'atteindre un fichier depuis une source. Seuls les chemins RELATIFS
// intéressent : un spécificateur de paquet passe par le manifeste, qui est
// justement l'endroit où le franchissement se déclare.
const RELATIVE_REQUEST = /(?:@import\s+|from\s+|import\s+|require\(\s*)['"](\.[^'"]*)['"]/g;

const normalise = (segments) =>
  segments.reduce((stack, segment) => {
    if (segment === '.' || segment === '') return stack;
    if (segment !== '..') return [...stack, segment];
    return stack.length === 0 ? stack : stack.slice(0, -1);
  }, []);

export const escapingRequests = (root, packageDirectory) =>
  filesUnder(join(root, packageDirectory))
    .filter((relative) => !relative.split('/').some((segment) => SKIPPED_TREES.has(segment)))
    .filter((relative) => MODULE_EXTENSIONS.has(splitName(relative).extension))
    .flatMap((relative) => {
      const source = readFileSync(join(root, packageDirectory, relative), 'utf8');
      const here = relative.split('/').slice(0, -1);
      return [...source.matchAll(RELATIVE_REQUEST)].flatMap((match) => {
        const target = normalise([packageDirectory, ...here, ...match[1].split('/')]).join('/');
        return target.startsWith(`${packageDirectory}/`) || target === packageDirectory
          ? []
          : [{ file: `${packageDirectory}/${relative}`, request: match[1], target }];
      });
    });

// --- ce que le code d'EXÉCUTION de la v3 lit dans son environnement ----------

// Les deux arbres dont le code TOURNE dans le conteneur. `scripts/`, `e2e/` et
// `__tests__/` en sont exclus : ils tournent sur une machine de développement ou
// dans un job de CI, où l'environnement est celui du poste et non celui de
// l'image.
const RUNTIME_TREES = ['app', 'lib'];

// Une CHAÎNE de replis, pas une variable isolée : `A ?? B ?? 'défaut'` se lit en
// une fois, parce que la question posée en aval est « au moins l'une d'elles
// est-elle déclarée ? ». Découpée en variables indépendantes, la lecture
// réclamerait la déclaration des DEUX, ce qui est faux — l'une est l'alternative
// de l'autre.
//
// DEUX NOTATIONS, UN SEUL TERME. `process.env.NOM` et `process.env['NOM']`
// lisent la MÊME chose — la seconde s'écrit quand `NOM` doit rester une
// chaîne calculable (`blocDuNavigateur` et `SCRIPT_DU_TRAVAILLEUR` la
// choisissent pour ça). Un terme qui ne reconnaît que le point est aveugle à
// la moitié des lectures : `V3_NAVIGABLE` (`app/connecte/chargeur.ts`) et
// `V3_SW_PORTEES` (`app/connecte/fil-vue.ts`) ne matchaient JAMAIS, et
// `theV3ServiceDeclaresWhatItsCodeReads` ne les voyait donc jamais manquer —
// la garde était aveugle à 100 % des variables lues en crochets du dépôt.
const ENV_TERM = /process\.env(?:\.[A-Z][A-Z0-9_]*|\['[A-Z][A-Z0-9_]*'\])/;

const ENV_CHAIN = new RegExp(
  `${ENV_TERM.source}(?:\\s*\\?\\?\\s*${ENV_TERM.source})*`,
  'g',
);

const ENV_NAME = /process\.env(?:\.([A-Z][A-Z0-9_]*)|\['([A-Z][A-Z0-9_]*)'\])/g;

export const runtimeEnvChains = (root, packageDirectory) =>
  RUNTIME_TREES.flatMap((tree) =>
    filesUnder(join(root, packageDirectory, tree))
      .filter((relative) => !relative.split('/').some((segment) => SKIPPED_TREES.has(segment)))
      .filter((relative) => MODULE_EXTENSIONS.has(splitName(relative).extension))
      .flatMap((relative) => {
        const source = readFileSync(join(root, packageDirectory, tree, relative), 'utf8');
        return [...source.matchAll(ENV_CHAIN)].map((match) => ({
          file: `${packageDirectory}/${tree}/${relative}`,
          variables: [...match[0].matchAll(ENV_NAME)].map(([, dotted, bracketed]) => dotted ?? bracketed),
        }));
      }),
  );

// Le graphe que la racine gouverne, lu depuis ses globs — la même entrée que
// `scripts/check-lockfile-alignment.mjs`, et pour la même raison : un parcours
// du disque ramasserait des manifestes que bun n'installe jamais.
export const workspaceDirectories = (root) => {
  const globs = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).workspaces ?? [];
  const parents = [
    ...new Set(globs.filter((glob) => glob.endsWith('/*')).map((glob) => glob.slice(0, -2))),
  ];
  return parents.flatMap((parent) =>
    (existsSync(join(root, parent)) ? readdirSync(join(root, parent), { withFileTypes: true }) : [])
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const manifest = join(root, parent, entry.name, 'package.json');
        if (!existsSync(manifest)) return [];
        const { name } = JSON.parse(readFileSync(manifest, 'utf8'));
        return typeof name === 'string' ? [{ name, directory: `${parent}/${entry.name}` }] : [];
      }),
  );
};

export const declaredWorkspaceDependencies = (root, packageDirectory) => {
  const manifest = JSON.parse(readFileSync(join(root, packageDirectory, 'package.json'), 'utf8'));
  const directories = new Map(workspaceDirectories(root).map((w) => [w.name, w.directory]));
  return Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })
    .filter(([, range]) => typeof range === 'string' && range.startsWith('workspace:'))
    .map(([name]) => ({ name, directory: directories.get(name) ?? null }));
};
