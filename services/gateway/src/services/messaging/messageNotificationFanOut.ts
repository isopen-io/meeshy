import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { protectedPreview, type NotificationActorProfile } from '../notifications/NotificationService';

export type { NotificationActorProfile };

export interface NotificationSenderIdentity {
  /** `User.id` pour un inscrit, `Participant.id` pour un anonyme. */
  readonly actorId: string;
  readonly isAnonymous: boolean;
  readonly profile: NotificationActorProfile;
}

/**
 * Le message tel que l'éventail le lit. Structural et minimal : les routes de
 * lien de partage ne construisent pas un `Message` Prisma complet.
 */
export interface FanOutMessage {
  readonly id: string;
  readonly messageType: string;
  readonly replyToId?: string | null;
  readonly isEncrypted?: boolean | null;
  readonly encryptionMode?: string | null;
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  readonly effectFlags?: number | null;
  readonly expiresAt?: Date | null;
  readonly createdAt?: Date | null;
  readonly encryptedContent?: string | null;
}

/**
 * La seule surface Prisma que l'éventail touche — six délégués, énumérés pour
 * qu'un appelant sache exactement ce que cette unité lit, et pour qu'elle ne
 * puisse pas dériver vers des lectures qu'il n'aurait pas prévues.
 *
 * `Pick<PrismaClient, …>` plutôt qu'une interface structurale maison, comme
 * `runMessagePostSaveEffects` : les délégués générés portent des surcharges que
 * rien de recopié à la main ne satisfait, et les `select` restent typés par
 * Prisma plutôt que par une approximation.
 */
export type FanOutPrisma = Pick<
  PrismaClient,
  'participant' | 'user' | 'conversation' | 'message' | 'messageAttachment' | 'userConversationPreferences'
>;

/**
 * Les trois créateurs que l'éventail appelle, en structural pour la même raison
 * que `FanOutPrisma`.
 */
export interface MessageNotificationTarget {
  createReplyNotification(params: Record<string, unknown>): Promise<unknown>;
  createMentionNotificationsBatch(
    mentionedUserIds: string[],
    commonData: Record<string, unknown>,
    memberIds: string[]
  ): Promise<unknown>;
  createMessageNotification(params: Record<string, unknown>): Promise<unknown>;
}

/**
 * Best-effort plain-text extraction from an AttachmentTranscription blob.
 * Returns undefined if the structure isn't recognized — caller falls back
 * to the original preview. Used to inline voice-message transcripts in the
 * push body for Phase A rich notifications (Communication Notifications iOS).
 */
export function extractTranscriptionText(att: { transcription?: unknown } | null | undefined): string | undefined {
  if (!att?.transcription || typeof att.transcription !== 'object') return undefined;
  const t = att.transcription as Record<string, unknown>;
  if (typeof t.text === 'string' && t.text.trim().length > 0) return t.text.trim();
  if (Array.isArray(t.segments)) {
    const joined = t.segments
      .map(seg => (typeof seg === 'object' && seg && typeof (seg as Record<string, unknown>).text === 'string'
        ? (seg as Record<string, unknown>).text as string
        : ''))
      .join(' ')
      .trim();
    if (joined.length > 0) return joined;
  }
  return undefined;
}

/**
 * Qui est l'expéditeur, du point de vue d'une notification.
 *
 * Trois branches, et AUCUNE n'est une impasse pour un expéditeur réel :
 *
 *  1. `Participant` porteur d'un `userId` → l'acteur est l'utilisateur inscrit ;
 *  2. `Participant` ANONYME (`userId: null`, cf. `schema.prisma` — c'est le seul
 *     type d'expéditeur qu'un lien de partage produise) → l'acteur est le
 *     participant lui-même : son `displayName` et son `avatar` sont la seule
 *     identité qui existe, et ils suffisent à nommer une notification ;
 *  3. aucun `Participant` sous cet id → l'id est retenté comme `User.id`. Ce
 *     n'est pas une précaution : la route de lien authentifiée porte un
 *     participant SYNTHÉTIQUE `{ id: userId }` pour la conversation globale
 *     `meeshy`, et le chemin nominal tolérait déjà ce cas.
 *
 * La branche (2) est la correction de ce cycle. Avant elle, l'éventail faisait
 * `user.findUnique({ id: <Participant.id> })` — les espaces d'ObjectIds ne se
 * recoupant jamais, la lecture rendait `null` et TOUT l'éventail (réponse,
 * mentions, message régulier) était abandonné en silence. Un anonyme ne
 * notifiait donc personne, ni par lien ni par le chemin nominal.
 */
export async function resolveNotificationSender(params: {
  prisma: Pick<FanOutPrisma, 'participant' | 'user'>;
  senderParticipantId: string;
}): Promise<NotificationSenderIdentity | null> {
  const { prisma, senderParticipantId } = params;

  const participant = await prisma.participant.findUnique({
    where: { id: senderParticipantId },
    select: { userId: true, displayName: true, avatar: true },
  });

  if (participant && !participant.userId) {
    const name = participant.displayName ?? '';
    return {
      actorId: senderParticipantId,
      isAnonymous: true,
      profile: { username: name, displayName: name, avatar: participant.avatar ?? null },
    };
  }

  const actorId = participant?.userId ?? senderParticipantId;
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { username: true, displayName: true, avatar: true },
  });
  if (!user) return null;

  return {
    actorId,
    isAnonymous: false,
    profile: { username: user.username, displayName: user.displayName, avatar: user.avatar },
  };
}

const attachmentTypeOf = (mimeType?: string | null): 'image' | 'video' | 'audio' | 'document' =>
  mimeType?.startsWith('image/') ? 'image' :
  mimeType?.startsWith('video/') ? 'video' :
  mimeType?.startsWith('audio/') ? 'audio' : 'document';

/**
 * Ce que TOUT message committé doit à ses destinataires quand ils ne regardent
 * PAS : la notification — ligne `Notification` en base, push APNs/FCM, et
 * événement in-app.
 *
 * Trois éventails, mutuellement exclusifs par destinataire et dans cet ordre de
 * priorité : réponse > mention > message régulier.
 *
 * Cette unité existe parce que l'obligation vivait sous DEUX niveaux de
 * `private` dans `MessageProcessor` (`triggerAllNotifications` ←
 * `handleMentionsAndNotifications` ← `saveMessage`). Les deux routes de lien de
 * partage contournent `MessagingService.handleMessage`, donc `MessageProcessor`
 * en entier : un message envoyé par lien ne produisait ni push, ni notification
 * in-app, ni ligne en base. Silence complet — pas une dégradation. Même défaut
 * et même remède qu'aux trois cycles précédents (`broadcastLinkMessage`,
 * `runMessagePostSaveEffects`, `emitUnreadCountsToRecipients`) : un point
 * d'appel public que tout écrivain peut atteindre.
 *
 * `validatedMentionUserIds` est OPTIONNEL et vaut `[]` par défaut, parce que
 * les routes de lien n'extraient pas encore les mentions (`Message.validatedMentions`
 * n'est écrit que par `MessageProcessor.processMentionsInDB`). Un lot de
 * mentions vide n'empêche ni la notification de réponse ni celle de message
 * régulier : c'est exactement la dégradation gracieuse voulue.
 *
 * Best-effort de bout en bout — ne lève jamais. Le message est committé quand
 * cette fonction tourne ; une panne de notification ne doit pas transformer un
 * envoi réussi en 500. `onError` laisse l'appelant journaliser dans le contexte
 * de sa requête.
 */
export async function notifyMessageRecipients(params: {
  prisma: FanOutPrisma;
  notificationService: MessageNotificationTarget | null | undefined;
  message: FanOutMessage;
  senderParticipantId: string;
  conversationId: string;
  processedContent: string;
  validatedMentionUserIds?: readonly string[];
  onError?: (error: unknown) => void;
  /**
   * Compte-rendu de l'éventail, pour que l'appelant journalise dans SON
   * contexte. Même contrat que `onError` et que les trois unités sœurs : une
   * unité partagée ne choisit pas le logger de ses appelants.
   */
  onFanOut?: (summary: { mentions: number; regular: number; reply: boolean }) => void;
}): Promise<void> {
  const {
    prisma,
    notificationService,
    message,
    senderParticipantId,
    conversationId,
    processedContent,
    onError,
    onFanOut,
  } = params;
  if (!notificationService) return;

  const validatedMentionUserIds = params.validatedMentionUserIds ?? [];

  try {
    // Le contenu qu'un message PROTÉGÉ (éphémère, vue unique, flouté, chiffré)
    // est autorisé à montrer sur un écran verrouillé — jamais le contenu lui-même.
    const protectedOverride = protectedPreview({
      messageType: message.messageType,
      isEncrypted: message.isEncrypted === true || message.encryptionMode === 'e2ee',
      isViewOnce: message.isViewOnce,
      isBlurred: message.isBlurred,
      effectFlags: message.effectFlags,
      expiresAt: message.expiresAt ?? null,
      createdAt: message.createdAt ?? null,
    });
    const notificationPreview = protectedOverride?.preview ?? processedContent;
    const notificationLocKey = protectedOverride?.locKey;

    const sender = await resolveNotificationSender({ prisma, senderParticipantId });
    if (!sender) return;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        title: true,
        type: true,
        participants: {
          where: { isActive: true, type: 'user' },
          select: { userId: true },
        },
      },
    });
    if (!conversation) return;

    const memberIds = conversation.participants
      .map(p => p.userId)
      .filter((id): id is string => id !== null);

    // L'auteur du message auquel celui-ci répond, en `User.id`. Un auteur
    // anonyme n'a pas de ligne `Notification` possible : il reste `null`.
    let originalMessageAuthorUserId: string | null = null;
    if (message.replyToId) {
      const originalMessage = await prisma.message.findUnique({
        where: { id: message.replyToId },
        select: { senderId: true },
      });
      if (originalMessage?.senderId) {
        const originalAuthorPart = await prisma.participant.findUnique({
          where: { id: originalMessage.senderId },
          select: { userId: true },
        });
        originalMessageAuthorUserId = originalAuthorPart?.userId || null;
      }
    }

    // Phase A — fileUrl + transcription dans le select pour que le rich-push iOS
    // attache le média en natif (waveform audio, preview image, thumb vidéo).
    const attachments = await prisma.messageAttachment.findMany({
      where: { messageId: message.id },
      select: {
        mimeType: true, fileName: true, fileSize: true, duration: true,
        width: true, height: true, fileUrl: true, transcription: true,
      },
    });

    const first = attachments[0];
    const attachmentInfo = {
      hasAttachments: attachments.length > 0,
      attachmentCount: attachments.length,
      firstAttachmentType: attachmentTypeOf(first?.mimeType),
      attachments: attachments.map(att => ({
        type: attachmentTypeOf(att.mimeType),
        filename: att.fileName,
      })),
      firstAttachmentFilename: first?.fileName,
      firstAttachmentFileSize: first?.fileSize,
      firstAttachmentDuration: first?.duration,
      firstAttachmentWidth: first?.width,
      firstAttachmentHeight: first?.height,
      firstAttachmentUrl: first?.fileUrl || undefined,
      firstAttachmentMimeType: first?.mimeType || undefined,
    };

    // Phase A — un vocal déjà transcrit affiche son texte sur l'écran verrouillé ;
    // le fichier reste attaché pour la lecture inline.
    const firstAttachmentTranscript =
      first?.mimeType?.startsWith('audio/')
        ? extractTranscriptionText(first as { transcription?: unknown })
        : undefined;
    const notificationPreviewForPush = firstAttachmentTranscript ?? notificationPreview;

    if (
      originalMessageAuthorUserId &&
      originalMessageAuthorUserId !== sender.actorId &&
      !validatedMentionUserIds.includes(originalMessageAuthorUserId)
    ) {
      await notificationService.createReplyNotification({
        recipientUserId: originalMessageAuthorUserId,
        replierUserId: sender.actorId,
        messageId: message.id,
        conversationId,
        messagePreview: notificationPreview,
        originalMessageId: message.replyToId!,
        senderProfile: sender.profile,
      });
    }

    if (validatedMentionUserIds.length > 0) {
      await notificationService.createMentionNotificationsBatch(
        [...validatedMentionUserIds],
        {
          senderId: sender.actorId,
          senderProfile: sender.profile,
          messageContent: notificationPreview,
          conversationId,
          messageId: message.id,
        },
        memberIds
      );
    }

    const alreadyNotified = new Set<string>([sender.actorId, ...validatedMentionUserIds]);
    if (originalMessageAuthorUserId) alreadyNotified.add(originalMessageAuthorUserId);

    const candidateRegularRecipients = memberIds.filter(id => !alreadyNotified.has(id));

    // GW3 — une seule requête élargie : un candidat quitte l'éventail régulier
    // s'il a choisi « mentions seulement » OU mis la conversation en sourdine
    // (les deux suppriment `new_message` ; une mention perce la sourdine via le
    // lot dédié ci-dessus).
    const conversationPrefs = candidateRegularRecipients.length > 0
      ? await prisma.userConversationPreferences.findMany({
          where: {
            conversationId,
            userId: { in: candidateRegularRecipients },
            OR: [{ mentionsOnly: true }, { isMuted: true }],
          },
          select: { userId: true },
        })
      : [];

    const suppressedUserIds = new Set(conversationPrefs.map(p => p.userId));
    const regularRecipients = candidateRegularRecipients.filter(id => !suppressedUserIds.has(id));

    if (regularRecipients.length > 0) {
      await Promise.all(regularRecipients.map(recipientUserId =>
        notificationService.createMessageNotification({
          recipientUserId,
          senderId: sender.actorId,
          senderProfile: sender.profile,
          messageId: message.id,
          conversationId,
          messagePreview: notificationPreviewForPush,
          encryptedContent: message.encryptedContent || undefined,
          notificationLocKey,
          ...attachmentInfo,
        })
      ));
    }

    onFanOut?.({
      mentions: validatedMentionUserIds.length,
      regular: regularRecipients.length,
      reply: !!originalMessageAuthorUserId,
    });
  } catch (error) {
    onError?.(error);
  }
}
