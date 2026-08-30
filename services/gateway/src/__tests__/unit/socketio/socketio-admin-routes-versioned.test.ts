/**
 * Les deux routes d'administration Socket.IO portent la VERSION d'API.
 *
 * ## Le défaut
 *
 * `setupSocketIO` déclarait `/api/socketio/stats` et
 * `/api/socketio/disconnect-user` — chemins écrits EN DUR, sans version. Le
 * dépôt sert 534 routes ; seize vivaient hors `/api/v1`, et sur ces seize :
 * treize sont des alias dépréciés qui annoncent leur successeur, deux sont des
 * sondes d'infrastructure (`/health`, `/info`) légitimement hors version. Ces
 * deux-ci n'étaient ni l'un ni l'autre : leur SEULE adresse, sans version.
 *
 * La version d'API est une CONFIGURATION (`apiBasePath()`, source unique) :
 * elle peut devenir `/api/v2`, ou se déplacer vers `api.domaine.tld/v2/`. Un
 * littéral la fige à l'insu de son module — et ces deux-là ne bougeraient pas
 * avec le reste.
 *
 * ## Pourquoi personne ne l'avait vu
 *
 * `setupSocketIO` est appelée au démarrage, HORS de `registerAllRoutes`. Le
 * collecteur du manifeste ne monte que `registerAllRoutes`, donc ces deux
 * routes n'apparaissent dans AUCUN manifeste — ni dans le catalogue client qui
 * en dérive, ni dans les audits qui s'y appuient. `grep -c socketio
 * route-manifest.json` rend 0 alors que `GET /api/socketio/stats` répond 403
 * en production de staging. Le défaut de visibilité (#4376) protégeait le
 * défaut d'adresse.
 *
 * ## L'ancienne adresse reste servie, et l'annonce
 *
 * Aucun client ne l'appelle (mesuré sur les quatre surfaces). Elle est
 * néanmoins conservée en ALIAS DÉPRÉCIÉ plutôt que retirée : le dépôt ne
 * retire pas une adresse sur une revue de code client, mais sur un compteur
 * d'accès nul (#4275). Une console d'administration tierce, un signet, un
 * script d'exploitation ne sont dans aucun `grep`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { apiPath } from '@meeshy/shared/api/prefix';

const mockManager = {
  initialize: jest.fn<any>().mockResolvedValue(undefined),
  getStats: jest.fn<any>().mockReturnValue({ connectedUsers: 0, rooms: 0 }),
  disconnectUser: jest.fn<any>().mockReturnValue(true),
};

jest.mock('../../../socketio/MeeshySocketIOManager', () => ({
  MeeshySocketIOManager: jest.fn().mockImplementation(() => mockManager),
}));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn(),
}));
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logError: jest.fn(),
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

/**
 * `requireAdmin` en passe-plat : ce témoin porte sur l'ADRESSE, pas sur le
 * rang. C'est `authenticate` qui refuse, et c'est suffisant — l'annonce de
 * dépréciation court avant les deux.
 */
jest.mock('../../../middleware/auth', () => ({
  requireAdmin: jest.fn<any>(async () => undefined),
}));

import { MeeshySocketIOHandler } from '../../../socketio/MeeshySocketIOHandler';

/**
 * `authenticate` REFUSE : l'annonce de dépréciation court en `onRequest`, donc
 * avant elle — et le témoin n'a besoin d'aucun double de la couche métier.
 */
async function monter(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', {} as never);
  app.decorate('authenticate', async (
    _req: unknown,
    reply: { status: (n: number) => { send: (b: unknown) => Promise<void> } }
  ) => {
    await reply.status(401).send({ success: false, error: 'Unauthorized' });
  });

  const handler = new MeeshySocketIOHandler({} as never, 'secret', {} as never);
  await handler.setupSocketIO(app);
  await app.ready();
  return app;
}

describe("Les routes d'administration Socket.IO portent la version d'API", () => {
  it.each([
    ['GET' as const, '/socketio/stats'],
    ['POST' as const, '/socketio/disconnect-user'],
  ])('%s %s est servie sous le préfixe versionné', async (methode, relatif) => {
    const app = await monter();

    const res = await app.inject({ method: methode, url: apiPath(relatif), payload: {} });

    // 401 et non 404 : la route EXISTE, c'est l'authentification qui refuse.
    expect(res.statusCode).toBe(401);

    await app.close();
  });

  /**
   * Le contre-témoin : sans lui, une route montée sur un chemin ARBITRAIRE
   * passerait le témoin ci-dessus si un attrape-tout répondait 401 partout.
   */
  it("un chemin voisin qui n'existe pas rend bien 404", async () => {
    const app = await monter();
    const res = await app.inject({ method: 'GET', url: apiPath('/socketio/inexistante') });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("L'ancienne adresse sans version reste servie et DIT qu'elle est en sursis", () => {
  it.each([
    ['GET' as const, '/api/socketio/stats', '/socketio/stats'],
    ['POST' as const, '/api/socketio/disconnect-user', '/socketio/disconnect-user'],
  ])('%s %s annonce son successeur, même sur un refus', async (methode, ancienne, relatif) => {
    const app = await monter();

    const res = await app.inject({ method: methode, url: ancienne, payload: {} });

    expect(res.statusCode).toBe(401);
    expect(res.headers.link).toBe(`<${apiPath(relatif)}>; rel="successor-version"`);
    expect(res.headers.deprecation).toMatch(/^@\d+$/);

    await app.close();
  });
});

describe("Aucun chemin d'API n'est écrit en dur dans ce module", () => {
  /**
   * La garde de la CAUSE, pas du symptôme. Les deux témoins ci-dessus
   * tomberaient si quelqu'un réécrivait les chemins à la main en gardant les
   * mêmes valeurs — ce qui compile, passe, et refige la version.
   */
  //
  // Les DEUX fichiers, et pas seulement celui qui porte les déclarations
  // aujourd'hui. #4376 les a extraites de `MeeshySocketIOHandler.ts` vers
  // `socketio-admin-routes.ts`, pour que le collecteur du manifeste monte le
  // MÊME plugin que la production ; une garde restée pointée sur le fichier
  // d'origine aurait continué de passer en ne gardant plus rien — un témoin
  // vacant, qui est pire qu'un témoin absent parce qu'il occupe la place.
  // Les deux sont donc lus : celui qui DÉCLARE et celui qui MONTE.
  it.each([
    ['socketio-admin-routes.ts'],
    ['MeeshySocketIOHandler.ts'],
  ])("%s ne contient aucun littéral commençant par /api/v", (fichier) => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'socketio', fichier),
      'utf8'
    );

    // Les COMMENTAIRES d'abord : un chemin cité en prose (`/api/v2` dans le
    // doc-comment qui explique pourquoi la version ne doit pas être figée)
    // n'est pas un littéral d'appel. Sans ce dépouillement, la garde attrape
    // sa propre justification — c'est le faux positif que la garde web
    // (`api-path-literal-guard`) écarte de la même façon.
    const sansCommentaires = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    const litteraux = sansCommentaires.match(/['"`]\/api\/v\d[^'"`]*['"`]/g) ?? [];

    expect(litteraux).toEqual([]);
  });

  /**
   * La preuve que la garde ci-dessus peut TOMBER, portée en permanence : un
   * témoin de source qui n'a jamais rougi n'atteste pas qu'il regarde le bon
   * fichier — c'est exactement ce qui lui est arrivé au moment de l'extraction
   * de #4376, où il a continué de passer en lisant un fichier vidé de ce qu'il
   * gardait.
   */
  it('la garde TOMBE sur un module qui refigerait la version en dur', () => {
    const source = "fastify.get('/api/v1/socketio/stats', {}, servirStats);";
    const sansCommentaires = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    expect(sansCommentaires.match(/['"`]\/api\/v\d[^'"`]*['"`]/g) ?? []).toEqual([
      "'/api/v1/socketio/stats'",
    ]);
  });
});
