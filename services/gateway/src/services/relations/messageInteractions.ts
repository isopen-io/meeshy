/**
 * Ce qu'un message compte pour la paire (#13932, RG-04).
 *
 * - **Conversation directe** (deux participants) : le message compte envers
 *   l'autre. `audio` quand le message est un vocal ; `message` sinon. Hors E2EE,
 *   le serveur voit les pièces jointes : un vocal porte une piste `audio/*`, et
 *   un type « audio » DÉCLARÉ sans elle n'est qu'un message. En E2EE (D-2), seul
 *   `Message.messageType`, déclaré par le client, dit « vocal » : on le compte en
 *   le sachant déclaratif. Un vocal ne compte QUE comme
 *   audio : « au moins un message » et « au moins un audio » sont deux
 *   exigences distinctes. Une réponse à une story ou un mood compte en
 *   `storyReply` (une seule nature par message, l'audio d'abord).
 * - **Groupe** : un message ordinaire n'est adressé à personne et ne compte pas.
 *   Répondre à quelqu'un compte envers lui ; mentionner quelqu'un compte une
 *   `mention` envers lui — sauf s'il est déjà compté par la réponse, ou si la
 *   conversation est directe (le message le compte déjà).
 *
 * - **Seul ce que la personne a écrit compte** (`messageSource === 'user'`) : un
 *   message qu'un AGENT écrit à son nom (`agent-response-bridge`) ou que le
 *   système pose n'est pas un échange d'elle — sinon un automate tiendrait la
 *   série qui distingue un proche d'une connaissance neuve. Fail-closed : une
 *   source absente ne compte pas.
 *
 * Le contenu n'entre jamais ici : la signature ne le porte pas.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { isEndToEndMode } from '../conversations/encryptionRegime.js';
import { notePairInteraction, type PairInteractionDb } from './pairInteractionRecorder.js';
import { answerMessageRequest, type MessageRequestDb } from '../messaging/messageRequests.js';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache.js';

const logger = enhancedLogger.child({ module: 'MessageInteractions' });

export type MessageInteraction = {
  readonly conversationId: string;
  readonly senderUserId: string | null;
  /** `Message.messageSource` : `user`, `agent`, `system`… Seul `user` compte. */
  readonly messageSource: string | null | undefined;
  readonly messageType: string;
  /** `Message.encryptionMode` : seul `e2ee` admet le type « audio » sur la foi du client (D-2). */
  readonly encryptionMode: string | null | undefined;
  /** Les MIME des pièces jointes FINALES du message (vides en E2EE : le serveur ne les lit pas). */
  readonly attachmentMimeTypes: ReadonlyArray<string | null | undefined>;
  readonly replyToAuthorUserId: string | null;
  /** Le message répond à une story ou un mood (`storyReplyToId`) : il compte en `storyReply`. */
  readonly isStoryReply?: boolean;
  readonly mentionedUserIds: readonly string[];
  readonly at?: Date;
};

type InteractionParticipant = { userId: string | null; messageRequestAt?: Date | null; messageRequestFromId?: string | null };

type MessageInteractionDb = PairInteractionDb & {
  readonly conversation: {
    findUnique(args: unknown): PromiseLike<{ type: string; participants: ReadonlyArray<InteractionParticipant> } | null>;
  };
};

/**
 * #14107, #16053 — le destinataire d'une DEMANDE de message qui y répond
 * (`answerMessageRequest`) : dans un tête-à-tête la réponse vaut accord et
 * rouvre les médias de l'expéditeur — y compris une demande déjà répondue sous
 * l'ancienne règle, dont seule la provenance reste —, sauf demande encore
 * CONTENUE (RG-21), que seul « Accepter » lève ; dans un groupe elle sort
 * seulement la conversation de la boîte (RG-22). L'expéditeur qui relance
 * n'efface rien (sa ligne ne porte pas de demande).
 */
const answersOwnRequest = (conversation: { type: string; participants: ReadonlyArray<InteractionParticipant> }, sender: string): boolean =>
  conversation.participants.some(
    (p) =>
      p.userId === sender &&
      (p.messageRequestAt instanceof Date || (conversation.type === 'direct' && Boolean(p.messageRequestFromId))),
  );

async function acceptRequestByReply(prisma: unknown, conversationId: string, userId: string, now: Date): Promise<void> {
  const answer = await answerMessageRequest(prisma as MessageRequestDb, { conversationId, userId, now });
  if (answer.requesterParticipantId) invalidateParticipantLookup(answer.requesterParticipantId, conversationId);
}

const isVoiceMessage = (interaction: MessageInteraction): boolean =>
  interaction.messageType === 'audio' &&
  (isEndToEndMode(interaction.encryptionMode) || interaction.attachmentMimeTypes.some((mime) => mime?.startsWith('audio/') === true));

const recipients = (
  interaction: MessageInteraction,
  conversation: { type: string; participants: ReadonlyArray<{ userId: string | null }> },
  sender: string,
): ReadonlyArray<{ otherId: string; nature: 'message' | 'audio' | 'storyReply' | 'mention' }> => {
  const nature: 'message' | 'audio' | 'storyReply' =
    isVoiceMessage(interaction) ? 'audio' : interaction.isStoryReply ? 'storyReply' : 'message';
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
  if (!sender || interaction.messageSource !== 'user') return;
  const db = prisma as MessageInteractionDb;
  const at = interaction.at ?? new Date();

  void Promise.resolve()
    .then(async () => {
      const conversation = await db.conversation.findUnique({
        where: { id: interaction.conversationId },
        select: {
          type: true,
          participants: { where: { isActive: true, type: 'user', userId: { not: null } }, select: { userId: true, messageRequestAt: true, messageRequestFromId: true } },
        },
      });
      if (!conversation) return;
      recipients(interaction, conversation, sender).forEach(({ otherId, nature }) =>
        notePairInteraction(db, { actorId: sender, otherId, nature, at }),
      );
      if (answersOwnRequest(conversation, sender)) await acceptRequestByReply(prisma, interaction.conversationId, sender, at);
    })
    .catch((error: unknown) => logger.warn('message interactions not counted', { conversationId: interaction.conversationId, error }));
}
