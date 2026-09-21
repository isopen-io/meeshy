import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { BLOCKED_USERS_QUERY_KEY, type BlockedData } from './blocks';
import { performBlock, performRespondToRequest, performSendRequest, performUnblock, type FriendActionDeps } from './friend-actions';
import { friendRequestsQueryKey, pendingRequestsOf, type FriendRequestRecord, type FriendRequestsData, type PersonSummary } from './friend-requests';
import { createHttpTransport } from './http';
import { publicProfileQueryKey, type PublicProfileView, type ServedRelation } from './public-profile';
import { performEmailInvitation } from './invitations';

/**
 * LES GESTES D'AMITIÉ (#6363) — optimistes, avec retour arrière, idempotents.
 * Le transport est RÉEL, nourri d'un `fetch` bouchonné qu'on peut RETENIR : on
 * lit le cache PENDANT que la requête est en vol, là où un geste qui attendrait
 * la passerelle ne montrerait encore rien.
 */

const ada: PersonSummary = { id: 'u-ada', username: 'ada', displayName: 'Ada Lovelace', avatar: null };
const grace: PersonSummary = { id: 'u-grace', username: 'grace', displayName: 'Grace Hopper', avatar: null };
const viewer: PersonSummary = { id: 'u-me', username: 'moi', displayName: 'Moi', avatar: null };

const request = (id: string, other: PersonSummary, incoming = true): FriendRequestRecord => ({
  id,
  senderId: incoming ? other.id : viewer.id,
  receiverId: incoming ? viewer.id : other.id,
  status: 'pending',
  message: null,
  createdAt: '2026-09-13T09:00:00.000Z',
  sender: incoming ? other : viewer,
  receiver: incoming ? viewer : other,
});

const pages = (...requests: FriendRequestRecord[]): FriendRequestsData => ({ pages: [{ requests, nextCursor: null }], pageParams: [null] });

type Reply = { readonly status: number; readonly body: unknown };

const harness = (reply: Reply, options: { readonly online?: boolean } = {}) => {
  const calls: { readonly method: string; readonly url: string }[] = [];
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ method: init?.method ?? 'GET', url: String(input) });
    await held;
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const deps: FriendActionDeps = {
    source: 'gateway',
    transport: createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 }),
    queryClient,
    isOnline: () => options.online ?? true,
    viewerId: () => viewer.id,
  };
  const ids = (bucket: 'received' | 'sent' | 'accepted') =>
    queryClient.getQueryData<FriendRequestsData>(friendRequestsQueryKey(bucket))?.pages.flatMap((p) => p.requests.map((r) => r.id)) ?? null;
  return { calls, deps, queryClient, ids, release: () => release() };
};

const ok = (data: unknown): Reply => ({ status: 200, body: { success: true, data } });
const refused: Reply = { status: 500, body: { success: false, error: 'panne' } };

describe('accepter ou refuser une demande reçue', () => {
  test('la ligne quitte « Reçues » et le compte baisse AU GESTE, avant la réponse ; accepter en fait un contact', async () => {
    const h = harness(ok({ ...request('f-ada', ada), status: 'accepted' }));
    h.queryClient.setQueryData(friendRequestsQueryKey('received'), pages(request('f-ada', ada), request('f-grace', grace)));
    h.queryClient.setQueryData(friendRequestsQueryKey('accepted'), pages());

    const outcome = performRespondToRequest({ request: request('f-ada', ada), action: 'accept', deps: h.deps });
    expect(h.ids('received')).toEqual(['f-grace']);
    expect(pendingRequestsOf(h.queryClient.getQueryData(friendRequestsQueryKey('received')))).toEqual({ count: 1, more: false });
    expect(h.ids('accepted')).toEqual(['f-ada']);

    h.release();
    expect(await outcome).toBe('done');
    expect(h.calls).toEqual([{ method: 'PATCH', url: 'https://gate.test/api/v1/directory/friend-requests/f-ada' }]);
  });

  test('un refus de la passerelle REND la ligne et le compte, et le contact disparaît', async () => {
    const h = harness(refused);
    h.queryClient.setQueryData(friendRequestsQueryKey('received'), pages(request('f-ada', ada), request('f-grace', grace)));
    h.queryClient.setQueryData(friendRequestsQueryKey('accepted'), pages());

    const outcome = performRespondToRequest({ request: request('f-ada', ada), action: 'accept', deps: h.deps });
    h.release();
    expect(await outcome).toBe('failed');
    expect(h.ids('received')).toEqual(['f-ada', 'f-grace']);
    expect(h.ids('accepted')).toEqual([]);
  });

  test('DOUBLE TAP : deux gestes sur la même demande ne partent qu’UNE fois et rendent la même issue', async () => {
    const h = harness(ok(null));
    h.queryClient.setQueryData(friendRequestsQueryKey('received'), pages(request('f-ada', ada)));

    const first = performRespondToRequest({ request: request('f-ada', ada), action: 'reject', deps: h.deps });
    const second = performRespondToRequest({ request: request('f-ada', ada), action: 'reject', deps: h.deps });
    h.release();
    expect(await Promise.all([first, second])).toEqual(['done', 'done']);
    expect(h.calls).toHaveLength(1);
  });

  test('hors ligne, rien ne part et rien ne bouge : le geste le dit', async () => {
    const h = harness(ok(null), { online: false });
    h.queryClient.setQueryData(friendRequestsQueryKey('received'), pages(request('f-ada', ada)));
    expect(await performRespondToRequest({ request: request('f-ada', ada), action: 'reject', deps: h.deps })).toBe('offline');
    expect(h.ids('received')).toEqual(['f-ada']);
    expect(h.calls).toHaveLength(0);
  });
});

describe('annuler une demande envoyée', () => {
  test('la ligne quitte « Envoyées » au geste, et revient si la passerelle refuse', async () => {
    const h = harness(refused);
    h.queryClient.setQueryData(friendRequestsQueryKey('sent'), pages(request('f-grace', grace, false)));
    const outcome = performRespondToRequest({ request: request('f-grace', grace, false), action: 'cancel', deps: h.deps });
    expect(h.ids('sent')).toEqual([]);
    h.release();
    expect(await outcome).toBe('failed');
    expect(h.ids('sent')).toEqual(['f-grace']);
  });
});

describe('envoyer une demande', () => {
  test('la personne entre « En attente » au geste ; la réponse remplace la ligne provisoire par la vraie', async () => {
    const h = harness({ status: 201, body: { success: true, data: { ...request('f-real', grace, false), receiver: undefined } } });
    h.queryClient.setQueryData(friendRequestsQueryKey('sent'), pages(request('f-old', ada, false)));
    const outcome = performSendRequest({ person: grace, deps: h.deps });
    expect(h.ids('sent')).toEqual(['optimiste:u-grace', 'f-old']);
    h.release();
    expect(await outcome).toBe('done');
    expect(h.ids('sent')).toEqual(['f-real', 'f-old']);
    const sent = h.queryClient.getQueryData<FriendRequestsData>(friendRequestsQueryKey('sent'));
    expect(sent?.pages[0]?.requests[0]?.receiver).toEqual(grace);
  });

  test('un refus retire la ligne provisoire ; un double tap n’émet qu’une requête', async () => {
    const h = harness({ status: 409, body: { success: false, error: 'déjà' } });
    h.queryClient.setQueryData(friendRequestsQueryKey('sent'), pages());
    const first = performSendRequest({ person: grace, deps: h.deps });
    const second = performSendRequest({ person: grace, deps: h.deps });
    h.release();
    expect(await Promise.all([first, second])).toEqual(['failed', 'failed']);
    expect(h.calls).toHaveLength(1);
    expect(h.ids('sent')).toEqual([]);
  });
});

describe('annuler une demande encore provisoire (#6418)', () => {
  test('aucun identifiant fabriqué ne part : l’annulation attend l’enregistrement, puis annule la VRAIE demande', async () => {
    const h = harness({ status: 201, body: { success: true, data: request('f-real', grace, false) } });
    h.queryClient.setQueryData(friendRequestsQueryKey('sent'), pages());
    const sending = performSendRequest({ person: grace, deps: h.deps });
    const placeholder = h.queryClient.getQueryData<FriendRequestsData>(friendRequestsQueryKey('sent'))?.pages[0]?.requests[0];
    if (placeholder === undefined) throw new Error('la ligne provisoire devait être posée au geste');
    expect(placeholder.id).toBe('optimiste:u-grace');

    const cancelling = performRespondToRequest({ request: placeholder, action: 'cancel', deps: h.deps });
    h.release();
    expect(await sending).toBe('done');
    expect(await cancelling).toBe('done');
    expect(h.calls).toEqual([
      { method: 'POST', url: 'https://gate.test/api/v1/directory/friend-requests' },
      { method: 'PATCH', url: 'https://gate.test/api/v1/directory/friend-requests/f-real' },
    ]);
    expect(h.ids('sent')).toEqual([]);
  });
});

describe('débloquer', () => {
  test('la personne quitte la liste au geste, et y revient si la passerelle refuse', async () => {
    const h = harness(refused);
    const blocked: BlockedData = { pages: [{ users: [ada, grace], nextCursor: null }], pageParams: [null] };
    h.queryClient.setQueryData(BLOCKED_USERS_QUERY_KEY, blocked);
    const outcome = performUnblock({ person: ada, deps: h.deps });
    const during = h.queryClient.getQueryData<BlockedData>(BLOCKED_USERS_QUERY_KEY)?.pages[0]?.users.map((u) => u.id);
    expect(during).toEqual(['u-grace']);
    h.release();
    expect(await outcome).toBe('failed');
    expect(h.calls).toEqual([{ method: 'DELETE', url: 'https://gate.test/api/v1/directory/blocks/u-ada' }]);
    expect(h.queryClient.getQueryData<BlockedData>(BLOCKED_USERS_QUERY_KEY)?.pages[0]?.users.map((u) => u.id)).toEqual(['u-ada', 'u-grace']);
  });
});

describe('inviter par e-mail', () => {
  test('une adresse invalide ne part pas ; une adresse déjà inscrite se nomme ; l’envoi aboutit sinon', async () => {
    const invalid = harness(ok(null));
    invalid.release();
    expect(await performEmailInvitation({ email: 'pas-une-adresse', deps: invalid.deps })).toBe('invalid');
    expect(invalid.calls).toHaveLength(0);

    const taken = harness({ status: 409, body: { success: false, error: 'déjà sur Meeshy', code: 'USER_ALREADY_EXISTS' } });
    taken.release();
    expect(await performEmailInvitation({ email: ' ada@example.org ', deps: taken.deps })).toBe('conflict');
    expect(taken.calls).toEqual([{ method: 'POST', url: 'https://gate.test/api/v1/invitations/email' }]);

    const sent = harness({ status: 201, body: { success: true, data: { email: 'grace@example.org' } } });
    sent.release();
    expect(await performEmailInvitation({ email: 'grace@example.org', deps: sent.deps })).toBe('sent');
  });
});

/**
 * **LES GESTES ATTEIGNENT LA FICHE DE PROFIL** (#7083) — `/u/:handle` met la
 * personne en cache PAR HANDLE, et la même personne y entre sous plusieurs
 * clés : son pseudo depuis une mention, son identifiant depuis une
 * notification. Un geste qui ne patcherait que la clé visitée laisserait la
 * jumelle afficher l'état d'AVANT dès la navigation suivante.
 */

const profileView = (person: PersonSummary, relation: ServedRelation): PublicProfileView => ({
  profile: { id: person.id, username: person.username, displayName: person.displayName, avatar: null, banner: null, bio: null, createdAt: null },
  stats: null,
  relation,
  isSelf: false,
  blockedByViewer: false,
  relationRequestId: null,
});

const relationIn = (queryClient: QueryClient, handle: string): ServedRelation | undefined =>
  queryClient.getQueryData<PublicProfileView>(publicProfileQueryKey(handle))?.relation;

const blockedIn = (queryClient: QueryClient, handle: string): boolean | undefined =>
  queryClient.getQueryData<PublicProfileView>(publicProfileQueryKey(handle))?.blockedByViewer;

const requestIdIn = (queryClient: QueryClient, handle: string): string | null | undefined =>
  queryClient.getQueryData<PublicProfileView>(publicProfileQueryKey(handle))?.relationRequestId;

describe('les gestes relationnels patchent la fiche de profil, optimistes et réversibles', () => {
  test('« Ajouter » passe la fiche à « en attente » AVANT la réponse, et un refus l’y ramène', async () => {
    const h = harness(refused);
    h.queryClient.setQueryData(publicProfileQueryKey('ada'), profileView(ada, 'none'));

    const outcome = performSendRequest({ person: ada, deps: h.deps });
    expect(relationIn(h.queryClient, 'ada')).toBe('pending_sent');
    h.release();
    expect(await outcome).toBe('failed');
    expect(relationIn(h.queryClient, 'ada')).toBe('none');
  });

  test('« Accepter » fait un contact de la fiche ; un refus la ramène « en attente reçue »', async () => {
    const h = harness(refused);
    h.queryClient.setQueryData(friendRequestsQueryKey('received'), pages(request('f-ada', ada)));
    h.queryClient.setQueryData(friendRequestsQueryKey('accepted'), pages());
    h.queryClient.setQueryData(publicProfileQueryKey('ada'), profileView(ada, 'pending_received'));

    const outcome = performRespondToRequest({ request: request('f-ada', ada), action: 'accept', deps: h.deps });
    expect(relationIn(h.queryClient, 'ada')).toBe('friend');
    expect(h.ids('received')).toEqual([]);
    h.release();
    expect(await outcome).toBe('failed');
    expect(relationIn(h.queryClient, 'ada')).toBe('pending_received');
    expect(h.ids('received')).toEqual(['f-ada']);
  });

  test('« Annuler » vise le DESTINATAIRE d’une envoyée, pas son expéditeur', async () => {
    const h = harness(refused);
    h.queryClient.setQueryData(friendRequestsQueryKey('sent'), pages(request('f-grace', grace, false)));
    h.queryClient.setQueryData(friendRequestsQueryKey('accepted'), pages());
    h.queryClient.setQueryData(publicProfileQueryKey('grace'), profileView(grace, 'pending_sent'));

    const outcome = performRespondToRequest({ request: request('f-grace', grace, false), action: 'cancel', deps: h.deps });
    expect(relationIn(h.queryClient, 'grace')).toBe('none');
    h.release();
    expect(await outcome).toBe('failed');
    expect(relationIn(h.queryClient, 'grace')).toBe('pending_sent');
  });

  test('TOUTE entrée qui porte l’identifiant bouge, et TOUTE entrée revient', async () => {
    const h = harness(refused);
    /* La même personne, deux clés : le pseudo et l'identifiant. */
    h.queryClient.setQueryData(publicProfileQueryKey('ada'), profileView(ada, 'none'));
    h.queryClient.setQueryData(publicProfileQueryKey('u-ada'), profileView(ada, 'none'));
    /* Et une autre personne, qui ne doit PAS bouger. */
    h.queryClient.setQueryData(publicProfileQueryKey('grace'), profileView(grace, 'none'));

    const outcome = performSendRequest({ person: ada, deps: h.deps });
    expect([relationIn(h.queryClient, 'ada'), relationIn(h.queryClient, 'u-ada'), relationIn(h.queryClient, 'grace')]).toEqual([
      'pending_sent',
      'pending_sent',
      'none',
    ]);
    h.release();
    expect(await outcome).toBe('failed');
    expect([relationIn(h.queryClient, 'ada'), relationIn(h.queryClient, 'u-ada'), relationIn(h.queryClient, 'grace')]).toEqual([
      'none',
      'none',
      'none',
    ]);
  });

  test('hors ligne, rien ne part et la fiche ne bouge pas', async () => {
    const h = harness(ok(null), { online: false });
    h.queryClient.setQueryData(publicProfileQueryKey('ada'), profileView(ada, 'none'));
    h.release();
    expect(await performSendRequest({ person: ada, deps: h.deps })).toBe('offline');
    expect(h.calls).toHaveLength(0);
    expect(relationIn(h.queryClient, 'ada')).toBe('none');
  });
});

describe('bloquer', () => {
  test('la personne entre dans le panier AU GESTE ; un refus l’en retire', async () => {
    const h = harness(refused);
    h.queryClient.setQueryData<BlockedData>(BLOCKED_USERS_QUERY_KEY, { pages: [{ users: [grace], nextCursor: null }], pageParams: [null] });

    const outcome = performBlock({ person: ada, deps: h.deps });
    expect(h.queryClient.getQueryData<BlockedData>(BLOCKED_USERS_QUERY_KEY)?.pages[0]?.users.map((u) => u.id)).toEqual(['u-ada', 'u-grace']);
    h.release();
    expect(await outcome).toBe('failed');
    expect(h.calls).toEqual([{ method: 'PUT', url: 'https://gate.test/api/v1/directory/blocks/u-ada' }]);
    expect(h.queryClient.getQueryData<BlockedData>(BLOCKED_USERS_QUERY_KEY)?.pages[0]?.users.map((u) => u.id)).toEqual(['u-grace']);
  });

  /* LE PANIER N'A JAMAIS ÉTÉ LU — et c'est le cas que les trois témoins
     voisins ne pouvaient pas voir : ils SÈMENT tous le cache avant le geste.
     Sans amorce, `setQueryData` recevait `undefined` et n'écrivait rien :
     « Bloquer » partait sur le réseau sans que l'écran bouge. */
  test('un panier JAMAIS LU s’amorce au geste, et un refus le rend à son néant', async () => {
    const h = harness(refused);
    expect(h.queryClient.getQueryData(BLOCKED_USERS_QUERY_KEY)).toBeUndefined();

    const outcome = performBlock({ person: ada, deps: h.deps });
    expect(h.queryClient.getQueryData<BlockedData>(BLOCKED_USERS_QUERY_KEY)?.pages[0]?.users.map((u) => u.id)).toEqual(['u-ada']);
    h.release();
    expect(await outcome).toBe('failed');
    expect(h.queryClient.getQueryData(BLOCKED_USERS_QUERY_KEY)).toBeUndefined();
  });

  test('un second geste PENDANT le vol ne produit PAS une seconde requête', async () => {
    const h = harness(ok(null));
    h.queryClient.setQueryData<BlockedData>(BLOCKED_USERS_QUERY_KEY, { pages: [{ users: [], nextCursor: null }], pageParams: [null] });
    const first = performBlock({ person: ada, deps: h.deps });
    const second = performBlock({ person: ada, deps: h.deps });
    h.release();
    expect(await Promise.all([first, second])).toEqual(['done', 'done']);
    expect(h.calls).toHaveLength(1);
  });

  test('hors ligne, rien ne part', async () => {
    const h = harness(ok(null), { online: false });
    h.release();
    expect(await performBlock({ person: ada, deps: h.deps })).toBe('offline');
    expect(h.calls).toHaveLength(0);
  });
});

/**
 * **BLOQUER ATTEINT LA FICHE, comme les quatre gestes relationnels** (#7125).
 *
 * La fiche `/u/:handle` DÉDUISAIT « ai-je bloqué cette personne » du panier ;
 * elle le lit maintenant sur le FIL (`blockedByViewer`, servi avec
 * `expand=relation`). Un geste qui ne patcherait que le panier laisserait donc
 * « Bloquer » SANS AUCUN EFFET sur l'écran d'où on vient de le toucher — le
 * contrôle mort que la loi 4 interdit, et le défaut exact que `withBlockedFirst`
 * a déjà corrigé une fois, un cache plus loin.
 *
 * **`relation` ne bouge PAS** : bloquer n'efface pas la ligne d'amitié, et
 * débloquer doit rendre la relation qu'on avait.
 */
describe('bloquer et débloquer atteignent la fiche de profil', () => {
  test('« Bloquer » marque TOUTE entrée au geste sans toucher la relation ; un refus la démarque', async () => {
    const h = harness(refused);
    h.queryClient.setQueryData(publicProfileQueryKey('ada'), profileView(ada, 'friend'));
    h.queryClient.setQueryData(publicProfileQueryKey('u-ada'), profileView(ada, 'friend'));
    h.queryClient.setQueryData(publicProfileQueryKey('grace'), profileView(grace, 'none'));

    const outcome = performBlock({ person: ada, deps: h.deps });
    expect([blockedIn(h.queryClient, 'ada'), blockedIn(h.queryClient, 'u-ada'), blockedIn(h.queryClient, 'grace')]).toEqual([
      true,
      true,
      false,
    ]);
    expect(relationIn(h.queryClient, 'ada')).toBe('friend');

    h.release();
    expect(await outcome).toBe('failed');
    expect([blockedIn(h.queryClient, 'ada'), blockedIn(h.queryClient, 'u-ada')]).toEqual([false, false]);
    expect(relationIn(h.queryClient, 'ada')).toBe('friend');
  });

  test('« Débloquer » démarque la fiche au geste, et un refus la remarque', async () => {
    const h = harness(refused);
    h.queryClient.setQueryData(publicProfileQueryKey('ada'), { ...profileView(ada, 'friend'), blockedByViewer: true });

    const outcome = performUnblock({ person: ada, deps: h.deps });
    expect(blockedIn(h.queryClient, 'ada')).toBe(false);
    h.release();
    expect(await outcome).toBe('failed');
    expect(blockedIn(h.queryClient, 'ada')).toBe(true);
  });
});

/**
 * **LA FICHE PORTE L'IDENTIFIANT QU'ELLE DOIT ENVOYER, GESTE COMPRIS** (#7122).
 *
 * La fiche ne lit plus de panier : son SEUL état relationnel est ce que
 * `relation` et `relationRequestId` disent. Un geste optimiste qui écrirait
 * l'un sans l'autre rendrait « Annuler » inatteignable juste après « Ajouter »
 * — le contrôle mort que la loi 4 interdit, et la forme exacte du défaut que
 * `patchProfileBlocked` a déjà fermé un cache plus loin.
 */
describe('l’identifiant de la demande suit les gestes sur la fiche (#7122)', () => {
  test('« Ajouter » pose un identifiant PROVISOIRE, puis celui de la passerelle', async () => {
    const h = harness({ status: 201, body: { success: true, data: { id: 'fr-neuve', senderId: viewer.id, receiverId: ada.id, status: 'pending', message: null, createdAt: '2026-09-21T09:00:00.000Z' } } });
    h.queryClient.setQueryData(publicProfileQueryKey('ada'), profileView(ada, 'none'));

    const outcome = performSendRequest({ person: ada, deps: h.deps });
    /* PENDANT le vol : l'identifiant provisoire, que `isProvisional` reconnaît
       — « Annuler » est offert et sait attendre l'enregistrement. */
    expect(requestIdIn(h.queryClient, 'ada')).toBe('optimiste:u-ada');
    h.release();
    expect(await outcome).toBe('done');
    expect(requestIdIn(h.queryClient, 'ada')).toBe('fr-neuve');
  });

  test('un refus d’« Ajouter » remet la fiche à son néant, identifiant compris', async () => {
    const h = harness(refused);
    h.queryClient.setQueryData(publicProfileQueryKey('ada'), profileView(ada, 'none'));

    const outcome = performSendRequest({ person: ada, deps: h.deps });
    h.release();
    expect(await outcome).toBe('failed');
    expect(relationIn(h.queryClient, 'ada')).toBe('none');
    expect(requestIdIn(h.queryClient, 'ada')).toBeNull();
  });

  test('« Accepter » retire l’identifiant : il n’y a plus rien à patcher', async () => {
    const h = harness({ status: 200, body: { success: true, data: null } });
    h.queryClient.setQueryData(friendRequestsQueryKey('received'), pages(request('f-ada', ada)));
    h.queryClient.setQueryData(friendRequestsQueryKey('accepted'), pages());
    h.queryClient.setQueryData(publicProfileQueryKey('ada'), { ...profileView(ada, 'pending_received'), relationRequestId: 'f-ada' });

    const outcome = performRespondToRequest({ request: request('f-ada', ada), action: 'accept', deps: h.deps });
    expect(relationIn(h.queryClient, 'ada')).toBe('friend');
    expect(requestIdIn(h.queryClient, 'ada')).toBeNull();
    h.release();
    expect(await outcome).toBe('done');
  });
});
