import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { FEED_QUERY_KEY } from '@/lib/api/feed';
import type { FeedInfiniteData } from '@/lib/api/feed-pages';
import type { ApiResult } from '@/lib/api/http';
import { performRepost, type RepostResult } from '@/lib/api/publication-repost';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { createActMounter } from '@/test-support/act-mount';
import { gatewayDeps, scripted, seededOn } from '@/test-support/feed-cache-kit';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FeedPostCard } from './feed-post-card';

/**
 * **LA CARTE SE REPEINT DEPUIS LE CACHE** (#6278 c) — la loi 4 mesurée
 * jusqu'au PIXEL (CLAUDE.md, cycle 123) : `feed-post-card-gestures.test.tsx`
 * prouve que l'hôte est appelé ; `publication-repost.test.ts` prouve que le
 * CACHE bascule. Ni l'un ni l'autre ne prouve que la CARTE elle-même se
 * repeint depuis ce cache — ce témoin ferme cette chaîne : un `QueryClient`
 * RÉEL, une carte montée dessus, un clic, une réponse DIFFÉRÉE.
 */
describe('FeedPostCard — repartager : la carte se repeint depuis le cache', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  const mounter = createActMounter();
  afterEach(() => {
    mounter.unmountAll();
  });

  const NOW = new Date('2026-09-25T12:00:00.000Z');

  /** LE PONT ENTRE LE CACHE et la carte — lit `FEED_QUERY_KEY` par
   * `useQuery` (`enabled: false` : aucune requête, la seule source est le
   * cache que le test sème et que `performRepost` bascule), résout le
   * modèle EXACTEMENT comme `routes/feed.tsx`, et remet chaque issue au
   * tableau `results` du test. */
  function Host({
    postId,
    deps,
    results,
  }: {
    readonly postId: string;
    readonly deps: ReturnType<typeof gatewayDeps>;
    readonly results: RepostResult[];
  }) {
    const { data } = useQuery<FeedInfiniteData>({
      queryKey: FEED_QUERY_KEY,
      queryFn: () => Promise.reject(new Error('jamais appelé — enabled: false')),
      enabled: false,
    });
    const post = data?.pages[0]?.posts.find((p) => p.id === postId);
    if (post === undefined) return null;
    const model = resolveFeedCardModel(post, { preferredLanguages: ['fr'], now: NOW });
    return (
      <FeedPostCard
        model={model}
        onRepost={(id) => {
          void performRepost({ postId: id, deps }).then((result) => results.push(result));
        }}
      />
    );
  }

  const mount = async (deps: ReturnType<typeof gatewayDeps>, results: RepostResult[]) =>
    mounter.mount(
      <QueryClientProvider client={deps.queryClient}>
        <Host postId="p1" deps={deps} results={results} />
      </QueryClientProvider>,
    );

  const repostButton = (host: HTMLElement) => host.querySelector('button[data-feed-gesture="repost"]') as HTMLButtonElement | null;

  test('clic ⇒ `aria-pressed=true` et le compte +1 AVANT la réponse — puis retour sur un refus 403', async () => {
    const queryClient = seededOn(FEED_QUERY_KEY as unknown as string[], [
      { id: 'p1', type: 'POST', createdAt: '2026-09-25T11:00:00.000Z', content: 'Bonjour', originalLanguage: 'fr', isRepostedByMe: false, repostCount: 5 },
    ]);
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { transport } = scripted(() => new Promise((resolve) => (release = resolve)));
    const results: RepostResult[] = [];

    const host = await mount(gatewayDeps(queryClient, transport), results);
    expect(repostButton(host)?.getAttribute('aria-pressed')).toBe('false');
    expect(repostButton(host)?.textContent).toContain('5');

    await mounter.click(repostButton(host));

    // OPTIMISTE, AVANT que la passerelle n'ait répondu — le clic n'attend
    // que le tour synchrone de `performRepost`, le transport reste en vol.
    expect(repostButton(host)?.getAttribute('aria-pressed')).toBe('true');
    expect(repostButton(host)?.textContent).toContain('6');

    release({ ok: false, status: 403, error: 'refusé' });
    await mounter.settle();

    // LE REFUS DÉFAIT L'OPTIMISTE — la carte suit le cache, pas un état posé
    // par le clic : c'est la MÊME carte qui se repeint, jamais une seconde
    // lecture.
    expect(repostButton(host)?.getAttribute('aria-pressed')).toBe('false');
    expect(repostButton(host)?.textContent).toContain('5');
    expect(results.at(-1)).toEqual({ ok: false, message: 'feed.post.repost.error', issue: 'refused' });
  });

  test('clic ⇒ succès 201 — l’optimiste RESTE, la notice est celle du succès', async () => {
    const queryClient = seededOn(FEED_QUERY_KEY as unknown as string[], [
      { id: 'p1', type: 'POST', createdAt: '2026-09-25T11:00:00.000Z', content: 'Bonjour', originalLanguage: 'fr', isRepostedByMe: false, repostCount: 5 },
    ]);
    const { transport } = scripted(async () => ({ ok: true, status: 201, data: {} }));
    const results: RepostResult[] = [];

    const host = await mount(gatewayDeps(queryClient, transport), results);
    await mounter.click(repostButton(host));

    expect(repostButton(host)?.getAttribute('aria-pressed')).toBe('true');
    expect(repostButton(host)?.textContent).toContain('6');
    expect(results.at(-1)).toEqual({ ok: true, notice: 'feed.post.repost.success' });
  });

  test('le CACHE seed initial se peint tel quel, sans qu’aucun clic n’ait eu lieu (cache-first)', async () => {
    const queryClient = seededOn(FEED_QUERY_KEY as unknown as string[], [
      { id: 'p1', type: 'POST', createdAt: '2026-09-25T11:00:00.000Z', content: 'Bonjour', originalLanguage: 'fr', isRepostedByMe: true, repostCount: 9 },
    ]);
    const { transport } = scripted(async () => ({ ok: true, status: 201, data: {} }));

    const host = await mount(gatewayDeps(queryClient, transport), []);

    expect(repostButton(host)?.getAttribute('aria-pressed')).toBe('true');
    expect(repostButton(host)?.textContent).toContain('9');
  });
});
