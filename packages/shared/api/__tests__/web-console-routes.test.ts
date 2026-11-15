/**
 * Les routes que seule la console d'administration WEB lit (#11280, #12266) :
 * `route-readers.ts` les retire des catalogues NATIFS (Swift, Kotlin). Le
 * catalogue TS les garde : c'est lui qui les sert.
 * Une entrée native sans lecteur possible n'est pas une dette à compter
 * (`check-swift-catalog-dead-entries.mjs`), c'est une adresse qui n'avait pas à
 * être générée.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { OPS_ONLY_ROUTES } from '../ops-only-routes.js';
import { WEB_CONSOLE_ROUTES } from '../web-console-routes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const read = (path: string) => readFileSync(resolve(REPO_ROOT, path), 'utf8');

describe('WEB_CONSOLE_ROUTES — la liste elle-même', () => {
  it('chaque entrée a sa raison, ne double pas la liste d’exploitation et désigne une route SERVIE', () => {
    const manifest = JSON.parse(read('services/gateway/route-manifest.json')) as { routes: { method: string; path: string }[] };
    const served = new Set(manifest.routes.map((route) => `${route.method} ${route.path}`));
    const ops = new Set(OPS_ONLY_ROUTES.map((route) => `${route.method} ${route.path}`));
    for (const route of WEB_CONSOLE_ROUTES) {
      expect(route.reason.length).toBeGreaterThan(20);
      expect(served.has(`${route.method} ${route.path}`)).toBe(true);
      expect(ops.has(`${route.method} ${route.path}`)).toBe(false);
    }
  });
});

describe('la lecture de la qualité de lecture n’existe que dans le catalogue web', () => {
  it('le catalogue TS la porte, le Swift et le Kotlin non', () => {
    expect(read('packages/shared/api/endpoints/admin.ts')).toContain('/api/v1/admin/analytics/playback');
    expect(read('packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/AdminEndpoint.swift')).not.toContain('/api/v1/admin/analytics/playback');
    expect(read('apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/routes/ApiRoutesAdmin.kt')).not.toContain('/api/v1/admin/analytics/playback');
  });
});

describe('le registre des packs (#11275) n’existe que dans le catalogue web', () => {
  it('le catalogue TS le porte, le Swift et le Kotlin non', () => {
    expect(read('packages/shared/api/endpoints/admin.ts')).toContain('/api/v1/admin/packs/registry');
    expect(read('packages/MeeshySDK/Sources/MeeshySDK/Networking/Endpoints/AdminEndpoint.swift')).not.toContain('/api/v1/admin/packs/registry');
    expect(read('apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/routes/ApiRoutesAdmin.kt')).not.toContain('/api/v1/admin/packs/registry');
  });

  it('ses trois routes sont déclarées lues par la console web', () => {
    const keys = WEB_CONSOLE_ROUTES.map((route) => `${route.method} ${route.path}`);
    expect(keys).toEqual(
      expect.arrayContaining([
        'GET /api/v1/admin/packs/registry',
        'PUT /api/v1/admin/packs/registry/:domain/:slug',
        'DELETE /api/v1/admin/packs/registry/:domain/:slug',
      ]),
    );
  });
});
