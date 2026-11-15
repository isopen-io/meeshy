import { describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import type { Conversation } from '@/lib/api/types';

import { createTalkieVoiceCopier, pickTalkieCopyDestination, talkieCopyFileName } from './talkie-voice-copy';

/**
 * LA COPIE VOCALE PART LÀ OÙ IL FAUT (#16698, iso `TalkieCopyDestination` iOS, précision porteur #17141) — la
 * conversation que la passerelle nomme, sinon la partagée la plus récente qui peut la porter, sinon le direct EN CLAIR.
 */

const PROCHE = '64b000000000000000000001';
const NAMED = '64b0000000000000000000c1';
const RECENT = '64b0000000000000000000c2';
const OLDER = '64b0000000000000000000c3';
const SEALED = '64b0000000000000000000c4';
const DIRECT = '64b0000000000000000000c5';

const conversation = (id: string, overrides: Partial<Conversation> = {}): Conversation =>
  ({ id, type: 'group', isActive: true, listRankAt: '2026-11-01T10:00:00.000Z', ...overrides }) as Conversation;

const frames = [new Uint8Array([0xff, 0xf1, 1]), new Uint8Array([0xff, 0xf1, 2])];
const copyOf = (conversationId: string | null) => ({ frames, durationMs: 4_200, toUserId: PROCHE, conversationId });

function gateway({ shared = [] as readonly Conversation[], direct = conversation(DIRECT, { type: 'direct' }), uploads = 1, sends = true } = {}) {
  const requests: HttpRequest[] = [];
  const respond = (request: HttpRequest): ApiResult<unknown> => {
    if (request.method === 'GET') return { ok: true, data: shared };
    if (request.path === '/api/v1/attachments/upload') return { ok: true, data: { attachments: Array.from({ length: uploads }, (_, i) => ({ id: `att-${i}` })) } };
    if (request.path === '/api/v1/conversations') return { ok: true, data: direct };
    return sends ? { ok: true, data: { id: 'msg-1', conversationId: 'x', createdAt: '2026-11-13T10:00:00.000Z' } } : { ok: false, status: 500, error: 'boom' };
  };
  const transport = {
    request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
      requests.push(request);
      return respond(request) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  const deps: ConversationsDeps = { source: 'gateway', transport };
  const copier = createTalkieVoiceCopier({ deps, language: () => 'fr', now: () => new Date(2026, 10, 13, 9, 5) });
  const sent = () => requests.filter((r) => r.method === 'POST' && r.path.endsWith('/messages'));
  return { copier, requests, sent };
}

describe('la conversation où part la copie', () => {
  test('la plus récente qui peut la porter gagne', () => {
    expect(
      pickTalkieCopyDestination([
        conversation(OLDER, { listRankAt: '2026-10-01T10:00:00.000Z' }),
        conversation(RECENT, { listRankAt: '2026-11-12T10:00:00.000Z' }),
      ]),
    ).toBe(RECENT);
  });

  test('jamais une conversation chiffrée, un salon public, une chaîne d’annonces ni une conversation quittée', () => {
    expect(
      pickTalkieCopyDestination([
        conversation(SEALED, { encryptionMode: 'e2ee', listRankAt: '2026-11-13T10:00:00.000Z' }),
        conversation('64b0000000000000000000d1', { type: 'public', listRankAt: '2026-11-13T10:00:00.000Z' }),
        conversation('64b0000000000000000000d2', { isAnnouncementChannel: true, listRankAt: '2026-11-13T10:00:00.000Z' }),
        conversation('64b0000000000000000000d3', { isMember: false, listRankAt: '2026-11-13T10:00:00.000Z' }),
        conversation(OLDER, { listRankAt: '2026-01-01T10:00:00.000Z' }),
      ]),
    ).toBe(OLDER);
  });

  test('aucune éligible : il faudra ouvrir le direct', () => {
    expect(pickTalkieCopyDestination([conversation(SEALED, { encryptionMode: 'e2ee' })])).toBeNull();
  });

  test('le nom du fichier dit le moment, à l’heure locale', () => {
    expect(talkieCopyFileName(new Date(2026, 10, 13, 9, 5))).toBe('talkie_2026-11-13_0905.aac');
  });
});

describe('le copieur', () => {
  test('la conversation nommée par la passerelle reçoit le vocal, sans autre lecture', async () => {
    const g = gateway();
    expect(await g.copier(copyOf(NAMED))).toBe(true);
    expect(g.requests.some((r) => r.method === 'GET')).toBe(false);
    const upload = g.requests.find((r) => r.path === '/api/v1/attachments/upload');
    const file = (upload?.body as FormData).getAll('files')[0] as File;
    expect(file.type).toBe('audio/aac');
    expect(file.name).toBe('talkie_2026-11-13_0905.aac');
    expect(file.size).toBe(6);
    expect(g.sent()[0]?.path).toBe(`/api/v1/conversations/${NAMED}/messages`);
    expect(g.sent()[0]?.body).toMatchObject({ messageType: 'audio', attachmentIds: ['att-0'], originalLanguage: 'fr' });
  });

  test('sans conversation nommée : la partagée la plus récente', async () => {
    const g = gateway({ shared: [conversation(RECENT, { listRankAt: '2026-11-12T10:00:00.000Z' }), conversation(OLDER)] });
    expect(await g.copier(copyOf(null))).toBe(true);
    expect(g.sent()[0]?.path).toBe(`/api/v1/conversations/${RECENT}/messages`);
  });

  test('aucune partagée éligible : le direct est ouvert EN CLAIR', async () => {
    const g = gateway({ shared: [conversation(SEALED, { encryptionMode: 'e2ee' })] });
    expect(await g.copier(copyOf(null))).toBe(true);
    const created = g.requests.find((r) => r.method === 'POST' && r.path === '/api/v1/conversations');
    expect(created?.body).toEqual({ type: 'direct', participantIds: [PROCHE], plaintext: true });
    expect(g.sent()[0]?.path).toBe(`/api/v1/conversations/${DIRECT}/messages`);
  });

  test('un direct rendu chiffré ne reçoit rien', async () => {
    const g = gateway({ direct: conversation(DIRECT, { type: 'direct', encryptionMode: 'e2ee' }) });
    expect(await g.copier(copyOf(null))).toBe(false);
    expect(g.requests.some((r) => r.path === '/api/v1/attachments/upload')).toBe(false);
  });

  test('un téléversement amputé n’envoie rien', async () => {
    const g = gateway({ uploads: 0 });
    expect(await g.copier(copyOf(NAMED))).toBe(false);
    expect(g.sent()).toEqual([]);
  });

  test('un envoi refusé se dit en échec', async () => {
    const g = gateway({ sends: false });
    expect(await g.copier(copyOf(NAMED))).toBe(false);
  });

  test('sans voix, rien ne part', async () => {
    const g = gateway();
    expect(await g.copier({ ...copyOf(NAMED), frames: [] })).toBe(false);
    expect(g.requests).toEqual([]);
  });
});
