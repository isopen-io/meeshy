import { describe, expect, test } from 'bun:test';

import { createHttpTransport, type Credential } from './http';

/**
 * Audit #19352 — une requête partie avec l'ancien jeton d'un compte dont l'onglet a repris, entre-temps, la session que
 * l'appareil tient : son 401 ne dit rien de la session courante. Elle repart UNE fois sous le crédential suivi — même
 * compte, jamais un autre — au lieu de remonter en échec à l'appelant.
 */
describe('un 401 reçu sous l’ancien jeton d’un compte qui a suivi l’appareil se rejoue une fois sous le nouveau', () => {
  const setup = (answers: readonly number[]) => {
    let credential: Credential = { kind: 'registered', token: 'jwt-ancien' };
    const sent: string[] = [];
    const unauthorized: unknown[] = [];
    const transport = createHttpTransport({
      base: 'https://gate.test',
      credential: () => credential,
      identity: () => 'u:ada',
      onUnauthorized: (refusal) => void unauthorized.push(refusal),
      timeoutMs: 0,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        sent.push((init.headers as Record<string, string>).Authorization ?? '');
        const status = answers[sent.length - 1] ?? 500;
        if (sent.length === 1) credential = { kind: 'registered', token: 'jwt-suivi' };
        return new Response(JSON.stringify(status === 200 ? { success: true, data: { id: 'p-1' } } : { success: false, error: 'Invalid JWT token' }), { status });
      }) as unknown as typeof fetch,
    });
    return { transport, sent, unauthorized };
  };

  test('la requête aboutit sous le jeton suivi, et rien ne ferme la session', async () => {
    const { transport, sent, unauthorized } = setup([401, 200]);

    const result = await transport.request<{ readonly id: string }>({ method: 'POST', path: '/posts', body: { content: 'x' } });

    expect(result).toMatchObject({ ok: true, data: { id: 'p-1' } });
    expect(sent).toEqual(['Bearer jwt-ancien', 'Bearer jwt-suivi']);
    expect(unauthorized).toEqual([]);
  });

  test('une seule fois : un second 401 sous le jeton suivi est le refus de la session courante', async () => {
    const { transport, sent, unauthorized } = setup([401, 401]);

    const result = await transport.request({ method: 'GET', path: '/conversations' });

    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(sent).toHaveLength(2);
    expect(unauthorized).toHaveLength(1);
  });
});
