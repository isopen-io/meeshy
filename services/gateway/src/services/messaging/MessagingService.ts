/**
 * Messaging Service - Orchestrator
 * Main entry point for message handling with composition of validator and processor
 */

import { PrismaClient, Message } from '@meeshy/shared/prisma/client';
import type {
  MessageRequest,
  MessageResponse
} from '@meeshy/shared/types';
import { MessageTranslationService } from '../message-translation/MessageTranslationService';
import { MessageReadStatusService } from '../MessageReadStatusService';
import { NotificationService } from '../notifications/NotificationService';
import { MessageValidator } from './MessageValidator';
import { MessageProcessor } from './MessageProcessor';
import { queueMessageTranslation, runMessagePostSaveEffects } from './messagePostSaveEffects';
import {
  admitMessageForward,
  describeForwardRefusal,
  isForwardRefused,
  sanitizeForwardReferences
} from './forwardAdmission';
import {
  admitConversationWrite,
  isConversationWriteRefused,
  describeConversationWriteRefusal
} from './conversationWriteAdmission';
import { enhancedLogger, performanceLogger } from '../../utils/logger-enhanced';
import { getCachedParticipant, cacheParticipant } from '../../utils/participant-lookup-cache';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';

const logger = enhancedLogger.child({ module: 'MessagingService' });

export class MessagingService {
  private validator: MessageValidator;
  private processor: MessageProcessor;
  private readStatusService: MessageReadStatusService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly translationService: MessageTranslationService,
    notificationService?: NotificationService
  ) {
    this.validator = new MessageValidator(prisma);
    this.processor = new MessageProcessor(prisma, notificationService, translationService);
    this.readStatusService = new MessageReadStatusService(prisma);
  }

  /**
   * Point d'entrée principal pour l'envoi de messages
   * Utilisé par REST et WebSocket endpoints
   *
   * @param participantId - The Participant.id of the sender (resolved by auth middleware)
   */
  async handleMessage(
    request: MessageRequest,
    participantId: string
  ): Promise<MessageResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    const corr: Record<string, any> = {
      clientMessageId: request.clientMessageId,
      conversationId: request.conversationId,
      participantId,
      requestId
    };

    logger.info('perf:messaging.handleMessage', {
      ...corr, step: 'messaging.handleMessage', phase: 'start'
    });

    try {
      // 0. Assainissement des références de transfert — AVANT la validation,
      //    pour qu'un `forwardedFromId` illisible ne compte pas comme contenu :
      //    dégradé ici, un forward-only malformé tombe en CONTENT_EMPTY
      //    explicite au lieu d'une « Erreur interne » à l'écriture Prisma.
      request = sanitizeForwardReferences(request);

      // 1. Validation de la requête
      const validationResult = await performanceLogger.withTiming(
        'messaging.validateRequest',
        () => this.validator.validateRequest(request),
        corr
      );
      if (!validationResult.isValid) {
        return this.createErrorResponse(validationResult.errors[0].message);
      }

      // 2. Résolution de l'ID de conversation
      const conversationId = await performanceLogger.withTiming(
        'messaging.resolveConversationId',
        () => this.validator.resolveConversationId(request.conversationId),
        corr
      );
      if (!conversationId) {
        return this.createErrorResponse('Conversation non trouvée');
      }

      // 3. Vérification des permissions via Participant
      let participant = await performanceLogger.withTiming(
        'messaging.participantLookup',
        async () => {
          const cached = getCachedParticipant(participantId, conversationId);
          if (cached) return cached;

          let p = await this.prisma.participant.findUnique({
            where: { id: participantId },
            select: { id: true, conversationId: true, isActive: true }
          });
          if (!p || p.conversationId !== conversationId) {
            logger.error('DEPRECATED: userId passed as participantId — caller must pass Participant.id', { participantId, conversationId });
            p = await this.prisma.participant.findFirst({
              where: { userId: participantId, conversationId, isActive: true },
              select: { id: true, conversationId: true, isActive: true }
            });
          }
          if (!p) {
            p = await this.ensureParticipantFromMember(participantId, conversationId);
          }
          if (p) {
            cacheParticipant(participantId, conversationId, p);
          }
          return p;
        },
        { ...corr, conversationId }
      );

      if (!participant || !participant.isActive) {
        return this.createErrorResponse(
          'Permissions insuffisantes pour envoyer des messages'
        );
      }

      // 3.5. Early dedup — runs after participant verification (security gate
      //      stays intact) but before language detection, link processing, and
      //      encryption context. Handles sequential retries with one DB read.
      //      Concurrent retries still resolve via the P2002 catch in saveMessage.
      if (request.clientMessageId) {
        const earlyHit = await performanceLogger.withTiming(
          'messaging.earlyDedupCheck',
          () => this.prisma.message.findFirst({
            where: { conversationId, clientMessageId: request.clientMessageId },
            // Fetch the sender relation so `createSuccessResponse` resolves
            // `senderId` to the User.id (clients compare it to their own
            // userId). Without it a sequential retry would return the raw
            // Participant.id — the concurrent P2002 dedup path in
            // MessageProcessor.saveMessage already carries this same shape.
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
              }
            }
          }),
          corr
        );
        if (earlyHit) {
          // Flag the in-process dedup marker so the caller (MessageHandler)
          // suppresses the `message:new` re-broadcast / agent-notify / stats
          // side effects. Without it, a sequential retry on the same
          // clientMessageId re-broadcasts the bubble to every recipient. This
          // mirrors the P2002 concurrent-retry path in MessageProcessor.saveMessage.
          (earlyHit as { isDuplicate?: boolean }).isDuplicate = true;
          const translations = (earlyHit as { translations?: unknown }).translations;
          if (this.isTranslationsEmpty(translations)) {
            void this.queueTranslation(earlyHit, earlyHit.originalLanguage ?? 'fr').catch((err) =>
              logger.error('background re-translation failed on early dedup', err as Error)
            );
          }
          logger.info('perf:messaging.handleMessage', {
            ...corr, step: 'messaging.handleMessage', phase: 'end',
            durationMs: Date.now() - startTime, messageId: earlyHit.id, earlyDedupHit: true
          });
          return this.createSuccessResponse(earlyHit);
        }
      }

      // 3.6. Admission par l'ÉTAT DU CONTENEUR — la clôture, puis le rang
      //      d'écriture, puis le mode lent. Aucune des gardes traversées jusqu'ici ne lit l'état de
      //      la conversation : celle du dessus porte bien un `isActive`, mais
      //      c'est celui du `Participant`, et fermer une conversation ne touche
      //      aucune ligne `Participant`. Le drapeau `isAnnouncementChannel` ne
      //      gouvernait rien non plus — sa règle vivait dans
      //      `MessageValidator.checkPermissions`, sans un seul appelant de
      //      production. `slowModeSeconds` était le troisième du même genre :
      //      réglable depuis l'écran de réglages iOS, diffusé aux clients, et
      //      appliqué par personne. Voir `conversationWriteAdmission`.
      //
      //      Posé ICI, comme `admitMessageForward` plus bas, parce que les
      //      trois transports d'envoi convergent sur `handleMessage`.
      //
      //      APRÈS le dedup précoce, et c'est la seule position juste : sur un
      //      rejeu la ligne existe déjà — le message avait été accepté quand la
      //      conversation était ouverte. Le refuser maintenant ferait marquer
      //      « échoué » un message pourtant délivré à tous ses destinataires.
      //
      //      AVANT la détection de langue : quand le client omet
      //      `originalLanguage`, l'étape suivante paie un aller-retour HTTP
      //      vers le translator. Un envoi qui va être refusé ne doit pas
      //      l'acheter.
      const conversationAdmission = await performanceLogger.withTiming(
        'messaging.conversationWriteAdmission',
        () => admitConversationWrite(this.prisma, {
          conversationId,
          senderParticipantId: participant.id
        }),
        { ...corr, conversationId }
      );
      if (isConversationWriteRefused(conversationAdmission)) {
        logger.info('conversation write refused', {
          ...corr, conversationId, reason: conversationAdmission.reason,
          retryAfterSeconds: conversationAdmission.retryAfterSeconds
        });
        return this.createErrorResponse(
          describeConversationWriteRefusal(conversationAdmission)
        );
      }

      // 4. Détection de langue — trust the client's `originalLanguage` when
      //    provided. iOS detects it locally (ConversationViewModel:
      //    detectKeyboardLanguage()) and the web via navigator.language ;
      //    calling the translator just to validate the claim costs a full
      //    HTTP round-trip per message (~266 ms cold, ~11 ms warm) for zero
      //    practical gain — the validation never reverted a legit client
      //    claim in observed prod traffic. The detector is now ONLY invoked
      //    when the client omits `originalLanguage` entirely (anon flows,
      //    legacy clients).
      //
      //    The socket schema is `originalLanguage: z.string().optional()`, so an
      //    EMPTY / whitespace-only string is a valid payload (common when
      //    client-side detection fails). A nullish (`??`) guard would let `''`
      //    through and persist `Message.originalLanguage = ''`, which downstream
      //    broadcasts as `'fr'` (Prisme corruption). Trim-then-truthy is what
      //    forces those blank claims back onto the detector.
      //
      //    Canonicalise the trusted claim at this WRITE boundary (SSOT
      //    `normalizeLanguageCode`): clients send the raw platform locale — iOS
      //    `Locale.current` ('fr_FR'), web `navigator.language` ('fr-FR'), or a
      //    bare 'FR'. Persisting that verbatim fragments every downstream
      //    consumer keyed on `Message.originalLanguage` (NLLB source, translation
      //    cache key, per-language stats, admin analytics) and forced each of
      //    them to re-normalise defensively on read. Normalising once here makes
      //    the DB the single source of truth. Codes the SSOT cannot reduce
      //    (irreducible ISO 639-3 like 'bas', unknown 2-letter) are kept verbatim
      //    via the fallback — the claim is still trusted, never dropped.
      const claimedLanguage = request.originalLanguage?.trim();
      const originalLanguage = claimedLanguage
        ? (normalizeLanguageCode(claimedLanguage) ?? claimedLanguage)
        : (request.content
            ? await performanceLogger.withTiming(
                'messaging.detectLanguage',
                () => this.validator.detectLanguage(request.content!),
                corr
              )
            : 'fr');

      // 4.5. Admission du TRANSFERT — la dernière sortie de l'éphémère et de la
      //      vue unique. Une copie transférée est une ligne `Message`
      //      indépendante : sans ce garde elle naît sans échéance et sans
      //      budget, et survit à la destruction de l'original. Posé ICI parce
      //      que les trois transports d'envoi (REST, socket texte, socket
      //      pièces jointes) convergent sur `handleMessage` — un garde par
      //      route aurait été la quatrième copie d'une règle de permission.
      //
      //      Après le dedup précoce : sur un rejeu la ligne existe déjà, et
      //      relire la source ne servirait qu'à payer une lecture de plus.
      //
      //      `bodyOnlyFromSource` est le MIROIR de l'exemption de
      //      `MessageValidator.validateRequest` : ce que le validateur laisse
      //      passer sur la seule foi de `forwardedFromId`, ce garde le fait
      //      tenir. Sans lui, un transfert dont la source a disparu créait une
      //      ligne sans contenu, sans pièce jointe et sans chiffré — une bulle
      //      vide diffusée à tous. Les deux règles évoluent ensemble.
      const forwardAdmission = await admitMessageForward(this.prisma, {
        forwardedFromId: request.forwardedFromId,
        at: new Date(),
        bodyOnlyFromSource: this.bodyOnlyFromSource(request)
      });
      if (isForwardRefused(forwardAdmission)) {
        logger.info('forward refused', { ...corr, reason: forwardAdmission.reason });
        return this.createErrorResponse(describeForwardRefusal(forwardAdmission));
      }

      // 5. Sauvegarde du message en base. Phase 4 §6.2 — `clientMessageId`
      //    est propagé pour permettre le pattern catch-P2002 atomique au
      //    niveau Prisma (cf MessageProcessor.saveMessage). Si l'INSERT
      //    déclenche un duplicate-key, MessageProcessor relit l'existant
      //    et flague `(message as any).isDuplicate = true`.
      //
      //    `expiresAt` : l'échéance HÉRITÉE de la source prime sur celle que le
      //    client a (ou n'a pas) envoyée — c'est tout l'objet du garde
      //    ci-dessus. Le bit `EPHEMERAL` s'en déduit dans `saveMessage`.
      const message = await performanceLogger.withTiming(
        'messaging.saveMessage',
        () => this.processor.saveMessage({
          ...request,
          ...(forwardAdmission.expiresAt ? { expiresAt: forwardAdmission.expiresAt } : {}),
          originalLanguage,
          conversationId,
          senderId: participant!.id,
          mentionedUserIds: request.mentionedUserIds,
          encryptedContent: request.encryptedPayload?.ciphertext,
          encryptionMetadata: request.encryptedPayload ? {
            mode: 'e2ee',
            ...request.encryptedPayload
          } as unknown as import('@meeshy/shared/prisma/client').Prisma.InputJsonValue : undefined,
          clientMessageId: request.clientMessageId
        }),
        { ...corr, conversationId }
      );

      const isDuplicate =
        Boolean((message as { isDuplicate?: boolean }).isDuplicate);

      // The client ACK must be returned the instant the message is persisted —
      // it is what flips the sender's bubble from the pending clock to the
      // single checkmark. Every post-save side effect (conversation bump,
      // sender read-cursor, translation queue, stats) is therefore moved OFF
      // the ACK path and runs in the background. Both the Socket.IO and the
      // REST entry points funnel through `handleMessage`, so both inherit the
      // fast ACK.

      if (isDuplicate) {
        // Dedup hit: the first attempt already ran the side effects (mark as
        // read, conversation bump, stats). Re-translate ONLY when the stored
        // record has no translations — the translator was likely down on the
        // first attempt — and do it off the ACK path.
        const translations = (message as { translations?: unknown }).translations;
        if (this.isTranslationsEmpty(translations)) {
          void this.queueTranslation(message, originalLanguage).catch((err) =>
            logger.error('background re-translation failed', err as Error)
          );
        }
        const response = this.createSuccessResponse(message);
        logger.info('perf:messaging.handleMessage', {
          ...corr, step: 'messaging.handleMessage', phase: 'end',
          durationMs: Date.now() - startTime,
          messageId: message.id, dedupHit: true
        });
        return response;
      }

      // 6. Réponse unifiée — générée immédiatement après la persistance.
      const response = this.createSuccessResponse(message);

      // 7. Effets de bord post-save — exécutés en arrière-plan, JAMAIS sur le
      //    chemin de l'ACK (cf. note ci-dessus).
      this.runPostSaveSideEffects({
        message,
        conversationId,
        senderParticipantId: participant!.id,
        originalLanguage
      });

      logger.info('perf:messaging.handleMessage', {
        ...corr, step: 'messaging.handleMessage', phase: 'end',
        durationMs: Date.now() - startTime, messageId: message.id
      });

      return response;

    } catch (error) {
      logger.warn('perf:messaging.handleMessage', {
        ...corr, step: 'messaging.handleMessage', phase: 'end',
        durationMs: Date.now() - startTime, errored: true,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      logger.error('Error handling message', error as Error);
      return this.createErrorResponse(
        'Erreur interne lors de l\'envoi du message'
      );
    }
  }

  /**
   * Effets de bord post-save qui ne doivent JAMAIS retarder l'ACK client.
   *
   * Les trois que TOUT message committé doit à sa conversation — bump du
   * timestamp, mise en file de la traduction, statistiques de langue — vivent
   * dans `runMessagePostSaveEffects`, hors de cette classe : les routes de lien
   * de partage la contournent entièrement, et une obligation produit enfermée
   * dans un `private` n'est honorable que par les appelants de sa classe.
   *
   * Le quatrième reste ICI : l'avancement du curseur de lecture de l'auteur
   * demande un vrai `Participant`, ce que seul ce chemin garantit (la route de
   * lien authentifiée peut porter `{ id: userId }` synthétique pour la
   * conversation globale). Cf. le docstring de l'unité partagée.
   *
   * Chaque effet s'exécute indépendamment avec sa propre capture d'erreur — une
   * défaillance n'empêche pas les autres, et aucune ne bloque la réponse qui
   * fait passer la coche de l'expéditeur.
   */
  private runPostSaveSideEffects(args: {
    message: Message;
    conversationId: string;
    senderParticipantId: string;
    originalLanguage: string;
  }): void {
    const { message, conversationId, senderParticipantId, originalLanguage } = args;

    // `sender` et `attachments` viennent de l'`include` de `saveMessage` — les
    // seconds RAFRAÎCHIS après `handleAttachments` (ÉTAPE 4 bis), sans quoi le
    // comptage verrait la liste vide capturée par `message.create`.
    const saved = message as typeof message & {
      sender?: { userId?: string | null } | null;
      attachments?: Array<{ mimeType?: string | null }> | null;
    };

    runMessagePostSaveEffects({
      prisma: this.prisma,
      translationService: this.translationService,
      message: {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        senderUserId: saved.sender?.userId ?? null,
        attachmentMimeTypes: (saved.attachments ?? []).map((att) => att.mimeType ?? ''),
        content: message.content,
        messageType: message.messageType,
        replyToId: message.replyToId
      },
      originalLanguage,
      onError: (effect, err) =>
        logger.error(`post-save ${effect} failed`, err as Error)
    });

    void this.readStatusService
      .markMessagesAsRead(senderParticipantId, conversationId, message.id)
      .catch((err) =>
        logger.error('post-save markMessagesAsRead failed', err as Error)
      );
  }

  /**
   * Phase 4 §6.2.1 — `MessageTranslation` est un Json field embedded dans
   * `Message.translations` (cf prisma/schema.prisma). Le check de
   * "traductions absentes" est donc sur la taille du Json, pas sur un
   * `.length` de relation Prisma. Une dedup hit avec ce Json vide signifie
   * que le translator était down lors du premier insert : on re-pousse.
   */
  private isTranslationsEmpty(translations: unknown): boolean {
    if (!translations) return true;
    if (typeof translations !== 'object') return true;
    return Object.keys(translations as Record<string, unknown>).length === 0;
  }

  /**
   * RÈGLE JUMELLE de l'exemption de `MessageValidator.validateRequest` : les
   * mêmes trois porteurs de corps (texte, pièces jointes propres, payload
   * chiffré) — mais lus à l'endroit où l'on peut encore refuser. Le validateur
   * accepte un envoi qui n'a que `forwardedFromId` ; ce prédicat dit à
   * `admitMessageForward` que la source est alors le SEUL corps possible, donc
   * qu'une source muette ne doit rien faire naître.
   */
  private bodyOnlyFromSource(request: MessageRequest): boolean {
    if (!request.forwardedFromId) return false;
    const hasOwnAttachments =
      (request.attachments?.length ?? 0) > 0 || (request.attachmentIds?.length ?? 0) > 0;
    return !request.content?.trim() && !hasOwnAttachments && !request.encryptedPayload;
  }

  /**
   * Queue le message pour traduction asynchrone.
   * Phase 4 — `options.skip` permet aux dedup hits avec traductions déjà
   * présentes d'éviter le re-push ZMQ (les traductions existantes restent
   * la source de vérité).
   */
  private async queueTranslation(
    message: Message,
    originalLanguage: string,
    options: { skip?: boolean } = {}
  ): Promise<any> {
    if (options.skip) {
      return {
        status: 'skipped',
        languagesRequested: [],
        languagesCompleted: [],
        languagesFailed: []
      };
    }
    try {
      await queueMessageTranslation({
        translationService: this.translationService,
        message,
        originalLanguage
      });

      return {
        status: 'pending',
        languagesRequested: [],
        languagesCompleted: [],
        languagesFailed: [],
        estimatedCompletionTime: 1000
      };

    } catch (error) {
      logger.error('Error queuing translation', error as Error);
      return {
        status: 'failed',
        languagesRequested: [],
        languagesCompleted: [],
        languagesFailed: ['unknown']
      };
    }
  }

  /**
   * Génère une réponse de succès
   *
   * L'ACK porte le message persisté, et rien d'autre. Il traînait un bloc
   * `metadata` que personne ne lisait : les TROIS appelants de `handleMessage`
   * (`MessageHandler.handleMessageSend`, `handleMessageSendWithAttachments`,
   * `MeeshySocketIOManager.handleAgentResponse`) n'utilisent que `success`,
   * `data` et `error` — `_sendResponse` remplace même la réponse entière par
   * `buildMessageAckData(data)` avant de rappeler le client.
   *
   * Ce que le bloc annonçait ne se mesurait pas : `deliveryStatus` était
   * `{recipientCount: 1, deliveredCount: 1, readCount: 1}` en dur — un envoi
   * dans un groupe de douze annonçait « livré à 1, lu par 1 » à l'instant de
   * la persistance — et les sous-temps `dbQueryTime` / `translationQueueTime` /
   * `validationTime` étaient des fractions arbitraires du temps total. Le
   * `context`, lui, coûtait DEUX balayages du contenu (`extractMentions` +
   * `containsLinks`) sur le chemin que cette méthode garde délibérément libre
   * de tout effet de bord.
   *
   * Le compte des accusés faisant autorité vit dans
   * `MessageReadStatusService.getConversationReadStatuses` et sort par les
   * routes de messages ; s'il doit un jour accompagner l'ACK, c'est de là
   * qu'il viendra.
   */
  private createSuccessResponse(message: Message): MessageResponse {
    // CORRECTION senderId: message.senderId = Participant.id (FK Prisma).
    // Les clients comparent senderId avec leur userId → on normalise avant sérialisation.
    const senderObj = (message as any).sender;
    const resolvedSenderId = senderObj?.userId ?? senderObj?.user?.id ?? message.senderId;

    return {
      success: true,
      data: {
        ...message,
        senderId: resolvedSenderId,
        senderParticipantId: message.senderId,
        timestamp: message.createdAt
      } as any,
      message: 'Message envoyé avec succès'
    };
  }

  /**
   * Génère une réponse d'erreur
   */
  private createErrorResponse(error: string): MessageResponse {
    return {
      success: false,
      error,
      data: null as any
    };
  }

  /**
   * Expose le service de statuts de lecture pour utilisation externe
   */
  public getReadStatusService(): MessageReadStatusService {
    return this.readStatusService;
  }

  /**
   * Utilitaires
   */
  private generateRequestId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Auto-create a Participant from legacy ConversationMember data.
   * This bridges the gap between the old ConversationMember model and
   * the new unified Participant model during migration.
   */
  private async ensureParticipantFromMember(
    userId: string,
    conversationId: string
  ): Promise<{ id: string; conversationId: string; isActive: boolean } | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, displayName: true, firstName: true, lastName: true, avatar: true, ...RECIPIENT_LANG_SELECT }
      });
      if (!user) return null;

      // Check legacy ConversationMember collection via raw query
      const members = await (this.prisma as any).$runCommandRaw({
        find: 'ConversationMember',
        filter: {
          userId: { $oid: userId },
          conversationId: { $oid: conversationId },
          isActive: true
        },
        limit: 1
      });

      const memberDoc = members?.cursor?.firstBatch?.[0];
      if (!memberDoc) return null;

      const roleMap: Record<string, string> = {
        'CREATOR': 'admin',
        'ADMIN': 'admin',
        'MODERATOR': 'moderator',
        'MEMBER': 'member',
        'USER': 'member'
      };

      const participant = await this.prisma.participant.create({
        data: {
          conversationId,
          type: 'user',
          userId: user.id,
          displayName: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
          avatar: user.avatar,
          role: roleMap[memberDoc.role] || 'member',
          language: recipientLanguage(user, 'fr'),
          permissions: {
            canSendMessages: memberDoc.canSendMessage ?? true,
            canSendFiles: memberDoc.canSendFiles ?? true,
            canSendImages: memberDoc.canSendImages ?? true,
            canSendVideos: memberDoc.canSendVideos ?? false,
            canSendAudios: memberDoc.canSendAudios ?? false,
            canSendLocations: memberDoc.canSendLocations ?? false,
            canSendLinks: memberDoc.canSendLinks ?? false
          },
          isActive: true,
          joinedAt: memberDoc.joinedAt ? new Date(memberDoc.joinedAt) : new Date(),
          // Materialise deletedForMe = null explicitement. Sans cela, Prisma
          // n'ecrit PAS le champ dans MongoDB pour les fields optional non
          // initialises. Les filters de listing (`deletedForMe: null`) peuvent
          // ne pas matcher les docs ou le champ est absent — bug observe le
          // 2026-05-11 (10 Participants invisibles, conversations DM
          // disparues de la liste).
          deletedForMe: null
        },
        select: { id: true, conversationId: true, isActive: true }
      });

      logger.info('Auto-created Participant', { conversationId });
      return participant;
    } catch (error) {
      logger.error('Error auto-creating participant', error as Error);
      return null;
    }
  }
}
