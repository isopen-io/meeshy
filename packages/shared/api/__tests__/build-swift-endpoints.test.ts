/**
 * TDD de `renderSwiftEndpoints()` — la projection SWIFT du catalogue d'API
 * (#4282), rendue depuis les MÊMES entrées dérivées que la projection
 * TypeScript.
 *
 * Ces témoins ne lisent jamais `services/gateway/route-manifest.json` : ils
 * fabriquent de petits manifestes synthétiques, pour la raison que
 * `build-catalog.test.ts` écrit déjà — isoler la RÈGLE de la donnée, et ne
 * jamais toucher l'artefact du gateway pendant qu'on prouve un rouge.
 *
 * Ce qui est vérifié ici est la SYNTAXE Swift et le placement des paramètres.
 * Que les NOMS soient les mêmes qu'en TypeScript n'a pas besoin de témoin :
 * les deux projections consomment `entries`, il n'existe pas deux règles de
 * nommage à faire diverger. C'est le point du lot.
 */

import { describe, expect, it } from 'vitest';
import { buildApiEndpointsCatalog, type ManifestRouteInput } from '../build-catalog.js';
import { renderSwiftEndpoints } from '../build-swift-endpoints.js';

function swiftFor(routes: readonly ManifestRouteInput[]): ReadonlyMap<string, string> {
  const files = renderSwiftEndpoints(buildApiEndpointsCatalog(routes).entries);
  return new Map(files.map((file) => [file.fileName, file.source]));
}

describe('renderSwiftEndpoints — un fichier par namespace', () => {
  it('un chemin fixe devient un cas sans valeur associée', () => {
    const files = swiftFor([{ method: 'POST', path: '/api/v1/auth/login' }]);
    const source = files.get('AuthEndpoint.swift') ?? '';

    expect(source).toContain('public enum AuthEndpoint: MeeshyEndpoint');
    expect(source).toContain('case login');
    expect(source).toContain('case .login: return "/api/v1/auth/login"');
  });

  it('un chemin paramétré devient un cas à valeurs associées ÉTIQUETÉES', () => {
    const source = swiftFor([
      { method: 'GET', path: '/api/v1/conversations/:conversationId/messages' },
    ]).get('ConversationsEndpoint.swift') ?? '';

    // Le nom vient de la dérivation PARTAGÉE, il n'est pas choisi ici : le
    // catalogue TypeScript porte exactement `byConversationIdMessages`.
    expect(source).toContain('case byConversationIdMessages(conversationId: String)');
    expect(source).toContain(
      'case .byConversationIdMessages(let conversationId): return "/api/v1/conversations/\\(conversationId)/messages"'
    );
  });

  it('deux paramètres gardent leur ORDRE et leurs étiquettes', () => {
    const source = swiftFor([
      { method: 'POST', path: '/api/v1/admin/agent/roles/:conversationId/:userId/assign' },
    ]).get('AdminEndpoint.swift') ?? '';

    expect(source).toContain('(conversationId: String, userId: String)');
    expect(source).toContain('(let conversationId, let userId)');
    expect(source).toContain('\\(conversationId)/\\(userId)/assign"');
  });

  it('un nom de cas qui est un mot RÉSERVÉ Swift est protégé par des accents graves', () => {
    const source = swiftFor([{ method: 'GET', path: '/api/v1/links/:identifier' }]).get(
      'LinksEndpoint.swift'
    ) ?? '';
    // `links.byIdentifier` n'est pas réservé — le témoin porte sur la MÉCANIQUE,
    // éprouvée sur un mot qui l'est vraiment.
    const reserved = swiftFor([{ method: 'GET', path: '/api/v1/posts/for' }]).get(
      'PostsEndpoint.swift'
    ) ?? '';
    expect(source).toContain('case byIdentifier(identifier: String)');
    expect(reserved).toContain('case `for`');
    expect(reserved).toContain('case .`for`: return "/api/v1/posts/for"');
  });

  it('chaque fichier ANNONCE qu\'il est généré et par quelle commande', () => {
    const source = swiftFor([{ method: 'POST', path: '/api/v1/auth/login' }]).get(
      'AuthEndpoint.swift'
    ) ?? '';
    expect(source).toContain('GÉNÉRÉ');
    expect(source).toContain('api-endpoints:generate');
  });

  it('la sortie est DÉTERMINISTE — même entrée, même octet', () => {
    const routes: ManifestRouteInput[] = [
      { method: 'GET', path: '/api/v1/users/me' },
      { method: 'POST', path: '/api/v1/auth/login' },
    ];
    const once = renderSwiftEndpoints(buildApiEndpointsCatalog(routes).entries);
    const twice = renderSwiftEndpoints(buildApiEndpointsCatalog([...routes].reverse()).entries);
    expect(twice).toEqual(once);
  });

  it('un namespace sans route ne produit AUCUN fichier', () => {
    expect(renderSwiftEndpoints([])).toEqual([]);
  });
});
