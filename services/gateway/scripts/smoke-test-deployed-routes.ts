/**
 * Test de fumée post-déploiement (#5644) : frappe les routes GET que les
 * clients publiés appellent réellement — dérivées de `route-manifest.json`,
 * filtrées des routes d'exploitation — et distingue un 404 (ABSENTE : le
 * serveur assemblé ne sert plus cette route) de tout autre code (PRÉSENTE :
 * le routage a matché, la suite est un verdict métier).
 *
 * Ce test aurait attrapé l'incident du 2026-09-07 : `POST
 * /api/v1/directory/friend-requests` rendait 404 en production pendant que le
 * dépôt la déclarait depuis neuf jours — un déploiement volontaire d'une
 * image antérieure à une route du manifeste fait tomber ce script pour la
 * même raison.
 *
 * Usage :
 *   SMOKE_TEST_BASE_URL=https://gate.meeshy.me npx tsx scripts/smoke-test-deployed-routes.ts
 *
 * La RÈGLE (quelles routes sonder, comment reformer leur chemin, comment lire
 * un code de statut) est pure et testée indépendamment :
 * `src/route-manifest/deploy-smoke.ts`. Ce script ne fait que lire le
 * manifeste et le réseau, et la lui passer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyRouteProbe,
  resolveSmokeTestPath,
  selectSmokeTestRoutes,
  type ManifestRouteInput,
} from '../src/route-manifest/deploy-smoke';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(ICI, '../route-manifest.json');

/** Sondes en parallèle, borné — ni une requête à la fois (lent), ni 250 d'un coup (amplificateur). */
const CONCURRENCE = 8;

type Sonde = {
  readonly route: ManifestRouteInput;
  readonly statusCode: number | null;
  readonly erreurRéseau?: string;
};

async function sonderRoute(baseUrl: string, route: ManifestRouteInput): Promise<Sonde> {
  const url = new URL(resolveSmokeTestPath(route.path), baseUrl).toString();
  try {
    const réponse = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    return { route, statusCode: réponse.status };
  } catch (erreur) {
    return { route, statusCode: null, erreurRéseau: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}

async function sonderParLots(routes: readonly ManifestRouteInput[], baseUrl: string): Promise<readonly Sonde[]> {
  const sondes: Sonde[] = [];
  for (let i = 0; i < routes.length; i += CONCURRENCE) {
    const lot = routes.slice(i, i + CONCURRENCE);
    sondes.push(...(await Promise.all(lot.map((route) => sonderRoute(baseUrl, route)))));
  }
  return sondes;
}

async function main(): Promise<void> {
  const baseUrl = process.env.SMOKE_TEST_BASE_URL;
  if (!baseUrl) {
    console.error('[smoke-test-deployed-routes] SMOKE_TEST_BASE_URL est requis (ex. https://gate.meeshy.me)');
    process.exit(1);
  }

  const manifeste = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as { routes: ManifestRouteInput[] };
  const routes = selectSmokeTestRoutes(manifeste);
  console.log(`[smoke-test-deployed-routes] ${routes.length} route(s) GET client à sonder contre ${baseUrl}`);

  const sondes = await sonderParLots(routes, baseUrl);

  const absentes = sondes.filter((sonde) => sonde.statusCode !== null && classifyRouteProbe(sonde.statusCode) === 'absent');
  const échecsRéseau = sondes.filter((sonde) => sonde.statusCode === null);

  for (const sonde of absentes) {
    console.log(`::error::[ABSENTE] GET ${sonde.route.path} → 404`);
  }
  for (const sonde of échecsRéseau) {
    console.log(`::warning::[RÉSEAU] GET ${sonde.route.path} → ${sonde.erreurRéseau}`);
  }

  const présentes = sondes.length - absentes.length - échecsRéseau.length;
  console.log(
    `[smoke-test-deployed-routes] ${présentes} présente(s), ${absentes.length} absente(s), ${échecsRéseau.length} échec(s) réseau`
  );

  process.exit(absentes.length > 0 ? 1 : 0);
}

main().catch((erreur) => {
  console.error('[smoke-test-deployed-routes]', erreur);
  process.exit(1);
});
