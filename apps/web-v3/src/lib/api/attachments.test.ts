import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { uploadAttachments } from './attachments';
import { createHttpTransport } from './http';
import { resetUploadedAttachmentsForTests } from './fixtures';

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const file = (name: string, type: string, bytes = 3): File => new File([new Uint8Array(bytes)], name, { type });

function fakeFetch(response: { readonly status: number; readonly body?: unknown }) {
  const calls: { readonly url: string; readonly init: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
      status: response.status,
    });
  }) as typeof fetch;
  return { impl, calls };
}

describe('uploadAttachments — fixtures', () => {
  test('rend un Attachment par fichier, duration reprise, aucun appel réseau', async () => {
    resetUploadedAttachmentsForTests();
    const transport = createHttpTransport({ base: '' });
    const result = await uploadAttachments({
      source: 'fixtures',
      transport,
      pending: [{ file: file('voix.webm', 'audio/webm'), durationMs: 800 }, { file: file('a.png', 'image/png') }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.attachments).toHaveLength(2);
      expect(result.data.attachments[0]?.duration).toBe(800);
      expect(result.data.attachments[1]?.fileName).toBe('a.png');
    }
  });

  test('liste vide ⇒ { attachments: [] }, même en source gateway (aucun appel)', async () => {
    const { impl, calls } = fakeFetch({ status: 200 });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });
    const result = await uploadAttachments({ source: 'gateway', transport, pending: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.attachments).toEqual([]);
    expect(calls.length).toBe(0);
  });
});

describe('uploadAttachments — gateway', () => {
  test('POST /api/v1/attachments/upload, corps FormData avec un champ « files » par fichier', async () => {
    const { impl, calls } = fakeFetch({
      status: 200,
      body: { success: true, data: { attachments: [{ id: 'att-1', messageId: '', fileName: 'a.png', originalName: 'a.png', mimeType: 'image/png', fileSize: 3, fileUrl: 'https://x/a.png' }] } },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    const result = await uploadAttachments({
      source: 'gateway',
      transport,
      pending: [{ file: file('a.png', 'image/png') }],
    });

    expect(calls[0]?.url).toBe('/api/v1/attachments/upload');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBeInstanceOf(FormData);
    const form = calls[0]?.init.body as FormData;
    expect((form.get('files') as File).name).toBe('a.png');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.attachments[0]?.id).toBe('att-1');
  });

  test('metadata_<i> porte { duration } pour un vocal, absente pour les autres', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: { attachments: [] } } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    await uploadAttachments({
      source: 'gateway',
      transport,
      pending: [{ file: file('a.png', 'image/png') }, { file: file('voix.webm', 'audio/webm'), durationMs: 4200 }],
    });

    const form = calls[0]?.init.body as FormData;
    expect(form.has('metadata_0')).toBe(false);
    expect(JSON.parse(form.get('metadata_1') as string)).toEqual({ duration: 4200 });
  });

  test('403 (droit de pièce jointe refusé) propagé tel quel', async () => {
    const { impl } = fakeFetch({ status: 403, body: { success: false, error: 'refusé', code: 'ATTACHMENT_RIGHT_NOT_PERMITTED' } });
    const transport = createHttpTransport({ base: '', fetchImpl: impl });

    const result = await uploadAttachments({ source: 'gateway', transport, pending: [{ file: file('a.png', 'image/png') }] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe('ATTACHMENT_RIGHT_NOT_PERMITTED');
    }
  });
});

/**
 * LE TÉLÉVERSEMENT NE VIT PAS SOUS L'HORLOGE D'UN APPEL JSON
 * (revue-correction #5668) — le transport porte 15 s par défaut
 * (`http.ts § DEFAULT_TIMEOUT_MS`, arbitré contre le p95 de
 * `GET /conversations`) ; à ~400 kbit/s en montée (profil Fast 3G de
 * `budgets.json`), une photo de 4 Mo demande plus de quatre-vingts secondes.
 * Ce port pose donc SON délai, et le témoin le mesure par le SIGNAL composé —
 * un transport réglé à 1 ms devrait avoir avorté l'appel, il ne l'a pas.
 */
describe('uploadAttachments — le délai de garde', () => {
  test('le délai du transport (ici 1 ms) NE s’applique pas au téléversement', async () => {
    const { impl, calls } = fakeFetch({
      status: 200,
      body: { success: true, data: { attachments: [] } },
    });
    const transport = createHttpTransport({ base: '', fetchImpl: impl, timeoutMs: 1 });
    await uploadAttachments({ source: 'gateway', transport, pending: [{ file: file('a.png', 'image/png') }] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(calls[0]?.init.signal?.aborted).toBe(false);
  });
});
