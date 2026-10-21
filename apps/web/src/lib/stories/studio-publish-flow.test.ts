import { describe, expect, test } from 'bun:test';

import { createHttpTransport, type ApiFailure, type ApiResult } from '@/lib/api/http';

import { createPublicationKeyring } from './publication-mutation-key';
import { publishStudioPlan, runStudioPublish, studioPublicationContent, type StudioPublishedEvent } from './studio-publish-flow';
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
    // L'événement dit OÙ en est la séquence — la capsule en tire « Publication k/N… ».
    expect(published.map((event) => [event.published, event.total])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
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

  test('le seau `social:write:create` plein (429) à la 3ᵉ ⇒ deux parties sur trois, la cause est le débit', async () => {
    const plan = readyPlan(['page-1', 'page-2', 'page-3']);
    const publish = async (input: StudioPublication): Promise<ApiResult<{ readonly id: string }>> =>
      input.pageIds[0] === 'page-3' ? { ok: false, status: 429, error: 'Trop de créations sociales coûteuses' } : ok(`p-${input.pageIds[0]}`);

    const outcome = await runStudioPublish({ plan, publish });

    expect(outcome).toEqual({ kind: 'failed', failure: 'story.studio.failure.rateLimited', published: 2, total: 3 });
  });

  test('une requête ANNULÉE (sans cause propre) se dit « réseau indisponible » — jamais un échec muet', async () => {
    const plan = readyPlan(['page-1']);
    const publish = async (): Promise<ApiResult<{ readonly id: string }>> => ({ ok: false, status: 0, error: 'annulée', code: 'ABORTED' });

    const outcome = await runStudioPublish({ plan, publish });

    expect(outcome).toEqual({ kind: 'failed', failure: 'story.studio.failure.network', published: 0, total: 1 });
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

/**
 * L'ANNULATION PAR L'AUTEUR (#10316) — une publication en attente se retire
 * de l'envoi, y compris quand la requête est DÉJÀ partie : la requête est
 * coupée, et la clé d'idempotence fait qu'un rejeu du même contenu ne publie
 * jamais deux fois ce que le serveur aurait reçu avant la coupure.
 */
describe('publishStudioPlan — annulable en vol, idempotent au rejeu (#10316)', () => {
  function heldGateway() {
    const calls: Array<{ readonly mutationId: string | null; readonly signal: AbortSignal | undefined }> = [];
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({ mutationId: headers.get('X-Client-Mutation-Id'), signal: init?.signal ?? undefined });
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        setTimeout(() => resolve(new Response(JSON.stringify({ success: true, data: { id: `post-${calls.length}` } }), { status: 201 })), 5);
      });
    }) as typeof fetch;
    return { calls, api: { source: 'gateway' as const, transport: createHttpTransport({ base: '', fetchImpl }) } };
  }

  const plan = readyPlan(['page-1']);

  test('l’annulation coupe la requête EN VOL et rend « aborted », jamais un échec', async () => {
    const gateway = heldGateway();
    const cancel = new AbortController();
    const outcome = publishStudioPlan({ plan, api: gateway.api, kind: 'STORY', visibility: null, language: 'fr', signal: cancel.signal, requestSignal: cancel.signal });
    await Promise.resolve();
    await Promise.resolve();
    expect(gateway.calls).toHaveLength(1);
    cancel.abort();
    expect(await outcome).toEqual({ kind: 'aborted', published: 0, total: 1 });
    expect(gateway.calls[0]!.signal?.aborted).toBe(true);
  });

  test('le rejeu du MÊME contenu porte la MÊME clé X-Client-Mutation-Id', async () => {
    const gateway = heldGateway();
    const keyring = createPublicationKeyring();
    await publishStudioPlan({ plan, api: gateway.api, kind: 'STORY', visibility: null, language: 'fr', keyring });
    await publishStudioPlan({ plan, api: gateway.api, kind: 'STORY', visibility: null, language: 'fr', keyring });
    expect(gateway.calls).toHaveLength(2);
    expect(gateway.calls[0]!.mutationId).toMatch(/^cmid_/);
    expect(gateway.calls[1]!.mutationId).toBe(gateway.calls[0]!.mutationId);
  });

  test('un contenu retouché part sous une clé neuve', async () => {
    const gateway = heldGateway();
    const keyring = createPublicationKeyring();
    await publishStudioPlan({ plan, api: gateway.api, kind: 'POST', visibility: null, language: 'fr', postText: 'Bonjour', keyring });
    await publishStudioPlan({ plan, api: gateway.api, kind: 'POST', visibility: null, language: 'fr', postText: 'Bonsoir', keyring });
    expect(gateway.calls[1]!.mutationId).not.toBe(gateway.calls[0]!.mutationId);
  });
});

/** LE TEXTE DU POST (#8413) — `Post.content` ne part que sous un POST : une
 * story ou un réel n'ont pas de corps, leur texte vit dans la scène. */
describe('studioPublicationContent — le corps ne part que pour un POST', () => {
  test('POST ⇒ le texte, débarrassé de ses blancs de bord', () => {
    expect(studioPublicationContent({ kind: 'POST', postText: '  Bonjour  ' })).toBe('Bonjour');
  });

  test('STORY ou REEL ⇒ rien', () => {
    expect(studioPublicationContent({ kind: 'STORY', postText: 'Bonjour' })).toBeUndefined();
    expect(studioPublicationContent({ kind: 'REEL', postText: 'Bonjour' })).toBeUndefined();
  });

  test('un texte vide ou blanc ⇒ rien', () => {
    expect(studioPublicationContent({ kind: 'POST', postText: '   ' })).toBeUndefined();
  });
});
