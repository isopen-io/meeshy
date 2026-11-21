import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from './http';
import { encryptedDeviceCountOf } from './e2ee-peer-devices';

/**
 * **COMBIEN D'APPAREILS CHIFFRÉS UN PAIR A PUBLIÉS** (#20075, jumelle web de
 * `EndToEndDirectoryDeviceCounter`, iOS #20074) — la liste de l'annuaire
 * (`GET e2-ee.keysByUserIdDevices`) suffit : on n'en garde que le compte. Une
 * lecture qui échoue ne dit rien (`null`), jamais « aucun appareil ».
 */
function gateway(response: { readonly status: number; readonly body: unknown } | Error) {
  const paths: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    paths.push(String(input));
    if (response instanceof Error) throw response;
    return new Response(JSON.stringify(response.body), { status: response.status });
  }) as typeof fetch;
  const transport = createHttpTransport({ base: '', fetchImpl, credential: () => ({ kind: 'registered', token: 'jwt' }) });
  return { deps: { source: 'gateway' as const, transport }, paths };
}

describe('encryptedDeviceCountOf', () => {
  test('lit la liste des appareils du pair et en rend le compte', async () => {
    const { deps, paths } = gateway({ status: 200, body: { success: true, data: { userId: 'u-ana', devices: [{ deviceId: 1 }, { deviceId: 2 }] } } });
    expect(await encryptedDeviceCountOf(deps, 'u-ana')).toBe(2);
    expect(paths).toEqual(['/api/v1/e2ee/keys/u-ana/devices']);
  });

  test('une liste vide : zéro appareil chiffré', async () => {
    const { deps } = gateway({ status: 200, body: { success: true, data: { userId: 'u-ana', devices: [] } } });
    expect(await encryptedDeviceCountOf(deps, 'u-ana')).toBe(0);
  });

  test('un refus, une panne ou une charge illisible : rien n’est su', async () => {
    const forbidden = gateway({ status: 403, body: { success: false, error: 'non', code: 'E2EE_KEYS_FORBIDDEN' } });
    expect(await encryptedDeviceCountOf(forbidden.deps, 'u-ana')).toBeNull();
    const thrown = gateway(new Error('network'));
    expect(await encryptedDeviceCountOf(thrown.deps, 'u-ana')).toBeNull();
    const odd = gateway({ status: 200, body: { success: true, data: { userId: 'u-ana' } } });
    expect(await encryptedDeviceCountOf(odd.deps, 'u-ana')).toBeNull();
  });

  test('aucun pair nommé : aucune requête', async () => {
    const { deps, paths } = gateway({ status: 200, body: { success: true, data: { devices: [] } } });
    expect(await encryptedDeviceCountOf(deps, '')).toBeNull();
    expect(paths).toEqual([]);
  });
});
