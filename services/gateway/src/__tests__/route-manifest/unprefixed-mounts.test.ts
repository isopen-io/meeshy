/**
 * Le témoin de #4367, critère 3 : aucun module n'est monté sans préfixe sans
 * une décision ÉCRITE, et une décision qui expose des adresses racine DIT ce
 * que ces adresses ne reçoivent pas.
 *
 * Trois blocs, trois questions séparées — la séparation EST le diagnostic :
 *
 *  1. le balayage est-il correct ? (fixtures synthétiques, fautives puis
 *     corrigées : une garde négative dont le balayage rend `[]` reste verte
 *     pour rien tant qu'on n'a pas montré ce qui la fait rougir)
 *  2. le manifeste RÉEL, aujourd'hui, satisfait-il la règle ? (et le balayage
 *     a-t-il vraiment LU un manifeste entier, plutôt qu'un tableau vide)
 *  3. la règle tombe-t-elle sur le manifeste RÉEL muté ? (la méta-preuve :
 *     mutation appliquée à l'artefact réel, en mémoire, pas à une fixture
 *     jouet — c'est la seule façon de prouver que le balayage voit un montage
 *     neuf DANS l'artefact qu'il garde, a sa taille reelle du jour -- le
 *     compte n'est pas cite ici : il bouge a chaque route ajoutee, et une
 *     prose qui l'epingle est perimee au lot suivant)
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

import {
  servedUnderApi,
  unprefixedModules,
  undeclaredUnprefixedModules,
  staleUnprefixedDecisions,
  miscountedUnprefixedModules,
  misdeclaredPerimeters,
  decisionsMissingPerimeterConsequence,
  UNPREFIXED_MOUNT_DECISIONS,
  type MountedRoute,
  type UnprefixedMountDecision,
} from './unprefixed-mounts';

const MANIFEST_PATH = path.resolve(__dirname, '../../../route-manifest.json');
const REGENERATE_COMMAND = 'cd services/gateway && npm run route-manifest:generate';

function readManifestRoutes(): MountedRoute[] {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as { routes: MountedRoute[] };
  return manifest.routes;
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Le balayage
// ───────────────────────────────────────────────────────────────────────────

describe('unprefixedModules — le balayage (#4367 critère 3)', () => {
  it('ignore les routes qui ont reçu un préfixe et ne garde que les montages nus', () => {
    const routes: MountedRoute[] = [
      { method: 'GET', path: '/api/v1/users', module: 'userRoutes', mountPrefix: '/api/v1' },
      { method: 'GET', path: '/health', module: 'registerAllRoutes', mountPrefix: '' },
    ];
    expect(unprefixedModules(routes)).toEqual([
      { module: 'registerAllRoutes', routeCount: 1, perimeter: 'hors-api', pathsOutsideApi: ['/health'] },
    ]);
  });

  it('groupe par module et compte les routes, GET et POST d\'une même adresse comprises', () => {
    const routes: MountedRoute[] = [
      { method: 'GET', path: '/voice/analysis', module: 'aliasRoutes', mountPrefix: '' },
      { method: 'POST', path: '/voice/analysis', module: 'aliasRoutes', mountPrefix: '' },
    ];
    expect(unprefixedModules(routes)).toEqual([
      { module: 'aliasRoutes', routeCount: 2, perimeter: 'hors-api', pathsOutsideApi: ['/voice/analysis'] },
    ]);
  });

  it("dit `sous-api` d'un module nu dont TOUTES les adresses portent /api en dur", () => {
    const routes: MountedRoute[] = [
      { method: 'POST', path: '/api/v1/uploads', module: 'registerTusRoutes', mountPrefix: '' },
      { method: 'PATCH', path: '/api/v1/uploads/*', module: 'registerTusRoutes', mountPrefix: '' },
    ];
    expect(unprefixedModules(routes)).toEqual([
      { module: 'registerTusRoutes', routeCount: 2, perimeter: 'sous-api', pathsOutsideApi: [] },
    ]);
  });

  it("bascule un module `sous-api` en `hors-api` dès UNE adresse racine, et la NOMME", () => {
    const routes: MountedRoute[] = [
      { method: 'POST', path: '/api/v1/uploads', module: 'registerTusRoutes', mountPrefix: '' },
      { method: 'GET', path: '/uploads/probe', module: 'registerTusRoutes', mountPrefix: '' },
    ];
    expect(unprefixedModules(routes)).toEqual([
      {
        module: 'registerTusRoutes',
        routeCount: 2,
        perimeter: 'hors-api',
        pathsOutsideApi: ['/uploads/probe'],
      },
    ]);
  });

  it('servedUnderApi ne range pas /apiary sous le périmètre de /api', () => {
    expect(servedUnderApi('/api')).toBe(true);
    expect(servedUnderApi('/api/v1/users')).toBe(true);
    expect(servedUnderApi('/apiary')).toBe(false);
    expect(servedUnderApi('/voice/analysis')).toBe(false);
  });
});

describe('Les cinq écarts que le témoin sait NOMMER (#4367 critère 3)', () => {
  const declaree: UnprefixedMountDecision = {
    module: 'aliasRoutes',
    routeCount: 2,
    perimeter: 'hors-api',
    reason: 'alias racine déprécié',
    decisionAt: 'routes/index.ts',
    perimeterConsequence: 'hors de toute règle ancrée sur /api',
  };

  it('NOMME un module nu que rien ne déclare — puis se tait quand il est déclaré', () => {
    const observed = unprefixedModules([
      { method: 'GET', path: '/surface/neuve', module: 'moduleNeuf', mountPrefix: '' },
    ]);
    expect(undeclaredUnprefixedModules(observed, [])).toEqual([
      { module: 'moduleNeuf', routeCount: 1, perimeter: 'hors-api', pathsOutsideApi: ['/surface/neuve'] },
    ]);
    expect(
      undeclaredUnprefixedModules(observed, [{ ...declaree, module: 'moduleNeuf', routeCount: 1 }])
    ).toEqual([]);
  });

  it('NOMME une décision que le manifeste ne porte plus', () => {
    expect(staleUnprefixedDecisions([], [declaree])).toEqual([declaree]);
  });

  it("NOMME l'écart de décompte quand un module déjà dispensé de préfixe grandit", () => {
    const observed = unprefixedModules([
      { method: 'GET', path: '/voice/analysis', module: 'aliasRoutes', mountPrefix: '' },
      { method: 'POST', path: '/voice/analysis', module: 'aliasRoutes', mountPrefix: '' },
      { method: 'DELETE', path: '/voice/analysis', module: 'aliasRoutes', mountPrefix: '' },
    ]);
    expect(miscountedUnprefixedModules(observed, [declaree])).toEqual([
      { module: 'aliasRoutes', declared: 2, observed: 3 },
    ]);
    expect(miscountedUnprefixedModules(observed, [{ ...declaree, routeCount: 3 }])).toEqual([]);
  });

  it("NOMME un module réputé `sous-api` qui vient de servir une adresse racine", () => {
    const observed = unprefixedModules([
      { method: 'POST', path: '/api/v1/uploads', module: 'registerTusRoutes', mountPrefix: '' },
      { method: 'GET', path: '/uploads/probe', module: 'registerTusRoutes', mountPrefix: '' },
    ]);
    const declarationOptimiste: UnprefixedMountDecision = {
      module: 'registerTusRoutes',
      routeCount: 2,
      perimeter: 'sous-api',
      reason: 'chemins absolus écrits en dur',
      decisionAt: 'routes/uploads/tus-handler.ts',
    };
    expect(misdeclaredPerimeters(observed, [declarationOptimiste])).toEqual([
      {
        module: 'registerTusRoutes',
        declared: 'sous-api',
        observed: 'hors-api',
        pathsOutsideApi: ['/uploads/probe'],
      },
    ]);
  });

  it("NOMME une décision `hors-api` qui ne DIT pas sa conséquence de périmètre", () => {
    const muette: UnprefixedMountDecision = {
      module: 'aliasRoutes',
      routeCount: 2,
      perimeter: 'hors-api',
      reason: "l'adresse est motivée, le périmètre ne l'est pas",
      decisionAt: 'routes/index.ts',
    };
    expect(decisionsMissingPerimeterConsequence([muette])).toEqual([muette]);
    // Une conséquence RÉDUITE À DES ESPACES est une conséquence absente : le
    // champ existe, donc le type est satisfait, et il ne dit rien.
    const blanche = { ...muette, perimeterConsequence: '   ' };
    expect(decisionsMissingPerimeterConsequence([blanche])).toEqual([blanche]);
    expect(decisionsMissingPerimeterConsequence([declaree])).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Le manifeste RÉEL
// ───────────────────────────────────────────────────────────────────────────

describe('Le manifeste RÉEL (#4367 critère 3, mesuré sur route-manifest.json)', () => {
  it("a bien LU un manifeste entier, et y a bien TROUVÉ des montages nus", () => {
    // La méta-preuve du balayage : les trois assertions ci-dessous tombent si
    // l'artefact devient illisible, si la colonne `mountPrefix` disparaît, ou
    // si le chemin du fichier dérive — trois façons dont un témoin NÉGATIF
    // passe au vert sans avoir rien mesuré.
    const routes = readManifestRoutes();
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.every((route) => typeof route.mountPrefix === 'string')).toBe(true);

    const observed = unprefixedModules(routes);
    expect(observed.length).toBeGreaterThan(0);
    expect(observed.reduce((total, module) => total + module.routeCount, 0)).toBe(
      UNPREFIXED_MOUNT_DECISIONS.reduce((total, decision) => total + decision.routeCount, 0)
    );
  });

  it('ne monte AUCUN module sans préfixe qui ne soit déclaré, avec sa raison et son périmètre', () => {
    const undeclared = undeclaredUnprefixedModules(unprefixedModules(readManifestRoutes()));
    if (undeclared.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        "[route-manifest] modules montés sans préfixe et absents de UNPREFIXED_MOUNT_DECISIONS — dire POURQUOI " +
          "ils n'ont pas de prefix Fastify, OÙ la décision est écrite, et — si leurs adresses sortent de /api — " +
          'ce à quoi elles échappent (#4367 critère 1) :',
        JSON.stringify(undeclared, null, 2)
      );
    }
    expect(undeclared).toEqual([]);
  });

  it('ne DÉCLARE aucun module que le manifeste ne porte plus', () => {
    const stale = staleUnprefixedDecisions(unprefixedModules(readManifestRoutes()));
    if (stale.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[route-manifest] décisions périmées — régénérer d'abord : ${REGENERATE_COMMAND}`, JSON.stringify(stale, null, 2));
    }
    expect(stale).toEqual([]);
  });

  it('fige le décompte de chaque module nu — un module dispensé de préfixe ne grandit pas en silence', () => {
    expect(miscountedUnprefixedModules(unprefixedModules(readManifestRoutes()))).toEqual([]);
  });

  it('déclare le PÉRIMÈTRE réel de chaque module nu', () => {
    expect(misdeclaredPerimeters(unprefixedModules(readManifestRoutes()))).toEqual([]);
  });

  it("dit, pour chaque module servant hors /api, ce que ces adresses ne reçoivent pas", () => {
    expect(decisionsMissingPerimeterConsequence()).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. La méta-preuve : le témoin TOMBE sur le manifeste réel muté
// ───────────────────────────────────────────────────────────────────────────

describe('Le témoin TOMBE sur le manifeste RÉEL muté (#4367 critère 3)', () => {
  it("NOMME un module neuf monté sans préfixe, ajouté à l'artefact réel", () => {
    const mutated: MountedRoute[] = [
      ...readManifestRoutes(),
      { method: 'GET', path: '/nouvelle-surface/racine', module: 'moduleMonteSansPrefixe', mountPrefix: '' },
    ];
    expect(undeclaredUnprefixedModules(unprefixedModules(mutated))).toEqual([
      {
        module: 'moduleMonteSansPrefixe',
        routeCount: 1,
        perimeter: 'hors-api',
        pathsOutsideApi: ['/nouvelle-surface/racine'],
      },
    ]);
  });

  it("NOMME une route ajoutée à un module DÉJÀ déclaré — l'exemption ne s'étend pas toute seule", () => {
    const cible = UNPREFIXED_MOUNT_DECISIONS[0];
    const mutated: MountedRoute[] = [
      ...readManifestRoutes(),
      { method: 'GET', path: '/api/v1/route-ajoutee-en-douce', module: cible.module, mountPrefix: '' },
    ];
    expect(miscountedUnprefixedModules(unprefixedModules(mutated))).toEqual([
      { module: cible.module, declared: cible.routeCount, observed: cible.routeCount + 1 },
    ]);
  });

  it("NOMME un module déclaré `sous-api` qui se met à servir une adresse racine", () => {
    const cible = UNPREFIXED_MOUNT_DECISIONS.find((decision) => decision.perimeter === 'sous-api');
    const mutated: MountedRoute[] = [
      ...readManifestRoutes(),
      { method: 'GET', path: '/echappee-hors-api', module: cible.module, mountPrefix: '' },
    ];
    expect(misdeclaredPerimeters(unprefixedModules(mutated))).toEqual([
      {
        module: cible.module,
        declared: 'sous-api',
        observed: 'hors-api',
        pathsOutsideApi: ['/echappee-hors-api'],
      },
    ]);
  });
});
