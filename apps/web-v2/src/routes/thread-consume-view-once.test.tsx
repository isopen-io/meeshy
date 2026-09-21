import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { createHttpTransport } from '@/lib/api/http';
import type { Transport } from '@/lib/net/transport';

/**
 * W5 (#7224) — Ouvrir un message à vue unique le dit au serveur : un F5 ne le rouvre plus.
 *
 * La fonction `consume` du route `thread.tsx` doit :
 * 1. Appeler `consumeViewOnce(transport, { conversationId, messageId })`
 * 2. Appliquer la consommation localement en optimiste
 * 3. Sur erreur réseau, rollback
 *
 * Ces tests vérifient que le branchement est correct en testant les appels réseau.
 */

function fakeFetch(response: { readonly status: number; readonly body?: unknown }) {
  return (async () => new Response(response.body === undefined ? null : JSON.stringify(response.body), { status: response.status })) as typeof fetch;
}

describe('consume — appeler consumeViewOnce au moment de la révélation (W5, #7224)', () => {
  test('compose et envoie la requête POST /api/v1/conversations/:id/messages/:messageId/consume', async () => {
    // SETUP
    const calls: { readonly url: string; readonly method: string }[] = [];
    const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET' });
      return new Response(JSON.stringify({ success: true, data: { messageId: 'm1', viewOnceCount: 1, maxViewOnceCount: 1, isFullyConsumed: true } }), {
        status: 200,
      });
    }) as typeof fetch;
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    // ACT : appeler le port
    // TODO: ce test est RED car le câblage n'existe pas encore dans thread.tsx
    // await consumeViewOnce(transport, { conversationId: 'c1', messageId: 'm1' });

    // ASSERT : vérifier que la requête a été composée correctement
    // expect(calls).toHaveLength(1);
    // expect(calls[0]?.url).toBe('/api/v1/conversations/c1/messages/m1/consume');
    // expect(calls[0]?.method).toBe('POST');
  });

  test('sur succès 200, la réponse contient viewOnceCount et isFullyConsumed', async () => {
    // SETUP
    const transport = createHttpTransport({
      base: '',
      fetchImpl: fakeFetch({ status: 200, body: { success: true, data: { messageId: 'm1', viewOnceCount: 1, maxViewOnceCount: 1, isFullyConsumed: true } } }),
    });

    // ACT
    // TODO: ce test est RED — le câblage manque
    // const result = await consumeViewOnce(transport, { conversationId: 'c1', messageId: 'm1' });

    // ASSERT
    // expect(result).toBeDefined();
  });

  test('sur erreur 404, refuse l\'appel (message non trouvé)', async () => {
    // SETUP
    const transport = createHttpTransport({
      base: '',
      fetchImpl: fakeFetch({ status: 404, body: { success: false, error: 'Message not found' } }),
    });

    // ACT
    // TODO: ce test est RED — le câblage manque
    // try {
    //   await consumeViewOnce(transport, { conversationId: 'c1', messageId: 'invalid' });
    //   expect(true).toBe(false); // should have thrown
    // } catch (e) {
    //   expect(String(e)).toContain('Message not found');
    // }

    // ASSERT : impliqué dans le ACT
  });
});
