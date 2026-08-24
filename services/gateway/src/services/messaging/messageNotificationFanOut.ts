import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  protectedPreview,
  type NotificationActorProfile,
  type PreviewPrismBasis,
} from '../notifications/NotificationService';
import { transcriptTranslationTexts } from '@meeshy/shared/types/attachment-audio';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import {
  retractMessageNotifications,
  type RetractedNotificationAnnouncer,
} from './retractMessageNotifications';

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
 * La seule surface Prisma que l'éventail touche — sept délégués, énumérés pour
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
  | 'participant'
  | 'user'
  | 'conversation'
  | 'message'
  | 'messageAttachment'
  | 'userConversationPreferences'
  | 'notification'
>;

/**
 * Les trois créateurs que l'éventail appelle, en structural pour la même raison
 * que `FanOutPrisma`.
 *
 * Les retours sont déclarés parce qu'ils sont LUS : le compte rendu
 * (`onFanOut`) dit ce qui est réellement parti, donc il compte les créations
 * non nulles et le total rendu par le lot de mentions. Un `Promise<unknown>`
 * partout laissait l'éventail annoncer son audience à la place de son résultat.
 */
export interface MessageNotificationTarget {
  createReplyNotification(params: Record<string, unknown>): Promise<unknown>;
  createMentionNotificationsBatch(
    mentionedUserIds: string[],
    commonData: Record<string, unknown>,
    memberIds: string[]
  ): Promise<number>;
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
 * La langue dans laquelle le vocal a été PARLÉ, telle que Whisper l'a rendue.
 *
 * Elle concourt à son RANG dans le Prisme du lecteur (règle #3), et n'est
 * jamais un court-circuit : un prisme `['fr','es']` sur un vocal espagnol
 * traduit en français sert le FRANÇAIS. `null` quand la transcription ne la
 * porte pas — la descente traite alors toutes les langues du lecteur comme
 * servables par traduction, ce qui est le comportement sûr : au pire elle sert
 * une traduction vers une langue où le vocal était déjà, jamais une langue que
 * le lecteur ne lit pas.
 */
export function transcriptionLanguage(att: { transcription?: unknown } | null | undefined): string | null {
  if (!att?.transcription || typeof att.transcription !== 'object') return null;
  const language = (att.transcription as Record<string, unknown>).language;
  return typeof language === 'string' && language.trim() !== '' ? language.trim() : null;
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
 * Un éventail, isolé de ses frères.
 *
 * Réponse, mentions et messages réguliers sont indépendants par construction —
 * leurs audiences se déduisent des ENTRÉES de la fonction, jamais du résultat
 * de l'éventail précédent. Ils partageaient pourtant un unique `try`, si bien
 * qu'une panne dans le premier annulait les deux suivants : un hoquet Mongo sur
 * la notification de réponse d'UNE personne faisait taire le message pour TOUTE
 * la conversation, mentions comprises — la famille qui perce pourtant toutes
 * les autres suppressions.
 *
 * L'erreur remontée NOMME l'éventail tombé et garde l'originale en `cause` :
 * sans elle, trois pannes distinctes arrivaient au même `onError` sous le même
 * libellé.
 */
async function runLot<T>(
  name: 'reply' | 'mentions' | 'regular' | 'retraction',
  onError: ((error: unknown) => void) | undefined,
  whenLost: T,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    onError?.(new Error(`Notification fan-out lot "${name}" failed`, { cause: error }));
    return whenLost;
  }
}

/**
 * Les candidats qui veulent encore de `new_message` dans cette conversation :
 * une seule requête élargie écarte « mentions seulement » ET la sourdine (les
 * deux suppriment `new_message` ; une mention perce la sourdine par son lot
 * dédié).
 *
 * Repli OUVERT, comme `filterMutedRecipients` : préférence illisible = tout le
 * monde reste notifié. Une préférence de confort qu'on ne sait plus lire ne
 * doit pas se transformer en silence pour toute la conversation.
 */
async function listeningRegularRecipients(
  prisma: FanOutPrisma,
  conversationId: string,
  candidates: readonly string[],
  onError?: (error: unknown) => void
): Promise<string[]> {
  if (candidates.length === 0) return [];

  try {
    const conversationPrefs = await prisma.userConversationPreferences.findMany({
      where: {
        conversationId,
        userId: { in: [...candidates] },
        OR: [{ mentionsOnly: true }, { isMuted: true }],
      },
      select: { userId: true },
    });

    const suppressedUserIds = new Set(conversationPrefs.map(p => p.userId));
    return candidates.filter(id => !suppressedUserIds.has(id));
  } catch (error) {
    onError?.(new Error(
      'Conversation preferences unreadable — every regular recipient stays notified',
      { cause: error }
    ));
    return [...candidates];
  }
}

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
 * `validatedMentionUserIds` est OPTIONNEL et vaut `[]` par défaut, pour tout
 * écrivain qui n'a pas de mentions à déclarer. Les deux routes de lien, elles,
 * le remplissent : elles appellent `resolveMessageMentions` avant cet éventail
 * (cette phrase disait l'inverse et ne le dit plus — le trou a été bouché, la
 * note ne l'avait pas suivi). Un lot de mentions vide n'empêche ni la
 * notification de réponse ni celle de message régulier : c'est exactement la
 * dégradation gracieuse voulue.
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
   * À qui annoncer les lignes qu'un rappel concurrent emporte. Même défaut et
   * même raison qu'`applyMessageRemovalEffects` : le service PARTAGÉ du
   * processus est le seul câblé avec `io`. Absent — worker, script, test — le
   * retrait a lieu quand même ; seule l'annonce est optionnelle.
   */
  retractionAnnouncer?: RetractedNotificationAnnouncer;
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
    retractionAnnouncer = getSharedNotificationService(),
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
    // Cycle 122 — l'aperçu est-il le CONTENU du message, donc substituable par
    // sa traduction dans la bannière ? Un placeholder de protection ne l'est
    // pas : y substituer la traduction relâcherait le texte que la protection
    // masque. `Message.translations` ne traduisant que `Message.content`, c'est
    // ici — où l'on sait ce que l'aperçu montre — que la question se tranche.
    const previewIsProtectedPlaceholder = protectedOverride !== null;

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
        // Cycle 123 — les traductions de la TRANSCRIPTION, que la bannière d'un
        // vocal sert : elles vivent ici, jamais sur `Message.translations`.
        translations: true,
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
    //
    // Cycle 124 — et il ne l'affiche PAS quand le message est protégé. Cette
    // condition manquait : la transcription gagnait inconditionnellement sur le
    // placeholder que `protectedPreview` venait de composer, si bien qu'un vocal
    // ÉPHÉMÈRE / à VUE UNIQUE / FLOUTÉ / CHIFFRÉ poussait son texte transcrit
    // ENTIER sur l'écran verrouillé — exactement ce que la protection masque.
    //
    // Le cycle 123 a fermé le FIL de ce même message (sa traduction ne part
    // plus sur le canal push) et laissé le CORPS ouvert : le texte nu de la
    // transcription était déjà substitué à l'aperçu une couche PLUS HAUT que
    // toute déclaration de base. `previewIsProtectedPlaceholder` gouvernait
    // `previewBasis`, jamais l'aperçu lui-même — la protection était donc
    // ANNONCÉE par deux champs et APPLIQUÉE par aucun.
    //
    // Conséquence de forme, et elle n'est pas accessoire : `pushPreviewBasis`
    // ne peut plus élire `transcript` sur un message protégé, puisqu'il n'y a
    // plus de transcription à ce moment-là. La base retombe sur
    // `protected-placeholder`, et le second verrou (`notificationLocKey`) cesse
    // d'être la seule chose qui retienne la traduction du texte masqué.
    const firstAttachmentTranscript =
      protectedOverride === null && first?.mimeType?.startsWith('audio/')
        ? extractTranscriptionText(first as { transcription?: unknown })
        : undefined;
    const notificationPreviewForPush = firstAttachmentTranscript ?? notificationPreview;

    // Cycle 123 — ce que l'aperçu EST décide de ce qui le traduit. Un
    // placeholder de protection n'a pas de source (et sa traduction ne doit pas
    // partir sur le fil non plus) ; une transcription a la SIENNE, sur
    // l'attachment. Le message reste le cas nominal.
    const previewBasis: PreviewPrismBasis = previewIsProtectedPlaceholder
      ? { kind: 'protected-placeholder' }
      : { kind: 'message-content' };
    const pushPreviewBasis: PreviewPrismBasis = firstAttachmentTranscript !== undefined
      ? {
          kind: 'transcript',
          source: {
            translations: transcriptTranslationTexts(
              (first as { translations?: unknown } | undefined)?.translations
            ),
            originalLanguage: transcriptionLanguage(first as { transcription?: unknown }),
          },
        }
      : previewBasis;

    // Les trois valeurs ci-dessous disent ce qui est réellement PARTI, pas ce
    // qui était visé — même règle de compte rendu que
    // `createMemberJoinedNotificationsBatch`. Une préférence, un DND ou une
    // panne écartent des destinataires sans que l'appelant doive le deviner ;
    // sans cela, un éventail entièrement tombé continuerait d'annoncer son
    // audience comme si elle avait été servie.

    const owesReplyNotification =
      !!originalMessageAuthorUserId &&
      originalMessageAuthorUserId !== sender.actorId &&
      !validatedMentionUserIds.includes(originalMessageAuthorUserId);

    const reply = owesReplyNotification
      ? await runLot('reply', onError, false, async () => {
          const created = await notificationService.createReplyNotification({
            recipientUserId: originalMessageAuthorUserId,
            replierUserId: sender.actorId,
            messageId: message.id,
            conversationId,
            messagePreview: notificationPreview,
            originalMessageId: message.replyToId!,
            senderProfile: sender.profile,
            messageExpiresAt: message.expiresAt ?? null,
            previewBasis,
          });
          return created != null;
        })
      : false;

    const mentions = validatedMentionUserIds.length > 0
      ? await runLot('mentions', onError, 0, () =>
          notificationService.createMentionNotificationsBatch(
            [...validatedMentionUserIds],
            {
              senderId: sender.actorId,
              senderProfile: sender.profile,
              messageContent: notificationPreview,
              conversationId,
              messageId: message.id,
              // L'éventail tient déjà l'échéance du message : la transmettre
              // évite une relecture PAR MENTIONNÉ, et `Message.expiresAt` étant
              // écrit à l'insertion et jamais modifié, cette copie ne dérive
              // pas. Le chemin `new_message`, lui, la prend de sa propre
              // relecture vivante — il en fait une de toute façon.
              messageExpiresAt: message.expiresAt ?? null,
              previewBasis,
            },
            memberIds
          )
        )
      : 0;

    // Les trois audiences se déduisent des ENTRÉES, jamais du résultat de
    // l'éventail précédent : `alreadyNotified` ne lit que l'auteur du message
    // cité et la liste de mentions validées. C'est ce qui rend l'isolement
    // ci-dessus fidèle — un éventail tombé ne déplace personne.
    const alreadyNotified = new Set<string>([sender.actorId, ...validatedMentionUserIds]);
    if (originalMessageAuthorUserId) alreadyNotified.add(originalMessageAuthorUserId);

    const candidateRegularRecipients = memberIds.filter(id => !alreadyNotified.has(id));

    const regular = await runLot('regular', onError, 0, async () => {
      const regularRecipients = await listeningRegularRecipients(
        prisma,
        conversationId,
        candidateRegularRecipients,
        onError
      );
      if (regularRecipients.length === 0) return 0;

      // `allSettled` et non `all` : le destinataire dont la lecture de contexte
      // hoquette ne doit pas emporter le compte rendu de ses voisins, dont les
      // notifications sont déjà parties.
      const results = await Promise.allSettled(regularRecipients.map(recipientUserId =>
        notificationService.createMessageNotification({
          recipientUserId,
          senderId: sender.actorId,
          senderProfile: sender.profile,
          messageId: message.id,
          conversationId,
          messagePreview: notificationPreviewForPush,
          encryptedContent: message.encryptedContent || undefined,
          notificationLocKey,
          // La transcription d'un vocal n'est PAS `Message.content` : ses
          // traductions vivent sur `MessageAttachment.translations`. Le cycle 122
          // s'en tenait à ne RIEN substituer ; le cycle 123 lui donne sa propre
          // source, et la bannière d'un vocal descend enfin le Prisme.
          previewBasis: pushPreviewBasis,
          ...attachmentInfo,
        })
      ));

      // Un signalement pour tout l'éventail, pas un par destinataire : sur un
      // groupe large, une panne commune produirait autant de lignes de log que
      // de membres. La première cause suffit à la nommer.
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (rejected.length > 0) {
        onError?.(new Error(
          `Notification fan-out lot "regular" lost ${rejected.length}/${regularRecipients.length} recipients`,
          { cause: rejected[0].reason }
        ));
      }

      return results.filter(r => r.status === 'fulfilled' && r.value != null).length;
    });

    onFanOut?.({ mentions, regular, reply });

    // Le rappel qui a couru CONTRE cet éventail.
    //
    // `applyMessageRemovalEffects` retire les notifications d'un message rappelé
    // en filtrant sur `messageId` : il emporte donc tout ce qui existe à
    // l'instant de son `deleteMany`. Ce qui naît APRÈS lui, il ne peut par
    // construction pas le voir — et une ligne `Notification` détient une COPIE
    // de l'extrait, qu'aucun filtre à la lecture ne rattrape.
    //
    // Une garde d'ADMISSION en tête d'éventail — celle que porte déjà
    // `createMessageNotification` — rétrécit cette fenêtre sans la fermer :
    // `deletedAt` peut être committé entre la relecture et la création. La
    // relecture d'APRÈS la ferme, elle, entièrement. Soit D l'instant du commit
    // de `deletedAt`, X celui du `deleteMany` du rappel (X > D, les effets
    // tournent après le commit), [c1..cn] nos créations, R cette relecture :
    //   - X > cn : le rappel voit toutes nos lignes, rien ne survit ;
    //   - X < cn : alors D < X < cn < R, donc R lit `deletedAt` et nous
    //     retirons nous-mêmes.
    // Aucun troisième cas.
    //
    // Placée ICI, après `onFanOut`, elle ne coûte rien au chemin de latence du
    // push — les notifications sont déjà parties — là où une garde d'admission
    // aurait allongé TOUS les envois d'un aller-retour.
    // La garde porte sur l'audience VISÉE, pas sur le compte rendu de ce qui
    // est parti : un créateur qui écrit sa ligne puis jette la laisserait
    // derrière lui avec un compteur à zéro. Un éventail sans aucun destinataire,
    // lui, n'a rien pu écrire — et ne paie donc pas la relecture.
    const attemptedFanOut =
      owesReplyNotification ||
      validatedMentionUserIds.length > 0 ||
      candidateRegularRecipients.length > 0;
    if (attemptedFanOut) {
      await runLot('retraction', onError, undefined, async () => {
        const live = await prisma.message.findUnique({
          where: { id: message.id },
          select: { deletedAt: true },
        });
        // `deletedAt` non nul est la SEULE preuve d'un rappel. Une ligne absente
        // ne prouve rien, et aucun chemin de la gateway ne supprime un message
        // physiquement : retirer sur une non-preuve viderait des inboxes.
        if (!live?.deletedAt) return;

        await retractMessageNotifications(prisma, message.id, retractionAnnouncer);
      });
    }
  } catch (error) {
    onError?.(error);
  }
}
