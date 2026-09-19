import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { BLOCKED_USERS_QUERY_KEY, blockUser, unblockUser, type BlockedData } from './blocks';
import { PUBLIC_PROFILE_QUERY_PREFIX, type PublicProfileView, type ServedRelation } from './public-profile';
import {
  friendRequestsQueryKey,
  respondToFriendRequest,
  sendFriendRequest,
  FRIENDS_QUERY_PREFIX,
  type FriendRequestAction,
  type FriendRequestBucket,
  type FriendRequestRecord,
  type FriendRequestsData,
  type FriendRequestsDeps,
  type PersonSummary,
} from './friend-requests';

/**
 * **LES GESTES D'AMITIÉ, OPTIMISTES ET IDEMPOTENTS** (#6363) — CLAUDE.md §
 * Optimistic Updates : instantané → application locale → réseau → retour
 * arrière sur échec. Miroir `RequestsViewModel.accept/reject/cancel`,
 * `ConnectionActionView.sendRequest` et `BlockedViewModel.unblock`.
 *
 * **Le même cache que la pastille.** Accepter ou refuser RETIRE la ligne du
 * panier des reçues, que la pastille du barreau « Découvrir » et le compte du
 * profil lisent : ils baissent au tap, pas au retour de la passerelle.
 *
 * **Idempotents : un double tap = UNE requête.** Tant qu'un geste est en vol
 * pour une demande (ou une personne), un second appel rend la MÊME promesse au
 * lieu d'en émettre une autre — le second clic d'un double clic arrive avant
 * que la ligne ne quitte l'écran, et « refuser » deux fois aurait rendu 404 au
 * second, donc un retour arrière d'une ligne déjà partie.
 *
 * **Hors ligne, rien ne part** : le web n'a pas de file d'écriture (#6325),
 * et un geste appliqué localement qui ne partira jamais serait un contrôle qui
 * ment. L'écran le dit ; iOS, lui, met le geste en file.
 *
 * Le retour arrière restaure l'INSTANTANÉ puis revalide la famille : un
 * événement arrivé entre le geste et l'échec est rattrapé par la relecture.
 */

export type FriendActionDeps = FriendRequestsDeps & {
  readonly queryClient: QueryClient;
  readonly isOnline: () => boolean;
  readonly viewerId: () => string | null;
};

export type FriendActionOutcome = 'done' | 'offline' | 'failed';

const inFlight = new Map<string, Promise<FriendActionOutcome>>();

function once(key: string, run: () => Promise<FriendActionOutcome>): Promise<FriendActionOutcome> {
  const pending = inFlight.get(key);
  if (pending !== undefined) return pending;
  const started = run().finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

type Snapshot = readonly (readonly [QueryKey, unknown])[];

/**
 * **TOUTE ENTRÉE DE PROFIL QUI PORTE CET IDENTIFIANT** (#7083) — la fiche
 * `/u/:handle` est mise en cache par HANDLE (`publicProfileQueryKey`), et une
 * même personne y entre sous plusieurs clés : son pseudo depuis une mention,
 * son identifiant depuis une notification. Patcher la seule clé visitée
 * laisserait la jumelle afficher l'état d'AVANT le geste dès la navigation
 * suivante — l'exact défaut que ce lot évite ailleurs en gardant UNE source.
 *
 * Le PRÉFIXE est importé de `public-profile.ts`, jamais recopié : une chaîne
 * écrite deux fois diverge au premier renommage, et rien ne rougirait.
 */
const profileKeysFor = (queryClient: QueryClient, userId: string): readonly QueryKey[] =>
  queryClient
    .getQueriesData<PublicProfileView>({ queryKey: PUBLIC_PROFILE_QUERY_PREFIX })
    .filter(([, data]) => data?.profile.id === userId)
    .map(([key]) => key);

const patchProfileRelations = (queryClient: QueryClient, userId: string, relation: ServedRelation): void => {
  profileKeysFor(queryClient, userId).forEach((key) => {
    queryClient.setQueryData<PublicProfileView>(key, (view) => (view === undefined ? view : { ...view, relation }));
  });
};

const snapshotOf = (queryClient: QueryClient, keys: readonly QueryKey[]): Snapshot =>
  keys.map((key) => [key, queryClient.getQueryData(key)] as const);

/** L'instantané d'un geste RELATIONNEL : ses paniers ET chaque fiche de la
 * personne touchée — sans quoi `restore` défairait la moitié du geste. */
const relationalSnapshot = (queryClient: QueryClient, userId: string, buckets: readonly QueryKey[]): Snapshot =>
  snapshotOf(queryClient, [...buckets, ...profileKeysFor(queryClient, userId)]);

/**
 * **RENDRE UNE ENTRÉE À SON NÉANT DEMANDE `removeQueries`, PAS `setQueryData`**
 * (revue #7083) — `setQueryData(key, undefined)` N'EFFACE RIEN : `undefined`
 * signifie « ne pas mettre à jour ». Un geste qui AMORCE un panier jamais lu
 * (`withRequestFirst`, `withBlockedFirst`) laissait donc son amorce derrière
 * lui quand la passerelle refusait — une liste d'UNE ligne, fabriquée par un
 * geste qui a échoué, et présentée comme la liste entière. L'invalidation qui
 * suit la rattrapait seulement si un observateur était monté.
 */
const restore = (queryClient: QueryClient, snapshot: Snapshot): void => {
  snapshot.forEach(([key, data]) => {
    if (data === undefined) queryClient.removeQueries({ queryKey: key, exact: true });
    else queryClient.setQueryData(key, data);
  });
  void queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_PREFIX });
};

const withoutRequest = (data: FriendRequestsData | undefined, id: string): FriendRequestsData | undefined =>
  data === undefined ? data : { ...data, pages: data.pages.map((page) => ({ ...page, requests: page.requests.filter((row) => row.id !== id) })) };

const withRequestFirst = (data: FriendRequestsData | undefined, request: FriendRequestRecord, replacing: string): FriendRequestsData => {
  const seed: FriendRequestsData = { pages: [{ requests: [], nextCursor: null }], pageParams: [null] };
  const base = data ?? seed;
  return {
    ...base,
    pages: base.pages.map((page, index) => {
      const kept = page.requests.filter((row) => row.id !== replacing && row.id !== request.id);
      return index === 0 ? { ...page, requests: [request, ...kept] } : { ...page, requests: kept };
    }),
  };
};

const update = (queryClient: QueryClient, bucket: FriendRequestBucket, next: (data: FriendRequestsData | undefined) => FriendRequestsData | undefined) =>
  queryClient.setQueryData<FriendRequestsData>(friendRequestsQueryKey(bucket), next);

const OPTIMISTIC_PREFIX = 'optimiste:';

const isProvisional = (request: FriendRequestRecord): boolean => request.id.startsWith(OPTIMISTIC_PREFIX);

/**
 * **UNE DEMANDE PROVISOIRE NE S'ANNULE PAS PAR SON IDENTIFIANT** (#6418) — il
 * est fabriqué ici (`optimiste:<userId>`), la passerelle ne le connaît pas. On
 * attend l'enregistrement en vol, puis on annule la VRAIE demande. Si l'envoi a
 * échoué, elle n'existe pas : il n'y a rien à annuler. Une ligne provisoire
 * sans envoi en vol (un cache restauré au milieu d'un envoi) ne part pas : la
 * famille se relit, et la vérité de la passerelle la remplace.
 */
async function respondOnceRecorded(params: {
  readonly request: FriendRequestRecord;
  readonly action: FriendRequestAction;
  readonly deps: FriendActionDeps;
}): Promise<FriendActionOutcome> {
  const { request, deps } = params;
  const sending = inFlight.get(`send:${request.receiverId}`);
  if (sending === undefined) {
    void deps.queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_PREFIX });
    return 'failed';
  }
  if ((await sending) !== 'done') return 'done';
  const recorded = deps.queryClient
    .getQueryData<FriendRequestsData>(friendRequestsQueryKey('sent'))
    ?.pages.flatMap((page) => page.requests)
    .find((row) => row.receiverId === request.receiverId && !isProvisional(row));
  return recorded === undefined ? 'done' : performRespondToRequest({ ...params, request: recorded });
}

export function performRespondToRequest({
  request,
  action,
  deps,
}: {
  readonly request: FriendRequestRecord;
  readonly action: FriendRequestAction;
  readonly deps: FriendActionDeps;
}): Promise<FriendActionOutcome> {
  if (isProvisional(request)) return respondOnceRecorded({ request, action, deps });
  return once(`request:${request.id}`, async () => {
    if (!deps.isOnline()) return 'offline';
    const from: FriendRequestBucket = action === 'cancel' ? 'sent' : 'received';
    /* L'AUTRE partie : l'expéditeur d'une reçue, le destinataire d'une envoyée
       — la personne dont la FICHE porte cette relation. */
    const otherId = action === 'cancel' ? request.receiverId : request.senderId;
    const snapshot = relationalSnapshot(deps.queryClient, otherId, [friendRequestsQueryKey(from), friendRequestsQueryKey('accepted')]);
    update(deps.queryClient, from, (data) => withoutRequest(data, request.id));
    patchProfileRelations(deps.queryClient, otherId, action === 'accept' ? 'friend' : 'none');
    if (action === 'accept') {
      update(deps.queryClient, 'accepted', (data) => withRequestFirst(data, { ...request, status: 'accepted' }, request.id));
    }

    const result = await respondToFriendRequest(deps, request.id, action);
    if (!result.ok) {
      restore(deps.queryClient, snapshot);
      return 'failed';
    }
    if (action === 'accept' && result.data !== null) {
      update(deps.queryClient, 'accepted', (data) => withRequestFirst(data, result.data ?? request, request.id));
    }
    return 'done';
  });
}

const optimisticRequestId = (userId: string): string => `optimiste:${userId}`;

export function performSendRequest({ person, deps }: { readonly person: PersonSummary; readonly deps: FriendActionDeps }): Promise<FriendActionOutcome> {
  return once(`send:${person.id}`, async () => {
    if (!deps.isOnline()) return 'offline';
    const snapshot = relationalSnapshot(deps.queryClient, person.id, [friendRequestsQueryKey('sent')]);
    patchProfileRelations(deps.queryClient, person.id, 'pending_sent');
    const placeholderId = optimisticRequestId(person.id);
    const placeholder: FriendRequestRecord = {
      id: placeholderId,
      senderId: deps.viewerId() ?? '',
      receiverId: person.id,
      status: 'pending',
      message: null,
      createdAt: new Date().toISOString(),
      sender: null,
      receiver: person,
    };
    update(deps.queryClient, 'sent', (data) => withRequestFirst(data, placeholder, placeholderId));

    const result = await sendFriendRequest(deps, person.id);
    if (!result.ok) {
      restore(deps.queryClient, snapshot);
      return 'failed';
    }
    update(deps.queryClient, 'sent', (data) => withRequestFirst(data, { ...result.data, receiver: result.data.receiver ?? person }, placeholderId));
    return 'done';
  });
}

const withoutBlocked = (data: BlockedData | undefined, userId: string): BlockedData | undefined =>
  data === undefined ? data : { ...data, pages: data.pages.map((page) => ({ ...page, users: page.users.filter((row) => row.id !== userId) })) };

/**
 * **UN PANIER JAMAIS LU S'AMORCE, il ne s'ignore pas** (revue #7083) — la
 * JUMELLE `withRequestFirst` amorce déjà le sien (`seed`, ci-dessus), et c'est
 * l'asymétrie entre les deux qui faisait le défaut : `if (data === undefined)
 * return data` rendait `undefined` à `setQueryData`, qui n'écrit alors RIEN.
 * Le geste partait sur le réseau et l'écran ne bougeait pas — « Bloquer »
 * devenait un contrôle sans effet visible (loi 4) exactement quand le panier
 * n'était pas encore lu ou que sa lecture avait échoué. Les témoins d'alors
 * SEMAIENT tous le cache avant le geste : aucun ne pouvait le voir.
 *
 * Ce que l'amorce affirme est BORNÉ et vrai : la personne est bloquée. La
 * revalidation de la famille remplace la page par la liste entière, et un
 * refus restaure l'instantané — c'est-à-dire `undefined`.
 */
const withBlockedFirst = (data: BlockedData | undefined, person: PersonSummary): BlockedData => {
  const seed: BlockedData = { pages: [{ users: [], nextCursor: null }], pageParams: [null] };
  const base = data ?? seed;
  return {
    ...base,
    pages: base.pages.map((page, index) => {
      const kept = page.users.filter((row) => row.id !== person.id);
      return index === 0 ? { ...page, users: [person, ...kept] } : { ...page, users: kept };
    }),
  };
};

/**
 * **BLOQUER** (#7083) — la JUMELLE de `performUnblock`, au même `once` et au
 * même instantané.
 *
 * **Le blocage s'écrit dans le PANIER DES BLOQUÉS, pas dans la relation du
 * fil.** `relationAvec` (`routes/directory/person.ts:72-93`) n'a pas de valeur
 * `blocked` : bloquer quelqu'un n'efface pas la ligne d'amitié, et le serveur
 * continue de servir `friend` ou `none`. Écrire `'blocked'` dans `relation`
 * inventerait une sixième valeur de fil que la revalidation suivante
 * effacerait — un geste qui « marche » puis se défait tout seul. Le panier,
 * lui, est la source que « Découvrir » lit déjà : UNE source, et les deux
 * surfaces bougent ensemble.
 */
export function performBlock({ person, deps }: { readonly person: PersonSummary; readonly deps: FriendActionDeps }): Promise<FriendActionOutcome> {
  return once(`block:${person.id}`, async () => {
    if (!deps.isOnline()) return 'offline';
    const snapshot = snapshotOf(deps.queryClient, [BLOCKED_USERS_QUERY_KEY]);
    deps.queryClient.setQueryData<BlockedData>(BLOCKED_USERS_QUERY_KEY, (data) => withBlockedFirst(data, person));

    const result = await blockUser(deps, person.id);
    if (!result.ok) {
      restore(deps.queryClient, snapshot);
      return 'failed';
    }
    return 'done';
  });
}

export function performUnblock({ person, deps }: { readonly person: PersonSummary; readonly deps: FriendActionDeps }): Promise<FriendActionOutcome> {
  return once(`unblock:${person.id}`, async () => {
    if (!deps.isOnline()) return 'offline';
    const snapshot = snapshotOf(deps.queryClient, [BLOCKED_USERS_QUERY_KEY]);
    deps.queryClient.setQueryData<BlockedData>(BLOCKED_USERS_QUERY_KEY, (data) => withoutBlocked(data, person.id));

    const result = await unblockUser(deps, person.id);
    if (!result.ok) {
      restore(deps.queryClient, snapshot);
      return 'failed';
    }
    return 'done';
  });
}
