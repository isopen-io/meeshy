import { describe, expect, test } from 'bun:test';

import { MEESH_MINT_PATH, mintMeesh, mintMeeshWithFragments } from './engagement';
import { createHttpTransport } from './http';

type Call = { readonly url: string; readonly init: RequestInit | undefined };

function transportServing(body: unknown, calls: Call[], status = 200) {
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return createHttpTransport({ base: 'https://gate.test', credential: () => ({ kind: 'registered', token: 'jwt-test' }), fetchImpl, timeoutMs: 0 });
}

/** LA FRAPPE GRATUITE (#10011) : la même adresse, `payWith: 'fragments'` en plus — la frappe en points ne change pas. */
describe('la frappe par fragments de Meesh', () => {
  test('part sur l’adresse de la frappe avec payWith « fragments »', async () => {
    const calls: Call[] = [];
    const transport = transportServing(
      { success: true, data: { status: 'minted', balance: 1, mintedLifetime: 4, number: 4, edition: 'silver', price: 0, paidWith: 'fragments', fragmentsSpent: 5, meeshFragments: { held: 1, perMeesh: 5 } } },
      calls,
    );

    const result = await mintMeeshWithFragments(transport, 'frappe-gratuite-01');

    expect(calls[0]?.url).toBe(`https://gate.test${MEESH_MINT_PATH}`);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ requestId: 'frappe-gratuite-01', payWith: 'fragments' });
    expect(result.ok && result.data.paidWith).toBe('fragments');
    expect(result.ok && result.data.meeshFragments).toEqual({ held: 1, perMeesh: 5 });
  });

  test('la frappe en points garde le corps d’hier', async () => {
    const calls: Call[] = [];
    const transport = transportServing({ success: true, data: { status: 'minted', balance: 1, mintedLifetime: 1 } }, calls);

    await mintMeesh(transport, 'frappe-points-01');

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ requestId: 'frappe-points-01' });
  });
});
