import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { canSendPlaintext, endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';
import { createImagePreparer, type ImagePort } from '@/lib/media/prepare-image-upload';

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

describe('uploadFiles — un partage de 100 fichiers et 5 Go (#12974)', () => {
  const passThrough = createImagePreparer((() => Promise.reject(new Error('aucune photo à préparer'))) as ImagePort);
  const doc = (name: string, bytes = 2): File => new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });

  test('au-delà de 30 fichiers, plusieurs requêtes directes — jamais une seule que la passerelle refuserait (413)', async () => {
    let next = 0;
    const { deps, requests } = scripted((request) => {
      const count = (request.body as FormData).getAll('files').length;
      return { ok: true, data: { attachments: Array.from({ length: count }, () => ({ id: `att-${(next += 1)}` })) } };
    });
    const ports = createSendSheetPorts({ language: 'fr', deps, prepare: passThrough });
    const files = Array.from({ length: 100 }, (_, i) => doc(`${i}.pdf`));
    const result = await ports.uploadFiles(files);
    expect(requests.map((request) => (request.body as FormData).getAll('files').length)).toEqual([30, 30, 30, 10]);
    expect(result).toEqual({ ok: true, data: { attachmentIds: Array.from({ length: 100 }, (_, i) => `att-${i + 1}`) } });
  });

  test('un fichier trop lourd pour la voie directe part en reprise (TUS), à son rang, sans contexte de publication', async () => {
    const { deps, requests } = scripted((request) => {
      const names = (request.body as FormData).getAll('files').map((entry) => (entry as File).name);
      return { ok: true, data: { attachments: names.map((name) => ({ id: `att-${name}` })) } };
    });
    const created: string[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        created.push(new Headers(init.headers).get('Upload-Metadata') ?? '');
        return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      }
      return new Response(JSON.stringify({ success: true, data: { attachment: { id: 'att-tus', fileUrl: 'f', mimeType: 'application/pdf' } } }), {
        status: 200,
        headers: { 'Upload-Offset': '8' },
      });
    }) as typeof fetch;
    const ports = createSendSheetPorts({
      language: 'fr',
      deps,
      prepare: passThrough,
      media: { source: 'gateway', base: 'https://up.test', credential: () => ({ kind: 'registered', token: 'jwt' }), fetchImpl },
      uploadLimits: { maxFiles: 30, maxBytes: 4 },
      resumableCheckpoints: null,
    });
    const result = await ports.uploadFiles([doc('a.pdf'), doc('lourd.pdf', 8), doc('b.pdf')]);
    expect(result).toEqual({ ok: true, data: { attachmentIds: ['att-a.pdf', 'att-tus', 'att-b.pdf'] } });
    expect(requests).toHaveLength(2);
    expect(created).toHaveLength(1);
    expect(created[0]).not.toContain('uploadcontext');
  });

  test('un lot refusé arrête l’envoi : rien n’est envoyé à moitié', async () => {
    let calls = 0;
    const { deps } = scripted(() => {
      calls += 1;
      return calls === 1 ? { ok: true, data: { attachments: Array.from({ length: 30 }, (_, i) => ({ id: `att-${i}` })) } } : { ok: false, status: 503, error: 'indisponible' };
    });
    const ports = createSendSheetPorts({ language: 'fr', deps, prepare: passThrough });
    const result = await ports.uploadFiles(Array.from({ length: 40 }, (_, i) => doc(`${i}.pdf`)));
    expect(result.ok).toBe(false);
  });
});

describe('openDirect', () => {
  test('rend l’identifiant de la conversation directe', async () => {
    const { deps, requests } = scripted(() => ({ ok: true, data: { id: 'dm-1' } }));
    const ports = createSendSheetPorts({ language: 'fr', deps });
    expect(await ports.openDirect('u1')).toEqual({ ok: true, data: { id: 'dm-1' } });
    expect(requests[0]?.body).toEqual({ type: 'direct', participantIds: ['u1'] });
  });

  test('le tête-à-tête existant servi e2ee est appris AVANT tout téléversement (audit #12949)', async () => {
    const { deps } = scripted(() => ({ ok: true, data: { id: 'dm-e2ee', type: 'direct', encryptionMode: 'e2ee' } }));
    const ports = createSendSheetPorts({ language: 'fr', deps });
    await ports.openDirect('u2');
    await ports.openGroup({ userIds: ['u3', 'u4'], title: 'g' });
    expect(canSendPlaintext({ conversationId: 'dm-e2ee' })).toBe(false);
    endToEndRegimeLedger.getState().reset();
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

describe('un média déjà servi par la passerelle ne se ré-encode pas (#11310, #11247)', () => {
  const jpegFetch = (async () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { status: 200 })) as unknown as typeof fetch;
  const spying = () => {
    const jobs: unknown[] = [];
    const port: ImagePort = (job) => (jobs.push(job), Promise.resolve(new Blob([new Uint8Array(1)], { type: 'image/webp' })));
    return { jobs, prepare: createImagePreparer(port) };
  };

  test('transféré en pièce jointe : les octets servis repartent tels quels', async () => {
    const { jobs, prepare } = spying();
    const { deps, requests } = scripted(() => ({ ok: true, data: { attachments: [{ id: 'att-1' }] } }));
    const ports = createSendSheetPorts({ language: 'fr', deps, fetchImpl: jpegFetch, prepare });
    const served = await ports.fetchFile({ url: 'https://gate/a.jpg', mime: 'image/jpeg', name: 'a.jpg' });
    if (served === null) throw new Error('média non relu');
    expect(await ports.uploadFiles([served])).toEqual({ ok: true, data: { attachmentIds: ['att-1'] } });
    expect(jobs).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  test('republié en story : le média servi n’est pas recompressé', async () => {
    const { jobs, prepare } = spying();
    const fetchImpl = (async (input: RequestInfo | URL) =>
      String(input).startsWith('https://gate/') ? new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { status: 200 }) : new Response(null, { status: 500 })) as unknown as typeof fetch;
    const ports = createSendSheetPorts({
      language: 'fr',
      fetchImpl,
      prepare,
      media: { source: 'gateway', base: 'https://up.test', credential: () => null, fetchImpl },
    });
    const served = await ports.fetchFile({ url: 'https://gate/a.jpg', mime: 'image/jpeg', name: 'a.jpg' });
    if (served === null) throw new Error('média non relu');
    await ports.uploadMedia(served);
    expect(jobs).toEqual([]);
  });

  test('un fichier choisi sur l’appareil, lui, est préparé', async () => {
    const { jobs, prepare } = spying();
    const { deps } = scripted(() => ({ ok: true, data: { attachments: [{ id: 'att-1' }] } }));
    await createSendSheetPorts({ language: 'fr', deps, prepare }).uploadFiles([new File([new Uint8Array([0xff, 0xd8])], 'b.jpg', { type: 'image/jpeg' })]);
    expect(jobs).toHaveLength(1);
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
