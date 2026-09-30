import { describe, expect, test } from 'bun:test';

import type { Credential } from '@/lib/api/http';

import { cardMediaBlobFetcher } from './message-card-fetch';

type Call = { readonly url: string; readonly headers: Record<string, string> };

const recorder = (status = 200) => {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: { ...((init?.headers ?? {}) as Record<string, string>) } });
    return new Response(status === 200 ? new Blob(['pixels'], { type: 'image/jpeg' }) : null, { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
};

const token: Credential = { kind: 'registered', token: 'jwt-secret' };

describe('le média d’une carte, en blob (#8901)', () => {
  test('une pièce servie par la passerelle part avec l’identité du lecteur', async () => {
    const { calls, fetchImpl } = recorder();
    const fetchBlob = cardMediaBlobFetcher({ fetchImpl, credential: () => token, apiBase: 'https://gate.meeshy.me', documentOrigin: 'https://meeshy.me' });
    const blob = await fetchBlob('/api/v1/attachments/file/2026%2F09%2Fu%2Fp.jpg', 'a-1');
    expect(blob).not.toBeNull();
    expect(calls[0]?.url).toBe('https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fu%2Fp.jpg');
    expect(calls[0]?.headers.Authorization).toBe('Bearer jwt-secret');
  });

  test('une pièce d’un AUTRE hôte (magasin statique, CDN) part SANS le jeton : jamais de secret chez un tiers, jamais de pré-vol refusé', async () => {
    const { calls, fetchImpl } = recorder();
    const fetchBlob = cardMediaBlobFetcher({ fetchImpl, credential: () => token, apiBase: 'https://gate.meeshy.me', documentOrigin: 'https://meeshy.me' });
    const blob = await fetchBlob('https://static.meeshy.me/u/i/2026/02/photo.jpg', 'a-2');
    expect(blob).not.toBeNull();
    expect(calls[0]?.url).toBe('https://static.meeshy.me/u/i/2026/02/photo.jpg');
    expect(calls[0]?.headers.Authorization).toBeUndefined();
  });

  test('derrière le proxy de développement, une adresse relative reste chez la passerelle', async () => {
    const { calls, fetchImpl } = recorder();
    const fetchBlob = cardMediaBlobFetcher({ fetchImpl, credential: () => token, apiBase: '', documentOrigin: 'http://localhost:5173', resolve: (url) => url });
    await fetchBlob('/api/v1/attachments/file/x.jpg', 'a-3');
    expect(calls[0]?.headers.Authorization).toBe('Bearer jwt-secret');
  });

  test('un refus ou un fichier absent rend null — l’atelier le dira', async () => {
    const { fetchImpl } = recorder(404);
    const fetchBlob = cardMediaBlobFetcher({ fetchImpl, credential: () => token, apiBase: 'https://gate.meeshy.me', documentOrigin: 'https://meeshy.me' });
    expect(await fetchBlob('https://static.meeshy.me/u/i/gone.jpg', 'a-4')).toBeNull();
    expect(await fetchBlob('/api/v1/attachments/file/gone.jpg', 'a-5')).toBeNull();
  });
});
