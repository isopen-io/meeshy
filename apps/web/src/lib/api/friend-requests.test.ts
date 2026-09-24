import { describe, expect, test } from 'bun:test';

import {
  decodeFriendRequest,
  loadFriendRequests,
  pendingRequestsOf,
  respondToFriendRequest,
  sendFriendRequest,
  type FriendRequestsData,
  type FriendRequestRecord,
} from './friend-requests';
import { createHttpTransport } from './http';

/**
 * LE PORT DES DEMANDES D'AMITIÉ (#6363, #6321) — `GET/POST/PATCH
 * /api/v1/directory/friend-requests` (`services/gateway/src/routes/directory/
 * friend-requests.ts`). Témoins écrits contre le transport RÉEL nourri d'un
 * `fetch` bouchonné : le chemin et le corps que la passerelle reçoit, et la
 * page qu'elle rend, sont mesurés.
 */

const party = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: '64f0c0ffee0000000000a001',
  username: 'ada',
  firstName: 'Ada',
  lastName: 'Lovelace',
  displayName: 'Ada Lovelace',
  avatar: 'https://cdn.test/ada.jpg',
  isOnline: true,
  lastActiveAt: '2026-09-13T11:59:00.000Z',
  ...overrides,
});

const wireRequest = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: '64f0c0ffee0000000000f001',
  senderId: '64f0c0ffee0000000000a001',
  receiverId: '64f0c0ffee0000000000b001',
  status: 'pending',
  message: 'Bonjour !',
  createdAt: '2026-09-13T09:00:00.000Z',
  updatedAt: '2026-09-13T09:00:00.000Z',
  sender: party(),
  receiver: party({ id: '64f0c0ffee0000000000b001', username: 'grace', displayName: 'Grace Hopper', avatar: null }),
  ...overrides,
});

type RecordedCall = { readonly url: string; readonly method: string; readonly body: unknown };

const gatewayReplying = (reply: { readonly status: number; readonly body: unknown }) => {
  const calls: RecordedCall[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
  };
  const transport = createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 });
  return { calls, deps: { source: 'gateway' as const, transport } };
};

const page = (requests: readonly FriendRequestRecord[], nextCursor: string | null = null) => ({ requests, nextCursor });
const data = (...pages: ReturnType<typeof page>[]): FriendRequestsData => ({ pages, pageParams: pages.map(() => null) });

describe('une demande décodée est une PROJECTION', () => {
  test('la présence d’une partie n’entre JAMAIS dans le cache persisté, même quand la charge la porte', () => {
    const decoded = decodeFriendRequest(wireRequest());
    expect(decoded).toEqual({
      id: '64f0c0ffee0000000000f001',
      senderId: '64f0c0ffee0000000000a001',
      receiverId: '64f0c0ffee0000000000b001',
      status: 'pending',
      message: 'Bonjour !',
      createdAt: '2026-09-13T09:00:00.000Z',
      sender: { id: '64f0c0ffee0000000000a001', username: 'ada', displayName: 'Ada Lovelace', avatar: 'https://cdn.test/ada.jpg' },
      receiver: { id: '64f0c0ffee0000000000b001', username: 'grace', displayName: 'Grace Hopper', avatar: null },
    });
    expect(JSON.stringify(decoded)).not.toContain('isOnline');
    expect(JSON.stringify(decoded)).not.toContain('lastActiveAt');
  });

  test('une demande sans identifiant ou à la date illisible est écartée ; un message vide se lit « aucun »', () => {
    expect(decodeFriendRequest(wireRequest({ id: '' }))).toBeNull();
    expect(decodeFriendRequest(wireRequest({ createdAt: 'hier' }))).toBeNull();
    expect(decodeFriendRequest(wireRequest({ message: '   ' }))?.message).toBeNull();
    expect(decodeFriendRequest(wireRequest({ sender: { username: 'sans-id' } }))?.sender).toBeNull();
  });
});

describe('les trois paniers se lisent chacun à SA question', () => {
  test('reçues en attente, envoyées en attente, acceptées dans les deux sens — par pages de cent', async () => {
    const { calls, deps } = gatewayReplying({ status: 200, body: { success: true, data: [], pagination: { hasMore: false } } });
    await loadFriendRequests({ ...deps, bucket: 'received', cursor: null });
    await loadFriendRequests({ ...deps, bucket: 'sent', cursor: null });
    await loadFriendRequests({ ...deps, bucket: 'accepted', cursor: 'jeton' });
    expect(calls.map((call) => call.url)).toEqual([
      'https://gate.test/api/v1/directory/friend-requests?direction=received&status=pending&limit=100',
      'https://gate.test/api/v1/directory/friend-requests?direction=sent&status=pending&limit=100',
      'https://gate.test/api/v1/directory/friend-requests?direction=any&status=accepted&limit=100&cursor=jeton',
    ]);
  });

  test('la page rend les demandes lisibles et ne suit le curseur que si la passerelle dit qu’il en reste', async () => {
    const more = gatewayReplying({
      status: 200,
      body: { success: true, data: [wireRequest(), { id: '' }], pagination: { hasMore: true, nextCursor: 'suite' } },
    });
    const result = await loadFriendRequests({ ...more.deps, bucket: 'received', cursor: null });
    expect(result.ok && result.data.requests.map((r) => r.id)).toEqual(['64f0c0ffee0000000000f001']);
    expect(result.ok && result.data.nextCursor).toBe('suite');

    const done = gatewayReplying({ status: 200, body: { success: true, data: [], pagination: { hasMore: false, nextCursor: 'périmé' } } });
    const last = await loadFriendRequests({ ...done.deps, bucket: 'received', cursor: null });
    expect(last.ok && last.data.nextCursor).toBeNull();
  });
});

describe('le compte des demandes reçues — la source de la pastille et du profil', () => {
  test('rien en cache : aucun compte ; pages chargées : leur somme, et « plus » tant qu’un curseur reste', () => {
    const request = decodeFriendRequest(wireRequest()) as FriendRequestRecord;
    expect(pendingRequestsOf(undefined)).toBeNull();
    expect(pendingRequestsOf(data(page([request, { ...request, id: 'b' }])))).toEqual({ count: 2, more: false });
    expect(pendingRequestsOf(data(page([request], 'suite')))).toEqual({ count: 1, more: true });
    expect(pendingRequestsOf(data(page([])))).toEqual({ count: 0, more: false });
  });
});

describe('les gestes partent à la route canonique', () => {
  test('accepter, refuser, annuler : UN verbe PATCH, l’action dans le corps', async () => {
    const { calls, deps } = gatewayReplying({ status: 200, body: { success: true, data: wireRequest({ status: 'accepted' }) } });
    const accepted = await respondToFriendRequest(deps, 'f 1', 'accept');
    await respondToFriendRequest(deps, 'f1', 'reject');
    await respondToFriendRequest(deps, 'f1', 'cancel');
    expect(calls.map(({ url, method, body }) => ({ url, method, body }))).toEqual([
      { url: 'https://gate.test/api/v1/directory/friend-requests/f%201', method: 'PATCH', body: { action: 'accept' } },
      { url: 'https://gate.test/api/v1/directory/friend-requests/f1', method: 'PATCH', body: { action: 'reject' } },
      { url: 'https://gate.test/api/v1/directory/friend-requests/f1', method: 'PATCH', body: { action: 'cancel' } },
    ]);
    expect(accepted.ok && accepted.data?.status).toBe('accepted');
  });

  test('envoyer : POST avec le destinataire, et la demande créée revient décodée', async () => {
    const { calls, deps } = gatewayReplying({ status: 201, body: { success: true, data: wireRequest() } });
    const sent = await sendFriendRequest(deps, '64f0c0ffee0000000000b001');
    expect(calls).toEqual([
      { url: 'https://gate.test/api/v1/directory/friend-requests', method: 'POST', body: { receiverId: '64f0c0ffee0000000000b001' } },
    ]);
    expect(sent.ok && sent.data.id).toBe('64f0c0ffee0000000000f001');
  });
});
