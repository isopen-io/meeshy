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
//   - « Verdict CI » (l'agrégateur de `ci.yml`, `needs-verdict.mjs`) est PRÉSENT et a
//     CONCLU `SUCCESS` — un rollup sans lui n'a pas encore jugé la PR, et un verdict
//     `SKIPPED` ou `NEUTRAL` dit « je n'ai pas jugé », ce qui n'est pas un feu vert
//     (#18045 : sous `PR_CI_GEL`, dix-sept jobs sautés et un verdict qui n'exécutait
//     aucune étape rendaient « vert — 18 checks ») ;
//   - une annulation n'est JAMAIS verte (`CANCELLED`, `TIMED_OUT`, `STALE`… sont rouges) ;
//   - un check relancé est jugé sur sa DERNIÈRE exécution (même workflow, même nom).
//
// Sorties : 0 vert, 1 rouge (les checks nommés), 3 en cours, 2 l'OUTIL n'a pas pu lire
// (`gh` en erreur — un 401 passager a été mesuré) : une panne de lecture n'est jamais
// un verdict. `--attendre <min>` relit toutes les 60 s, pannes de lecture comprises,
// jusqu'à un verdict ou l'échéance.
//
// En session distante, GraphQL est refusé (`gh pr view` rend 403) : on lit alors la PR par
// l'API REST ou par MCP (`pull_request_read` get, get_check_runs page par page, get_status)
// et on remet la charge à `--rest`, qui applique la MÊME règle. La charge :
//   { "state": "open", "head_sha": "…", "total_count": 22, "check_runs": [ …REST… ], "statuses": [ …REST… ] }
// `statuses` est le tableau, ou le statut combiné de get_status tel quel.
// Une relance se range avec son exécution par l'identifiant de run de son URL
// (`/actions/runs/<id>`) ; moins de check runs que `total_count` n'est jamais un verdict (sortie 2).
//
// Usage :
//   node scripts/ci/pr-verte.mjs <numéro> [--attendre 45]
//   node scripts/ci/pr-verte.mjs --rest <charge.json>
//   node scripts/ci/pr-verte.mjs --self-test

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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
  // #18045 — l'agrégateur doit être là ET avoir CONCLU. `SKIPPED` / `NEUTRAL`
  // disent « je n'ai pas jugé », ce qui est l'inverse d'un feu vert : elles
  // sont vertes pour un job ORDINAIRE (sauté par zone touchée = rien à faire
  // sur ce diff) et muettes pour celui dont le travail EST de conclure.
  const verdict = checks.find((c) => c.nom === VERDICT);
  if (verdict === undefined) return { etat: 'en cours', code: 3, detail: [`« ${VERDICT} » absent du SHA de tête`] };
  if (verdict.conclusion !== 'SUCCESS') {
    return { etat: 'en cours', code: 3, detail: [`« ${VERDICT} » n'a pas conclu (${verdict.conclusion || 'sans conclusion'})`] };
  }
  return { etat: 'vert', code: 0, detail: [`${checks.length} checks`] };
};

const runDe = (url) => (String(url ?? '').match(/\/actions\/runs\/(\d+)/) ?? [])[1] ?? '';
const majuscule = (valeur) => String(valeur ?? '').toUpperCase();

const statutsDe = (statuses) => (Array.isArray(statuses) ? statuses : (statuses?.statuses ?? []));

export const depuisRest = ({ check_runs = [], statuses }) => [
  ...check_runs.map((c) => ({
    __typename: 'CheckRun', name: c.name, status: majuscule(c.status), conclusion: majuscule(c.conclusion),
    startedAt: c.started_at ?? '', workflowName: runDe(c.details_url ?? c.html_url),
  })),
  ...statutsDe(statuses).map((s) => ({ __typename: 'StatusContext', context: s.context, state: majuscule(s.state), startedAt: s.updated_at ?? s.created_at ?? '' })),
];

export const jugeRest = (charge) => {
  const lus = (charge.check_runs ?? []).length;
  if (Number.isInteger(charge.total_count) && lus < charge.total_count) {
    return { etat: 'lecture incomplète', code: 2, detail: [`${lus}/${charge.total_count} check runs lus`] };
  }
  if (charge.state !== undefined && charge.state !== 'open') return { etat: 'rouge', code: 1, detail: [`PR ${charge.state}`] };
  return juge(depuisRest(charge));
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
  const rest = (name, conclusion, { runId = '1', status = 'completed', quand = '2026-10-24T10:00:00Z' } = {}) => ({
    name, status, conclusion, started_at: quand, details_url: `https://github.com/isopen-io/meeshy/actions/runs/${runId}/job/9`,
  });
  const charge = (check_runs, extra = {}) => ({ state: 'open', total_count: check_runs.length, check_runs, ...extra });
  assert.equal(jugeRest(charge([rest(VERDICT, 'success'), rest('a', 'skipped'), rest('b', 'neutral')])).etat, 'vert');
  assert.equal(jugeRest(charge([rest(VERDICT, 'success'), rest('a', 'cancelled')])).etat, 'rouge');
  assert.equal(jugeRest(charge([rest(VERDICT, 'success'), rest('a', null, { status: 'in_progress' })])).etat, 'en cours');
  assert.equal(jugeRest(charge([rest('a', 'success')])).etat, 'en cours');
  assert.equal(jugeRest(charge([rest(VERDICT, 'success'), rest('a', 'failure', { quand: '2026-10-24T09:00:00Z' }), rest('a', 'success', { quand: '2026-10-24T10:30:00Z' })])).etat, 'vert');
  assert.equal(jugeRest(charge([rest(VERDICT, 'success'), rest('a', 'success', { runId: '1', quand: '2026-10-24T10:30:00Z' }), rest('a', 'failure', { runId: '2', quand: '2026-10-24T09:00:00Z' })])).etat, 'rouge');
  assert.equal(jugeRest(charge([rest(VERDICT, 'success')], { statuses: [{ context: 'ext', state: 'pending', created_at: '2026-10-24T10:00:00Z' }] })).etat, 'en cours');
  assert.equal(jugeRest(charge([rest(VERDICT, 'success')], { statuses: [{ context: 'ext', state: 'error', created_at: '2026-10-24T10:00:00Z' }] })).etat, 'rouge');
  assert.deepEqual(jugeRest({ ...charge([rest(VERDICT, 'success')]), total_count: 30 }), { etat: 'lecture incomplète', code: 2, detail: ['1/30 check runs lus'] });
  assert.equal(jugeRest(charge([rest(VERDICT, 'success')], { state: 'closed' })).etat, 'rouge');
  const statutCombine = { state: 'failure', statuses: [{ context: 'ext', state: 'failure', created_at: '2026-10-24T10:00:00Z' }] };
  assert.equal(jugeRest(charge([rest(VERDICT, 'success')], { statuses: statutCombine })).etat, 'rouge');
  assert.equal(jugeRest(charge([rest(VERDICT, 'success')], { statuses: { state: 'pending', statuses: [] } })).etat, 'vert');

  // #18045 — L'AGRÉGATEUR DOIT AVOIR CONCLU, pas seulement être présent.
  //
  // `SKIPPED` et `NEUTRAL` veulent dire « ce job n'a pas jugé » — l'inverse
  // exact d'un feu vert. L'outil les acceptait parce qu'elles sont dans
  // `VERTS`, ce qui est juste pour un job ORDINAIRE (sauté par zone touchée =
  // rien à faire sur ce diff) et faux pour l'agrégateur, dont le travail EST de
  // conclure.
  //
  // Mesuré avant ce lot, sur la charge RÉELLE d'une PR sous `PR_CI_GEL` :
  // dix-sept jobs `skipped` et un `Verdict CI` `success` qui n'avait exécuté
  // AUCUNE étape (ses trois étapes portaient le gel, son `if: always()` de job
  // le faisait conclure par absence d'échec) ⇒ `vert — 18 checks`, EXIT=0.
  // Tous les fusionneurs du dépôt (#12559) auraient fusionné sans qu'un job
  // tourne.
  //
  // Le gel n'est que le RÉVÉLATEUR : toute autre façon de ne pas exécuter le
  // verdict rouvrait la même porte. D'où une garde sur la CONCLUSION, et non
  // sur la cause du jour.
  assert.equal(juge([run(VERDICT, 'SKIPPED'), run('a', 'SKIPPED')]).etat, 'en cours');
  assert.equal(juge([run(VERDICT, 'NEUTRAL'), run('a', 'SKIPPED')]).etat, 'en cours');
  assert.deepEqual(juge([run(VERDICT, 'SKIPPED')]).detail, [`« ${VERDICT} » n'a pas conclu (SKIPPED)`]);
  assert.equal(jugeRest(charge([rest(VERDICT, 'skipped'), rest('a', 'skipped')])).etat, 'en cours');
  assert.equal(jugeRest(charge([rest(VERDICT, 'neutral'), rest('a', 'skipped')])).etat, 'en cours');
  // Non-régression : un verdict qui a VRAIMENT conclu reste vert, et un verdict
  // rouge reste rouge — la garde ne déplace que les deux conclusions muettes.
  assert.equal(juge([run(VERDICT, 'SUCCESS'), run('a', 'SKIPPED')]).etat, 'vert');
  assert.equal(juge([run(VERDICT, 'FAILURE'), run('a', 'SKIPPED')]).etat, 'rouge');
  console.log('pr-verte --self-test : 32 cas tenus');
};

const lit = (numero) => {
  const sortie = execFileSync('gh', ['pr', 'view', String(numero), '--repo', 'isopen-io/meeshy', '--json', 'state,headRefOid,statusCheckRollup'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(sortie);
};

const jugeFichier = (chemin) => {
  const charge = JSON.parse(readFileSync(chemin, 'utf8'));
  const v = jugeRest(charge);
  console.log(`PR @ ${String(charge.head_sha ?? '?').slice(0, 10)} : ${v.etat} — ${v.detail.join(', ')}`);
  process.exit(v.code);
};

const main = async () => {
  if (process.argv.includes('--self-test')) return autoTest();
  const r = process.argv.indexOf('--rest');
  if (r !== -1) return jugeFichier(process.argv[r + 1]);
  const numero = process.argv[2];
  if (!/^\d+$/.test(numero ?? '')) {
    console.error('usage : node scripts/ci/pr-verte.mjs <numéro> [--attendre <min>] | --rest <charge.json> | --self-test');
    process.exit(2);
  }
  const i = process.argv.indexOf('--attendre');
  const echeance = Date.now() + (i === -1 ? 0 : Number(process.argv[i + 1]) * 60_000);
  for (;;) {
    let pr;
    try {
      pr = lit(numero);
    } catch (error) {
      if (Date.now() >= echeance) {
        console.error(`PR #${numero} : lecture impossible — ${String(error.stderr ?? error.message).trim()}`);
        process.exit(2);
      }
      await new Promise((resolve) => setTimeout(resolve, 60_000));
      continue;
    }
    const v = pr.state === 'OPEN' ? juge(pr.statusCheckRollup) : { etat: 'rouge', code: 1, detail: [`PR ${pr.state}`] };
    if (v.code !== 3 || Date.now() >= echeance) {
      console.log(`PR #${numero} @ ${pr.headRefOid.slice(0, 10)} : ${v.etat} — ${v.detail.join(', ')}`);
      process.exit(v.code);
    }
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
};

if (import.meta.url === `file://${process.argv[1]}`) await main();
