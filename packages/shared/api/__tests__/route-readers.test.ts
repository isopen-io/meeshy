/**
 * TDD des LECTEURS DÉCLARÉS d'une route (#11271, décision du 2026-10-23 sur
 * #12288, dans la ligne de #12266) : une route ne se génère que dans le
 * catalogue d'un client qui la LIT. Une route non déclarée reste lue par
 * tous — rien ne change pour elle ; une route déclarée quitte le catalogue
 * natif de tout client qu'elle ne nomme pas. Le catalogue TS ne filtre pas :
 * son cliquet exige que le web, qui le sert, ait le lecteur.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { OPS_ONLY_ROUTES } from '../ops-only-routes.js';
import { ROUTE_READERS, filterRoutesReadBy, readersOf } from '../route-readers.js';
import { WEB_CONSOLE_ROUTES } from '../web-console-routes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const read = (path: string) => readFileSync(resolve(REPO_ROOT, path), 'utf8');
const keyOf = (route: { method: string; path: string }) => `${route.method} ${route.path}`;

const UNDECLARED = { method: 'GET', path: '/api/v1/conversations' };
const LENS_CATALOG = { method: 'GET', path: '/api/v1/packs/lens' };

describe('readersOf — qui lit une route', () => {
  it('une route non déclarée est lue par tous les clients : null', () => {
    expect(readersOf(UNDECLARED)).toBeNull();
  });

  it('les routes des lens ne sont lues, pour l’instant, que par le web', () => {
    expect(readersOf(LENS_CATALOG)).toEqual(['web']);
  });

  it('chaque route de la console web est déclarée lue par le web seul', () => {
    for (const route of WEB_CONSOLE_ROUTES) expect(readersOf(route)).toEqual(['web']);
  });

  it('distingue par MÉTHODE', () => {
    expect(readersOf({ method: 'PATCH', path: LENS_CATALOG.path })).toBeNull();
  });
});

describe('filterRoutesReadBy — le catalogue d’un client natif ne garde que ce qu’il lit', () => {
  it('garde une route non déclarée, retire une route web seulement, pour iOS comme pour Android', () => {
    expect(filterRoutesReadBy([UNDECLARED, LENS_CATALOG], 'ios')).toEqual([UNDECLARED]);
    expect(filterRoutesReadBy([UNDECLARED, LENS_CATALOG], 'android')).toEqual([UNDECLARED]);
  });

  it('une route déclarée lue par iOS reste dans le catalogue iOS et quitte celui d’Android', () => {
    const declarations = [{ ...LENS_CATALOG, readers: ['web', 'ios'] as const, reason: 'lue par le composer iOS' }];
    expect(filterRoutesReadBy([LENS_CATALOG], 'ios', declarations)).toEqual([LENS_CATALOG]);
    expect(filterRoutesReadBy([LENS_CATALOG], 'android', declarations)).toEqual([]);
  });

  it('les onze routes des lens quittent les deux catalogues natifs', () => {
    const manifest = JSON.parse(read('services/gateway/route-manifest.json')) as { routes: { method: string; path: string }[] };
    const lens = manifest.routes.filter((route) => route.path.startsWith('/api/v1/packs/lens'));
    expect(lens).toHaveLength(11);
    expect(filterRoutesReadBy(lens, 'ios')).toEqual([]);
    expect(filterRoutesReadBy(lens, 'android')).toEqual([]);
  });
});

describe('ROUTE_READERS — la déclaration elle-même', () => {
  it('chaque entrée a sa raison, au moins un lecteur connu, désigne une route SERVIE hors exploitation, sans doublon', () => {
    const manifest = JSON.parse(read('services/gateway/route-manifest.json')) as { routes: { method: string; path: string }[] };
    const served = new Set(manifest.routes.map(keyOf));
    const ops = new Set(OPS_ONLY_ROUTES.map(keyOf));
    const keys = ROUTE_READERS.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
    for (const route of ROUTE_READERS) {
      expect(route.reason.length).toBeGreaterThan(20);
      expect(route.readers.length).toBeGreaterThan(0);
      expect(route.readers.every((reader) => ['web', 'ios', 'android'].includes(reader))).toBe(true);
      expect(served.has(keyOf(route))).toBe(true);
      expect(ops.has(keyOf(route))).toBe(false);
    }
  });
});
