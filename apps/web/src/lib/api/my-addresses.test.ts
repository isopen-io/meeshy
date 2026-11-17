import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpTransport } from './http';
import { decodeMyAddress, loadMyAddresses, MY_ADDRESSES_QUERY_KEY } from './my-addresses';

const transportOf = (result: ApiResult<unknown>): HttpTransport => ({ request: async () => result }) as unknown as HttpTransport;

const wire = (overrides: Record<string, unknown> = {}) => ({ id: 'a1', title: 'Site', url: 'https://aissandiaye.studio', glyph: 'site', circle: 'PUBLIC', position: 0, isShown: true, clicks: 12, ...overrides });

describe('mes adresses, lues sur le serveur', () => {
  test('une adresse servie est décodée avec son glyphe et ses clics', () => {
    expect(decodeMyAddress(wire())).toEqual({ id: 'a1', title: 'Site', url: 'https://aissandiaye.studio/', glyph: 'site', position: 0, isShown: true, clicks: 12 });
  });

  test('une adresse qui n’est pas un site web public n’est jamais dessinée en lien', () => {
    expect(decodeMyAddress(wire({ url: 'javascript:alert(1)' }))).toBeNull();
    expect(decodeMyAddress(wire({ url: 'data:text/html,<script>alert(1)</script>' }))).toBeNull();
    expect(decodeMyAddress(wire({ url: 'http://localhost:3000/admin' }))).toBeNull();
    expect(decodeMyAddress(wire({ url: 'https://user:pass@site.example' }))).toBeNull();
  });

  test('une adresse servie sans schéma ne devient pas un chemin interne à l’application', () => {
    expect(decodeMyAddress(wire({ url: 'aissandiaye.studio/music' }))?.url).toBe('https://aissandiaye.studio/music');
  });

  test('un glyphe inconnu retombe sur le site, une ligne sans url est écartée', () => {
    expect(decodeMyAddress(wire({ glyph: 'inconnu' }))?.glyph).toBe('site');
    expect(decodeMyAddress(wire({ url: '' }))).toBeNull();
    expect(decodeMyAddress(wire({ title: '' }))).toBeNull();
  });

  test('la liste sort dans l’ordre choisi par son propriétaire', async () => {
    const transport = transportOf({ ok: true, data: { addresses: [wire({ id: 'b', position: 1 }), wire({ id: 'a', position: 0 })] } });
    const result = await loadMyAddresses({ source: 'gateway', transport });
    expect(result.ok && result.data.map((address) => address.id)).toEqual(['a', 'b']);
  });

  test('un serveur qui ne sert pas encore les adresses (404) rend une liste vide, jamais une erreur', async () => {
    const result = await loadMyAddresses({ source: 'gateway', transport: transportOf({ ok: false, status: 404, error: 'Not found' }) });
    expect(result).toEqual({ ok: true, data: [] });
  });

  test('une vraie panne reste une panne', async () => {
    const result = await loadMyAddresses({ source: 'gateway', transport: transportOf({ ok: false, status: 500, error: 'boom' }) });
    expect(result.ok).toBe(false);
  });

  test('la clé de cache est stable', () => {
    expect(MY_ADDRESSES_QUERY_KEY).toEqual(['profile-addresses', 'mine']);
  });
});
