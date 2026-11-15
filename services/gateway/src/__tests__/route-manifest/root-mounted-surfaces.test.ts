/**
 * Le témoin de #4376, critère 2 : le manifeste décrit la table de l'instance
 * RÉELLE. Quatre blocs, quatre questions séparées — la séparation EST le
 * diagnostic (cf. `services/gateway/CLAUDE.md`, § « La quatrième famille ») :
 *
 *  1. l'extraction des surfaces est-elle correcte ? (fixtures synthétiques)
 *  2. `server.ts`, AUJOURD'HUI, monte-t-il exactement les surfaces figées ?
 *  3. la table VIVANTE du collecteur porte-t-elle chaque surface déclarante ?
 *  4. l'artefact commité porte-t-il la même chose que cette table vivante ?
 *
 * Le 3 est le nouveau : c'est lui qui tombe quand une surface est montée sur
 * l'instance de production sans l'être par le collecteur — le défaut #4376
 * exactement. Le 2 tombe UN CRAN PLUS TÔT, quand la surface apparaît dans
 * `server.ts` : c'est l'ordre qui compte, la question « déclare-t-elle des
 * routes ? » ne s'étant, pour Socket.IO, jamais posée toute seule.
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Mêmes mocks que `security/route-manifest-ratchet.test.ts`, pour les mêmes
// raisons, redites parce qu'un mock recopié sans sa raison finit par être
// retiré : `@tus/server`/`@tus/file-store` sont publiés en ESM pur, que Jest ne
// transforme pas (importer `route-registration.ts` échouerait au chargement) ;
// `routes/voice-profile.ts` et `routes/voice-analysis.ts` ouvrent un VRAI
// socket ZMQ À L'ENREGISTREMENT, qui ne se ferme jamais. Ce témoin n'envoie
// aucune requête HTTP — il lui faut une table de routes, jamais un serveur
// fonctionnel.
jest.mock('@tus/server', () => ({
  Server: class MockTusServer {
    constructor(_opts: any) {}
  },
}));
jest.mock('@tus/file-store', () => ({
  FileStore: class MockFileStore {
    constructor(_opts: any) {}
  },
}));
jest.mock('../../services/ZmqSingleton', () => {
  const { EventEmitter: EE } = require('events');
  return { ZMQSingleton: { getInstance: jest.fn().mockResolvedValue(new EE()) } };
});

import {
  rootMountedSurfaces,
  undeclaredRootSurfaces,
  staleRootSurfaces,
  witnessPathsOfDeclaringSurfaces,
  stripCommentsPreservingStrings,
  ROOT_MOUNTED_SURFACES,
  type RootMountedSurface,
} from './root-mounted-surfaces';
import { buildAssembledApp } from '../../route-manifest';

const SERVER_SOURCE_PATH = path.resolve(__dirname, '../../server.ts');
const MANIFEST_PATH = path.resolve(__dirname, '../../../route-manifest.json');
const REGENERATE_COMMAND = 'cd services/gateway && npm run route-manifest:generate';

function readServerSource(): string {
  return fs.readFileSync(SERVER_SOURCE_PATH, 'utf-8');
}

describe("rootMountedSurfaces — l'extraction (#4376 critère 2)", () => {
  it('voit une surface passée en plugin à this.server.register(...)', () => {
    const source = 'await this.server.register(helmet, { global: true });';
    expect(rootMountedSurfaces(source)).toEqual([{ callee: 'helmet', via: 'register' }]);
  });

  it("voit une surface qui REÇOIT l'instance en argument, appel libre comme appel de méthode", () => {
    const source = [
      'registerRouteUsageHook(this.server);',
      'await this.socketIOHandler.setupSocketIO(this.server);',
    ].join('\n');
    expect(rootMountedSurfaces(source)).toEqual([
      { callee: 'registerRouteUsageHook', via: 'call' },
      { callee: 'this.socketIOHandler.setupSocketIO', via: 'call' },
    ]);
  });

  it("ne prend pas une MÉTHODE de l'instance pour une surface qui la reçoit", () => {
    const source = [
      "this.server.decorate('prisma', this.prisma);",
      "this.server.addHook('onRequest', hook);",
      'this.server.setErrorHandler(handler);',
      'await this.server.listen({ port: 3000 });',
    ].join('\n');
    expect(rootMountedSurfaces(source)).toEqual([]);
  });

  it('ignore les commentaires SANS avaler ce qui suit un // vivant dans une chaîne', () => {
    const source = [
      "const doc = 'https://gate.meeshy.me/docs'; registerAllRoutes(this.server, deps);",
      '// registerFantome(this.server);',
      '/* registerAutreFantome(this.server); */',
    ].join('\n');
    expect(rootMountedSurfaces(source)).toEqual([{ callee: 'registerAllRoutes', via: 'call' }]);
  });

  it("stripCommentsPreservingStrings garde le contenu des chaînes intact", () => {
    expect(stripCommentsPreservingStrings("const a = 'x // y'; // z")).toBe("const a = 'x // y'; ");
  });

  it("undeclaredRootSurfaces NOMME une surface neuve absente de la liste figée", () => {
    const observed: RootMountedSurface[] = [
      { callee: 'registerAllRoutes', via: 'call' },
      { callee: 'registerSurfaceNeuve', via: 'call' },
    ];
    expect(undeclaredRootSurfaces(observed)).toEqual([{ callee: 'registerSurfaceNeuve', via: 'call' }]);
  });

  it('staleRootSurfaces NOMME une entrée figée que la source ne porte plus', () => {
    const observed: RootMountedSurface[] = [{ callee: 'registerAllRoutes', via: 'call' }];
    const declared = [
      { callee: 'registerAllRoutes', via: 'call' as const, kind: 'declares-api-routes' as const, reason: 'r', witnessPath: '/health' },
      { callee: 'surfaceRetiree', via: 'call' as const, kind: 'no-routes' as const, reason: 'r' },
    ];
    expect(staleRootSurfaces(observed, declared)).toEqual([
      { callee: 'surfaceRetiree', via: 'call', kind: 'no-routes', reason: 'r' },
    ]);
  });

  it('chaque surface déclarante porte un witnessPath non vide — sans lui, le bloc 3 ne peut rien prouver', () => {
    for (const surface of witnessPathsOfDeclaringSurfaces()) {
      expect(surface.witnessPath).not.toBe('');
    }
  });
});

describe("server.ts RÉEL — la liste des surfaces montées sur l'instance racine est FIGÉE (#4376 critère 2)", () => {
  it("ne monte AUCUNE surface qui ne soit déclarée, avec sa nature et sa raison", () => {
    const observed = rootMountedSurfaces(readServerSource());
    const undeclared = undeclaredRootSurfaces(observed);
    if (undeclared.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        "[route-manifest] surfaces de server.ts absentes de ROOT_MOUNTED_SURFACES — dire ce qu'elles font de " +
          "l'instance racine, et si elles déclarent des routes, les monter aussi dans route-manifest/collect.ts :",
        JSON.stringify(undeclared, null, 2)
      );
    }
    expect(undeclared).toEqual([]);
  });

  it('ne DÉCLARE aucune surface que server.ts ne monte plus', () => {
    const observed = rootMountedSurfaces(readServerSource());
    expect(staleRootSurfaces(observed)).toEqual([]);
  });

  // La preuve du ROUGE, portée en permanence plutôt que faite une fois à la
  // main : le témoin ci-dessus est VERT aujourd'hui, et un témoin vert
  // n'atteste rien tant qu'on n'a pas montré sous quelle mutation il tombe
  // (§ « Toujours prouver le ROUGE », services/gateway/CLAUDE.md). La mutation
  // est appliquée à la SOURCE RÉELLE, en mémoire — pas à une fixture jouet :
  // c'est la seule façon de prouver que le balayage voit une surface neuve
  // DANS le fichier qu'il garde, avec ses 1400 lignes, ses commentaires et ses
  // chaînes.
  it("TOMBE quand une surface neuve est montée sur l'instance racine de server.ts", () => {
    const mutated = `${readServerSource()}\n// mutation du témoin :\nregisterSurfaceMontéeHorsRegisterAllRoutes(this.server, deps);\n`;
    expect(undeclaredRootSurfaces(rootMountedSurfaces(mutated))).toEqual([
      { callee: 'registerSurfaceMontéeHorsRegisterAllRoutes', via: 'call' },
    ]);
  });

  it("TOMBE de même quand la surface neuve arrive en plugin (this.server.register)", () => {
    const mutated = `${readServerSource()}\nawait this.server.register(pluginNeuf, { prefix: '/api/v1' });\n`;
    expect(undeclaredRootSurfaces(rootMountedSurfaces(mutated))).toEqual([
      { callee: 'pluginNeuf', via: 'register' },
    ]);
  });
});

describe("La table VIVANTE du collecteur porte chaque surface déclarante (#4376 critère 2)", () => {
  it('monte tout ce que server.ts monte de routes API — une surface non montée est INVISIBLE au manifeste', async () => {
    const { app, routes } = await buildAssembledApp();
    try {
      const servedPaths = new Set(routes.map((route) => route.url));
      const missing = witnessPathsOfDeclaringSurfaces().filter((surface) => !servedPaths.has(surface.witnessPath));
      if (missing.length > 0) {
        // eslint-disable-next-line no-console
        console.log(
          '[route-manifest] surfaces montées par server.ts et NON reproduites par route-manifest/collect.ts :',
          JSON.stringify(missing, null, 2)
        );
      }
      expect(missing).toEqual([]);
    } finally {
      await app.close().catch(() => undefined);
    }
  }, 60000);
});

describe("L'artefact commité porte la même table que l'instance assemblée (#4376 critère 2)", () => {
  it('contient le chemin témoin de chaque surface déclarante', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as { routes: { path: string }[] };
    const committedPaths = new Set(manifest.routes.map((route) => route.path));
    const missing = witnessPathsOfDeclaringSurfaces().filter((surface) => !committedPaths.has(surface.witnessPath));
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[route-manifest] artefact commité incomplet — régénérer : ${REGENERATE_COMMAND}`, JSON.stringify(missing, null, 2));
    }
    expect(missing).toEqual([]);
  });
});
