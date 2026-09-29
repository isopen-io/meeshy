import { describe, expect, test } from 'bun:test';

import { createThumbnailCache } from './message-card-thumbnails';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const harness = (options: { readonly concurrency?: number; readonly limit?: number } = {}) => {
  const revoked: string[] = [];
  let made = 0;
  const cache = createThumbnailCache({
    createObjectURL: () => `blob:${(made += 1)}`,
    revokeObjectURL: (url) => revoked.push(url),
    ...options,
  });
  return { cache, revoked };
};

const deferred = () => {
  let resolve: (blob: Blob | null) => void = () => {};
  const promise = new Promise<Blob | null>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('le cache des vignettes', () => {
  test('peint une vignette demandée une seule fois, et prévient qui l’attend', async () => {
    const { cache } = harness();
    let renders = 0;
    let heard = 0;
    cache.subscribe(() => {
      heard += 1;
    });
    const render = async () => {
      renders += 1;
      return new Blob(['png']);
    };
    cache.request('aurore.rond.orbite|fr', render);
    cache.request('aurore.rond.orbite|fr', render);
    await tick();
    expect(renders).toBe(1);
    expect(heard).toBe(1);
    expect(cache.get('aurore.rond.orbite|fr')).toBe('blob:1');
  });

  test('ne peint jamais plus de deux vignettes à la fois, la dernière demandée d’abord', async () => {
    const { cache } = harness();
    const started: string[] = [];
    const pending = new Map<string, ReturnType<typeof deferred>>();
    const renderOf = (key: string) => () => {
      started.push(key);
      const d = deferred();
      pending.set(key, d);
      return d.promise;
    };
    for (const key of ['a', 'b', 'c', 'd']) cache.request(key, renderOf(key));
    expect(started).toEqual(['a', 'b']);
    pending.get('a')?.resolve(new Blob(['a']));
    await tick();
    await tick();
    expect(started).toEqual(['a', 'b', 'd']);
  });

  test('une peinture ratée pourra être redemandée', async () => {
    const { cache } = harness();
    cache.request('x', async () => null);
    await tick();
    let again = 0;
    cache.request('x', async () => {
      again += 1;
      return new Blob(['x']);
    });
    await tick();
    expect(again).toBe(1);
    expect(cache.get('x')).not.toBeNull();
  });

  test('borné : au-delà de la limite, la plus ancienne vignette rend son URL', async () => {
    const { cache, revoked } = harness({ limit: 2 });
    for (const key of ['a', 'b', 'c']) {
      cache.request(key, async () => new Blob([key]));
      await tick();
    }
    expect(revoked).toEqual(['blob:1']);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('c')).toBe('blob:3');
  });

  test('fermer la feuille rend toutes les URL et ignore les peintures en vol', async () => {
    const { cache, revoked } = harness();
    cache.request('a', async () => new Blob(['a']));
    await tick();
    const late = deferred();
    cache.request('b', () => late.promise);
    cache.dispose();
    late.resolve(new Blob(['b']));
    await tick();
    expect(revoked).toEqual(['blob:1']);
    expect(cache.get('b')).toBeNull();
  });
});
