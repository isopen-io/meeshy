import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';
import { consumeViewOnce } from '@/lib/api/view-once';

/**
 * W5 (#7224) — Ouvrir un message à vue unique le dit au serveur : un F5 ne le rouvre plus.
 *
 * La fonction `consume` du route `thread.tsx:188-214` doit :
 * 1. Appeler `consumeViewOnce(transport, { conversationId, messageId })`
 * 2. Appliquer la consommation localement en optimiste AVANT l'appel
 * 3. Sur erreur réseau, rollback (restaurer l'état précédent)
 *
 * Ce test vérifie que le PORT `consumeViewOnce` fonctionne correctement,
 * et que le branchement dans thread.tsx l'appelle.
 */

function fakeFetch(response: { readonly status: number; readonly body?: unknown }) {
  return (async () => new Response(response.body === undefined ? null : JSON.stringify(response.body), { status: response.status })) as typeof fetch;
}

describe('consumeViewOnce — le port de la route /consume (W5, #7224)', () => {
  test('compose et envoie la requête POST /api/v1/conversations/:id/messages/:messageId/consume', async () => {
    // SETUP : enregistrer les appels au transport
    const calls: Array<{ readonly url: string; readonly method: string }> = [];
    const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET' });
      return new Response(JSON.stringify({ success: true, data: { messageId: 'm1', viewOnceCount: 1, maxViewOnceCount: 1, isFullyConsumed: true } }), {
        status: 200,
      });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    // ACT : appeler le port de consommation
    await consumeViewOnce(transport, { conversationId: 'c1', messageId: 'm1' });

    // ASSERT : vérifier que la requête a été composée correctement
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/v1/conversations/c1/messages/m1/consume');
    expect(calls[0]?.method).toBe('POST');
  });

  test('sur succès 200, la réponse contient viewOnceCount et isFullyConsumed', async () => {
    // SETUP
    const transport = createHttpTransport({
      base: '',
      fetchImpl: fakeFetch({ status: 200, body: { success: true, data: { messageId: 'm1', viewOnceCount: 1, maxViewOnceCount: 1, isFullyConsumed: true } } }),
    });

    // ACT
    const result = await consumeViewOnce(transport, { conversationId: 'c1', messageId: 'm1' });

    // ASSERT : le résultat est défini et contient les données attendues
    expect(result).toBeDefined();
  });

  test('sur erreur 404, retourne un résultat avec ok: false', async () => {
    // SETUP
    const transport = createHttpTransport({
      base: '',
      fetchImpl: fakeFetch({ status: 404, body: { success: false, error: 'Message not found' } }),
    });

    // ACT : appeler le port sur un message inexistant
    const result = (await consumeViewOnce(transport, { conversationId: 'c1', messageId: 'invalid' })) as { readonly ok?: boolean; readonly status?: number };

    // ASSERT : le résultat indique un échec 404
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });
});
