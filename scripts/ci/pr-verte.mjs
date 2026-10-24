#!/usr/bin/env node
// UNE PR EST-ELLE VERTE ? Un seul outil pour tous les fusionneurs (#12559).
//
// La fusion automatique native est refusée sur ce dépôt (`enablePullRequestAutoMerge`) :
// les workflows de `.claude/workflows` et le fusionneur de `apps/android/scripts/parity`
// jugeaient donc eux-mêmes, chacun avec sa règle — `gh pr checks --fail-fast`, une lecture
// de `statusCheckRollup` par un agent, une exception écrite à la main pour les gardes
// navigateur. Trois règles, trois façons de fusionner un rouge.
//
// La règle, une fois :
//   - chaque check du SHA de tête est TERMINÉ, conclu `SUCCESS`, `SKIPPED` ou `NEUTRAL` ;
//   - « Verdict CI » (l'agrégateur de `ci.yml`, `needs-verdict.mjs`) est PRÉSENT et vert —
//     un rollup sans lui n'a pas encore jugé la PR ;
//   - une annulation n'est JAMAIS verte (`CANCELLED`, `TIMED_OUT`, `STALE`… sont rouges) ;
//   - un check relancé est jugé sur sa DERNIÈRE exécution (même workflow, même nom).
//
// Sorties : 0 vert, 1 rouge (les checks nommés), 3 en cours. `--attendre <min>` relit
// toutes les 60 s jusqu'à un verdict ou l'échéance (en cours ⇒ 3).
//
// Usage :
//   node scripts/ci/pr-verte.mjs <numéro> [--attendre 45]
//   node scripts/ci/pr-verte.mjs --self-test

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export const VERDICT = 'Verdict CI';
const VERTS = new Set(['SUCCESS', 'SKIPPED', 'NEUTRAL']);

const normalise = (c) =>
  c.__typename === 'StatusContext'
    ? { nom: c.context, groupe: 'status', fini: c.state !== 'PENDING' && c.state !== 'EXPECTED', conclusion: c.state, quand: c.startedAt ?? '' }
    : { nom: c.name, groupe: c.workflowName ?? '', fini: c.status === 'COMPLETED', conclusion: c.conclusion ?? '', quand: c.startedAt ?? '' };

const derniers = (checks) => {
  const parCle = new Map();
  for (const c of checks.map(normalise)) {
    const cle = `${c.groupe}\u0000${c.nom}`;
    const avant = parCle.get(cle);
    if (avant === undefined || c.quand >= avant.quand) parCle.set(cle, c);
  }
  return [...parCle.values()];
};

export const juge = (rollup) => {
  const checks = derniers(rollup ?? []);
  const rouges = checks.filter((c) => c.fini && !VERTS.has(c.conclusion)).map((c) => `${c.nom} (${c.conclusion || 'sans conclusion'})`);
  if (rouges.length > 0) return { etat: 'rouge', code: 1, detail: rouges.sort() };
  const enCours = checks.filter((c) => !c.fini).map((c) => c.nom);
  if (enCours.length > 0) return { etat: 'en cours', code: 3, detail: enCours.sort() };
  if (!checks.some((c) => c.nom === VERDICT)) return { etat: 'en cours', code: 3, detail: [`« ${VERDICT} » absent du SHA de tête`] };
  return { etat: 'vert', code: 0, detail: [`${checks.length} checks`] };
};

const run = (nom, conclusion, quand = '2026-10-24T10:00:00Z', status = 'COMPLETED', workflowName = 'CI') => ({
  __typename: 'CheckRun', name: nom, conclusion, status, startedAt: quand, workflowName,
});

const autoTest = () => {
  assert.equal(juge([run(VERDICT, 'SUCCESS'), run('a', 'SKIPPED'), run('b', 'NEUTRAL')]).etat, 'vert');
  assert.equal(juge([run('a', 'SUCCESS')]).etat, 'en cours');
  assert.equal(juge([]).etat, 'en cours');
  assert.equal(juge([run(VERDICT, 'SUCCESS'), run('a', 'CANCELLED')]).etat, 'rouge');
  assert.equal(juge([run(VERDICT, 'SUCCESS'), run('a', 'TIMED_OUT')]).etat, 'rouge');
  assert.equal(juge([run(VERDICT, 'FAILURE')]).etat, 'rouge');
  assert.equal(juge([run(VERDICT, 'SUCCESS'), run('a', '', undefined, 'IN_PROGRESS')]).etat, 'en cours');
  assert.equal(juge([run(VERDICT, 'SUCCESS'), run('a', 'FAILURE', '2026-10-24T09:00:00Z'), run('a', 'SUCCESS', '2026-10-24T10:30:00Z')]).etat, 'vert');
  assert.equal(juge([run(VERDICT, 'SUCCESS'), run('a', 'SUCCESS', '2026-10-24T09:00:00Z'), run('a', 'CANCELLED', '2026-10-24T10:30:00Z')]).etat, 'rouge');
  assert.equal(juge([run(VERDICT, 'SUCCESS'), run('a', 'SUCCESS', undefined, undefined, 'CI'), run('a', 'FAILURE', undefined, undefined, 'Android')]).etat, 'rouge');
  assert.equal(juge([run(VERDICT, 'SUCCESS'), { __typename: 'StatusContext', context: 'ext', state: 'PENDING' }]).etat, 'en cours');
  assert.equal(juge([run(VERDICT, 'SUCCESS'), { __typename: 'StatusContext', context: 'ext', state: 'ERROR' }]).etat, 'rouge');
  assert.deepEqual(juge([run(VERDICT, 'SUCCESS'), run('b', 'FAILURE'), run('a', 'CANCELLED')]).detail, ['a (CANCELLED)', 'b (FAILURE)']);
  console.log('pr-verte --self-test : 13 cas tenus');
};

const lit = (numero) => {
  const sortie = execFileSync('gh', ['pr', 'view', String(numero), '--repo', 'isopen-io/meeshy', '--json', 'state,headRefOid,statusCheckRollup'], { encoding: 'utf8' });
  return JSON.parse(sortie);
};

const main = async () => {
  if (process.argv.includes('--self-test')) return autoTest();
  const numero = process.argv[2];
  if (!/^\d+$/.test(numero ?? '')) {
    console.error('usage : node scripts/ci/pr-verte.mjs <numéro> [--attendre <min>]');
    process.exit(2);
  }
  const i = process.argv.indexOf('--attendre');
  const echeance = Date.now() + (i === -1 ? 0 : Number(process.argv[i + 1]) * 60_000);
  for (;;) {
    const pr = lit(numero);
    const v = pr.state === 'OPEN' ? juge(pr.statusCheckRollup) : { etat: 'rouge', code: 1, detail: [`PR ${pr.state}`] };
    if (v.code !== 3 || Date.now() >= echeance) {
      console.log(`PR #${numero} @ ${pr.headRefOid.slice(0, 10)} : ${v.etat} — ${v.detail.join(', ')}`);
      process.exit(v.code);
    }
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
};

if (import.meta.url === `file://${process.argv[1]}`) await main();
