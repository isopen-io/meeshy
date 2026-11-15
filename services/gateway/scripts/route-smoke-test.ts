/**
 * Test de fumée post-déploiement (#5644) : lit `route-manifest.json` et sonde
 * chaque route contre un `--base-url` réel — jamais contre le serveur monté en
 * mémoire, c'est le CONTENEUR déployé qu'on interroge. Distingue 404 (route
 * absente du binaire servi) de tout le reste (la route existe).
 *
 * Usage :
 *   npx tsx scripts/route-smoke-test.ts --base-url https://gate.staging.meeshy.me
 *
 * Options :
 *   --base-url         requis — origine du gateway à sonder (sans slash final)
 *   --manifest         chemin du manifeste (défaut : route-manifest.json, à côté)
 *   --concurrency       sondes en parallèle (défaut : 8)
 *   --timeout-ms        délai par requête avant de compter la route « injoignable » (défaut : 8000)
 */

import fs from 'fs';
import path from 'path';

import {
  runRouteSmokeTest,
  selectSmokeRoutes,
  summarizeSmokeResults,
  type ManifestRoute,
  type SmokeFetch
} from '../src/utils/route-smoke';

type CliOptions = {
  baseUrl: string;
  manifestPath: string;
  concurrency: number;
  timeoutMs: number;
};

function parseArgs(argv: string[]): CliOptions {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      flags.set(arg.slice(2), argv[i + 1]);
      i += 1;
    }
  }

  const baseUrl = flags.get('base-url');
  if (!baseUrl) {
    throw new Error('--base-url est requis (ex : https://gate.staging.meeshy.me)');
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    manifestPath: flags.get('manifest') ?? path.join(__dirname, '..', 'route-manifest.json'),
    concurrency: Number(flags.get('concurrency') ?? '8'),
    timeoutMs: Number(flags.get('timeout-ms') ?? '8000')
  };
}

function loadManifestRoutes(manifestPath: string): ManifestRoute[] {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const parsed = JSON.parse(raw) as { routes: ManifestRoute[] };
  return parsed.routes;
}

/**
 * Le corps n'est lu QUE sur un 404 : c'est le seul statut dont le verdict en
 * dépend (#5857), et une route en 200 peut rendre un fichier entier — le
 * télécharger cinq cent cinquante fois pour ne rien en faire serait payer le
 * réseau pour rien. Un corps illisible (HTML de proxy, JSON tronqué) rend
 * `undefined`, et `classifySmokeStatus` le traite comme « rien n'est prouvé ».
 */
function makeTimedFetch(timeoutMs: number): SmokeFetch {
  return async (url, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.status !== 404) return { status: response.status };
      const texte = await response.text().catch(() => '');
      try {
        return { status: response.status, body: JSON.parse(texte) as unknown };
      } catch {
        return { status: response.status };
      }
    } finally {
      clearTimeout(timer);
    }
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const allRoutes = loadManifestRoutes(options.manifestPath);
  const routes = selectSmokeRoutes(allRoutes);

  console.log(`Sonde de fumée — ${routes.length} routes /api sur ${options.baseUrl} (manifeste : ${allRoutes.length} routes au total)`);

  const results = await runRouteSmokeTest({
    baseUrl: options.baseUrl,
    routes,
    fetchImpl: makeTimedFetch(options.timeoutMs),
    concurrency: options.concurrency
  });
  const report = summarizeSmokeResults(results);

  console.log(`✓ ${report.total - report.absent.length - report.unreachable.length}/${report.total} routes servies par le conteneur`);

  if (report.absent.length > 0) {
    console.error(`\n✗ ${report.absent.length} route(s) ABSENTE(S) du conteneur servi (404) :`);
    for (const result of report.absent) {
      console.error(`  404  ${result.method.padEnd(6)} ${result.path}  (${result.module})`);
    }
  }

  if (report.unreachable.length > 0) {
    console.error(`\n✗ ${report.unreachable.length} route(s) INJOIGNABLE(S) (erreur réseau ou délai dépassé) :`);
    for (const result of report.unreachable) {
      console.error(`  ??   ${result.method.padEnd(6)} ${result.path}  (${result.module})`);
    }
  }

  if (report.absent.length > 0 || report.unreachable.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log('\nToutes les routes du manifeste répondent sur cette révision.');
}

main().catch((error) => {
  console.error('Échec du test de fumée :', error);
  process.exitCode = 1;
});
