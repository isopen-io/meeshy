/**
 * Message Processing Module
 * Handles message content processing, encryption, links, mentions, and persistence
 */

import * as path from 'path';
import { PrismaClient, Message } from '@meeshy/shared/prisma/client';
import type { Prisma } from '@meeshy/shared/prisma/client';
import type { MessageRequest } from '@meeshy/shared/types';
import { TrackingLinkService } from '../TrackingLinkService';
import { processExplicitLinks } from './messageLinks';
import { MentionService } from '../MentionService';
import { EncryptionService } from '../EncryptionService';
import { NotificationService } from '../notifications/NotificationService';
import {
  notifyMessageRecipients,
  type FanOutPrisma,
  type MessageNotificationTarget,
} from './messageNotificationFanOut';
import { resolveMessageMentions } from './messageMentions';
import { MessageTranslationService } from '../message-translation/MessageTranslationService';
import { AttachmentService } from '../attachments';
import { copyAttachmentsFromMessage } from './copyAttachments';
import { deriveMessageTypeForAttachments } from './attachmentMessageType';
import { attachmentFullSelect } from '../attachments/attachmentIncludes';
import { enhancedLogger, performanceLogger } from '../../utils/logger-enhanced';
import { shouldProcessAudioAttachment } from '../../utils/transcription';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import {
  buildPostReplyTo,
  POST_REPLY_SNAPSHOT_SELECT,
  type PostReplyTo,
} from './postReplySnapshot';
import { clientDeclaredMetadata } from './clientDeclaredMetadata';
import { LIVE_MESSAGE_MARK } from './liveMessage';
import { unsetOrNull } from '../../utils/prisma-unset';
import { mapWithConcurrency } from '@meeshy/shared/utils/concurrency';

// Logger dédié pour MessageProcessor
const logger = enhancedLogger.child({ module: 'MessageProcessor' });

/**
 * Pistes audio dispatchées simultanément vers le translator. Assez pour tenir
 * le pipeline occupé, assez bas pour qu'un message de 199 vocaux ne le
 * submerge pas d'un coup.
 */
const AUDIO_DISPATCH_CONCURRENCY = 4;


type EncryptionMode = 'e2ee' | 'server' | 'hybrid';

/**
 * Encryption context for a message
 */
interface MessageEncryptionContext {
  isEncrypted: boolean;
  mode: EncryptionMode | null;
  encryptedContent: string | null;
  encryptionMetadata: Prisma.InputJsonValue | null;
}

export class MessageProcessor {
  private trackingLinkService: TrackingLinkService;
  private mentionService: MentionService;
  private encryptionService: EncryptionService;
  private attachmentService: AttachmentService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly notificationService?: NotificationService,
    private readonly translationService?: MessageTranslationService
  ) {
    this.trackingLinkService = new TrackingLinkService(prisma);
    this.mentionService = new MentionService(prisma);
    this.encryptionService = new EncryptionService(prisma);
    this.attachmentService = new AttachmentService(prisma);
  }

  /**
   * Traite les liens du contenu selon les règles suivantes :
   * - Règle 1 : Markdown [texte](url) → lien normal (pas de tracking)
   * - Règle 2 : URLs brutes → aucun tracking automatique (cf. `buildRawUrlTrackingLinks`)
   * - Règle 3 : [[url]] → force le tracking → m+token
   * - Règle 4 : <url> → force le tracking → m+token
   *
   * Le corps de ces quatre étapes vivait ICI, en second exemplaire complet de
   * `TrackingLinkService.processExplicitLinksInContent` : mêmes expressions
   * régulières, même réutilisation de token, ~90 lignes chacun. Deux copies
   * d'un algorithme ne restent pas d'accord — le correctif des séquences `$`
   * (replacer fonction) a dû être appliqué aux deux, séparément. Il n'y en a
   * plus qu'une, et l'envoi la traverse par la même unité que les deux chemins
   * d'édition.
   *
   * `createdBy` est un **`User.id`** — cf. `ExplicitLinkParams`. Ce chemin y
   * passait le `Participant.id` de l'expéditeur, d'un espace d'ids disjoint.
   */
  async processLinksInContent(
    content: string,
    conversationId: string,
    createdBy?: string,
    messageId?: string
  ): Promise<string> {
    return processExplicitLinks({
      trackingLinkService: this.trackingLinkService,
      content,
      conversationId,
      messageId,
      createdBy,
      onError: (error) => logger.error('[MessageProcessor] Error processing links', error),
    });
  }

  /**
   * L'identité UTILISATEUR derrière le participant expéditeur — la seule que
   * `TrackingLink.createdBy` accepte de désigner (`/tracking-links` y compare
   * un `User.id` pour lister « mes liens » ET pour autoriser l'accès).
   *
   * `undefined` pour un expéditeur anonyme (aucun `User.id`) comme pour une
   * lecture en échec : dans les deux cas, un lien sans propriétaire vaut mieux
   * qu'un lien attribué à un id qui ne désigne aucun utilisateur. Même forme et
   * même raison que `resolveSenderUserId` côté mentions (cf. messageMentions.ts).
   */
  private async resolveLinkAuthorUserId(senderParticipantId: string): Promise<string | undefined> {
    try {
      const participant = await this.prisma.participant.findUnique({
        where: { id: senderParticipantId },
        select: { userId: true },
      });
      return participant?.userId ?? undefined;
    } catch (error) {
      logger.error('[MessageProcessor] Error resolving link author', error);
      return undefined;
    }
  }

  /**
   * Construit le mapping `{ url, token }` des URLs BRUTES d'un contenu pour
   * `metadata.trackingLinks` — rend le lien cliquable + tracé `/l/<token>` côté client
   * SANS réécrire le contenu (l'aperçu vidéo et l'URL lisible sont préservés).
   * Délègue à la source UNIQUE `TrackingLinkService.collectContentTrackingLinks`
   * (partagée avec posts/stories/commentaires). Jamais bloquant : le helper avale
   * toute erreur de tracking et retourne `[]`.
   */
  private async buildRawUrlTrackingLinks(
    content: string,
    conversationId: string,
    createdBy?: string
  ): Promise<Array<{ url: string; token: string }>> {
    return this.trackingLinkService.collectContentTrackingLinks({
      content,
      conversationId,
      createdBy,
    });
  }

  /**
   * Get encryption context for a conversation
   * Determines if and how a message should be encrypted
   */
  async getEncryptionContext(
    conversationId: string,
    content: string,
    messageType: string
  ): Promise<MessageEncryptionContext> {
    // System messages are NEVER encrypted
    if (messageType === 'system') {
      return {
        isEncrypted: false,
        mode: null,
        encryptedContent: null,
        encryptionMetadata: null
      };
    }

    // Check if conversation has encryption enabled
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        encryptionMode: true,
        encryptionEnabledAt: true,
        serverEncryptionKeyId: true
      }
    });

    // No encryption enabled
    if (!conversation?.encryptionEnabledAt || !conversation.encryptionMode) {
      return {
        isEncrypted: false,
        mode: null,
        encryptedContent: null,
        encryptionMetadata: null
      };
    }

    const mode = conversation.encryptionMode as EncryptionMode;

    // E2EE mode: encryption happens client-side
    if (mode === 'e2ee') {
      logger.warn('[MessageProcessor] E2EE message received as plaintext - client should encrypt');
      return {
        isEncrypted: false,
        mode: 'e2ee',
        encryptedContent: null,
        encryptionMetadata: null
      };
    }

    try {
      // Server mode: encrypt content server-side
      if (mode === 'server') {
        const encrypted = await this.encryptionService.encryptMessage(
          content,
          'server',
          conversationId
        );

        return {
          isEncrypted: true,
          mode: 'server',
          encryptedContent: encrypted.ciphertext,
          encryptionMetadata: encrypted.metadata as Prisma.InputJsonValue
        };
      }

      // Hybrid mode: encrypt the server layer
      if (mode === 'hybrid') {
        const serverLayer = await this.encryptionService.encryptHybridServerLayer(
          content,
          conversationId
        );

        return {
          isEncrypted: true,
          mode: 'hybrid',
          encryptedContent: serverLayer.ciphertext,
          encryptionMetadata: {
            mode: 'hybrid',
            protocol: 'aes-256-gcm',
            keyId: serverLayer.keyId,
            iv: serverLayer.iv,
            authTag: serverLayer.authTag,
            canTranslate: true,
            timestamp: Date.now()
          } as Prisma.InputJsonValue
        };
      }

      // Unknown mode - fallback to plaintext
      logger.warn(`[MessageProcessor] Unknown encryption mode: ${mode}`);
      return {
        isEncrypted: false,
        mode: null,
        encryptedContent: null,
        encryptionMetadata: null
      };
    } catch (error) {
      logger.error('[MessageProcessor] Encryption failed', error);
      return {
        isEncrypted: false,
        mode: null,
        encryptedContent: null,
        encryptionMetadata: null
      };
    }
  }

  /**
   * Sauvegarde du message en base avec toutes les relations
   * Handles encryption based on conversation settings.
   *
   * Phase 4 §6.2 — when `clientMessageId` is supplied, the create is wrapped
   * in a `catch P2002` clause so concurrent retries with the same id resolve
   * to the same server record (idempotent dedup). The returned tuple
   * includes `isDuplicate: true` for hits — the caller skips broadcast and
   * post-processing for hits while still re-pushing translation if the
   * existing record's `translations` blob is empty (translator was down on
   * the first attempt).
   */
  async saveMessage(data: {
    conversationId: string;
    senderId: string;
    content: string;
    originalLanguage: string;
    messageType?: string;
    messageSource?: string;
    replyToId?: string;
    storyReplyToId?: string;
    forwardedFromId?: string;
    forwardedFromConversationId?: string;
    /**
     * Diffusion à plusieurs destinataires (pas un transfert) : copie
     * serveur des pièces jointes du message désigné, mêmes fichiers, sans
     * marque de transfert. Voir `handleAttachments` et `copyAttachments.ts`.
     */
    copyAttachmentsFromMessageId?: string;
    mentionedUserIds?: readonly string[];
    encryptedContent?: string;
    encryptionMetadata?: Prisma.InputJsonValue;
    attachmentIds?: readonly string[];
    isBlurred?: boolean;
    effectFlags?: number;
    expiresAt?: Date;
    isViewOnce?: boolean;
    maxViewOnceCount?: number;
    clientMessageId?: string;
    /** Lieu partagé — champ dédié, jamais un `metadata` brut. Validé par `parseSharedPlace`. */
    location?: unknown;
    /** Sticker (#4823) — champ dédié, même doctrine. Validé par `parseMessageSticker`. */
    sticker?: unknown;
  }): Promise<Message> {
    const corr: Record<string, any> = {
      clientMessageId: data.clientMessageId,
      conversationId: data.conversationId,
      senderId: data.senderId
    };

    // À qui appartiendront les liens de ce message : le `User.id` DERRIÈRE le
    // participant expéditeur, résolu UNE fois pour les deux chemins de tracking
    // (syntaxe explicite ci-dessous, URLs brutes plus bas). `Message.senderId`
    // est un `Participant.id` ; `TrackingLink.createdBy` est un `User.id`, et
    // c'est contre lui que `/tracking-links` autorise l'accès.
    //
    // La résolution est PAYÉE seulement si le texte porte une URL — un message
    // sans lien ne produit aucun `TrackingLink`, donc aucun propriétaire à
    // désigner. `containsLinks` couvre les deux syntaxes explicites autant que
    // les URLs brutes : `[[https://…]]` contient une URL.
    const linkAuthorUserId = this.containsLinks(data.content)
      ? await this.resolveLinkAuthorUserId(data.senderId)
      : undefined;

    // ÉTAPE 1: Traiter les liens AVANT de sauvegarder le message
    const processedContent = await performanceLogger.withTiming(
      'messaging.processLinks',
      () => this.processLinksInContent(
        data.content,
        data.conversationId,
        linkAuthorUserId,
        undefined
      ),
      corr
    );

    // ÉTAPE 2: Get encryption context for this message
    let encryptionContext: MessageEncryptionContext;

    if (data.encryptedContent && data.encryptionMetadata) {
      const metadata = data.encryptionMetadata as Record<string, unknown>;
      encryptionContext = {
        isEncrypted: true,
        mode: (metadata.mode as EncryptionMode) || 'e2ee',
        encryptedContent: data.encryptedContent,
        encryptionMetadata: data.encryptionMetadata
      };
    } else {
      encryptionContext = await performanceLogger.withTiming(
        'messaging.encryptionContext',
        () => this.getEncryptionContext(
          data.conversationId,
          processedContent.trim(),
          data.messageType || 'text'
        ),
        corr
      );
    }

    // Compute effectFlags: use provided value or derive from legacy fields
    let effectFlags = data.effectFlags ?? 0;
    if (data.isBlurred && !(effectFlags & MESSAGE_EFFECT_FLAGS.BLURRED)) effectFlags |= MESSAGE_EFFECT_FLAGS.BLURRED;
    if (data.expiresAt && !(effectFlags & MESSAGE_EFFECT_FLAGS.EPHEMERAL)) effectFlags |= MESSAGE_EFFECT_FLAGS.EPHEMERAL;
    if (data.isViewOnce && !(effectFlags & MESSAGE_EFFECT_FLAGS.VIEW_ONCE)) effectFlags |= MESSAGE_EFFECT_FLAGS.VIEW_ONCE;

    // Réponse à un post (status/story/reel/post) : GELER un snapshot du post
    // cité MAINTENANT, pendant qu'il existe encore. Sans ça, à l'expiration
    // (STATUS 1h / STORY 21h) la résolution live de `storyReplyToId` renvoie
    // null et la citation perd contenu + emoji mood + date + compteurs +
    // vignette. Le snapshot est rangé dans `metadata.postReplyTo` — réutilise
    // le champ `metadata Json?` existant (pas de colonne dédiée).
    const postReplyTo = data.storyReplyToId
      ? await this.capturePostReplyTo(data.storyReplyToId)
      : null;

    // Tracking des URLs brutes du message : mapping `url → token` rangé dans
    // `metadata.trackingLinks`. Le client rend le lien (texte + façade vidéo) vers
    // `/l/<token>` (capture du clic + redirection) tout en gardant l'URL/aperçu.
    // Ignoré pour les messages chiffrés (contenu vide côté serveur).
    const trackingLinks = encryptionContext.isEncrypted
      ? []
      : await this.buildRawUrlTrackingLinks(processedContent, data.conversationId, linkAuthorUserId);

    // Les blocs que le CLIENT déclare (`location`, `sticker`) passent par leurs
    // parseurs dédiés — jamais un `metadata` brut, cf. `clientDeclaredMetadata.ts`.
    const messageMetadata: Record<string, unknown> = {
      ...(postReplyTo ? { postReplyTo } : {}),
      ...(trackingLinks.length > 0 ? { trackingLinks } : {}),
      ...clientDeclaredMetadata(data),
    };

    // ÉTAPE 3: Créer le message avec le contenu traité et encryption.
    //
    // Phase 4 §6.2 — INSERT direct + catch P2002 atomique. Le findUnique
    // pré-INSERT n'est PAS atomique (deux requêtes concurrentes avec le
    // même clientMessageId passent toutes les deux le findUnique avant que
    // l'une INSERT et que l'autre échoue) — on s'appuie sur la contrainte
    // unique partielle MongoDB pour détecter le doublon en une seule
    // round-trip. Sur P2002 on relit l'existant et on flague isDuplicate.
    const messageData = {
      conversationId: data.conversationId,
      senderId: data.senderId,
      content: encryptionContext.isEncrypted ? '' : processedContent.trim(),
      originalLanguage: data.originalLanguage,
      messageType: data.messageType || 'text',
      messageSource: data.messageSource || 'user',
      replyToId: data.replyToId,
      storyReplyToId: data.storyReplyToId || null,
      ...(Object.keys(messageMetadata).length > 0
        ? { metadata: messageMetadata as Prisma.InputJsonValue }
        : {}),
      forwardedFromId: data.forwardedFromId,
      forwardedFromConversationId: data.forwardedFromConversationId,
      isEncrypted: encryptionContext.isEncrypted,
      encryptionMode: encryptionContext.mode,
      encryptedContent: encryptionContext.encryptedContent,
      encryptionMetadata: encryptionContext.encryptionMetadata,
      isBlurred: data.isBlurred || false,
      expiresAt: data.expiresAt || null,
      effectFlags,
      isViewOnce: data.isViewOnce || false,
      maxViewOnceCount: data.maxViewOnceCount ?? null,
      ...LIVE_MESSAGE_MARK,
      ...(data.clientMessageId ? { clientMessageId: data.clientMessageId } : {})
    } as const;

    let message: Message;
    let isDuplicate = false;
    try {
      message = await performanceLogger.withTiming(
        'messaging.prismaMessageCreate',
        () => this.prisma.message.create({
          data: messageData,
          include: {
            sender: {
              select: {
                id: true,
                displayName: true,
                avatar: true,
                type: true,
                nickname: true,
                userId: true,
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    firstName: true,
                    lastName: true,
                    avatar: true
                  }
                }
              }
            },
            attachments: true,
            replyTo: {
              include: {
                sender: {
                  select: {
                    id: true,
                    displayName: true,
                    avatar: true,
                    type: true,
                    nickname: true,
                    userId: true,
                    user: {
                      select: {
                        id: true,
                        username: true,
                        displayName: true,
                        firstName: true,
                        lastName: true,
                        avatar: true
                      }
                    }
                  }
                },
                // Parité avec le chemin REST (messages.ts) : le snapshot du
                // message cité doit porter ses pièces jointes, sinon l'aperçu
                // de citation n'affiche rien sur les messages reçus en socket.
                attachments: { select: attachmentFullSelect, take: 4 }
              }
            }
          }
        }),
        corr
      );
    } catch (e) {
      const isP2002 =
        typeof e === 'object' && e !== null
          && 'code' in e && (e as { code?: unknown }).code === 'P2002';
      if (!isP2002 || !data.clientMessageId) {
        throw e;
      }
      // Use `findFirst` instead of `findUnique` because the unique
      // constraint on `(conversationId, clientMessageId)` lives in a
      // partial MongoDB index (managed by the manual migration), not
      // a Prisma `@@unique` directive — so the `findUnique` compound
      // type is not generated. The compound `@@index` declared in the
      // schema still backs this query for performance.
      const existing = await performanceLogger.withTiming(
        'messaging.dedupFindFirst',
        () => this.prisma.message.findFirst({
          where: {
            conversationId: data.conversationId,
            clientMessageId: data.clientMessageId
          },
          include: {
            sender: {
              select: {
                id: true, displayName: true, avatar: true, type: true,
                nickname: true, userId: true,
                user: {
                  select: {
                    id: true, username: true, displayName: true,
                    firstName: true, lastName: true, avatar: true
                  }
                }
              }
            },
            attachments: true,
            replyTo: {
              include: {
                sender: {
                  select: {
                    id: true, displayName: true, avatar: true, type: true,
                    nickname: true, userId: true,
                    user: {
                      select: {
                        id: true, username: true, displayName: true,
                        firstName: true, lastName: true, avatar: true
                      }
                    }
                  }
                },
                // Parité REST : porter les pièces jointes du message cité
                // (sinon l'aperçu de citation est vide via le dédup socket).
                attachments: { select: attachmentFullSelect, take: 4 }
              }
            }
          }
        }),
        corr
      );
      if (!existing) {
        // Race condition we cannot reconcile — bubble up the original error.
        logger.error('P2002 raised but no existing record found for clientMessageId', {
          conversationId: data.conversationId,
          clientMessageId: data.clientMessageId
        });
        throw e;
      }
      message = existing;
      isDuplicate = true;
      logger.info('Idempotent dedup hit on clientMessageId', {
        conversationId: data.conversationId,
        clientMessageId: data.clientMessageId,
        messageId: existing.id
      });
    }

    // Stash the dedup flag on the message object so the caller can branch
    // on it (broadcast / translate decisions). The field is non-persistent
    // and only travels in-process.
    (message as Message & { isDuplicate?: boolean }).isDuplicate = isDuplicate;

    if (isDuplicate) {
      // Skip side-effects on dedup hits: attachments are already linked,
      // tracking links and mentions/notifications were processed on the
      // first attempt. The translation re-push (if needed) is decided at
      // the caller level (`MessagingService.handleMessage`).
      return {
        ...message,
        timestamp: message.createdAt
      } as Message;
    }

    const corrWithMsg = { ...corr, messageId: message.id };

    // ÉTAPE 4: Gérer les attachments (Lier ou Copier pour forward)
    await performanceLogger.withTiming(
      'messaging.handleAttachments',
      () => this.handleAttachments(data, message),
      corrWithMsg
    );

    // ÉTAPE 4 bis: Rafraîchir les attachments en mémoire. `prisma.message.create`
    // a capturé `attachments: []` AVANT que `handleAttachments` ne fasse le
    // lien (`updateMany`/`create`), donc l'objet renvoyé ici porte un
    // tableau vide. Sans ce refresh, le broadcast `message:new` et la
    // réponse REST diffusent un message sans attachments — ce qui fait
    // disparaître les médias côté client (iOS écrase les attachments
    // optimistes avec `null`).
    const hasAttachmentLinks =
      (data.attachmentIds && data.attachmentIds.length > 0) ||
      Boolean(data.forwardedFromId) ||
      Boolean(data.copyAttachmentsFromMessageId);
    if (hasAttachmentLinks) {
      const refreshedAttachments = await performanceLogger.withTiming(
        'messaging.refreshAttachments',
        () => this.prisma.messageAttachment.findMany({
          where: { messageId: message.id }
        }),
        corrWithMsg
      );
      (message as Message & { attachments: unknown[] }).attachments = refreshedAttachments;

      // ÉTAPE 4 ter: Dire ce QU'EST ce message, maintenant qu'on sait ce qu'il
      // porte. C'est le seul point du service où les pièces jointes FINALES
      // sont connues, quel que soit le chemin qui les a produites (liaison par
      // `attachmentIds`, copie de transfert, copie de diffusion) — donc le seul
      // endroit où la règle puisse être écrite UNE fois pour les trois.
      //
      // Elle ne l'était pour aucun des trois. Le client était censé fournir
      // `messageType`, et `SendMessageRequest` du SDK iOS n'a pas ce champ :
      // toute photo, vidéo ou note vocale partie d'iOS se persistait `'text'`,
      // et sa notification s'affichait au ballon texte (`contentTypeIcon`).
      //
      // La reprise EN MÉMOIRE compte autant que l'écriture : c'est cet
      // objet-là que lisent la notification (ÉTAPE 6) et `buildMessageNewPayload`.
      // Sans elle la colonne serait juste et le fil resterait faux. Mutation
      // assumée, comme celle d'`attachments` juste au-dessus et pour la même
      // raison — la ligne rendue par `create` a été prise avant que le message
      // ne soit complet.
      const derivedMessageType = deriveMessageTypeForAttachments({
        persistedMessageType: message.messageType,
        mimeTypes: refreshedAttachments.map((att) => att.mimeType),
      });
      if (derivedMessageType) {
        await this.prisma.message.update({
          where: { id: message.id },
          data: { messageType: derivedMessageType },
        });
        (message as Message & { messageType: string }).messageType = derivedMessageType;
      }
    }

    // ÉTAPE 5: Mettre à jour les liens de tracking avec le messageId (fire-and-forget)
    performanceLogger.withTiming(
      'messaging.trackingLinks',
      () => this.updateTrackingLinksWithMessageId(processedContent, data, message.id),
      corrWithMsg
    ).catch(err => logger.error('[MessageProcessor] trackingLinks update failed', err));

    // ÉTAPE 6: Traiter les mentions et déclencher TOUTES les notifications
    // (Mentions, Réponses, Messages réguliers)
    await performanceLogger.withTiming(
      'messaging.mentionsAndNotifications',
      () => this.handleMentionsAndNotifications(data, message, processedContent),
      corrWithMsg
    );

    return {
      ...message,
      timestamp: message.createdAt
    } as Message;
  }

  /**
   * Gère l'association ou la copie des attachments pour un nouveau message
   */
  private async handleAttachments(
    data: {
      senderId: string;
      attachmentIds?: readonly string[];
      forwardedFromId?: string;
      copyAttachmentsFromMessageId?: string;
      conversationId: string;
    },
    message: Message
  ): Promise<void> {
    // Diffusion à plusieurs destinataires (PAS un transfert) : copie SERVEUR
    // des pièces jointes du message désigné. Volontairement HORS du
    // try/catch ci-dessous — celui-ci absorbe les échecs du forward en
    // best-effort (une source disparue dégrade en message ordinaire), mais
    // une copie manquée ici doit faire ÉCHOUER l'envoi : sans elle le
    // message créé n'a ni texte ni pièce jointe — une bulle vide et
    // irrécupérable chez TOUS les destinataires de la diffusion.
    if (data.copyAttachmentsFromMessageId) {
      try {
        await copyAttachmentsFromMessage(this.prisma, {
          sourceMessageId: data.copyAttachmentsFromMessageId,
          targetMessageId: message.id,
          requesterParticipantId: data.senderId,
        });
      } catch (error) {
        // La ligne `Message` existe déjà : `saveMessage` la crée AVANT
        // d'appeler `handleAttachments`. Laisser l'erreur remonter sans
        // nettoyer laisserait une bulle orpheline (content vide, zéro pièce
        // jointe, `deletedAt: null`) que le prochain GET servirait comme un
        // message réel — et qu'un rejeu au même `clientMessageId` rendrait
        // ensuite `success: true` en dédup P2002 (`saveMessage` retourne
        // AVANT `handleAttachments` sur ce chemin, donc la copie ne serait
        // jamais retentée). Supprimer la ligne avant de propager l'erreur
        // fait échouer l'envoi ET libère le `clientMessageId` pour un vrai
        // nouvel essai.
        await this.prisma.message.delete({ where: { id: message.id } }).catch((deleteError) =>
          logger.error('[MessageProcessor] Failed to delete orphaned message after copy failure', deleteError)
        );
        throw error;
      }
      return;
    }

    try {
      // 1. Lier les attachments pré-uploadés
      if (data.attachmentIds && data.attachmentIds.length > 0) {
        await this.attachmentService.associateAttachmentsToMessage(data.attachmentIds, message.id);

        // Déclencher le traitement audio si nécessaire
        if (this.translationService) {
          this.processAudioAttachments(data.attachmentIds, message.id, data.conversationId, data.senderId)
            .catch(err => logger.error('[MessageProcessor] Audio processing failed', err));
        }
      }
      // 2. Copier les attachments si c'est un forward et qu'aucun nouvel attachment n'est fourni
      else if (data.forwardedFromId) {
        await this.copyForwardedAttachments(data.forwardedFromId, message.id, data.senderId);
      }
    } catch (error) {
      logger.error('[MessageProcessor] Error handling attachments', error);
    }
  }

  /**
   * Copie les attachments d'un message original vers un nouveau message (Forward)
   */
  private async copyForwardedAttachments(originalMessageId: string, newMessageId: string, senderId: string): Promise<void> {
    try {
      const originalAttachments = await this.prisma.messageAttachment.findMany({
        where: { messageId: originalMessageId }
      });

      if (originalAttachments.length === 0) return;

      const createdAttachments = await Promise.all(
        originalAttachments.map(att =>
          this.prisma.messageAttachment.create({
            data: {
              messageId: newMessageId,
              fileName: att.fileName,
              originalName: att.originalName,
              mimeType: att.mimeType,
              fileSize: att.fileSize,
              filePath: att.filePath,
              fileUrl: att.fileUrl,
              title: att.title,
              alt: att.alt,
              caption: att.caption,
              forwardedFromAttachmentId: att.id,
              isForwarded: true,
              width: att.width,
              height: att.height,
              thumbnailPath: att.thumbnailPath,
              thumbnailUrl: att.thumbnailUrl,
              duration: att.duration,
              bitrate: att.bitrate,
              sampleRate: att.sampleRate,
              codec: att.codec,
              channels: att.channels,
              fps: att.fps,
              videoCodec: att.videoCodec,
              pageCount: att.pageCount,
              lineCount: att.lineCount,
              uploadedBy: senderId,
              isAnonymous: false,
              transcription: att.transcription ?? undefined,
              translations: att.translations ?? undefined,
              metadata: att.metadata ?? undefined,

              // Le placeholder instantané et les variantes WebP sont DÉJÀ
              // dérivés de ces octets-là. Les laisser derrière condamnait la
              // copie au téléchargement pleine taille pour un travail déjà fait.
              thumbHash: att.thumbHash,
              imageVariants: att.imageVariants ?? undefined,

              // ── Ce que la copie doit dire de SES PROPRES OCTETS ───────────
              //
              // `filePath`/`fileUrl` sont repris à l'identique : les deux lignes
              // désignent le MÊME blob. Quand l'original est chiffré, ce blob
              // est du chiffré — et la copie naissait pourtant sans un seul de
              // ces champs, donc avec le défaut Prisma `isEncrypted: false`.
              //
              // Le gateway ne déchiffre rien : `routes/attachments/download.ts`
              // sert les octets bruts et c'est le CLIENT qui déchiffre, d'après
              // ce que la ligne déclare (`attachmentIncludes` publie
              // `isEncrypted`, `encryptionMode`, `encryptionIv`,
              // `encryptionAuthTag` exactement pour ça). Une copie qui annonce
              // « clair » en pointant du chiffré fait donc rendre le chiffré
              // TEL QUEL comme s'il était le média : le client ne déchiffre pas,
              // puisqu'on vient de lui dire qu'il n'y a rien à déchiffrer.
              //
              // Le fait est porté par les OCTETS ; le drapeau n'en est que
              // l'écho. Copier les octets par référence en laissant l'écho
              // derrière, c'est faire mentir la ligne sur ce qu'elle contient.
              // `originalFileSize` compte au même titre : `fileSize` porte la
              // taille CHIFFRÉE (cf. `UploadProcessor`) et il EST copié.
              isEncrypted: att.isEncrypted,
              encryptionMode: att.encryptionMode,
              encryptionIv: att.encryptionIv,
              encryptionAuthTag: att.encryptionAuthTag,
              encryptionHmac: att.encryptionHmac,
              originalFileHash: att.originalFileHash,
              encryptedFileHash: att.encryptedFileHash,
              originalFileSize: att.originalFileSize,
              serverKeyId: att.serverKeyId,
              thumbnailEncryptionIv: att.thumbnailEncryptionIv,
              thumbnailEncryptionAuthTag: att.thumbnailEncryptionAuthTag,
            }
          })
        )
      );

      // Le `messageType` n'est PLUS dérivé ici. Ce site en portait un second
      // exemplaire, manuscrit, et il divergeait de la règle canonique sur deux
      // points mesurés : il ne lisait que `createdAttachments[0]` (un lot
      // hétérogène s'annonçait donc du type de sa première pièce, quand la
      // règle dit `'file'`), et il ne connaissait que le préfixe `application/`
      // (une carte de visite `text/vcard`, un `.txt`, un MIME vide y
      // retombaient sur `'text'`, quand la règle dit « jamais 'text' »). Les
      // deux exemplaires avaient chacun leur témoin, et les deux témoins
      // exigeaient des réponses OPPOSÉES pour `text/plain`.
      //
      // `saveMessage` applique désormais `deriveMessageTypeForAttachments` sur
      // les pièces jointes RELUES, ce qui couvre ce chemin et les deux autres.
      logger.info(`[MessageProcessor] Copied ${createdAttachments.length} attachments for forward`);
    } catch (error) {
      logger.error('[MessageProcessor] Error copying forwarded attachments', error);
    }
  }

  /**
   * Envoie les audios au service de traduction pour transcription/clonage
   */
  private async processAudioAttachments(
    attachmentIds: readonly string[],
    messageId: string,
    conversationId: string,
    senderId: string
  ): Promise<void> {
    if (!this.translationService) return;

    try {
      const attachments = await this.prisma.messageAttachment.findMany({
        where: { id: { in: [...attachmentIds] } },
        select: { id: true, mimeType: true, fileUrl: true, filePath: true, duration: true, metadata: true, transcription: true }
      });

      // Idempotence : ne dispatcher au translator que les audios SANS
      // transcription déjà stockée. Un handleAttachments rejoué (retry outbox,
      // REST+socket pour le même message) ne relance donc pas le pipeline ML
      // coûteux (Whisper→NLLB→TTS) sur un audio déjà traité.
      const audioAttachments = attachments.filter(att => shouldProcessAudioAttachment(att));
      const alreadyTranscribed = attachments.filter(
        att => att.mimeType?.startsWith('audio/') && !shouldProcessAudioAttachment(att)
      );
      if (alreadyTranscribed.length > 0) {
        logger.info(
          `[MessageProcessor] Skip ${alreadyTranscribed.length} audio déjà transcrit(s) — idempotence (message ${messageId})`
        );
      }

      // Resolve sender userId once (shared across all attachments)
      let resolvedSenderId = senderId;
      const senderParticipant = await this.prisma.participant.findUnique({
        where: { id: senderId },
        select: { userId: true }
      });
      if (senderParticipant?.userId) {
        resolvedSenderId = senderParticipant.userId;
      }

      const uploadBasePath = process.env.UPLOAD_PATH || '/app/uploads';

      // Dispatch BORNÉ : un message peut porter jusqu'à
      // `MAX_ATTACHMENTS_PER_MESSAGE` (199) vocaux, et chaque dispatch ouvre un
      // pipeline ML (Whisper → NLLB → TTS). Un `Promise.all` nu les libérait
      // tous d'un coup sur le translator. Le pool garde le parallélisme utile
      // sans rafale.
      //
      // Chaque piste est isolée dans son propre try/catch : le pool s'arrête à
      // la première exception (sémantique `Promise.all`), donc sans cette garde
      // un audio illisible priverait de traitement toutes les pistes que son
      // worker n'a pas encore prises.
      const outcomes = await mapWithConcurrency(
        audioAttachments,
        AUDIO_DISPATCH_CONCURRENCY,
        async (audioAtt) => {
          let mobileTranscription: any = undefined;
          if (audioAtt.metadata && typeof audioAtt.metadata === 'object') {
            const metadata = audioAtt.metadata as any;
            if (metadata.transcription) {
              mobileTranscription = metadata.transcription;
            }
          }

          const audioPath = audioAtt.filePath ? path.join(uploadBasePath, audioAtt.filePath) : '';

          try {
            await this.translationService!.processAudioAttachment({
              messageId,
              attachmentId: audioAtt.id,
              conversationId,
              senderId: resolvedSenderId,
              audioUrl: audioAtt.fileUrl || '',
              audioPath: audioPath,
              audioDurationMs: audioAtt.duration || 0,
              mobileTranscription: mobileTranscription,
              generateVoiceClone: true,
              modelType: 'medium'
            });
            return true;
          } catch (error) {
            logger.error(
              `[MessageProcessor] Audio dispatch failed for attachment ${audioAtt.id} (message ${messageId})`,
              error as Error
            );
            return false;
          }
        }
      );

      const failedCount = outcomes.filter((dispatched) => !dispatched).length;
      if (failedCount > 0) {
        logger.warn(
          `[MessageProcessor] ${failedCount}/${audioAttachments.length} audio dispatch(es) failed (message ${messageId})`
        );
      }
    } catch (error) {
      logger.error('[MessageProcessor] Error processing audio attachments', error);
    }
  }

  /**
   * Met à jour les liens de tracking avec l'ID du message
   */
  private async updateTrackingLinksWithMessageId(
    processedContent: string,
    data: { conversationId: string; content: string },
    messageId: string
  ): Promise<void> {
    if (processedContent === data.content) return;

    try {
      const meeshyTokenRegex = /m\+([a-zA-Z0-9_-]{2,50})/gi;
      const matches = processedContent.matchAll(meeshyTokenRegex);

      for (const match of matches) {
        const token = match[1];
        try {
          // `messageId: null` n'appariait AUCUN lien : la réécriture appelle
          // `createTrackingLink` avec `messageId` encore indisponible, donc
          // omis, donc la colonne est ABSENTE du document — pas nulle.
          // L'attribution d'un lien à son message n'était jamais écrite sur ce
          // chemin. La garde reste nécessaire pour ne pas voler le lien qu'un
          // autre message de la conversation a déjà réclamé (un `TrackingLink`
          // est PARTAGÉ par URL, cf. `messageRemovalEffects.ts`).
          // Voir `utils/prisma-unset.ts`.
          await this.prisma.trackingLink.updateMany({
            where: {
              token,
              conversationId: data.conversationId,
              ...unsetOrNull('messageId')
            },
            data: { messageId }
          });
        } catch (updateError) {
          logger.error(`[MessageProcessor] Error updating messageId for token ${token}:`, updateError);
        }
      }
    } catch (error) {
      logger.error('[MessageProcessor] Error updating messageIds', error);
    }
  }

  /**
   * Traiter les mentions et déclencher TOUTES les notifications nécessaires
   * (Mentions, Réponses, Messages réguliers)
   */
  private async handleMentionsAndNotifications(
    data: { senderId: string; conversationId: string; mentionedUserIds?: readonly string[] },
    message: Message,
    processedContent: string
  ): Promise<void> {
    try {
      // 1. Gérer les mentions en DB (validation + création). Le court-circuit
      // « pas de `@`, pas de requête » vit dans l'unité, pas ici : c'est une
      // garde qu'un nouvel écrivain oublierait.
      const validatedMentionUserIds = await this.processMentionsInDB(data, message, processedContent);

      // 2. Déclencher les notifications (Mentions, Réponses, Messages)
      if (this.notificationService) {
        // Fire-and-forget pour ne pas bloquer le retour API
        this.triggerAllNotifications(message, data, processedContent, validatedMentionUserIds)
          .catch(err => logger.error('[MessageProcessor] Fire-and-forget notifications failed', err));
      }
    } catch (error) {
      logger.error('[MessageProcessor] Error in handleMentionsAndNotifications', error);
    }
  }

  /**
   * Valide et crée les mentions en base de données.
   *
   * Délègue à `resolveMessageMentions` : le corps vivait ici, `private` sous
   * `handleMentionsAndNotifications` (elle-même `private`), donc inatteignable
   * par tout écrivain hors de cette classe. Les deux routes de lien de partage
   * contournent `MessagingService` en entier — un `@alice` envoyé par lien ne
   * produisait ni ligne `Mention`, ni `validatedMentions`, ni notification de
   * mention.
   *
   * L'affectation en mémoire reste ici : ce sont les émetteurs socket de CETTE
   * classe qui relisent `message.validatedMentions` pour peupler leur payload.
   */
  private async processMentionsInDB(
    data: { senderId: string; conversationId: string; mentionedUserIds?: readonly string[] },
    message: Message,
    processedContent: string
  ): Promise<string[]> {
    const { validatedUserIds, validatedUsernames } = await resolveMessageMentions({
      prisma: this.prisma,
      mentionService: this.mentionService,
      message: {
        id: message.id,
        conversationId: data.conversationId,
        senderId: data.senderId
      },
      content: processedContent,
      explicitMentionedUserIds: data.mentionedUserIds,
      onError: (error) => logger.error('[MessageProcessor] Error processing mentions in DB', error)
    });

    if (validatedUsernames.length > 0) {
      (message as any).validatedMentions = [...validatedUsernames];
    }
    return [...validatedUserIds];
  }

  /**
   * Déclenche les notifications pour tous les types de destinataires.
   *
   * Délègue à `notifyMessageRecipients` : le corps vivait ici, `private` sous
   * `handleMentionsAndNotifications` (elle-même `private`), donc inatteignable
   * par tout écrivain hors de cette classe. Les deux routes de lien de partage
   * contournent `MessagingService` en entier — un message envoyé par lien ne
   * produisait ni push, ni notification in-app, ni ligne `Notification`.
   */
  private async triggerAllNotifications(
    message: Message,
    data: { senderId: string; conversationId: string },
    processedContent: string,
    validatedMentionUserIds: string[]
  ): Promise<void> {
    await notifyMessageRecipients({
      prisma: this.prisma as unknown as FanOutPrisma,
      notificationService: this.notificationService as unknown as MessageNotificationTarget | undefined,
      message,
      senderParticipantId: data.senderId,
      conversationId: data.conversationId,
      processedContent,
      validatedMentionUserIds,
      onError: (error) => logger.error('[MessageProcessor] Error triggering notifications', error),
      onFanOut: ({ mentions, regular, reply }) => logger.info(
        `[MessageProcessor] Notifications triggered for ${message.id}: ${mentions} mentions, ${regular} messages, reply=${reply}`
      ),
    });
  }

  /**
   * Extract mentions from content
   */
  extractMentions(content: string): string[] {
    return this.mentionService.extractMentions(content);
  }

  /**
   * Check if content contains links
   */
  containsLinks(content: string): boolean {
    return /https?:\/\/[^\s]+/.test(content);
  }

  /**
   * Gèle un snapshot du post cité (`metadata.postReplyTo`) au moment de la
   * réponse. Best-effort : en cas d'échec ou de post introuvable, retourne null
   * (l'enrichissement GET retombe sur la résolution live de `storyReplyToId`).
   */
  private async capturePostReplyTo(postId: string): Promise<PostReplyTo | null> {
    try {
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        select: POST_REPLY_SNAPSHOT_SELECT,
      });
      if (!post) return null;
      return buildPostReplyTo(post);
    } catch (error) {
      enhancedLogger.warn('capturePostReplyTo failed', { postId, error });
      return null;
    }
  }
}
