import type { Message } from './types';

/**
 * **LE PSEUDO DE L'EXPÉDITEUR, SOUS LA FORME QUE LE FIL LIT** (#7991).
 *
 * Le fil lit le pseudo sous `sender.user.username` (`Participant`,
 * `packages/shared/types/participant.ts`) — c'est la forme du socket
 * (`MessagingService`, `user` imbriqué). La LISTE REST ne la sert pas :
 * `messageSchema.sender` est `userMinimalSchema`, où `username` voyage à la
 * RACINE, et le `user` imbriqué, non déclaré, est retiré par la sérialisation.
 * Sans ce repli, aucun nom ni avatar de l'historique ne menait au profil —
 * seuls les messages arrivés en direct restaient tapables.
 *
 * **Jamais pour un anonyme** : son `username` à plat est le pseudo `ano_…` de
 * sa session, pas l'adresse d'un profil (`resolveAnonymousSenderIdentity`,
 * gateway). Sans `userId`, aucun compte n'est derrière : rien à replier.
 */
type WireSender = NonNullable<Message['sender']> & { readonly username?: string | null };

export function withSenderAccount(message: Message): Message {
  /* La charge REST est PLUS LARGE que le type déclaré : `username` à la racine
     n'existe que sur le fil, jamais dans `Participant`. */
  const sender = message.sender as WireSender | undefined;
  if (sender === undefined || sender === null) return message;
  if (typeof sender.user?.username === 'string' && sender.user.username !== '') return message;
  if (sender.type === 'anonymous' || typeof sender.userId !== 'string') return message;
  if (typeof sender.username !== 'string' || sender.username === '') return message;
  return {
    ...message,
    sender: { ...sender, user: { ...sender.user, id: sender.user?.id ?? sender.userId, username: sender.username } },
  };
}
