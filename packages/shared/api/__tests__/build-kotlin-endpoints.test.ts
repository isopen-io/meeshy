/**
 * TDD de `renderKotlinEndpoints()` — la projection KOTLIN du catalogue d'API
 * (#11817), rendue depuis les MÊMES entrées dérivées que les projections
 * TypeScript et Swift. Manifestes synthétiques uniquement.
 */

import { describe, expect, it } from 'vitest';
import { buildApiEndpointsCatalog, type ManifestRouteInput } from '../build-catalog.js';
import {
  constantName,
  kotlinIdentifier,
  kotlinRoutePath,
  renderKotlinEndpoints,
} from '../build-kotlin-endpoints.js';

function kotlinFor(routes: readonly ManifestRouteInput[]): ReadonlyMap<string, string> {
  const files = renderKotlinEndpoints(buildApiEndpointsCatalog(routes).entries);
  return new Map(files.map((file) => [file.fileName, file.source]));
}

describe('renderKotlinEndpoints — un objet par namespace', () => {
  it('un chemin fixe devient une const val relative au préfixe, sous un en-tête GÉNÉRÉ', () => {
    const source = kotlinFor([{ method: 'POST', path: '/api/v1/auth/login' }]).get('ApiRoutesAuth.kt') ?? '';

    expect(source.startsWith('// GÉNÉRÉ — ne pas éditer à la main.')).toBe(true);
    expect(source).toContain('package me.meeshy.sdk.net.routes');
    expect(source).toContain('public object ApiRoutesAuth {');
    expect(source).toContain('public const val LOGIN: String = "auth/login"');
  });

  it('un paramètre de chemin devient un emplacement Retrofit {nom}, dans son ordre', () => {
    const source =
      kotlinFor([{ method: 'POST', path: '/api/v1/admin/agent/roles/:conversationId/:userId/assign' }]).get(
        'ApiRoutesAdmin.kt'
      ) ?? '';

    expect(source).toContain('"admin/agent/roles/{conversationId}/{userId}/assign"');
  });

  it('le joker devient {wildcard}', () => {
    expect(kotlinRoutePath('/api/v1/uploads/*')).toBe('uploads/{wildcard}');
  });

  it('une route hors /api/v1 garde son chemin complet sans barre initiale', () => {
    expect(kotlinRoutePath('/health')).toBe('health');
    expect(kotlinRoutePath('/api/conversations/:id/delete-for-me')).toBe(
      'api/conversations/{id}/delete-for-me'
    );
  });

  it('le dollar est échappé pour ne pas devenir un gabarit Kotlin', () => {
    expect(kotlinRoutePath('/api/v1/a$b')).toBe('a\\$b');
  });

  it('une clé camelCase devient SCREAMING_SNAKE', () => {
    expect(constantName('byConversationIdMessages')).toBe('BY_CONVERSATION_ID_MESSAGES');
    expect(constantName('root')).toBe('ROOT');
  });

  it('un identifiant qui commence par un chiffre ou qui est un mot réservé reste utilisable', () => {
    expect(kotlinIdentifier('2fa')).toBe('_2fa');
    expect(kotlinIdentifier('in')).toBe('`in`');
    expect(kotlinIdentifier('LOGIN')).toBe('LOGIN');
  });

  it('un namespace devient un fichier, les routes legacy ne se mêlent pas à leur homonyme v1', () => {
    const files = kotlinFor([
      { method: 'GET', path: '/api/v1/conversations' },
      { method: 'DELETE', path: '/api/conversations/:conversationId/delete-for-me' },
    ]);

    expect([...files.keys()]).toEqual(['ApiRoutesApiLegacyConversations.kt', 'ApiRoutesConversations.kt']);
  });

  it('la sortie est déterministe, quel que soit l’ordre des routes', () => {
    const routes: ManifestRouteInput[] = [
      { method: 'GET', path: '/api/v1/users/me' },
      { method: 'GET', path: '/api/v1/auth/me' },
      { method: 'POST', path: '/api/v1/auth/login' },
    ];
    const forward = renderKotlinEndpoints(buildApiEndpointsCatalog(routes).entries);
    const backward = renderKotlinEndpoints(buildApiEndpointsCatalog([...routes].reverse()).entries);

    expect(backward).toEqual(forward);
  });
});
