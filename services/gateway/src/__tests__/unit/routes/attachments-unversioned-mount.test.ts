/**
 * Témoin du montage NON VERSIONNÉ des pièces jointes (issue #4187).
 *
 * Ce que le doublon coûtait : `attachmentRoutes` était monté DEUX fois —
 * `/api/v1` et `/api` — et les dix couples y étaient servis en double, dont un
 * `POST /attachments/upload` et un `DELETE /attachments/:attachmentId`. Toute
 * règle de proxy ou de WAF écrite pour `/api/v1/attachments/*` ratait
 * silencieusement `/api/attachments/*` : une garde posée d'un côté ne protégeait
 * pas l'autre chemin, et le contournement ne demandait qu'à retirer « v1 » de
 * l'URL. Seule `GET /attachments/file/*` a une raison de survivre sous `/api` —
 * des `fileUrl` de cette forme sont persistées en base depuis des années et
 * voyagent dans des notifications déjà livrées ; une URL en base ne se migre pas
 * par un déploiement.
 *
 * Emplacement du témoin : il interroge la TABLE DE ROUTES d'un serveur
 * réellement monté, jamais le fichier de routes — le double montage venait de
 * `route-registration.ts`, et un témoin posé sur le plugin n'y aurait rien vu.
 * Le montage reproduit ici est copié de `route-registration.ts` (le même
 * spécificateur d'import, les mêmes deux préfixes) et un témoin de PRÉMISSE
 * relit ce fichier pour que la reproduction ne puisse pas dériver en silence :
 * si le site de montage change de forme, c'est ce témoin-là qui rougit, pas la
 * production qui s'ouvre en douce.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import Fastify from 'fastify';

// Spécificateur COPIÉ de `route-registration.ts` : `./routes/attachments`, la
// coquille de ré-export — jamais `./routes/attachments/index`, qui court-
// circuiterait le chemin que la production emprunte réellement.
import { attachmentRoutes } from '../../../routes/attachments';

const API_PREFIX = '/api/v1';
const LEGACY_PREFIX = '/api';

/** Les dix couples que `attachmentRoutes` déclare, sans préfixe. */
const ALL_COUPLES: ReadonlyArray<readonly [string, string]> = [
  ['POST', '/attachments/upload'],
  ['POST', '/attachments/upload-text'],
  ['GET', '/attachments/:attachmentId'],
  ['GET', '/attachments/:attachmentId/thumbnail'],
  ['GET', '/attachments/file/*'],
  ['GET', '/attachments/:attachmentId/metadata'],
  ['DELETE', '/attachments/:attachmentId'],
  ['GET', '/conversations/:conversationId/attachments'],
  ['POST', '/attachments/:attachmentId/translate'],
  ['POST', '/attachments/:attachmentId/transcribe'],
];

/** Le seul couple qui a une raison de survivre sous `/api`. */
const LEGACY_SURVIVOR = 'GET /attachments/file/*';

function coupleKey(method: string, url: string): string {
  return `${method} ${url}`;
}

/**
 * Double Prisma minimal : `attachmentRoutes` ne fait que vérifier sa présence
 * et le passer aux services, dont aucun n'ouvre de requête à l'ENREGISTREMENT.
 * Rien ici ne doit répondre — le témoin porte sur la table de routes, pas sur
 * un handler.
 */
function makePrismaStub(): unknown {
  return {};
}

/**
 * Les options AJV sont celles de `server.ts` — sans elles, le mot-clé `example`
 * des schémas OpenAPI fait échouer la construction de la validation, et le
 * témoin mesurerait un serveur que la production n'a jamais.
 */
function buildApp() {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: {
        strict: 'log' as const,
        keywords: ['example'],
      },
    },
  });
  app.decorate('prisma', makePrismaStub() as never);
  return app;
}

/**
 * Monte les DEUX enregistrements exactement comme `route-registration.ts`, puis
 * rend la table de routes RÉELLEMENT enregistrée (`onRoute` voit les routes des
 * contextes encapsulés fils, préfixe compris).
 */
async function mountedRouteTable(): Promise<Set<string>> {
  const app = buildApp();

  const table = new Set<string>();
  app.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];
    for (const method of methods) {
      table.add(coupleKey(method, routeOptions.url));
    }
  });

  await app.register(attachmentRoutes, { prefix: API_PREFIX });
  await app.register(attachmentRoutes, { prefix: LEGACY_PREFIX });
  await app.ready();
  await app.close();

  return table;
}

describe('montage non versionné des pièces jointes (#4187)', () => {
  let table: Set<string>;

  beforeAll(async () => {
    table = await mountedRouteTable();
  });

  it('sert les DIX couples sous /api/v1 — le montage versionné est inchangé', () => {
    const missing = ALL_COUPLES
      .map(([method, url]) => coupleKey(method, `${API_PREFIX}${url}`))
      .filter((key) => !table.has(key));

    expect(missing).toEqual([]);
  });

  it('ne sert QUE la lecture d\'octets par chemin sous /api', () => {
    const legacyCouples = [...table].filter((key) => {
      const url = key.slice(key.indexOf(' ') + 1);
      return url.startsWith(`${LEGACY_PREFIX}/`) && !url.startsWith(`${API_PREFIX}/`);
    });

    // `HEAD` est ajouté par Fastify lui-même (`exposeHeadRoutes`, actif par
    // défaut) sur toute route `GET` : c'est la même lecture d'octets, sans corps.
    expect(legacyCouples.sort()).toEqual([
      coupleKey('GET', `${LEGACY_PREFIX}/attachments/file/*`),
      coupleKey('HEAD', `${LEGACY_PREFIX}/attachments/file/*`),
    ]);
  });

  it('retire les NEUF autres couples du chemin sans v1 — dont l\'upload et le delete', () => {
    const stillDoubled = ALL_COUPLES
      .filter(([method, url]) => coupleKey(method, url) !== LEGACY_SURVIVOR)
      .map(([method, url]) => coupleKey(method, `${LEGACY_PREFIX}${url}`))
      .filter((key) => table.has(key));

    expect(stillDoubled).toEqual([]);
  });

  it('répond 404 sur POST /api/attachments/upload et DELETE /api/attachments/:id', async () => {
    const app = buildApp();
    await app.register(attachmentRoutes, { prefix: API_PREFIX });
    await app.register(attachmentRoutes, { prefix: LEGACY_PREFIX });
    await app.ready();

    const upload = await app.inject({ method: 'POST', url: '/api/attachments/upload' });
    const remove = await app.inject({
      method: 'DELETE',
      url: '/api/attachments/aabbccddeeff001122334455',
    });

    await app.close();

    expect(upload.statusCode).toBe(404);
    expect(remove.statusCode).toBe(404);
  });

  /**
   * PRÉMISSE du témoin, et non décoration : les assertions ci-dessus ne valent
   * pour la PRODUCTION que si `route-registration.ts` monte bien ce que ce
   * fichier reproduit. Un témoin de table de routes qui compose lui-même son
   * montage atteste sa propre composition — c'est ce contrôle-ci, et lui seul,
   * qui le rattache au serveur réel.
   *
   * DEUX formes sont acceptées sous `/api`, parce qu'elles rendent la MÊME
   * table : `attachmentRoutes` (qui se ramène de lui-même à l'alias sous ce
   * préfixe) et `attachmentLegacyFileRoutes` (l'alias nommé explicitement au
   * site de montage). Toute TROISIÈME forme — un autre symbole, un montage de
   * plus, un préfixe de plus — invalide la reproduction et doit rougir ici.
   */
  it('reproduit le montage que route-registration.ts déclare vraiment', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../route-registration.ts'),
      'utf-8'
    );

    expect(source).toContain(
      'await server.register(attachmentRoutes, { prefix: API_PREFIX });'
    );
    expect(source).toContain('const API_PREFIX = `/api/${API_VERSION}`;');

    const legacyMounts = [
      ...source.matchAll(
        /await server\.register\((attachment\w*), \{ prefix: '\/api' \}\);/g
      ),
    ].map((match) => match[1]);

    expect(legacyMounts).toEqual([expect.any(String)]);
    expect(['attachmentRoutes', 'attachmentLegacyFileRoutes']).toContain(
      legacyMounts[0]
    );
  });
});
