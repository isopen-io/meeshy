import type { FriendRequestBucket, FriendRequestRecord, PersonSummary } from '@/lib/api/friend-requests';

/**
 * **LES RÈGLES PURES DE LA DÉCOUVERTE** (#6363) — miroir de
 * `PeopleDiscoveryView` (les trois onglets), de `RequestsTab` (le filtre
 * Reçues / Envoyées) et d'`UserRelationshipResolver` (ce qu'une personne est
 * pour le lecteur), sans DOM ni requête.
 */

export const DISCOVER_TABS = ['discover', 'requests', 'blocked'] as const;
export type DiscoverTab = (typeof DISCOVER_TABS)[number];
export const DISCOVER_TAB_PARAM = 'onglet';

/** iOS ouvre `PeopleDiscoveryView(initialTab: .discover)` : l'onglet absent ou inconnu est « Découvrir ». */
export function discoverTabFromSearch(raw: string | null): DiscoverTab {
  return DISCOVER_TABS.find((tab) => tab === raw) ?? 'discover';
}

export const REQUEST_FILTERS = ['received', 'sent'] as const;
export type RequestFilter = (typeof REQUEST_FILTERS)[number];
export const REQUEST_FILTER_PARAM = 'demandes';

export function requestFilterFromSearch(raw: string | null): RequestFilter {
  return REQUEST_FILTERS.find((filter) => filter === raw) ?? 'received';
}

export type Relationship =
  | { readonly kind: 'self' }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'friend' }
  | { readonly kind: 'pendingSent'; readonly request: FriendRequestRecord }
  | { readonly kind: 'pendingReceived'; readonly request: FriendRequestRecord }
  | { readonly kind: 'none' };

export type RelationshipIndex = {
  readonly viewerId: string | null;
  readonly blocked: ReadonlySet<string>;
  readonly friends: ReadonlySet<string>;
  readonly sent: ReadonlyMap<string, FriendRequestRecord>;
  readonly received: ReadonlyMap<string, FriendRequestRecord>;
};

/**
 * L'INDEX se bâtit depuis les MÊMES paniers que l'onglet « Demandes » et la
 * pastille : une personne passe « En attente » dans la recherche à l'instant où
 * la demande entre dans le panier des envoyées, et redevient « Ajouter » à
 * l'instant où elle en sort. Deux sources, et un geste aurait pu dire deux
 * états sur le même écran.
 */
export function relationshipIndexOf(params: {
  readonly viewerId: string | null;
  readonly received: readonly FriendRequestRecord[];
  readonly sent: readonly FriendRequestRecord[];
  readonly accepted: readonly FriendRequestRecord[];
  readonly blocked: readonly PersonSummary[];
}): RelationshipIndex {
  const { viewerId } = params;
  const otherParties = params.accepted.flatMap((request) => [request.senderId, request.receiverId].filter((id) => id !== viewerId));
  return {
    viewerId,
    blocked: new Set(params.blocked.map((person) => person.id)),
    friends: new Set(otherParties),
    sent: new Map(params.sent.map((request) => [request.receiverId, request])),
    received: new Map(params.received.map((request) => [request.senderId, request])),
  };
}

/** L'ordre d'`UserRelationshipResolver.resolve` puis de `FriendshipCache.status` : soi, bloqué, contact, envoyée, reçue. */
export function relationshipOf(index: RelationshipIndex, userId: string): Relationship {
  if (userId === index.viewerId) return { kind: 'self' };
  if (index.blocked.has(userId)) return { kind: 'blocked' };
  if (index.friends.has(userId)) return { kind: 'friend' };
  const sent = index.sent.get(userId);
  if (sent !== undefined) return { kind: 'pendingSent', request: sent };
  const received = index.received.get(userId);
  if (received !== undefined) return { kind: 'pendingReceived', request: received };
  return { kind: 'none' };
}

/** La personne qu'une ligne de demande MONTRE : l'expéditeur d'une reçue, le destinataire d'une envoyée. */
export function requestPartyOf(request: FriendRequestRecord, bucket: FriendRequestBucket): PersonSummary | null {
  return bucket === 'sent' ? request.receiver : request.sender;
}

/** `sender?.name ?? "Inconnu"` d'iOS : nom affiché, sinon identifiant, sinon le repli fourni par l'appelant. */
export function personNameOf(person: PersonSummary | null, unknown: string): string {
  return person?.displayName ?? (person === null || person.username === '' ? unknown : person.username);
}
