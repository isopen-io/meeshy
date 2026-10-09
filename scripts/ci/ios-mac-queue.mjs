#!/usr/bin/env node
// File d'attente des suites iOS complètes [#9751]
//
// L'org tourne sur l'offre Free : 5 jobs macOS simultanés pour tout le compte.
// Une suite complète en prend 5 à elle seule (build + 4 tranches, #9692). Deux
// ou trois suites lancées à quelques minutes d'écart entrelaçaient leurs
// tranches, et chacune finissait en 60 à 90 min pour 30 min de travail
// (runs 37911242543 et 37900129053).
//
// Un groupe `concurrency` commun ne convient pas : GitHub n'y garde qu'UN run
// en attente et annule les autres, donc les runs des autres sessions. Ce
// script fait une vraie file, premier arrivé premier servi, depuis un job
// ubuntu qui ne coûte aucune place Mac : il attend qu'aucun run iOS PLUS
// ANCIEN n'ait de suite complète en cours ou en attente.
//
// Une suite complète se reconnaît à ses jobs : la file elle-même, le build des
// produits de test, ou une tranche. Les runs de compilation seule n'en ont
// aucun et ne bloquent personne.
//
// La file ne bloque jamais la CI : une erreur d'API ou une attente qui passe
// `--max-minutes` laisse passer le run, avec un avertissement.
//
// Usage (dans le job, GITHUB_TOKEN / GITHUB_REPOSITORY / GITHUB_RUN_ID posés) :
//   node scripts/ci/ios-mac-queue.mjs [--poll-seconds 90] [--max-minutes 150]

export const QUEUE_JOB = "File d'attente Mac";
const FULL_SUITE_JOB = /^(File d'attente Mac|Build app \(produits de test\)|Tests unitaires — tranche \d+)$/;

export const holdsMac = (jobs) =>
  jobs.some((job) => job.status !== 'completed' && FULL_SUITE_JOB.test(job.name));

export const runsAhead = ({ myRunId, runs, jobsByRun }) =>
  runs
    .filter((run) => run.id < myRunId && run.status !== 'completed')
    .filter((run) => holdsMac(jobsByRun.get(run.id) ?? []))
    .map((run) => run.id)
    .sort((a, b) => a - b);

const api = async (path) => {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
  return response.json();
};

const unfinishedRuns = async () => {
  const pages = await Promise.all(
    ['in_progress', 'queued', 'waiting', 'pending'].map((status) =>
      api(`/actions/workflows/ios.yml/runs?status=${status}&per_page=100`),
    ),
  );
  return pages.flatMap((page) => page.workflow_runs).map((run) => ({ id: run.id, status: run.status }));
};

const jobsOf = async (runId) => (await api(`/actions/runs/${runId}/jobs?filter=latest&per_page=100`)).jobs;

const ahead = async (myRunId) => {
  const runs = (await unfinishedRuns()).filter((run) => run.id < myRunId);
  const jobsByRun = new Map(await Promise.all(runs.map(async (run) => [run.id, await jobsOf(run.id)])));
  return runsAhead({ myRunId, runs, jobsByRun });
};

const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const myRunId = Number(process.env.GITHUB_RUN_ID);
  const pollMs = option('poll-seconds', 90) * 1000;
  const deadline = Date.now() + option('max-minutes', 150) * 60_000;
  const started = Date.now();
  for (;;) {
    const blocking = await ahead(myRunId).catch((error) => {
      console.log(`::warning title=File d'attente Mac::relevé impossible (${error.message}), le run passe.`);
      return [];
    });
    const waited = Math.round((Date.now() - started) / 60_000);
    if (blocking.length === 0) {
      console.log(`::notice title=File d'attente Mac::les Mac sont à ce run après ${waited} min d'attente.`);
      return;
    }
    if (Date.now() > deadline) {
      console.log(`::warning title=File d'attente Mac::${waited} min d'attente, le run passe malgré ${blocking.join(', ')}.`);
      return;
    }
    console.log(`${new Date().toISOString()} — ${blocking.length} suite(s) devant : ${blocking.join(', ')}`);
    await sleep(pollMs);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) await main();
