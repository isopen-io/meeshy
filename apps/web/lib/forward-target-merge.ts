/**
 * RÈGLE JUMELLE : apps/ios/Meeshy/Features/Main/Components/ForwardTargetMerge.swift
 * — toute évolution touche les deux.
 *
 * Ordre : conversations (dans l'ordre reçu), puis contacts non absorbés.
 * Un contact dont `userId` correspond au `userId` d'une conversation directe
 * déjà listée est ABSORBÉ par elle — une personne n'apparaît jamais deux fois.
 */

export type ForwardTargetKind = 'conversation' | 'contact';

export interface ForwardTarget {
  readonly id: string; // "conv:<id>" | "user:<id>"
  readonly kind: ForwardTargetKind;
  readonly conversationId?: string;
  readonly userId?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly avatarUrl?: string;
}

export function mergeForwardTargets(
  conversations: readonly ForwardTarget[],
  contacts: readonly ForwardTarget[],
): readonly ForwardTarget[] {
  const seenIds = new Set<string>();
  const joinedUserIds = new Set<string>();
  const out: ForwardTarget[] = [];

  for (const target of conversations) {
    if (seenIds.has(target.id)) continue;
    seenIds.add(target.id);
    if (target.userId) joinedUserIds.add(target.userId);
    out.push(target);
  }

  for (const target of contacts) {
    if (seenIds.has(target.id)) continue;
    seenIds.add(target.id);
    if (target.userId && joinedUserIds.has(target.userId)) continue;
    out.push(target);
  }

  return out;
}

const OPEN_CONVERSATION_TYPES = new Set(['public', 'global']);

/**
 * Une conversation trouvée par `GET /conversations/search` n'est une cible de
 * transfert que si l'utilisateur peut y ÉCRIRE, donc s'il en est membre.
 *
 * La route retourne délibérément aussi les conversations `public`/`global` dont
 * l'appelant n'est PAS membre (`search.ts:131-137`) — elle sert aussi la
 * recherche globale, qui les veut. Offrir un salon public homonyme comme cible
 * produit « Permissions insuffisantes pour envoyer des messages » : une cible
 * qui ne peut jamais fonctionner.
 *
 * `isMember` est le drapeau SERVEUR (`search.ts`, décision du user 2026-08-19)
 * et la seule autorité quand il est présent : depuis cette décision la route
 * n'émet plus AUCUN participant pour un non-membre, et le tableau qu'elle émet
 * pour un membre reste tronqué à cinq — il ne peut donc ni prouver ni infirmer
 * l'appartenance à lui seul. C'est ce qui faisait disparaître de sa propre
 * recherche le salon public de plus de cinq personnes dont l'utilisateur EST
 * membre.
 *
 * `isMember` absent = gateway antérieur : on retombe sur l'heuristique
 * historique plutôt que de tout écarter.
 * - tout type AUTRE que `public`/`global` n'a pu être trouvé que par
 *   `participants some { userId }` — appartenance garantie par construction ;
 * - pour `public`/`global`, seul le tableau `participants` du corps le dit.
 *
 * RÈGLE JUMELLE : `ForwardTargetMerge.isReachableConversation`
 * (`apps/ios/Meeshy/Features/Main/Components/ForwardTargetMerge.swift`).
 */
export function isReachableForwardConversation(
  type: string | null | undefined,
  participantUserIds: readonly string[],
  currentUserId: string | null | undefined,
  isMember?: boolean | null,
): boolean {
  if (typeof isMember === 'boolean') return isMember;
  if (!OPEN_CONVERSATION_TYPES.has((type ?? '').toLowerCase())) return true;
  if (!currentUserId) return false;
  return participantUserIds.includes(currentUserId);
}
