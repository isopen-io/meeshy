import { describe, expect, test } from 'bun:test';

import { decodeCallSession, loadActiveCall, loadCallSession, loadConversationActiveCallId } from './call-sessions';
import { createHttpTransport } from './http';

/**
 * LES SESSIONS D'APPEL (lot 3) — `GET /api/v1/calls/active` (la reprise après
 * rechargement, #3586, E7), `GET /api/v1/calls/:callId` (le lien profond
 * `/call/:callId`, A12) et `GET /api/v1/conversations/:id/active-call` (la
 * pastille « Rejoindre » du fil, H3), toutes trois servies par
 * `calls-consultation.ts` au schéma `callSessionSchema`.
 */

const wireSession = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: '64f0c0ffee00000000000a01',
  conversationId: '64f0c0ffee00000000000c01',
  initiatorId: 'u-ada',
  mode: 'p2p',
  status: 'active',
  metadata: { type: 'video' },
  startedAt: '2026-09-26T09:00:00.000Z',
  answeredAt: '2026-09-26T09:00:04.000Z',
  endedAt: null,
  duration: null,
  participants: [
    { id: 'p1', userId: 'u-ada', leftAt: null, user: { id: 'u-ada', username: 'ada', displayName: 'Ada Lovelace', avatar: 'https://cdn.test/ada.jpg', isOnline: true } },
    { id: 'p2', userId: 'u-me', leftAt: null, user: { id: 'u-me', username: 'moi', displayName: 'Moi', avatar: null, isOnline: true } },
  ],
  participantCount: 2,
  ...overrides,
});

const gatewayReplying = (reply: { readonly status: number; readonly body: unknown }) => {
  const paths: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
    paths.push(new URL(String(input)).pathname);
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
  };
  const transport = createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 });
  return { paths, deps: { source: 'gateway' as const, transport } };
};

describe('une session d’appel décodée est une PROJECTION', () => {
  test('le type vient de `metadata.type`, jamais de `mode` ; la présence des participants n’entre pas', () => {
    expect(decodeCallSession(wireSession())).toEqual({
      callId: '64f0c0ffee00000000000a01',
      conversationId: '64f0c0ffee00000000000c01',
      media: 'video',
      live: true,
      initiatorId: 'u-ada',
      answered: true,
      startedAt: '2026-09-26T09:00:00.000Z',
      durationSec: 0,
      participants: [
        { userId: 'u-ada', name: 'Ada Lovelace', avatar: 'https://cdn.test/ada.jpg' },
        { userId: 'u-me', name: 'Moi', avatar: null },
      ],
    });
  });

  test('un statut terminal n’est pas vivant ; une durée terminée se lit', () => {
    for (const status of ['ended', 'missed', 'rejected', 'failed']) {
      expect(decodeCallSession(wireSession({ status, duration: 185 }))).toMatchObject({ live: false, durationSec: 185 });
    }
  });

  test('un appel sans type déclaré est vocal ; un participant parti n’est plus compté', () => {
    const session = decodeCallSession(
      wireSession({
        metadata: null,
        participants: [
          { userId: 'u-ada', leftAt: '2026-09-26T09:01:00.000Z', user: { id: 'u-ada', username: 'ada' } },
          { userId: 'u-me', leftAt: null, user: { id: 'u-me', username: 'moi' } },
        ],
      }),
    );
    expect(session?.media).toBe('audio');
    expect(session?.participants).toEqual([{ userId: 'u-me', name: 'moi', avatar: null }]);
  });

  test('sans identifiant ni conversation, rien', () => {
    expect(decodeCallSession(wireSession({ id: '' }))).toBeNull();
    expect(decodeCallSession({ status: 'active' })).toBeNull();
    expect(decodeCallSession(null)).toBeNull();
  });
});

describe('l’appel en cours du lecteur — `GET /calls/active`', () => {
  test('rend la session servie', async () => {
    const { paths, deps } = gatewayReplying({ status: 200, body: { success: true, data: wireSession() } });
    const result = await loadActiveCall(deps);
    expect(paths).toEqual(['/api/v1/calls/active']);
    expect(result.ok && result.data?.callId).toBe('64f0c0ffee00000000000a01');
  });

  test('un 404 NO_ACTIVE_CALL est une RÉPONSE — aucun appel — jamais une erreur', async () => {
    const { deps } = gatewayReplying({ status: 404, body: { success: false, error: 'NO_ACTIVE_CALL' } });
    expect(await loadActiveCall(deps)).toEqual({ ok: true, data: null });
  });

  test('une session terminée servie par erreur ne se reprend pas', async () => {
    const { deps } = gatewayReplying({ status: 200, body: { success: true, data: wireSession({ status: 'ended' }) } });
    expect(await loadActiveCall(deps)).toEqual({ ok: true, data: null });
  });

  test('une panne reste une panne', async () => {
    const { deps } = gatewayReplying({ status: 500, body: { success: false, error: 'INTERNAL_ERROR' } });
    expect((await loadActiveCall(deps)).ok).toBe(false);
  });
});

describe('un appel par son identifiant — `GET /calls/:callId`', () => {
  test('encode l’identifiant et rend la session', async () => {
    const { paths, deps } = gatewayReplying({ status: 200, body: { success: true, data: wireSession({ status: 'ended' }) } });
    const result = await loadCallSession(deps, 'a/b');
    expect(paths).toEqual(['/api/v1/calls/a%2Fb']);
    expect(result.ok && result.data?.live).toBe(false);
  });

  test('introuvable ou interdit se lit « aucun appel » — la fiche le dit sans distinguer', async () => {
    for (const status of [400, 403, 404]) {
      const { deps } = gatewayReplying({ status, body: { success: false, error: 'CALL_NOT_FOUND' } });
      expect(await loadCallSession(deps, 'x')).toEqual({ ok: true, data: null });
    }
  });
});

describe('l’appel en cours d’UNE conversation — `GET /conversations/:id/active-call`', () => {
  test('rend l’identifiant d’un appel vivant, `null` sinon', async () => {
    const live = gatewayReplying({ status: 200, body: { success: true, data: wireSession() } });
    expect(await loadConversationActiveCallId(live.deps, 'c 1')).toEqual({ ok: true, data: '64f0c0ffee00000000000a01' });
    expect(live.paths).toEqual(['/api/v1/conversations/c%201/active-call']);
    const none = gatewayReplying({ status: 200, body: { success: true, data: null } });
    expect(await loadConversationActiveCallId(none.deps, 'c')).toEqual({ ok: true, data: null });
    const ended = gatewayReplying({ status: 200, body: { success: true, data: wireSession({ status: 'ended' }) } });
    expect(await loadConversationActiveCallId(ended.deps, 'c')).toEqual({ ok: true, data: null });
  });
});
