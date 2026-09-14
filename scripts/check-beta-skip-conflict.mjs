#!/usr/bin/env node
// Garde du conflit marqueur (beta) × marqueur de saut CI [issue #6351]
//
// LE PIÈGE QUE CE GARDE FERME
//
// `.github/workflows/ios-beta-trigger.yml` lit le message ENTIER (titre +
// corps) du commit poussé sur `main` pour décider de démarrer le build
// Xcode Cloud « TestFlight beta test iOS ». Mais GitHub applique SA PROPRE
// détection de saut sur ce même message, AVANT que le workflow ne s'exécute :
// si le message contient un marqueur de saut ([skip ci], [ci skip], [no ci],
// [skip actions], [actions skip], skip-checks:true), GitHub supprime TOUS les
// workflows du push — y compris ios-beta-trigger.yml lui-même. Un commit
// `(beta)` dont le CORPS cite, en exemple ou en contexte, le message d'un
// commit de release (`chore(release): version packages [skip ci]`) porte
// alors les deux marqueurs à la fois, et son build ne démarre jamais — en
// silence, puisque le workflow qui aurait pu le dire n'a lui-même pas tourné.
//
// POURQUOI CE GARDE NE PEUT PAS VIVRE DANS ios-beta-trigger.yml
//
// Un témoin déclenché par push ou pull_request est supprimé par le MÊME
// mécanisme que celui qu'il devrait signaler : un job qui s'y accrocherait
// serait aveugle exactement quand il doit voir. Ce script sert donc DEUX
// points d'ancrage qui ne dépendent d'aucun des deux événements supprimés :
//
//   1. Un hook de commit LOCAL (`--message-file`), avant que le commit
//      n'existe — la seule prévention qui agit avant que GitHub ne voie
//      quoi que ce soit. Voir `.githooks/commit-msg`.
//   2. Un témoin PÉRIODIQUE (`--range`), sur `schedule` — un déclencheur que
//      GitHub n'associe à aucun commit précis, donc qu'aucun marqueur de
//      saut ne peut supprimer. Voir `.github/workflows/beta-marker-audit.yml`.
//
// Sans arguments, le script vérifie le seul commit HEAD (`git log -1`) : un
// filet de sécurité pour la CI ordinaire (job `quality`), qui ne verra
// jamais le cas que ce garde existe pour fermer (un push affecté par ce
// piège ne fait justement tourner aucune CI), mais qui attrape le même
// défaut sur un commit de PR normal, avant qu'il n'atteigne `main`.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Doit rester un sur-ensemble exact des marqueurs bash de
// `.github/workflows/ios-beta-trigger.yml` (§ « Decide whether this commit
// asks for a beta ») — sinon ce garde et le déclencheur qu'il protège
// jugeraient deux commits différemment. `betaMarkersDriftedFromTrigger`
// ci-dessous le vérifie à chaque `--self-test`.
export const BETA_MARKERS = ['(beta)', '[beta]', '{beta}', '"beta"', "'beta'"];

// Les six formes documentées par GitHub pour sauter un push/pull_request.
export const SKIP_MARKERS = [
  '[skip ci]',
  '[ci skip]',
  '[no ci]',
  '[skip actions]',
  '[actions skip]',
  'skip-checks:true',
  'skip-checks: true',
];

const containsAny = (message, markers) => {
  const lowered = message.toLowerCase();
  return markers.some((marker) => lowered.includes(marker.toLowerCase()));
};

export const hasBetaMarker = (message) => containsAny(message, BETA_MARKERS);
export const hasSkipMarker = (message) => containsAny(message, SKIP_MARKERS);
export const hasConflict = (message) => hasBetaMarker(message) && hasSkipMarker(message);

const explain = (message) =>
  [
    'Ce message porte À LA FOIS un marqueur (beta) et un marqueur de saut CI.',
    'GitHub supprime TOUS les workflows du push qui porte ce message — y compris',
    '« iOS (beta) → Xcode Cloud » — donc le build TestFlight voulu ne démarrera',
    'jamais, sans qu\'aucune CI ne le signale (issue #6351).',
    '',
    'Retirer le marqueur de saut du message (le citer sans les crochets/deux-points',
    'qui le rendent actif, par exemple), ou démarrer le build par',
    '`workflow_dispatch` sur ios-beta-trigger.yml plutôt que par push.',
    '',
    `Message concerné :\n${message}`,
  ].join('\n');

// Extrait le littéral bash `markers=(...)` de ios-beta-trigger.yml, pour
// vérifier que ce fichier et le déclencheur qu'il protège jugent le même
// ensemble de commits. Un parsing DÉLIBÉRÉMENT étroit : ce garde n'a besoin
// de comprendre qu'une seule ligne du bash du déclencheur, pas de
// l'interpréter.
const betaMarkersDeclaredByTrigger = () => {
  const path = join(REPO_ROOT, '.github/workflows/ios-beta-trigger.yml');
  const source = readFileSync(path, 'utf8');
  const match = /markers=\((.*)\)/.exec(source);
  if (match === null) {
    throw new Error(`marqueurs bash introuvables dans ${path}`);
  }
  // Chaîne bash entre guillemets, échappement compris (\") — même motif que
  // `JSON_STRING` dans check-lockfile-alignment.mjs, appliqué au bash plutôt
  // qu'au JSON : sans lui, `"\"beta\""` casse un découpage naïf sur `"`.
  const BASH_STRING = /"(?:\\.|[^"\\])*"/g;
  return (match[1].match(BASH_STRING) ?? []).map((literal) =>
    literal.slice(1, -1).replace(/\\(.)/g, '$1'),
  );
};

const betaMarkersDriftedFromTrigger = () => {
  const declared = betaMarkersDeclaredByTrigger();
  const here = new Set(BETA_MARKERS);
  const there = new Set(declared);
  const missingHere = declared.filter((marker) => !here.has(marker));
  const missingThere = BETA_MARKERS.filter((marker) => !there.has(marker));
  return missingHere.length === 0 && missingThere.length === 0
    ? []
    : [
        `BETA_MARKERS a dérivé de ios-beta-trigger.yml : ` +
          `absents ici=[${missingHere.join(', ')}] absents là-bas=[${missingThere.join(', ')}]`,
      ];
};

const MUTATIONS = [
  ['un message avec (beta) et [skip ci]', 'chore(ios): (beta) build TestFlight — cite "[skip ci]"'],
  ['un message avec [beta] et skip-checks: true', 'release [beta]\n\nskip-checks: true'],
  ["un message avec 'beta' et [no ci]", "chore: 'beta' run\n[no ci]"],
];

const TOLERATED = [
  ['un message beta sans marqueur de saut', 'chore(ios): (beta) build TestFlight 1.0.9 depuis main'],
  ['un message de saut sans marqueur beta', 'chore(release): version packages [skip ci]'],
  ['un message neutre', 'fix(gateway): corrige la pagination des messages'],
];

const selfTest = () => {
  const blind = MUTATIONS.filter(([, message]) => !hasConflict(message));
  blind.forEach(([title]) => console.error(`AVEUGLE : « ${title} » n'a pas été détecté comme conflit`));

  const overzealous = TOLERATED.filter(([, message]) => hasConflict(message));
  overzealous.forEach(([title]) => console.error(`TROP STRICT : « ${title} » a été signalé à tort`));

  const drifted = betaMarkersDriftedFromTrigger();
  drifted.forEach((failure) => console.error(failure));

  const failing = blind.length + overzealous.length + drifted.length;
  const total = MUTATIONS.length + TOLERATED.length + 1;
  if (failing > 0) {
    console.error(`\n${failing}/${total} sondes échouent.`);
    return 1;
  }
  console.log(`self-test : ${total}/${total} sondes correctes.`);
  return 0;
};

const commitsIn = (range) => {
  const SEP = '\x1f';
  const END = '\x1e';
  const output = execFileSync(
    'git',
    ['log', `--format=%H${SEP}%B${END}`, range],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return output
    .split(END)
    .map((entry) => entry.replace(/^\n/, ''))
    .filter((entry) => entry.trim().length > 0)
    .map((entry) => {
      const [sha, ...rest] = entry.split(SEP);
      return { sha, message: rest.join(SEP) };
    });
};

const checkRange = (range) => {
  const conflicts = commitsIn(range).filter(({ message }) => hasConflict(message));
  if (conflicts.length === 0) {
    console.log(`aucun conflit (beta) × saut CI sur ${range}.`);
    return 0;
  }
  conflicts.forEach(({ sha, message }) => {
    console.error(`--- ${sha} ---`);
    console.error(explain(message));
    console.error('');
  });
  console.error(`${conflicts.length} commit(s) en conflit sur ${range}.`);
  return 1;
};

const checkMessageFile = (path) => {
  const message = readFileSync(path, 'utf8');
  if (!hasConflict(message)) {
    return 0;
  }
  console.error(explain(message));
  return 1;
};

const checkHead = () => {
  const message = execFileSync('git', ['log', '-1', '--format=%B'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (!hasConflict(message)) {
    console.log('HEAD ne porte pas de conflit (beta) × saut CI.');
    return 0;
  }
  console.error(explain(message));
  return 1;
};

const main = () => {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    return selfTest();
  }
  const messageFileIndex = args.indexOf('--message-file');
  if (messageFileIndex !== -1) {
    const path = args[messageFileIndex + 1];
    if (path === undefined || !existsSync(path)) {
      console.error(`--message-file exige un fichier existant, reçu : ${path}`);
      return 2;
    }
    return checkMessageFile(path);
  }
  const rangeIndex = args.indexOf('--range');
  if (rangeIndex !== -1) {
    const range = args[rangeIndex + 1];
    if (range === undefined) {
      console.error('--range exige une plage git (ex. origin/main~50..origin/main)');
      return 2;
    }
    return checkRange(range);
  }
  return checkHead();
};

process.exit(main());
