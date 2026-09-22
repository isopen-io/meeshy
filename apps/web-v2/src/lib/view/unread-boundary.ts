import { useRef } from 'react';

import { firstUnreadBoundary, type FirstUnreadBoundaryResult } from '@meeshy/shared/utils/first-unread';

import { toDate } from '@/lib/api/decode';
import type { Conversation, Message } from '@/lib/api/types';

export type UnreadBoundarySnapshot = FirstUnreadBoundaryResult | null;

export type FrozenUnreadBoundary = {
  readonly conversationId: string;
  readonly boundary: UnreadBoundarySnapshot;
};

/**
 * **LE GEL DE LA FRONTIÈRE DE NON-LUS** (#7202, W3, D-L2/D-L3) — loi PURE,
 * isolée de React : elle décide QUAND (re)calculer, jamais COMMENT tenir la
 * référence (ça, c'est `useUnreadBoundary` ci-dessous).
 *
 * **Pourquoi geler.** Le séparateur ne doit pas bouger pendant la session
 * même quand W1 (#7201, `markCaughtUp`) avance la lecture pendant qu'on
 * défile : `markCaughtUp` ne patch QUE `unreadCount` dans le cache
 * (`lib/api/receipts.ts`), jamais `lastReadMessageId` — donc un recalcul
 * naïf resterait déjà stable en pratique — mais un futur refetch de la
 * conversation qui écrirait ces trois champs ferait bouger le séparateur
 * SOUS le lecteur sans ce gel. On fige donc UNE fois, à la première donnée
 * prête, et plus jamais pour la même conversation.
 *
 * **`ready`, pas `messages.length > 0`.** `useThreadData` compose DEUX
 * requêtes (`conversation`, `messages`) qui peuvent résoudre à des instants
 * différents ; `conversation` peut arriver avant `messages`, auquel cas
 * geler sur `messages.length === 0` figerait `boundary: null` à tort (zéro
 * CANDIDAT plutôt que zéro message CHARGÉ). `ready` doit donc venir de
 * `threadData.status === 'success'` (les deux résolus), jamais d'une
 * approximation locale.
 */
export function nextFrozenUnreadBoundary(params: {
  readonly previous: FrozenUnreadBoundary | undefined;
  readonly conversationId: string;
  readonly ready: boolean;
  readonly compute: () => UnreadBoundarySnapshot;
}): FrozenUnreadBoundary | undefined {
  const { previous, conversationId, ready, compute } = params;
  if (previous !== undefined && previous.conversationId === conversationId) return previous;
  if (!ready) return previous;
  return { conversationId, boundary: compute() };
}

/**
 * **SANS AUCUN SIGNAL, NE PAS INVENTER DE FRONTIÈRE** (garde ajoutée en
 * revue, avant livraison — mesuré via `check-thread-virtualization.mjs`, qui
 * a rougi le premier).
 *
 * `firstUnreadBoundary` (S1) est délibérément conçue ainsi : « aucun des
 * trois [rangs] ⇒ rien n'a jamais été lu ⇒ tout message d'autrui est
 * candidat » (doc-comment de la fonction). C'est juste pour un lecteur qui
 * n'a VRAIMENT jamais ouvert la conversation — mais un consommateur qui
 * n'ouvre que `GET /conversations/:id` (cas nominal de `thread.tsx`, via
 * `conversationQuery`) ne reçoit JAMAIS `currentUserJoinedAt` (S1 le
 * documente : ce champ n'est servi que par la LISTE). Si le cursor de
 * lecture est de surcroît absent — un membre ancien dont
 * `ConversationReadCursor` n'existe pas encore, ou tout simplement une
 * conversation où personne n'a encore posé de curseur — les QUATRE
 * signaux (`lastReadMessageId`, `lastReadAt`, `lastReadMessageCreatedAt`,
 * `currentUserJoinedAt`) sont absents à la fois, et la loi, appliquée à la
 * lettre, élit le tout premier message d'autrui de TOUTE la fenêtre chargée
 * comme frontière — exactement le « 4 812 messages non lus » que le
 * doc-comment de S1 dit vouloir éviter, mesuré ici en clair :
 * `check-thread-virtualization.mjs` s'attend à ce qu'un fil de 500 messages
 * s'ouvre en BAS, et un fil sans AUCUN signal s'ouvrait à la place à ~8 400 px
 * du bas.
 *
 * La garde : si les CINQ signaux sont absents, on ne connaît RIEN de la
 * position de lecture — se comporter comme si tout était lu (frontière
 * `null`, ouverture en bas) est le défaut le plus sûr, jamais « tout est
 * non lu depuis toujours ». Un signal, même un seul, suffit à sortir de
 * cette garde et à laisser la loi partagée trancher normalement.
 *
 * **CINQUIÈME signal, `unreadCount` (#7351, V3, LE PROFIL NEUF)** — ajouté
 * après les quatre premiers : `GET /conversations/:id` sert TOUJOURS
 * `unreadCount` (aucune colonne, `core-detail.ts:193,227`) même quand aucun
 * des quatre autres n'existe — le cas d'un lecteur qui ouvre un lien direct
 * sur une conversation qu'il n'a JAMAIS ouverte (pas de cursor, et
 * `currentUserJoinedAt` n'est servi que par la LISTE). Sans ce cinquième
 * signal, ce cas précis retombait dans la garde ci-dessus et rendait `null`
 * — l'inverse de D-L2, qui veut le séparateur DÈS qu'il existe des non-lus.
 * `firstUnreadBoundary` sait déjà quoi faire de ce signal seul
 * (`unreadCountHint`, voir son doc-comment) : élire les N DERNIERS
 * candidats plutôt que d'inventer une frontière sur tout l'historique.
 */
function hasAnyReadSignal(conversation: Conversation): boolean {
  return (
    conversation.lastReadMessageId !== undefined ||
    conversation.lastReadAt !== undefined ||
    conversation.lastReadMessageCreatedAt !== undefined ||
    conversation.currentUserJoinedAt !== undefined ||
    conversation.unreadCount !== undefined
  );
}

/**
 * `unreadBoundaryOf` — compose la garde ci-dessus et la loi partagée S1.
 * Site UNIQUE d'appel à `firstUnreadBoundary` pour web-v2 : tout appelant
 * futur qui a besoin de la frontière passe par ICI, pas par un second appel
 * direct à `firstUnreadBoundary` qui oublierait la garde.
 */
export function unreadBoundaryOf(params: {
  readonly conversation: Conversation;
  readonly messages: readonly Message[];
  readonly viewerId: string;
}): UnreadBoundarySnapshot {
  const { conversation, messages, viewerId } = params;
  if (!hasAnyReadSignal(conversation)) return null;
  return firstUnreadBoundary({
    messages,
    lastReadMessageId: conversation.lastReadMessageId ?? null,
    lastReadAt: conversation.lastReadAt ?? null,
    lastReadMessageCreatedAt: conversation.lastReadMessageCreatedAt ?? null,
    joinedAt: conversation.currentUserJoinedAt === undefined ? null : toDate(conversation.currentUserJoinedAt),
    viewerId,
    ...(conversation.unreadCount !== undefined ? { unreadCountHint: conversation.unreadCount } : {}),
  });
}

export type UseUnreadBoundaryInput = {
  readonly conversationId: string;
  readonly ready: boolean;
  readonly conversation: Conversation | undefined;
  readonly confirmedMessages: readonly Message[];
  readonly viewerId: string;
};

/**
 * `useUnreadBoundary` — GLUE React autour de `nextFrozenUnreadBoundary` : un
 * seul `ref`, recalculé SYNCHRONE pendant le rendu (jamais dans un effet —
 * l'effet de défilement initial de `use-thread-open-scroll.ts` lit la
 * valeur gelée DANS LE MÊME rendu que celui où elle vient de se figer, sans
 * quoi le premier defile utiliserait une valeur `null` non encore posée).
 *
 * `conversation.currentUserJoinedAt` est typé `Date | string`
 * (`packages/shared/types/conversation.ts:374`, deux origines possibles) —
 * `toDate()` (idempotent) l'uniformise avant l'appel à `firstUnreadBoundary`,
 * qui n'accepte que `Date`.
 */
/**
 * `resumeThreadTarget` (#7351, V3, critère de fin « Reprendre le fil cible
 * firstUnreadBoundary ») — LOI PURE, isolée de React : `routes/thread.tsx`
 * (`onResumeThread`) visait `messages.find((m) => m.senderId !==
 * viewer.id)`, le premier message d'autrui de la fenêtre CHARGÉE, jamais la
 * vraie frontière de lecture. Sur un fil paginé, ce premier message chargé
 * peut être bien avant le premier non-lu réel — « Reprendre le fil »
 * survolait alors des messages déjà lus avant d'atteindre le bon.
 *
 * Repli INCHANGÉ quand tout est lu (`unreadBoundary === null`) : le premier
 * message d'autrui de la fenêtre chargée, comme avant ce lot — seul le cas
 * « il existe un non-lu » change de cible.
 */
export function resumeThreadTarget(params: {
  readonly unreadBoundary: UnreadBoundarySnapshot;
  readonly messages: readonly { readonly id: string; readonly senderId: string }[];
  readonly viewerId: string;
}): string | null {
  const { unreadBoundary, messages, viewerId } = params;
  if (unreadBoundary !== null) return unreadBoundary.firstUnreadId;
  return messages.find((m) => m.senderId !== viewerId)?.id ?? null;
}

export function useUnreadBoundary(input: UseUnreadBoundaryInput): UnreadBoundarySnapshot {
  const { conversationId, ready, conversation, confirmedMessages, viewerId } = input;
  const frozen = useRef<FrozenUnreadBoundary | undefined>(undefined);

  frozen.current = nextFrozenUnreadBoundary({
    previous: frozen.current,
    conversationId,
    ready,
    compute: () => {
      if (conversation === undefined) return null;
      return unreadBoundaryOf({ conversation, messages: confirmedMessages, viewerId });
    },
  });

  return frozen.current?.conversationId === conversationId ? frozen.current.boundary : null;
}
