/**
 * Ce qu'un message compte pour la paire (#13932, RG-04).
 *
 * - **Conversation directe** (deux participants) : le message compte envers
 *   l'autre. `audio` si le type DÉCLARÉ du message l'est (D-2 : en E2EE, seul
 *   `Message.messageType`, déclaré par le client, dit « vocal » ; on le compte
 *   en le sachant déclaratif) ; `message` sinon. Un vocal ne compte QUE comme
 *   audio : « au moins un message » et « au moins un audio » sont deux
 *   exigences distinctes. Une réponse à une story ou un mood compte en
 *   `storyReply` (une seule nature par message, l'audio d'abord).
 * - **Groupe** : un message ordinaire n'est adressé à personne et ne compte pas.
 *   Répondre à quelqu'un compte envers lui ; mentionner quelqu'un compte une
 *   `mention` envers lui — sauf s'il est déjà compté par la réponse, ou si la
 *   conversation est directe (le message le compte déjà).
 *
 * Le contenu n'entre jamais ici : la signature ne le porte pas.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { notePairInteraction, type PairInteractionDb } from './pairInteractionRecorder.js';

const logger = enhancedLogger.child({ module: 'MessageInteractions' });

export type MessageInteraction = {
  readonly conversationId: string;
  readonly senderUserId: string | null;
  readonly messageType: string;
  readonly replyToAuthorUserId: string | null;
  /** Le message répond à une story ou un mood (`storyReplyToId`) : il compte en `storyReply`. */
  readonly isStoryReply?: boolean;
  readonly mentionedUserIds: readonly string[];
  readonly at?: Date;
};

type MessageInteractionDb = PairInteractionDb & {
  readonly conversation: {
    findUnique(args: unknown): PromiseLike<{ type: string; participants: ReadonlyArray<{ userId: string | null }> } | null>;
  };
};

const recipients = (
  interaction: MessageInteraction,
  conversation: { type: string; participants: ReadonlyArray<{ userId: string | null }> },
  sender: string,
): ReadonlyArray<{ otherId: string; nature: 'message' | 'audio' | 'storyReply' | 'mention' }> => {
  const nature = interaction.messageType === 'audio' ? 'audio' : interaction.isStoryReply ? 'storyReply' : 'message';
  if (conversation.type === 'direct') {
    return conversation.participants
      .map((p) => p.userId)
      .filter((id): id is string => Boolean(id) && id !== sender)
      .map((otherId) => ({ otherId, nature }));
  }
  const replied = interaction.replyToAuthorUserId && interaction.replyToAuthorUserId !== sender ? interaction.replyToAuthorUserId : null;
  const mentioned = [...new Set(interaction.mentionedUserIds)].filter((id) => id !== sender && id !== replied);
  return [
    ...(replied ? [{ otherId: replied, nature }] : []),
    ...mentioned.map((otherId) => ({ otherId, nature: 'mention' as const })),
  ];
};

export function noteMessageInteractions(prisma: MessageInteractionDb | PrismaClient, interaction: MessageInteraction): void {
  const sender = interaction.senderUserId;
  if (!sender) return;
  const db = prisma as MessageInteractionDb;
  const at = interaction.at ?? new Date();

  void Promise.resolve()
    .then(async () => {
      const conversation = await db.conversation.findUnique({
        where: { id: interaction.conversationId },
        select: {
          type: true,
          participants: { where: { isActive: true, type: 'user', userId: { not: null } }, select: { userId: true } },
        },
      });
      if (!conversation) return;
      recipients(interaction, conversation, sender).forEach(({ otherId, nature }) =>
        notePairInteraction(db, { actorId: sender, otherId, nature, at }),
      );
    })
    .catch((error: unknown) => logger.warn('message interactions not counted', { conversationId: interaction.conversationId, error }));
}
