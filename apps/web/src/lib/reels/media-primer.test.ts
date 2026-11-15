import { describe, expect, test } from 'bun:test';

import { createMediaPrimer, type PrimeTarget } from './media-primer';

/**
 * L'AMORCEUR D'OCTETS DES RÉELS (#9702) — il télécharge la TÊTE des réels de
 * la fenêtre qui ne montent pas d'élément, en priorité basse, sans jamais
 * dépasser sa concurrence, et abandonne tout ce qui sort de la fenêtre.
 */
type Call = { readonly url: string; readonly init: RequestInit; resolve: () => void; readonly signal: AbortSignal };

function fakeFetch() {
  const calls: Call[] = [];
  const fetcher = (url: string, init: RequestInit): Promise<Response> =>
    new Promise<Response>((resolve, reject) => {
      const signal = init.signal as AbortSignal;
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      calls.push({ url, init, signal, resolve: () => resolve(new Response('ok')) });
    });
  return { calls, fetcher };
}

const target = (url: string, bytes = 1_000): PrimeTarget => ({ url, bytes });
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('createMediaPrimer', () => {
  test('demande la tête par une plage d’octets, en priorité basse', () => {
    const { calls, fetcher } = fakeFetch();
    const primer = createMediaPrimer({ fetch: fetcher, maxConcurrent: 2 });
    primer.sync([target('https://m/a.mp4', 4_096)]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://m/a.mp4');
    expect(new Headers(calls[0]?.init.headers).get('Range')).toBe('bytes=0-4095');
    expect((calls[0]?.init as RequestInit & { priority?: string }).priority).toBe('low');
  });

  test('ne dépasse jamais sa concurrence, et sert la file DANS L’ORDRE donné (le plus proche d’abord)', async () => {
    const { calls, fetcher } = fakeFetch();
    const primer = createMediaPrimer({ fetch: fetcher, maxConcurrent: 2 });
    primer.sync([target('a'), target('b'), target('c')]);
    expect(calls.map((c) => c.url)).toEqual(['a', 'b']);
    calls[0]?.resolve();
    await flush();
    expect(calls.map((c) => c.url)).toEqual(['a', 'b', 'c']);
  });

  test('ce qui sort de la fenêtre est abandonné, en vol comme en file', async () => {
    const { calls, fetcher } = fakeFetch();
    const primer = createMediaPrimer({ fetch: fetcher, maxConcurrent: 1 });
    primer.sync([target('a'), target('b')]);
    primer.sync([target('c')]);
    expect(calls[0]?.signal.aborted).toBe(true);
    await flush();
    expect(calls.map((c) => c.url)).toEqual(['a', 'c']);
  });

  test('une tête déjà amorcée ne se redemande pas', async () => {
    const { calls, fetcher } = fakeFetch();
    const primer = createMediaPrimer({ fetch: fetcher, maxConcurrent: 2 });
    primer.sync([target('a')]);
    calls[0]?.resolve();
    await flush();
    primer.sync([target('a'), target('b')]);
    expect(calls.map((c) => c.url)).toEqual(['a', 'b']);
  });

  test('un échec réseau ne bloque pas la file', async () => {
    const calls: string[] = [];
    const primer = createMediaPrimer({
      fetch: (url) => {
        calls.push(url);
        return Promise.reject(new TypeError('offline'));
      },
      maxConcurrent: 1,
    });
    primer.sync([target('a'), target('b')]);
    await flush();
    await flush();
    expect(calls).toEqual(['a', 'b']);
  });

  test('dispose abandonne tout', () => {
    const { calls, fetcher } = fakeFetch();
    const primer = createMediaPrimer({ fetch: fetcher, maxConcurrent: 2 });
    primer.sync([target('a'), target('b')]);
    primer.dispose();
    expect(calls.every((c) => c.signal.aborted)).toBe(true);
  });
});
