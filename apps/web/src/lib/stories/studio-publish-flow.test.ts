import { describe, expect, test } from 'bun:test';

import type { ApiFailure, ApiResult } from '@/lib/api/http';

import { runStudioPublish, type StudioPublishedEvent } from './studio-publish-flow';
import type { StudioPublication, StudioPublishPlan } from './studio-publish';

/**
 * `runStudioPublish` — L'ENVOI SÉQUENTIEL, DANS L'ORDRE, ARRÊTÉ À LA PREMIÈRE
 * PANNE (#7707). Miroir de `StoryViewModel+PublicationUpload.swift:99-125`.
 */

const publication = (pageId: string): StudioPublication => ({
  pageIds: [pageId],
  hasText: true,
  storyEffects: { v: 3, scenes: [{ id: pageId, objects: [] }] },
  mediaIds: [],
});

const readyPlan = (pageIds: readonly string[]): Extract<StudioPublishPlan, { kind: 'ready' }> => ({
  kind: 'ready',
  publications: pageIds.map(publication),
});

const ok = (id: string): ApiResult<{ readonly id: string }> => ({ ok: true, data: { id } });
const failure: ApiFailure = { ok: false, status: 500, error: 'boom' };

describe('runStudioPublish — séquentiel, dans l’ordre, arrêt à la première panne (#7707)', () => {
  test('trois succès : les trois partent DANS L’ORDRE, une par une (jamais en parallèle)', async () => {
    const plan = readyPlan(['page-1', 'page-2', 'page-3']);
    const order: string[] = [];
    const pending: Array<() => void> = [];
    const published: StudioPublishedEvent[] = [];

    const publish = (input: StudioPublication) =>
      new Promise<ApiResult<{ readonly id: string }>>((resolve) => {
        order.push(input.pageIds[0]!);
        pending.push(() => resolve(ok(`p-${input.pageIds[0]}`)));
      });

    const outcomePromise = runStudioPublish({ plan, publish, onPublished: (event) => published.push(event) });

    // La 2ᵉ requête n’est PAS émise tant que la 1ʳᵉ n’est pas résolue.
    await Promise.resolve();
    expect(order).toEqual(['page-1']);
    pending[0]!();
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['page-1', 'page-2']);
    pending[1]!();
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['page-1', 'page-2', 'page-3']);
    pending[2]!();

    const outcome = await outcomePromise;
    expect(outcome).toEqual({ kind: 'published', postIds: ['p-page-1', 'p-page-2', 'p-page-3'] });
    expect(published.map((event) => event.pageIds)).toEqual([['page-1'], ['page-2'], ['page-3']]);
  });

  test('la 2ᵉ requête échoue (500) ⇒ la 3ᵉ n’est JAMAIS émise, `onPublished` appelé UNE fois', async () => {
    const plan = readyPlan(['page-1', 'page-2', 'page-3']);
    const calls: string[] = [];
    const published: StudioPublishedEvent[] = [];
    const publish = async (input: StudioPublication): Promise<ApiResult<{ readonly id: string }>> => {
      calls.push(input.pageIds[0]!);
      return input.pageIds[0] === 'page-2' ? failure : ok(`p-${input.pageIds[0]}`);
    };

    const outcome = await runStudioPublish({ plan, publish, onPublished: (event) => published.push(event) });

    expect(calls).toEqual(['page-1', 'page-2']);
    expect(outcome).toEqual({ kind: 'failed', failure: 'story.studio.failure.unavailable', published: 1, total: 3 });
    expect(published).toHaveLength(1);
  });

  test('un signal abandonné ENTRE la 1ʳᵉ et la 2ᵉ ⇒ exactement une requête émise', async () => {
    const plan = readyPlan(['page-1', 'page-2', 'page-3']);
    const controller = new AbortController();
    const calls: string[] = [];
    const publish = async (input: StudioPublication): Promise<ApiResult<{ readonly id: string }>> => {
      calls.push(input.pageIds[0]!);
      controller.abort();
      return ok(`p-${input.pageIds[0]}`);
    };

    const outcome = await runStudioPublish({ plan, publish, signal: controller.signal });

    expect(calls).toEqual(['page-1']);
    expect(outcome).toEqual({ kind: 'aborted', published: 1, total: 3 });
  });
});
