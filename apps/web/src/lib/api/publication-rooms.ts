/**
 * **LA SALLE D'UNE PUBLICATION** (#7395) — un module SANS aucune dépendance,
 * que les écrans importent à la place de `api/realtime.ts` (motif
 * `typing-emit.ts` : le possesseur de la connexion s'ENREGISTRE, les écrans
 * APPELLENT — importer la connexion ferait de `socket.io-client` une
 * dépendance statique de chaque route).
 *
 * POURQUOI UNE SALLE. La passerelle adresse la vie d'une publication (sa
 * traduction, ses commentaires, ses aimés) à deux audiences : les salons de
 * fil des amis de l'auteur, filtrés par la visibilité, et la salle
 * `post:<id>`, que tout lecteur AUTORISÉ rejoint par `post:join`
 * (`PostReactionHandler.handleJoinPost`, gardé par `canUserConsumePost`). Le
 * lecteur d'une publication PUBLIQUE qui n'est pas ami de son auteur n'est
 * dans aucun salon de fil : sans la salle, rien ne lui parvient.
 *
 * LA POLITIQUE, et ce qui la distingue d'iOS (`SocialSocketManager.swift`,
 * `joinedPostRooms: Set<String>`) :
 *
 * - **un COMPTEUR, pas un ensemble.** iOS tient un `Set` : quand la feuille de
 *   commentaires d'un réel se ferme, son `leavePostRoom` sort aussi le lecteur
 *   de Réels resté à l'écran (relevé #7395). Ici, deux hôtes sur la même
 *   publication (la fiche et une feuille, un double montage) tiennent UNE
 *   salle, quittée au départ du DERNIER ;
 * - **une libération est IDEMPOTENTE** : un hôte démonté deux fois ne vole pas
 *   la salle d'un autre hôte ;
 * - **le REJEU appartient à la connexion** : une coupure vide les salles du
 *   socket côté passerelle, et la reconnexion ouvre un socket NEUF. La
 *   connexion rejoue donc `join` pour chaque salle tenue à CHAQUE
 *   (ré)authentification — la première comprise, qui rattrape un écran ouvert
 *   avant que le temps réel ait fini de se charger (`main.tsx` le charge en
 *   `import()`, après la première peinture). Même geste qu'iOS au `.connect`.
 *
 * Les salles de CONVERSATION n'ont pas d'équivalent client : la passerelle
 * les rejoint elle-même à l'authentification (`AuthHandler._joinUserConversations`).
 * Celles des publications dépendent de ce que l'écran MONTRE, que seul le
 * client connaît.
 */

export type PublicationRoomTransport = {
  readonly join: (postId: string) => void;
  readonly leave: (postId: string) => void;
};

export type PublicationRoomBinding = {
  /** Rejoue `join` pour chaque salle tenue — à chaque (ré)authentification. */
  readonly rejoin: () => void;
  /** Débranche CE transport ; sans effet s'il a déjà été remplacé. */
  readonly detach: () => void;
};

let holders: ReadonlyMap<string, number> = new Map();
let transport: PublicationRoomTransport | null = null;

const withCount = (postId: string, count: number): ReadonlyMap<string, number> => {
  const next = new Map(holders);
  if (count <= 0) next.delete(postId);
  else next.set(postId, count);
  return next;
};

/**
 * Tient la salle d'une publication tant que la fonction rendue n'a pas été
 * appelée. NO-OP côté réseau tant qu'aucune connexion n'existe : la salle est
 * notée, et le rejeu de la connexion la rejoindra.
 */
export function acquirePublicationRoom(postId: string): () => void {
  const count = holders.get(postId) ?? 0;
  holders = withCount(postId, count + 1);
  if (count === 0) transport?.join(postId);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = holders.get(postId) ?? 0;
    holders = withCount(postId, current - 1);
    if (current === 1) transport?.leave(postId);
  };
}

/** Appelé par la connexion (`api/socket.ts`) à sa création. */
export function bindPublicationRoomTransport(next: PublicationRoomTransport): PublicationRoomBinding {
  transport = next;
  return {
    rejoin: () => {
      if (transport !== next) return;
      for (const postId of holders.keys()) next.join(postId);
    },
    detach: () => {
      if (transport === next) transport = null;
    },
  };
}
