import type { Message } from '@/lib/api/types';

import { participantAvatarOf } from './conversation';
import { isSystemMessage } from './message-badges';

/**
 * **LES PARTICIPANTS LES PLUS ACTIFS D'UN GROUPE** (#7830) — miroir de
 * `topActiveMembersList` (`ConversationViewModel+Projections.swift:327-351`) :
 * on compte les messages CHARGÉS par expéditeur, hors soi, et on garde les
 * trois premiers par ordre décroissant.
 *
 * Deux précisions que la loi d'iOS laisse au hasard d'un dictionnaire :
 * - une ÉGALITÉ se départage par l'activité la plus RÉCENTE (le dernier
 *   message chargé de chacun) — l'ordre ne saute pas d'une ouverture à
 *   l'autre ;
 * - un message SYSTÈME (arrivée, départ, appel) n'est pas une prise de
 *   parole : il ne compte pas.
 *
 * L'identifiant rendu est celui du COMPTE quand il existe (c'est lui qui porte
 * l'anneau de story et le profil), l'expéditeur sinon.
 */
export type ActiveMember = {
  readonly id: string;
  readonly name: string;
  readonly username: string | undefined;
  readonly avatar: string | undefined;
  readonly count: number;
};

export const TOP_ACTIVE_LIMIT = 3;

type Tally = ActiveMember & { readonly lastIndex: number };

export function topActiveMembers(messages: readonly Message[], viewerId: string, limit: number = TOP_ACTIVE_LIMIT): readonly ActiveMember[] {
  const tallies = messages.reduce((acc, message, index) => {
    if (message.senderId === '' || message.senderId === viewerId || isSystemMessage(message)) return acc;
    const sender = message.sender;
    const id = sender?.userId ?? sender?.user?.id ?? message.senderId;
    if (id === viewerId) return acc;
    const known = acc.get(id);
    const username = sender?.user?.username;
    acc.set(id, {
      id,
      name: known?.name ?? sender?.displayName ?? sender?.user?.displayName ?? '',
      username: known?.username ?? (typeof username === 'string' && username !== '' ? username : undefined),
      avatar: known?.avatar ?? participantAvatarOf(sender),
      count: (known?.count ?? 0) + 1,
      lastIndex: index,
    });
    return acc;
  }, new Map<string, Tally>());

  return [...tallies.values()]
    .sort((a, b) => b.count - a.count || b.lastIndex - a.lastIndex)
    .slice(0, limit)
    .map(({ lastIndex: _lastIndex, ...member }) => member);
}
