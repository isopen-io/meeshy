import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import * as uploadsEndpoints from '@meeshy/shared/api/endpoints/uploads';

import { currentCredential, currentIdentity } from '@/lib/api/client';
import { createHttpTransport } from '@/lib/api/http';
import { sessionStore } from '@/lib/api/session';
import type { FeedPost } from '@/lib/api/feed-pages';
import type { PublicationKind } from '@/lib/stories/publication-kind';
import { buildStoryCanvasEffectsPages } from '@/lib/stories/story-document';
import { studioEditHydration } from '@/lib/stories/studio-edit';
import { newTextLayer } from '@/lib/stories/studio-text';
import type { StudioEdit } from '@/routes/use-studio-edit';
import { VIEWER_ID, flush, harness, image, mount, mountEdit, publishButton, registerStudioBench, selectFile, typeText } from '@/test-support/story-studio-bench';

/**
 * UNE PUBLICATION DU STUDIO SE TERMINE SOUS LE COMPTE QUI L'A LANCÉE (audit
 * #19352, X1). Ada touche Publier pendant que la dernière tranche de sa photo
 * monte ; un autre onglet fait passer l'appareil à Bob, et cet onglet suit.
 * La tranche aboutit, puis `POST /posts` partait avec le jeton de Bob, le texte
 * d'Ada et l'adresse de sa photo. Le transport est celui de la production :
 * crédential et identité relus dans la session à l'émission.
 */
registerStudioBench();

const BOB = { user: { id: 'u-bob', username: 'bob' }, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 } as const;

type Sent = { readonly kind: 'upload' | 'post'; readonly auth: string | null };

function bench({ holdCreation = false }: { readonly holdCreation?: boolean } = {}) {
  const sent: Sent[] = [];
  const held: Array<() => void> = [];
  const uploadFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ kind: 'upload', auth: new Headers(init?.headers).get('Authorization') });
    if (init?.method === 'POST') {
      if (holdCreation) await new Promise<void>((resolve) => held.push(resolve));
      return new Response(null, { status: 201, headers: { Location: uploadsEndpoints.byWildcard('up-1') } });
    }
    if (!holdCreation) await new Promise<void>((resolve) => held.push(resolve));
    return new Response(JSON.stringify({ success: true, data: { attachment: { id: 'pm-1', fileUrl: '2026/11/u/f.jpg', mimeType: 'image/jpeg' } } }), {
      status: 200,
      headers: { 'Upload-Offset': '3' },
    });
  }) as typeof fetch;
  const postsFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ kind: 'post', auth: new Headers(init?.headers).get('Authorization') });
    return new Response(JSON.stringify({ success: true, data: { id: 'post-1' } }), { status: 201 });
  }) as typeof fetch;
  const base = harness({});
  const deps = {
    ...base.deps,
    api: { source: 'gateway' as const, transport: createHttpTransport({ base: '', credential: currentCredential, identity: currentIdentity, fetchImpl: postsFetch }) },
    upload: { source: 'gateway' as const, base: 'https://gate.test', credential: currentCredential, fetchImpl: uploadFetch },
  };
  return { sent, held, deps };
}

describe('la publication du studio reste au compte qui a touché Publier (audit #19352, X1)', () => {
  const kinds: readonly PublicationKind[] = ['STORY', 'POST'];
  for (const kind of kinds) test(`${kind} : l’appareil passe à Bob pendant la dernière tranche — rien ne part sous Bob, l’intention attend Ada`, async () => {
    const { sent, held, deps } = bench();
    const el = mount(deps, kind);
    typeText(el, 'Le secret d’Ada');
    selectFile(el, 'visual', image());
    await flush(() => held.length === 1);

    act(() => publishButton(el)!.click());
    await flush();
    act(() => {
      sessionStore.getState().establish(BOB);
    });
    await flush();
    held.shift()!();
    await flush(() => sent.some((request) => request.kind === 'post'));
    await flush();

    expect(sent.filter((request) => request.auth === 'Bearer jwt-bob')).toEqual([]);
    expect(sent.filter((request) => request.kind === 'post')).toEqual([]);
    expect((await deps.outbox!.load(VIEWER_ID))?.intent?.state).toBe('armed');
  });
});

describe('la montée refusée parce que le compte a changé laisse l’intention attendre son compte (audit #19352, X1)', () => {
  test('l’appareil passe à Bob avant la tranche : aucune tranche ni publication sous Bob, l’intention reste armée pour Ada', async () => {
    const { sent, held, deps } = bench({ holdCreation: true });
    const el = mount(deps, 'STORY');
    typeText(el, 'Le secret d’Ada');
    selectFile(el, 'visual', image());
    await flush(() => held.length === 1);

    act(() => publishButton(el)!.click());
    await flush();
    act(() => {
      sessionStore.getState().establish(BOB);
    });
    await flush();
    held.shift()!();
    await flush();
    await flush();

    expect(sent.filter((request) => request.auth === 'Bearer jwt-bob')).toEqual([]);
    expect(sent.filter((request) => request.kind === 'post')).toEqual([]);
    expect((await deps.outbox!.load(VIEWER_ID))?.intent?.state).toBe('armed');
  });
});

describe('l’enregistrement d’une publication rouverte reste au compte qui a touché Enregistrer (audit #19352, X1)', () => {
  const served = (): FeedPost => ({
    id: 'p-1',
    type: 'POST',
    createdAt: '2026-10-01T10:00:00.000Z',
    content: 'Le corps',
    originalLanguage: 'fr',
    author: { id: VIEWER_ID },
    storyEffects: buildStoryCanvasEffectsPages(
      [{ id: '1', texts: [{ ...newTextLayer({ id: 'text-1', language: 'fr' }), text: 'Une' }], background: { source: { postMediaId: 'pm-1', fileUrl: '2026/10/u/pm-1.jpg' }, mediaType: 'image' as const } }],
      null,
    ),
    media: [{ id: 'pm-1', fileUrl: '2026/10/u/pm-1.jpg', mimeType: 'image/jpeg' }],
  });
  const editOf = (journal: string[]): StudioEdit => {
    const hydration = studioEditHydration({ post: served(), viewerId: VIEWER_ID, resolveUrl: (url) => `https://cdn.test/${url}`, language: 'fr' });
    if (hydration.kind !== 'studio') throw new Error(hydration.reason);
    return { draft: hydration.draft, origin: hydration.origin, onSaved: () => journal.push('saved'), onCancel: () => journal.push('cancel') };
  };

  test('l’appareil passe à Bob pendant la dernière tranche : le PUT ne part pas sous Bob, et rien n’est dit en échec', async () => {
    const { sent, held, deps } = bench();
    const journal: string[] = [];
    const el = mountEdit(deps, editOf(journal));
    await flush(() => publishButton(el) !== null);
    selectFile(el, 'visual', image());
    await flush(() => held.length === 1);

    act(() => publishButton(el)!.click());
    await flush();
    act(() => {
      sessionStore.getState().establish(BOB);
    });
    await flush();
    held.shift()!();
    await flush(() => sent.some((request) => request.kind === 'post'));
    await flush();

    expect(sent.filter((request) => request.auth === 'Bearer jwt-bob')).toEqual([]);
    expect(sent.filter((request) => request.kind === 'post')).toEqual([]);
    expect(journal).toEqual([]);
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});
