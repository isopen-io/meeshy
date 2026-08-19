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
): ForwardTarget[] {
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
