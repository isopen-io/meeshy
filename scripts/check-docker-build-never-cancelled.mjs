#!/usr/bin/env node
// Garde du build Docker qui va jusqu'au staging [#14878]
//
// `docker.yml` portait `concurrency: cancel-in-progress: true`. Au rythme des
// poussées sur `dev`, chaque run annulait le précédent avant « Deploy to
// staging » : 22 runs annulés sur 40 (mesuré le 2026-11-03), et le staging
// servait une version en retard sans que rien ne rougisse.
//
// La règle : le groupe de concurrence de `docker.yml` existe (un seul run à la
// fois par branche, un seul en attente — le plus récent) et ne porte JAMAIS
// `cancel-in-progress: true`, ni une expression qui pourrait le rendre vrai.

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = '.github/workflows/docker.yml';

export function violations(text) {
  const block = /^concurrency:\s*\n((?:[ \t]+.*\n?)+)/m.exec(text);
  if (block === null) return ['docker.yml : aucun bloc `concurrency:` au niveau du workflow'];
  const cancel = /^[ \t]+cancel-in-progress:\s*(.+?)\s*$/m.exec(block[1]);
  if (cancel === null) return [];
  return cancel[1] === 'false'
    ? []
    : [`docker.yml : \`cancel-in-progress: ${cancel[1]}\` — un build lancé doit aller jusqu'au déploiement du staging (#14878)`];
}

const OK = 'concurrency:\n  group: docker-${{ github.ref }}\n  cancel-in-progress: false\n\njobs:\n';
const MUTATIONS = [
  ['annulation vraie', OK.replace('false', 'true')],
  ['annulation par expression', OK.replace('false', "${{ github.ref != 'refs/heads/dev' }}")],
  ['bloc absent', 'jobs:\n'],
];

function selfTest() {
  if (violations(OK).length !== 0) throw new Error('self-test : la forme juste est refusée');
  if (violations('concurrency:\n  group: docker-${{ github.ref }}\n\njobs:\n').length !== 0)
    throw new Error('self-test : un groupe sans annulation est refusé');
  const missed = MUTATIONS.filter(([, t]) => violations(t).length === 0).map(([n]) => n);
  if (missed.length > 0) throw new Error(`self-test : mutations non détectées : ${missed.join(', ')}`);
  console.log(`self-test : ${MUTATIONS.length}/${MUTATIONS.length} mutations détectées.`);
  return 0;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const found = violations(readFileSync(join(ROOT, WORKFLOW), 'utf8'));
  found.forEach((v) => console.error(v));
  if (found.length === 0) console.log('docker.yml : un build lancé va au bout.');
  return found.length === 0 ? 0 : 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
