import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';

import { uploadProfileImage, type ProfileImageUploadDeps } from './image-upload';

/**
 * W9 (#11315) — UNE PHOTO HEIC CHOISIE SUR ANDROID OU CHROME. Le navigateur ne
 * la décode pas, donc la recompression du profil lève : avant ce lot, la photo
 * était dite « illisible » et rien ne partait. Elle part désormais TELLE QUELLE,
 * typée `image/heic`, et la passerelle (S8, #11263) la sert en JPEG. Si la
 * passerelle ne sait pas la convertir, le refus est MOTIVÉ (`FORMAT_REFUSED`).
 */
type Reply = { readonly status: number; readonly body: unknown };

const gatewayAnswering = (reply: Reply) => {
  const sent: File[] = [];
  const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body = init?.body;
    if (body instanceof FormData) sent.push(...(body.getAll('files') as File[]));
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  };
  return { sent, transport: createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 }) };
};

const depsOf = (transport: ProfileImageUploadDeps['transport']): ProfileImageUploadDeps => ({
  source: 'api',
  transport,
  isOnline: () => true,
  recompress: async () => {
    throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
  },
});

const heicFromChrome = (): File => new File([new Uint8Array(3_000_000)], 'IMG_0042.HEIC', { type: '' });

const servedJpeg = (url: string): Reply => ({
  status: 200,
  body: { success: true, data: { attachments: [{ id: 'a1', fileUrl: url, mimeType: 'image/jpeg', fileSize: 900_000 }] } },
});

describe('uploadProfileImage — une photo HEIC que le navigateur ne décode pas', () => {
  test('elle part telle quelle, typée image/heic, et l’adresse servie (le JPEG) est rendue', async () => {
    const gateway = gatewayAnswering(servedJpeg('2026/10/u-ada/IMG_0042.jpg'));
    const outcome = await uploadProfileImage({ kind: 'avatar', file: heicFromChrome(), deps: depsOf(gateway.transport) });
    expect(outcome).toEqual({ status: 'uploaded', url: '2026/10/u-ada/IMG_0042.jpg', bytesSent: 3_000_000 });
    expect(gateway.sent).toHaveLength(1);
    expect(gateway.sent[0]?.type).toBe('image/heic');
    expect(gateway.sent[0]?.size).toBe(3_000_000);
  });

  test('la passerelle l’écarte (serveur d’avant S8) : refus MOTIVÉ, jamais un échec muet', async () => {
    const gateway = gatewayAnswering({ status: 200, body: { success: true, data: { attachments: [] } } });
    const outcome = await uploadProfileImage({ kind: 'avatar', file: heicFromChrome(), deps: depsOf(gateway.transport) });
    expect(outcome).toMatchObject({ status: 'refused', code: 'FORMAT_REFUSED' });
  });

  test('la passerelle refuse le type par un 4xx : refus MOTIVÉ aussi', async () => {
    const gateway = gatewayAnswering({ status: 415, body: { success: false, error: 'Unsupported media type' } });
    const outcome = await uploadProfileImage({ kind: 'avatar', file: heicFromChrome(), deps: depsOf(gateway.transport) });
    expect(outcome).toMatchObject({ status: 'refused', code: 'FORMAT_REFUSED' });
  });

  test('CONTRE-ÉPREUVE : un JPEG illisible reste « illisible », rien ne part', async () => {
    const gateway = gatewayAnswering(servedJpeg('x'));
    const broken = new File([new Uint8Array(10)], 'abime.jpg', { type: 'image/jpeg' });
    const outcome = await uploadProfileImage({ kind: 'avatar', file: broken, deps: depsOf(gateway.transport) });
    expect(outcome).toEqual({ status: 'unreadable' });
    expect(gateway.sent).toHaveLength(0);
  });
});
