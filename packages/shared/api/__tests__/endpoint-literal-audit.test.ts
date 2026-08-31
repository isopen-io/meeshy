import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  canonicalSwiftLiteral,
  endpointLiteralsIn,
  unmatchedEndpointLiterals,
  type EndpointLiteralSite,
} from '../endpoint-literal-audit.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const MANIFEST = resolve(REPO_ROOT, 'services/gateway/route-manifest.json');
const CLIENT_ROOTS = [
  resolve(REPO_ROOT, 'packages/MeeshySDK/Sources'),
  resolve(REPO_ROOT, 'apps/ios/Meeshy'),
];
const API_PREFIX = '/api/v1';

function servedPaths(): readonly string[] {
  const parsed = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
    routes: readonly { path: string }[];
  };
  return parsed.routes.map((route) => route.path);
}

function swiftFiles(root: string): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.swift')) out.push(full);
    }
  };
  walk(root);
  return out;
}

describe('canonicalisation — ce que la comparaison doit tolérer', () => {
  it("réduit une interpolation Swift à un segment variable", () => {
    expect(canonicalSwiftLiteral('/conversations/\\(id)/messages')).toBe('/conversations/*/messages');
  });

  it('retire la chaîne de requête, qui ne fait pas partie du chemin', () => {
    expect(canonicalSwiftLiteral('/links?offset=\\(o)&limit=\\(l)')).toBe('/links');
  });
});

describe("l'appariement dénonce ce qui n'est pas servi, et RIEN d'autre", () => {
  const served = ['/api/v1/auth/reset-password', '/api/v1/conversations/:id/messages'];

  it('un chemin servi, écrit en suffixe, passe', () => {
    const sites: EndpointLiteralSite[] = [
      { file: 'X.swift', line: 1, literal: '/auth/reset-password' },
    ];
    expect(unmatchedEndpointLiterals(sites, served, '/api/v1')).toEqual([]);
  });

  it("un chemin que le serveur ne sert pas est DÉNONCÉ — le défaut de #4588", () => {
    const sites: EndpointLiteralSite[] = [
      { file: 'AuthService.swift', line: 42, literal: '/auth/password-reset/reset' },
    ];
    expect(unmatchedEndpointLiterals(sites, served, '/api/v1')).toHaveLength(1);
  });

  it('un paramètre interpolé apparie le `:param` du manifeste', () => {
    const sites: EndpointLiteralSite[] = [
      { file: 'X.swift', line: 1, literal: '/conversations/\\(conversationId)/messages' },
    ];
    expect(unmatchedEndpointLiterals(sites, served, '/api/v1')).toEqual([]);
  });

  /**
   * Le serveur sert une route par CATÉGORIE (`/me/preferences/audio`, `…/video`)
   * et non un `:param`. Le client, lui, interpole une énumération. L'audit ne
   * connaît pas les valeurs qu'elle prend : il ne peut donc que ne pas accuser
   * à tort — c'est la limite assumée, et c'est la migration #4282 qui la ferme,
   * pas une liste d'exemptions.
   */
  it("un segment interpolé apparie une route à segment LITTÉRAL de même forme", () => {
    const catégories = ['/api/v1/me/preferences/audio', '/api/v1/me/preferences/video'];
    const sites: EndpointLiteralSite[] = [
      { file: 'PreferenceService.swift', line: 127, literal: '/me/preferences/\\(category.rawValue)' },
    ];
    expect(unmatchedEndpointLiterals(sites, catégories, '/api/v1')).toEqual([]);
  });

  it("mais un segment interpolé ne fabrique pas une route d'une AUTRE forme", () => {
    const sites: EndpointLiteralSite[] = [
      { file: 'X.swift', line: 1, literal: '/me/preferences/\\(a)/\\(b)' },
    ];
    expect(
      unmatchedEndpointLiterals(sites, ['/api/v1/me/preferences/audio'], '/api/v1')
    ).toHaveLength(1);
  });
});

describe('AUDIT — aucun chemin écrit à la main ne rend 404', () => {
  /**
   * Le témoin qui aurait trouvé #4588 le jour où il a été écrit. Il balaie les
   * DEUX clients iOS (SDK et app) et compare chaque littéral au manifeste du
   * serveur assemblé.
   *
   * Il ne demande pas que les chemins soient TYPÉS — c'est le travail de la
   * migration #4282, et il tomberait sur chaque fichier non encore migré. Il
   * demande seulement qu'un chemin écrit à la main DÉSIGNE quelque chose.
   */
  it('chaque littéral correspond à une route servie', () => {
    const sites = CLIENT_ROOTS.flatMap((root) =>
      swiftFiles(root).flatMap((file) =>
        endpointLiteralsIn(file.slice(REPO_ROOT.length + 1), readFileSync(file, 'utf8'))
      )
    );
    expect(sites.length).toBeGreaterThan(50);

    const unmatched = unmatchedEndpointLiterals(sites, servedPaths(), API_PREFIX);
    const report = unmatched
      .map((site) => `  ${site.file}:${site.line}  ${site.literal}`)
      .join('\n');
    expect(
      unmatched,
      `Chemins qui ne correspondent à AUCUNE route du serveur — ils rendront 404 :\n${report}\n` +
        `Régénérer le manifeste si le serveur a changé : cd services/gateway && npm run route-manifest:generate`
    ).toEqual([]);
  });
});
