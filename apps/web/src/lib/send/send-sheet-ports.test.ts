import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { createSendSheetPorts } from './send-sheet-ports';

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

/**
 * LES VRAIS PORTS (#8884) — un transport factice enregistre ce qui part vers
 * la passerelle ; on éprouve la TRADUCTION appel du moteur → requête.
 */
const scripted = (respond: (request: HttpRequest) => ApiResult<unknown>) => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
      requests.push(request);
      return respond(request) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  const deps: ConversationsDeps = { source: 'gateway', transport };
  return { deps, requests };
};

const png = (name = 'a.png'): File => new File([new Uint8Array(2)], name, { type: 'image/png' });

describe('uploadFiles', () => {
  test('moins de pièces que de fichiers : UPLOAD_PARTIAL, jamais un message amputé', async () => {
    const { deps } = scripted(() => ({ ok: true, data: { attachments: [{ id: 'att-1' }] } }));
    const ports = createSendSheetPorts({ language: 'fr', deps });
    const result = await ports.uploadFiles([png('a.png'), png('b.png')]);
    expect(result).toEqual({ ok: false, status: 200, error: 'Lot de pièces jointes incomplet', code: 'UPLOAD_PARTIAL' });
  });

  test('toutes les pièces : leurs identifiants, dans l’ordre', async () => {
    const { deps } = scripted(() => ({ ok: true, data: { attachments: [{ id: 'att-1' }, { id: 'att-2' }] } }));
    const ports = createSendSheetPorts({ language: 'fr', deps });
    expect(await ports.uploadFiles([png('a.png'), png('b.png')])).toEqual({ ok: true, data: { attachmentIds: ['att-1', 'att-2'] } });
  });
});

describe('openDirect', () => {
  test('rend l’identifiant de la conversation directe', async () => {
    const { deps, requests } = scripted(() => ({ ok: true, data: { id: 'dm-1' } }));
    const ports = createSendSheetPorts({ language: 'fr', deps });
    expect(await ports.openDirect('u1')).toEqual({ ok: true, data: { id: 'dm-1' } });
    expect(requests[0]?.body).toEqual({ type: 'direct', participantIds: ['u1'] });
  });
});

describe('fetchFile', () => {
  test('le média téléchargé devient un File nommé, au bon type', async () => {
    const fetchImpl = (async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as unknown as typeof fetch;
    const ports = createSendSheetPorts({ language: 'fr', fetchImpl });
    const file = await ports.fetchFile({ url: 'https://cdn/x.jpg', mime: 'image/jpeg', name: 'x.jpg' });
    expect(file?.name).toBe('x.jpg');
    expect(file?.type).toBe('image/jpeg');
    expect(file?.size).toBe(3);
  });

  test('un refus ou une coupure : null, jamais une exception', async () => {
    const refused = createSendSheetPorts({ language: 'fr', fetchImpl: (async () => new Response(null, { status: 404 })) as unknown as typeof fetch });
    expect(await refused.fetchFile({ url: 'u', mime: 'image/png', name: 'x.png' })).toBeNull();
    const cut = createSendSheetPorts({ language: 'fr', fetchImpl: (async () => Promise.reject(new Error('coupé'))) as unknown as typeof fetch });
    expect(await cut.fetchFile({ url: 'u', mime: 'image/png', name: 'x.png' })).toBeNull();
  });
});

describe('publishMedia', () => {
  const media = { postMediaId: 'pm-1', fileUrl: 'https://cdn/pm-1.jpg', mimeType: 'image/jpeg' };

  test('un POST porte la légende en CORPS', async () => {
    const { deps, requests } = scripted(() => ({ ok: true, data: { id: 'post-1' } }));
    await createSendSheetPorts({ language: 'fr', deps }).publishMedia({ format: 'POST', media, caption: 'Beau' });
    const body = requests[0]?.body as Record<string, unknown>;
    expect(requests[0]?.path).toBe('/api/v1/posts');
    expect(body.type).toBe('POST');
    expect(body.content).toBe('Beau');
    expect(body.mediaIds).toEqual(['pm-1']);
    expect(body.mediaCaption).toBeUndefined();
  });

  test('une story porte la légende sur le MÉDIA, jamais en corps', async () => {
    const { deps, requests } = scripted(() => ({ ok: true, data: { id: 'post-1' } }));
    await createSendSheetPorts({ language: 'fr', deps }).publishMedia({ format: 'STORY', media, caption: 'Beau' });
    const body = requests[0]?.body as Record<string, unknown>;
    expect(body.type).toBe('STORY');
    expect(body.content).toBeUndefined();
    expect(body.mediaCaption).toEqual({ 'pm-1': 'Beau' });
  });

  test('un réel sans légende : ni corps ni légende de média', async () => {
    const { deps, requests } = scripted(() => ({ ok: true, data: { id: 'post-1' } }));
    await createSendSheetPorts({ language: 'fr', deps }).publishMedia({ format: 'REEL', media: { ...media, mimeType: 'video/mp4' } });
    const body = requests[0]?.body as Record<string, unknown>;
    expect(body.type).toBe('REEL');
    expect(body.content).toBeUndefined();
    expect(body.mediaCaption).toBeUndefined();
  });
});

describe('le réseau', () => {
  test('online lit navigator.onLine par défaut, ou l’horloge injectée', () => {
    expect(createSendSheetPorts({ language: 'fr', online: () => false }).online()).toBe(false);
    expect(typeof createSendSheetPorts({ language: 'fr' }).online()).toBe('boolean');
  });
});
