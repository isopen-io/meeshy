#!/usr/bin/env node
/**
 * LE CLIQUET DES MOTS VISIBLES (#17587, épure #17584).
 *
 * Confronte le relevé de `capture-verbosity.mjs` (`render/verbosity-measure.json`)
 * aux budgets de `verbosity-budgets.json`, et ces budgets à ceux de la base
 * (`origin/dev`, ou `VERBOSITY_BASE_REF`). Rouge si une vue dépasse son budget,
 * si un budget MONTE, si une vue listée n'a ni budget ni mention « non
 * couverte », ou si une vue couverte ne s'ouvre plus.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { verbosityProblems } from './lib/verbosity-budgets.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const MEASURE = `${ROOT}render/verbosity-measure.json`;
const BASE_REF = process.env.VERBOSITY_BASE_REF ?? 'origin/dev';
const BUDGETS_PATH = 'apps/web/verbosity-budgets.json';

if (!existsSync(MEASURE)) {
  console.error('ECHEC aucun relevé : lance `node scripts/capture-verbosity.mjs` après `bun run build`.');
  process.exit(1);
}

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

const readBase = () => {
  const show = () => JSON.parse(git(['show', `${BASE_REF}:${BUDGETS_PATH}`]));
  try {
    return show();
  } catch {
    // En intégration continue seulement (clone à une profondeur) : localement, un `--depth=1` poserait une
    // frontière superficielle sur la base et couperait l'historique commun — on y laisse `git fetch origin dev` à la main.
    if (process.env.CI !== 'true') return null;
    try {
      const [remote, ...branch] = BASE_REF.split('/');
      git(['fetch', '--no-tags', '--depth=1', remote, `${branch.join('/')}:refs/remotes/${BASE_REF}`]);
      return show();
    } catch {
      return null;
    }
  }
};

const { views } = JSON.parse(readFileSync(`${ROOT}verbosity-views.json`, 'utf8'));
const budgets = JSON.parse(readFileSync(`${ROOT}verbosity-budgets.json`, 'utf8'));
const measured = JSON.parse(readFileSync(MEASURE, 'utf8'));
const previous = readBase();
if (previous === null) console.log(`  note  aucun budget lisible sur ${BASE_REF} : le cliquet contre la base est sauté, les budgets restent tenus`);

const problems = verbosityProblems({ listed: views.map((view) => view.name), measured, budgets, previous });
for (const [name, view] of Object.entries(measured.views)) {
  const budget = budgets.views[name];
  if (budget !== undefined && (view.total < budget.total || view.firstScreen < budget.firstScreen)) {
    console.log(`  note  ${name} : ${view.total}/${view.firstScreen} sous le budget ${budget.total}/${budget.firstScreen} — abaisse-le (capture-verbosity.mjs --write-budgets)`);
  }
}
for (const [name, reason] of Object.entries(budgets.uncovered)) console.log(`  non couverte  ${name} — ${reason}`);

if (problems.length > 0) {
  for (const problem of problems) console.error(`ECHEC ${problem}`);
  process.exit(1);
}
console.log(`  ok    ${Object.keys(budgets.views).length} vues sous leur budget de mots visibles`);
