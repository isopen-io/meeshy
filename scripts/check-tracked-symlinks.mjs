#!/usr/bin/env node
// Garde des liens symboliques suivis par git [#4553]
//
// LE DÉFAUT QU'IL FERME
//
// `services/gateway/prebuilds` était un lien symbolique SUIVI par git (mode
// `120000`) dont la cible était un chemin ABSOLU posé sur la machine d'une
// personne (`/Users/<login>/Documents/…`). Il ne résolvait nulle part
// ailleurs — mesuré : `test -e` échoue dans tout conteneur, CI comprise — et
// pourtant `EncryptionService.ts` le déclarait nécessaire au chargement du
// module natif `@signalapp/libsignal-client` par `node-gyp-build`. Mesuré à
// nouveau pour cette garde : `node-gyp-build` résout en réalité le binaire
// depuis `node_modules/@signalapp/libsignal-client/prebuilds/<plateforme>/`,
// un répertoire que le PAQUET livre lui-même — le lien de la racine du
// gateway n'a jamais été consulté. Le supprimer ne change rien au
// chiffrement ; le garder aurait laissé un prochain lecteur croire qu'il est
// requis.
//
// POURQUOI IL VIT ICI, ET PAS DANS LES TESTS D'UN WORKSPACE
//
// L'invariant porte sur l'arbre GIT du dépôt entier — n'importe quel chemin
// peut recevoir un lien suivi — donc sa surface est la racine, comme les
// autres gardes de ce dossier (`check-lockfile-alignment.mjs`,
// `check-makefile-workspaces.mjs`). Un témoin logé dans un workspace ne
// verrait que sa propre sous-arborescence.
//
// POURQUOI DEUX RÈGLES, ET PAS UNE
//
// Un chemin ABSOLU est fautif même s'il résout par accident sur la machine
// qui vient de le poser : il ne survit ni à un autre poste, ni à un
// conteneur, ni à un renommage d'utilisateur. Une cible relative qui ne
// résout PAS depuis la racine du dépôt est fautive pour une autre raison,
// symétrique à la garde des compositions Docker de #4544/#4548 (qui ne
// couvre que `docker-compose*.yml`) : ici, TOUT lien suivi, où qu'il vive,
// entre dans l'inventaire. Les deux règles sont nécessaires ensemble — un
// lien peut être relatif et mort, ou absolu et (par accident) vivant.
//
// POURQUOI LA CIBLE EST LUE PAR `readlinkSync`, ET PAS PAR `git show`
//
// `git ls-files -s` donne le MODE (120000 = lien) et le chemin ; il ne donne
// pas la cible en clair. La lire depuis le disque (`readlinkSync`) suppose
// un checkout qui matérialise les liens en liens réels — vrai sur Linux/macOS
// CI, qui est la seule plateforme où cette garde tourne.

import { execFileSync } from 'node:child_process';
import { existsSync, readlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// `git ls-files -s` énumère les ~15 000 chemins du dépôt (~1,7 Mo) : la
// sortie dépasse le `maxBuffer` par défaut d'`execFileSync` (1 Mo), d'où le
// relèvement explicite.
const readWorld = (root) => {
  const output = execFileSync('git', ['ls-files', '-s'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
  });
  const symlinks = output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split('\t');
      return { mode: meta.split(' ')[0], path };
    })
    .filter(({ mode }) => mode === '120000')
    .map(({ path }) => ({ path, target: readlinkSync(join(root, path)) }));
  return { root, symlinks };
};

const noTrackedSymlinkTargetsAnAbsolutePath = (world) =>
  world.symlinks
    .filter(({ target }) => isAbsolute(target))
    .map(
      ({ path, target }) =>
        `${path} → ${target} — cible ABSOLUE, ne résout que sur la machine qui l'a posée`,
    );

const everyTrackedSymlinkResolvesFromTheRepoRoot = (world) =>
  world.symlinks
    .filter(({ target }) => !isAbsolute(target))
    .filter(({ path, target }) => !existsSync(resolve(world.root, dirname(path), target)))
    .map(
      ({ path, target }) => `${path} → ${target} — lien MORT, ne résout pas depuis la racine du dépôt`,
    );

const CHECKS = [
  ['aucun lien suivi ne cible un chemin absolu', noTrackedSymlinkTargetsAnAbsolutePath],
  ['chaque lien suivi résout depuis la racine du dépôt', everyTrackedSymlinkResolvesFromTheRepoRoot],
];

const inspect = (world) => CHECKS.flatMap(([title, check]) => check(world).map((failure) => `${title} → ${failure}`));

const mutate = (world, apply) => {
  const copy = structuredClone(world);
  apply(copy);
  return copy;
};

const MUTATIONS = [
  [
    'un lien suivi qui cible un chemin absolu',
    (world) => world.symlinks.push({ path: 'zz-sonde-absolue', target: '/Users/zz/sonde' }),
    'zz-sonde-absolue → /Users/zz/sonde — cible ABSOLUE',
  ],
  [
    'un lien suivi dont la cible relative ne résout pas',
    (world) => world.symlinks.push({ path: 'zz-sonde-morte', target: './chemin/qui/n/existe/pas' }),
    'zz-sonde-morte → ./chemin/qui/n/existe/pas — lien MORT',
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
  const world = readWorld(REPO_ROOT);
  if (process.argv.includes('--self-test')) {
    return selfTest(world);
  }
  const failures = inspect(world);
  if (failures.length > 0) {
    failures.forEach((failure) => console.error(failure));
    console.error(`\n${failures.length} défaut(s) parmi les liens symboliques suivis par git.`);
    return 1;
  }
  console.log(
    `Liens symboliques : ${world.symlinks.length} lien(s) suivi(s) par git, tous résolvent depuis la racine du dépôt.`,
  );
  return 0;
};

process.exit(await main());
