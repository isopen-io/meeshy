import { describe, expect, test } from 'bun:test';

import { apiCacheOfflineOnlyPlugin } from './api-cache-offline-only';

/**
 * **EN LIGNE, LE SERVICE WORKER NE SERT PAS UNE COPIE ANCIENNE DE L'API**
 * (#18919, WEB-10). Le seau `api` est en `NetworkFirst` sans délai : un `fetch`
 * qui LÈVE (passerelle injoignable une seconde, 502 sans CORS, changement de
 * réseau) rendait la copie rangée — d'il y a une heure ou sept jours — que
 * TanStack prenait pour une réponse fraîche, par-dessus l'état temps réel.
 * La copie ne sert plus que le vrai hors-ligne.
 *
 * Le greffon est jugé STRINGIFIÉ, comme Workbox le recopie dans `dist/sw.js`,
 * et évalué contre un `self` fabriqué : ni import, ni global du poste de test.
 */

const standalone = (onLine: boolean) =>
  new Function('self', `"use strict"; return (${String(apiCacheOfflineOnlyPlugin.cachedResponseWillBeUsed)});`)({ navigator: { onLine } }) as typeof apiCacheOfflineOnlyPlugin.cachedResponseWillBeUsed;

describe('la copie du seau `api` ne sert que hors ligne', () => {
  test('en ligne, un réseau qui échoue ne reçoit AUCUNE copie : l’échec remonte, l’état affiché reste', async () => {
    expect(await standalone(true)({ cachedResponse: new Response('{"de":"il y a une heure"}') })).toBeNull();
  });

  test('hors ligne, la copie rangée est servie : le démarrage à froid sans réseau lit encore', async () => {
    const copy = new Response('{"de":"hier"}');

    expect(await standalone(false)({ cachedResponse: copy })).toBe(copy);
  });

  test('hors ligne sans copie, rien n’est fabriqué', async () => {
    expect(await standalone(false)({})).toBeNull();
  });
});
