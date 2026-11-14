import type { SocketUser } from './utils/socket-helpers.js';

/**
 * #16726 — la joignabilité est une propriété de la SOCKET, et `connectedUsers`
 * est une carte par UTILISATEUR.
 *
 * Les deux marqueurs (`unreachableConversations`, `allConversationRoomsUnreachable`)
 * naissent d'un fait de SOCKET : « CETTE socket n'a pas pu rejoindre CETTE
 * room ». Ils étaient écrits dans une entrée par COMPTE, et une entrée par
 * compte n'a qu'un exemplaire de chaque champ. D'où deux pertes, de sens
 * opposé et de coût très inégal :
 *
 * - **le dernier arrivé ÉCRASE.** Un second appareil sain remplaçait l'entrée
 *   d'un appareil malade — juste tant que les deux vivent (le compte EST
 *   joignable par la room), faux dès que le sain part ;
 * - **le survivant HÉRITE.** `handleDisconnection` recopiait l'entrée en ne
 *   changeant que `socketId` : l'appareil malade qui reste héritait d'une
 *   entrée SANS marqueur. Il est alors absent de la room ET tenu pour
 *   joignable — la file hors ligne le saute, aucune diffusion ne l'atteint,
 *   et rien n'est écrit, donc rien à rejouer. C'est la perte sèche.
 *
 * La réponse n'est pas de choisir un gagnant mais de RANGER le fait là où il
 * est vrai — sur la socket, dans `socket.data`, comme `SOCKET_SESSION_ID` et
 * `appForeground` — puis de DÉRIVER l'entrée du compte.
 *
 * ## La loi de combinaison
 *
 * Un compte est joignable pour une conversation dès qu'UNE de ses sockets est
 * dans la room : `io.to(ROOMS.conversation(id))` atteint le compte par elle.
 * Le marqueur du compte est donc l'**INTERSECTION** des ensembles de ses
 * sockets — jamais l'union, qui enfilerait pour un compte parfaitement
 * joignable (doublons à la remise), jamais le dernier écrit, qui perd.
 *
 * `allConversationRoomsUnreachable` est l'élément ABSORBANT de cette
 * intersection : « toutes, dont j'ignore la liste » ne retire rien à ce qu'une
 * autre socket nomme, et ne devient le verdict du compte que si TOUTES ses
 * sockets le portent.
 *
 * **Zéro socket rend un verdict VIDE**, et c'est le bon : un compte sans
 * socket n'est plus dans `connectedUsers` — la file l'enfile parce qu'il est
 * hors ligne, ce qui est la vérité.
 */
export const SOCKET_REACHABILITY = 'meeshyReachability';

export type SocketReachability = {
  readonly unreachableConversations?: ReadonlySet<string>;
  readonly allConversationRoomsUnreachable?: boolean;
};

export type ReachabilityCarrier = {
  readonly id: string;
  data?: unknown;
};

export function readSocketReachability(socket: ReachabilityCarrier | undefined): SocketReachability | undefined {
  const bag = socket?.data as Record<string, unknown> | undefined;
  const stored = bag?.[SOCKET_REACHABILITY];
  return stored === undefined ? undefined : (stored as SocketReachability);
}

export function recordSocketReachability(socket: ReachabilityCarrier, reachability: SocketReachability): void {
  const bag = (socket.data ?? {}) as Record<string, unknown>;
  bag[SOCKET_REACHABILITY] = reachability;
  socket.data = bag;
}

/** La room de cette conversation a été rejointe par CETTE socket. */
export function noteConversationReachable(socket: ReachabilityCarrier, conversationId: string): void {
  const current = readSocketReachability(socket);
  if (!current?.unreachableConversations?.has(conversationId)) return;
  const next = new Set(current.unreachableConversations);
  next.delete(conversationId);
  recordSocketReachability(socket, {
    ...current,
    unreachableConversations: next.size > 0 ? next : undefined,
  });
}

/** La room de cette conversation reste injoignable pour CETTE socket, réessais épuisés. */
export function noteConversationUnreachable(socket: ReachabilityCarrier, conversationId: string): void {
  const current = readSocketReachability(socket);
  const next = new Set(current?.unreachableConversations ?? []);
  next.add(conversationId);
  recordSocketReachability(socket, { ...current, unreachableConversations: next });
}

type Reach = ReadonlySet<string> | 'all';

const reachOf = (r: SocketReachability | undefined): Reach =>
  r?.allConversationRoomsUnreachable === true ? 'all' : (r?.unreachableConversations ?? new Set<string>());

const intersect = (left: Reach, right: Reach): Reach => {
  if (left === 'all') return right;
  if (right === 'all') return left;
  return new Set([...left].filter(id => right.has(id)));
};

/**
 * Le verdict du COMPTE, dérivé de ses sockets vivantes. Rend les champs à
 * poser sur l'entrée `connectedUsers` — `undefined` pour chacun veut dire
 * « joignable », et c'est ce qui EFFACE un marqueur hérité.
 */
export function combineSocketReachability(
  sockets: Iterable<ReachabilityCarrier | undefined>,
): Pick<SocketUser, 'unreachableConversations' | 'allConversationRoomsUnreachable'> {
  let accumulated: Reach | undefined;
  for (const socket of sockets) {
    const reach = reachOf(readSocketReachability(socket));
    if (reach !== 'all' && reach.size === 0) return {};
    accumulated = accumulated === undefined ? reach : intersect(accumulated, reach);
    if (accumulated !== 'all' && accumulated.size === 0) return {};
  }
  if (accumulated === undefined) return {};
  if (accumulated === 'all') return { allConversationRoomsUnreachable: true };
  return { unreachableConversations: accumulated };
}

/**
 * Pose le verdict combiné sur l'entrée du compte, en EFFAÇANT ce qu'il ne
 * porte plus. Rendre une entrée neuve plutôt que muter : `connectedUsers` est
 * lue par la file hors ligne pendant le même tour de boucle.
 */
export function withCombinedReachability(
  entry: SocketUser,
  sockets: Iterable<ReachabilityCarrier | undefined>,
): SocketUser {
  const { unreachableConversations, allConversationRoomsUnreachable } = combineSocketReachability(sockets);
  return { ...entry, unreachableConversations, allConversationRoomsUnreachable };
}

export type NamespaceCarrier = ReachabilityCarrier & {
  readonly nsp?: { readonly sockets?: { get(id: string): ReachabilityCarrier | undefined } };
};

/**
 * Les sockets VIVANTES de ce compte sur CE nœud, lues dans le namespace local.
 *
 * Rend `undefined` quand le namespace n'est pas lisible — « je ne sais pas »,
 * jamais `[]`, qui AFFIRMERAIT « aucune socket » et effacerait des marqueurs
 * sur la foi d'une ignorance. C'est la distinction que le cycle 116 a payée
 * sur la file hors ligne (`params.participants ?? requête` : `[]` n'est pas
 * nullish, donc l'unité partagée recevait l'affirmation « aucun participant »).
 *
 * L'appelant garde alors l'entrée telle qu'elle est — le comportement d'avant
 * ce lot, qui n'efface rien.
 */
export function liveSocketsOf(
  socket: NamespaceCarrier,
  ids: Iterable<string> | undefined,
): ReachabilityCarrier[] | undefined {
  const registry = socket.nsp?.sockets;
  if (!registry || typeof registry.get !== 'function') return undefined;
  const live: ReachabilityCarrier[] = [];
  for (const id of ids ?? []) {
    const found = id === socket.id ? socket : registry.get(id);
    if (found) live.push(found);
  }
  return live;
}
