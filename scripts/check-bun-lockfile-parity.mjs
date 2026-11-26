#!/usr/bin/env node
// Garde de parité bun ↔ bun.lock [#20026]
//
// Le bun des conteneurs de session (1.4.4) n'est pas celui que la CI épingle
// (1.3.14). Les deux n'écrivent pas le même format de lockfile : un simple
// `bun install` local réécrit `bun.lock` de `lockfileVersion` 1 en 3, sans
// changer une seule dépendance, et le hook de fin de session réclame de
// committer ce diff. Commité, il casse l'installation de la CI et des images
// Docker (« Unknown lockfile version ») sur un lot qui n'a rien à voir.
//
// La règle, lue sur le dépôt :
//   1. tous les épinglages de bun (`BUN_VERSION:` des workflows,
//      `ARG BUN_VERSION=` des Dockerfiles) portent la MÊME version — une seule
//      version de bun écrit et relit le lockfile ;
//   2. `bun.lock` porte le `lockfileVersion` que CETTE version écrit, déclaré
//      dans LOCKFILE_VERSION_BY_BUN. Une version de bun absente de la table
//      rougit : monter BUN_VERSION oblige à déclarer, et donc à committer, le
//      format qu'elle écrit, dans le même lot.
//
// `--local` compare en plus le bun du poste à l'épinglage et AVERTIT (code 0) :
// c'est ce que lit une session au démarrage, avant son premier `bun install`.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS_DIR = '.github/workflows';
const DOCKERFILES = ['apps/web/Dockerfile', 'services/gateway/Dockerfile'];

export const LOCKFILE_VERSION_BY_BUN = { '1.3': 1 };

const minorOf = (version) => version.split('.').slice(0, 2).join('.');

export function pinsOf(path, text) {
  const patterns = [/^\s*BUN_VERSION:\s*['"]?([0-9][0-9A-Za-z.+-]*)['"]?\s*$/gm, /^\s*ARG\s+BUN_VERSION=([0-9][0-9A-Za-z.+-]*)\s*$/gm];
  return patterns.flatMap((re) => [...text.matchAll(re)].map((m) => ({ path, version: m[1] })));
}

export function lockfileVersionOf(text) {
  const m = /"lockfileVersion"\s*:\s*(\d+)/.exec(text);
  return m ? Number(m[1]) : null;
}

export function violations({ pins, lockfile }) {
  const found = [];
  if (pins.length === 0) return ['aucun épinglage de bun trouvé (BUN_VERSION) — la parité ne se vérifie plus'];
  const versions = [...new Set(pins.map((p) => p.version))];
  if (versions.length > 1)
    found.push(
      `épinglages de bun divergents : ${pins.map((p) => `${p.path}=${p.version}`).join(', ')} — une seule version écrit et relit bun.lock`,
    );
  const pinned = pins[0].version;
  const expected = LOCKFILE_VERSION_BY_BUN[minorOf(pinned)];
  const actual = lockfileVersionOf(lockfile);
  if (expected === undefined)
    found.push(
      `bun ${pinned} n'est pas déclaré dans LOCKFILE_VERSION_BY_BUN (scripts/check-bun-lockfile-parity.mjs) — déclarer le format qu'il écrit et committer bun.lock dans ce même lot`,
    );
  if (actual === null) found.push('bun.lock : aucun champ lockfileVersion lisible');
  if (expected !== undefined && actual !== null && actual !== expected)
    found.push(
      `bun.lock porte lockfileVersion ${actual}, mais bun ${pinned} (épinglé par la CI) écrit la version ${expected} — ce lockfile a été réécrit par un autre bun : \`git checkout origin/dev -- bun.lock\`, puis installer avec \`bun install --ignore-scripts --no-save\``,
    );
  return found;
}

export function localWarning(pinned, local) {
  if (local === null || local === pinned) return null;
  return `bun local ${local} ≠ bun ${pinned} épinglé par la CI : \`bun install\` réécrirait bun.lock dans un format que la CI ne lit pas. Installer avec \`bun install --ignore-scripts --no-save\`, et ne jamais committer bun.lock depuis ce poste (#20026).`;
}

function repoPins() {
  const workflows = readdirSync(join(ROOT, WORKFLOWS_DIR))
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => `${WORKFLOWS_DIR}/${f}`);
  return [...workflows, ...DOCKERFILES]
    .filter((p) => existsSync(join(ROOT, p)))
    .sort()
    .flatMap((p) => pinsOf(p, readFileSync(join(ROOT, p), 'utf8')));
}

function localBun() {
  try {
    return execFileSync('bun', ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const LOCK_V1 = '{\n  "lockfileVersion": 1,\n  "configVersion": 1,\n}\n';
const PINS_OK = [
  ...pinsOf('ci.yml', "env:\n  BUN_VERSION: '1.3.14'\n"),
  ...pinsOf('Dockerfile', 'ARG BUN_VERSION=1.3.14\nFROM oven/bun:${BUN_VERSION}\n'),
];
const MUTATIONS = [
  ['lockfile réécrit en v3', { pins: PINS_OK, lockfile: LOCK_V1.replace('": 1,\n  "config', '": 3,\n  "config') }],
  ['épinglages divergents', { pins: [...PINS_OK, ...pinsOf('docker.yml', "  BUN_VERSION: '1.4.4'\n")], lockfile: LOCK_V1 }],
  ['bun monté sans déclarer son format', { pins: pinsOf('ci.yml', '  BUN_VERSION: "1.4.4"\n'), lockfile: LOCK_V1 }],
  ['aucun épinglage', { pins: [], lockfile: LOCK_V1 }],
  ['lockfile illisible', { pins: PINS_OK, lockfile: '{}' }],
];

function selfTest() {
  if (PINS_OK.length !== 2) throw new Error(`self-test : ${PINS_OK.length} épinglages lus au lieu de 2`);
  if (pinsOf('x', '  # BUN_VERSION: 9.9.9\n  bun-version: ${{ env.BUN_VERSION }}\n').length !== 0)
    throw new Error('self-test : un commentaire ou une référence est lu comme un épinglage');
  const accepted = violations({ pins: PINS_OK, lockfile: LOCK_V1 });
  if (accepted.length !== 0) throw new Error(`self-test : la forme juste est refusée : ${accepted.join(' ; ')}`);
  const missed = MUTATIONS.filter(([, input]) => violations(input).length === 0).map(([n]) => n);
  if (missed.length > 0) throw new Error(`self-test : mutations non détectées : ${missed.join(', ')}`);
  if (localWarning('1.3.14', '1.4.4') === null) throw new Error('self-test : un bun local divergent ne prévient pas');
  if (localWarning('1.3.14', '1.3.14') !== null || localWarning('1.3.14', null) !== null)
    throw new Error('self-test : un bun local aligné (ou absent) prévient');
  console.log(`self-test : ${MUTATIONS.length + 1}/${MUTATIONS.length + 1} mutations détectées.`);
  return 0;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const pins = repoPins();
  const found = violations({ pins, lockfile: readFileSync(join(ROOT, 'bun.lock'), 'utf8') });
  found.forEach((v) => console.error(v));
  if (process.argv.includes('--local') && pins.length > 0) {
    const warning = localWarning(pins[0].version, localBun());
    if (warning) console.warn(`AVERTISSEMENT : ${warning}`);
    return 0;
  }
  if (found.length === 0)
    console.log(`bun ${pins[0].version} épinglé partout (${pins.length} sites), bun.lock au format qu'il écrit.`);
  return found.length === 0 ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
