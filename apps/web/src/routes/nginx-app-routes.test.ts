import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { ROUTES } from './route-table';

/**
 * UNE ADRESSE INCONNUE RÉPOND 404, LE STAGING NE S'INDEXE PAS (#10123).
 *
 * `nginx.conf` ne peut pas importer la table des routes : il en porte un
 * MIROIR, le premier segment de chaque route (`map $uri $meeshy_app_route`).
 * Une adresse hors de ce miroir reçoit la coquille en 404 — un robot ne voit
 * plus une page vide « trouvée ». Le miroir se confronte ici à `ROUTES` : une
 * route ajoutée sans lui répondrait 404 à son premier visiteur, une route
 * retirée resterait servie en 200.
 */

const NGINX = readFileSync(new URL('../../nginx.conf', import.meta.url), 'utf8');

const firstSegment = (pattern: string): string | null => /^\/([^/]+)/.exec(pattern)?.[1] ?? null;

describe('nginx.conf — la table des adresses de l’application', () => {
  test('le miroir porte exactement le premier segment de chaque route', () => {
    const mirror = /map \$uri \$meeshy_app_route \{[\s\S]*?~\^\/\(([a-z|-]+)\)\(\/\|\$\) 1;/.exec(NGINX)?.[1];
    const declared = [...new Set(Object.values(ROUTES).map((route) => firstSegment(route.pattern)).filter((segment) => segment !== null))].sort();
    expect(mirror?.split('|').sort()).toEqual(declared);
  });

  test('le repli de l’application rend la coquille en 404 hors de la table', () => {
    expect(NGINX).toMatch(/location \/ \{\n\s+try_files \$uri \$uri\.html \$uri\/index\.html @app;/);
    expect(NGINX).toMatch(/location @app \{\n\s+error_page 404 \/index\.html;\n\s+if \(\$meeshy_app_route = 0\) \{\n\s+return 404;/);
  });
});

describe('nginx.conf — le staging ne s’indexe pas', () => {
  test('robots.txt ferme tout sur staging, et seulement là', () => {
    expect(NGINX).toMatch(/map \$host \$meeshy_staging \{\n\s+default 0;\n\s+~\^staging\\\. 1;/);
    expect(NGINX).toMatch(/location = \/robots\.txt \{[\s\S]*?if \(\$meeshy_staging\) \{\n\s+return 200 "User-agent: \*\\nDisallow: \/\\n";/);
  });

  test('toute location qui pose un en-tête repose X-Robots-Tag (nginx n’hérite plus du serveur)', () => {
    const blocks = [...NGINX.matchAll(/\n {4}location ([^\n]*)\{\n([\s\S]*?)\n {4}\}/g)].map((m) => ({ location: (m[1] ?? '').trim(), body: m[2] ?? '' }));
    const bare = blocks.filter(({ body }) => body.includes('add_header') && !body.includes('add_header X-Robots-Tag $meeshy_robots_tag always;')).map(({ location }) => location);
    expect(blocks.length).toBeGreaterThan(10);
    expect(bare).toEqual([]);
    expect(NGINX).toMatch(/\n {4}add_header X-Robots-Tag \$meeshy_robots_tag always;\n/);
  });
});
