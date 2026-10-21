import { describe, expect, test } from 'bun:test';

import { createContractLoader } from './contracts';

const body = JSON.stringify({ domain: 'avatar-ring', rings: [] });

const sha16Of = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

const fetcherServing = (text: string, calls: string[]) =>
  (async (url: string) => {
    calls.push(String(url));
    return new Response(text, { status: 200 });
  }) as unknown as typeof fetch;

describe('le chargeur de contrats de décor', () => {
  test('un contrat dont le contenu porte l’empreinte de son adresse se charge, une seule fois', async () => {
    const src = `${await sha16Of(body)}.json`;
    const calls: string[] = [];
    const loader = createContractLoader({ origin: 'https://gate.test', fetcher: fetcherServing(body, calls) });
    expect(await loader.load(src)).toEqual({ domain: 'avatar-ring', rings: [] });
    await loader.load(src);
    expect(calls).toEqual([`https://gate.test/api/v1/pack-assets/${src}`]);
  });

  test('un contenu qui ne correspond pas à son adresse est refusé', async () => {
    const loader = createContractLoader({ origin: 'https://gate.test', fetcher: fetcherServing(body, []) });
    expect(await loader.load('0000000000000000.json')).toBeNull();
  });

  test('une adresse qui n’est pas une empreinte JSON n’est jamais demandée', async () => {
    const calls: string[] = [];
    const loader = createContractLoader({ origin: 'https://gate.test', fetcher: fetcherServing(body, calls) });
    expect(await loader.load('../../etc/passwd')).toBeNull();
    expect(calls).toEqual([]);
  });

  test('un échec réseau n’est pas retenu : le prochain essai redemande', async () => {
    const src = `${await sha16Of(body)}.json`;
    let attempts = 0;
    const flaky = (async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const loader = createContractLoader({ origin: 'https://gate.test', fetcher: flaky });
    expect(await loader.load(src)).toBeNull();
    expect(await loader.load(src)).not.toBeNull();
  });
});
