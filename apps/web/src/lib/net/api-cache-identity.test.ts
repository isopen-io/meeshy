import { describe, expect, test } from 'bun:test';

import { API_CACHE_IDENTITY_PARAM, apiCacheIdentityPlugin } from './api-cache-identity';

/**
 * LE SERVICE WORKER NE SERT PAS UNE RÉPONSE API D'UN AUTRE COMPTE (#8674) —
 * la clé du seau `api` porte l'empreinte de l'identité de la requête.
 */

const LIST = 'https://gate.meeshy.me/api/v1/conversations?limit=30';

const keyOf = (url: string, headers: Record<string, string> = {}): Promise<string> =>
  apiCacheIdentityPlugin.cacheKeyWillBeUsed({ request: new Request(url, { headers }) });

describe('la clé du seau `api`', () => {
  test('A et B, même URL ⇒ deux clés distinctes', async () => {
    const a = await keyOf(LIST, { Authorization: 'Bearer jwt-de-a' });
    const b = await keyOf(LIST, { Authorization: 'Bearer jwt-de-b' });
    expect(a).not.toBe(b);
  });

  test('le même compte relit SA clé', async () => {
    expect(await keyOf(LIST, { Authorization: 'Bearer jwt-de-a' })).toBe(await keyOf(LIST, { Authorization: 'Bearer jwt-de-a' }));
  });

  test('un invité a sa propre clé, distincte d’un compte', async () => {
    const guest = await keyOf(LIST, { 'X-Session-Token': 'anon_1' });
    expect(guest).not.toBe(await keyOf(LIST, { Authorization: 'Bearer jwt-de-a' }));
    expect(guest).toContain(API_CACHE_IDENTITY_PARAM);
  });

  test('sans identité, la clé est l’URL nue', async () => {
    expect(await keyOf(LIST)).toBe(LIST);
  });

  test('la clé ne porte JAMAIS le jeton en clair (elle est écrite sur le disque)', async () => {
    const key = await keyOf(LIST, { Authorization: 'Bearer jwt-de-a' });
    expect(key).not.toContain('jwt-de-a');
    expect(key.startsWith(`${LIST}&${API_CACHE_IDENTITY_PARAM}=`)).toBe(true);
  });

  test('une URL sans requête reçoit `?`', async () => {
    const key = await keyOf('https://gate.meeshy.me/api/v1/users/me', { Authorization: 'Bearer jwt-de-a' });
    expect(key.startsWith(`https://gate.meeshy.me/api/v1/users/me?${API_CACHE_IDENTITY_PARAM}=`)).toBe(true);
  });

  test('AUTONOME : la fonction stringifiée s’évalue sans aucun import (Workbox la recopie dans sw.js)', async () => {
    const source = String(apiCacheIdentityPlugin.cacheKeyWillBeUsed);
    const standalone = new Function(`"use strict"; return (${source});`)() as typeof apiCacheIdentityPlugin.cacheKeyWillBeUsed;
    const key = await standalone({ request: new Request(LIST, { headers: { Authorization: 'Bearer jwt-de-a' } }) });
    expect(key).toBe(await keyOf(LIST, { Authorization: 'Bearer jwt-de-a' }));
  });
});
