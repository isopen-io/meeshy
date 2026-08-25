/**
 * Messaging Service
 * Handles all message-related Socket.IO operations
 * - Sending messages (with/without attachments)
 * - Editing messages
 * - Deleting messages
 * - Message encryption/decryption
 * - Message event listeners
 */

'use client';

import { logger } from '@/utils/logger';
import { SERVER_EVENTS, CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  AttachmentStatusUpdatedEventData,
  AttachmentUpdatedEventData,
  LinkMessageNewEventData,
  MessageConsumedEventData,
  MessagePinnedEventData,
  MessageUnpinnedEventData,
  MessageHiddenForMeEventData,
  MessageRestoredForMeEventData,
  ReactionUpdateEventData,
  MessageSendData,
  MessageSendWithAttachmentsData,
} from '@meeshy/shared/types/socketio-events';
import type {
  Message,
  SocketIOMessage
} from '@/types';
import type { EncryptedPayload } from '@meeshy/shared/types/encryption';
import { messageTypeForClientAttachments } from '@meeshy/shared/utils/attachment-message-type';
import type { AnonymousChatService } from '../anonymous-chat.service';
import type {
  TypedSocket,
  MessageListener,
  MessageEditListener,
  MessageDeleteListener,
  UnsubscribeFn,
  EncryptionHandlers,
  GetMessageByIdCallback,
  MessageSendOptions,
  MessageAckResponse
} from './types';

/**
 * L'accusé d'un envoi, tel que ce service le LIT. Volontairement permissif sur
 * la forme — c'est l'accusé de DEUX événements, servi par un serveur qui n'est
 * pas compilé ici, et chaque champ est déjà lu en optionnel.
 */
type SendAckResponse = {
  success?: boolean;
  data?: { messageId?: string; clientMessageId?: string };
  message?: string;
  error?: string;
};

/**
 * MessagingService
 * Single Responsibility: Handle all message operations
 */
export class MessagingService {
  private messageListeners: Set<MessageListener> = new Set();
  private editListeners: Set<MessageEditListener> = new Set();
  private deleteListeners: Set<MessageDeleteListener> = new Set();
  private mentionListeners: Set<(data: unknown) => void> = new Set();
  private consumedListeners: Set<(data: MessageConsumedEventData) => void> = new Set();
  private attachmentStatusListeners: Set<(data: AttachmentStatusUpdatedEventData) => void> = new Set();
  private messageAttachmentUpdatedListeners: Set<(data: AttachmentUpdatedEventData) => void> = new Set();
  private pendingDeliveredListeners: Set<(data: { count: number; conversationIds: string[] }) => void> = new Set();
  private linkMessageNewListeners: Set<(data: LinkMessageNewEventData) => void> = new Set();
  private messagePinnedListeners: Set<(data: MessagePinnedEventData) => void> = new Set();
  private messageUnpinnedListeners: Set<(data: MessageUnpinnedEventData) => void> = new Set();
  private messageRestoredForMeListeners: Set<(data: MessageRestoredForMeEventData) => void> = new Set();

  private encryptionHandlers: EncryptionHandlers | null = null;
  private getMessageByIdCallback: GetMessageByIdCallback | null = null;
  private currentUserId: string | null = null;
  private markReceivedTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private recentMessageIds: Map<string, number> = new Map();
  private typingRetractor: ((conversationId: string, userId: string) => void) | null = null;

  setCurrentUserId(userId: string | null): void {
    this.currentUserId = userId;
  }

  /**
   * Câble la rétractation de frappe : l'arrivée d'un message éteint
   * immédiatement l'indicateur « X écrit… » de son auteur.
   *
   * Le service ne connaît pas `TypingService` — il reçoit une closure opaque,
   * posée par l'orchestrateur qui possède les deux. C'est le seul endroit du
   * client web qui sait qu'un message VIENT D'ARRIVER avant toute autre
   * couche ; le `typing:stop` de l'expéditeur, lui, arrive par un canal
   * séparé, dans un ordre non garanti, et peut se perdre.
   */
  setTypingRetractor(retract: ((conversationId: string, userId: string) => void) | null): void {
    this.typingRetractor = retract;
  }

  private static senderIdOf(message: Message): string | undefined {
    const sender = message.sender;
    return sender?.userId ?? sender?.id ?? message.senderId;
  }

  private isOwnMessage(message: Message): boolean {
    if (!this.currentUserId) return false;
    return MessagingService.senderIdOf(message) === this.currentUserId;
  }

  private isDuplicateMessage(id: string): boolean {
    if (this.recentMessageIds.has(id)) return true;

    if (this.recentMessageIds.size >= 200) {
      const oldest = [...this.recentMessageIds.entries()].sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < 50; i++) {
        this.recentMessageIds.delete(oldest[i][0]);
      }
    }

    const ts = Date.now();
    this.recentMessageIds.set(id, ts);
    setTimeout(() => {
      if (this.recentMessageIds.get(id) === ts) {
        this.recentMessageIds.delete(id);
      }
    }, 300_000);

    return false;
  }

  private markAsReceivedDebounced(conversationId: string): void {
    if (this.markReceivedTimers.has(conversationId)) return;
    if (this.markReceivedTimers.size >= 100) return;
    const timer = setTimeout(async () => {
      this.markReceivedTimers.delete(conversationId);
      try {
        const { conversationsService } = await import('@/services/conversations.service');
        await conversationsService.markAsReceived(conversationId);
      } catch (error) {
        logger.debug('[MessagingService]', 'Failed to mark as received', { conversationId });
      }
    }, 500);
    this.markReceivedTimers.set(conversationId, timer);
  }

  /**
   * Check if encryption handlers are already configured
   */
  hasEncryptionHandlers(): boolean {
    return this.encryptionHandlers !== null;
  }

  /**
   * Set encryption handlers for E2EE support
   */
  setEncryptionHandlers(handlers: EncryptionHandlers): void {
    this.encryptionHandlers = handlers;
    logger.debug('[MessagingService]', 'Encryption handlers configured');
  }

  /**
   * Clear encryption handlers (on logout)
   */
  clearEncryptionHandlers(): void {
    this.encryptionHandlers = null;
    logger.debug('[MessagingService]', 'Encryption handlers cleared');
  }

  setGetMessageByIdCallback(callback: GetMessageByIdCallback): void {
    this.getMessageByIdCallback = callback;
  }

  /**
   * Check if conversation has encryption enabled
   */
  async isConversationEncrypted(conversationId: string): Promise<boolean> {
    if (!this.encryptionHandlers?.getConversationMode) {
      return false;
    }
    const mode = await this.encryptionHandlers.getConversationMode(conversationId);
    return mode !== null;
  }

  /**
   * Setup message event listeners on socket
   */
  setupEventListeners(socket: TypedSocket, convertMessageFn: (msg: SocketIOMessage) => Message): void {
    // New message
    socket.on(SERVER_EVENTS.MESSAGE_NEW, async (socketMessage) => {
      if (socketMessage.id && this.isDuplicateMessage(socketMessage.id)) return;

      let message: Message = convertMessageFn(socketMessage);

      // Un message rétracte la frappe qui l'annonçait — AVANT le déchiffrement.
      // Placé après ce point, la latence E2EE s'ajouterait à la rétractation et
      // l'indicateur « X écrit… » survivrait au message déjà affiché. Le
      // dedup ci-dessus est franchi en premier : un doublon ne rétracte pas
      // deux fois.
      const senderId = MessagingService.senderIdOf(message);
      if (this.typingRetractor && message.conversationId && senderId) {
        this.typingRetractor(message.conversationId, senderId);
      }

      // E2EE: Decrypt message if encrypted
      message = await this.decryptMessage(socketMessage, message);

      this.messageListeners.forEach(listener => listener(message));

      // Auto mark-as-received for messages from other users
      if (message.conversationId && !this.isOwnMessage(message)) {
        this.markAsReceivedDebounced(message.conversationId);
      }
    });

    // Edited message
    socket.on(SERVER_EVENTS.MESSAGE_EDITED, async (socketMessage) => {
      logger.debug('[MessagingService]', 'Message edited', { messageId: socketMessage.id });

      let message: Message = convertMessageFn(socketMessage);

      // E2EE: Decrypt edited message if encrypted
      message = await this.decryptMessage(socketMessage, message);

      this.editListeners.forEach(listener => listener(message));
    });

    // Deleted message
    socket.on(SERVER_EVENTS.MESSAGE_DELETED, (data) => {
      logger.debug('[MessagingService]', 'Message deleted', { messageId: data.messageId });
      this.deleteListeners.forEach(listener => listener(data.messageId));
    });

    // « Supprimer pour moi » venu d'un AUTRE appareil du même utilisateur.
    //
    // L'effet local est mot pour mot celui d'une suppression : la bulle s'en
    // va. On réutilise donc les mêmes écouteurs plutôt que d'écrire un second
    // retrait — deux implémentations du même geste auraient dérivé (l'aperçu de
    // la liste, les réponses qui pointent vers la bulle retirée).
    //
    // L'appareil qui a ÉMIS la requête reçoit l'événement lui aussi : la room
    // est celle de l'utilisateur, pas du socket. Le retrait y est idempotent —
    // il a déjà retiré la bulle en optimiste, et re-filtrer une liste qui ne la
    // contient plus ne change rien.
    socket.on(SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME, (data: MessageHiddenForMeEventData) => {
      logger.debug('[MessagingService]', 'Messages hidden for me', {
        count: data?.messages?.length ?? 0,
      });
      (data?.messages ?? []).forEach(({ messageId }) => {
        this.deleteListeners.forEach(listener => listener(messageId));
      });
    });

    // L'inverse. Une APPARITION ne peut pas être servie comme une tombstone :
    // l'appareil qui a retiré la bulle n'en détient plus le contenu. L'événement
    // ne porte donc que l'adresse, et le consommateur va rechercher.
    socket.on(SERVER_EVENTS.MESSAGE_RESTORED_FOR_ME, (data: MessageRestoredForMeEventData) => {
      logger.debug('[MessagingService]', 'Messages restored for me', {
        count: data?.messages?.length ?? 0,
      });
      this.messageRestoredForMeListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.MESSAGE_CONSUMED, (data: MessageConsumedEventData) => {
      this.consumedListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.ATTACHMENT_STATUS_UPDATED, (data: AttachmentStatusUpdatedEventData) => {
      this.attachmentStatusListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED, (data: AttachmentUpdatedEventData) => {
      this.messageAttachmentUpdatedListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.PENDING_MESSAGES_DELIVERED, (data: { count: number; conversationIds: string[] }) => {
      this.pendingDeliveredListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.LINK_MESSAGE_NEW, (data: LinkMessageNewEventData) => {
      this.linkMessageNewListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.MESSAGE_PINNED, (data: MessagePinnedEventData) => {
      this.messagePinnedListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.MESSAGE_UNPINNED, (data: MessageUnpinnedEventData) => {
      this.messageUnpinnedListeners.forEach(listener => listener(data));
    });

    socket.on(SERVER_EVENTS.MENTION_CREATED, (data: unknown) => {
      this.mentionListeners.forEach(listener => listener(data));
    });
  }

  /**
   * Decrypt message if it has encrypted content
   */
  private async decryptMessage(socketMessage: SocketIOMessage, message: Message): Promise<Message> {
    const socketMsg = socketMessage as SocketIOMessage & { encryptedContent?: string; encryptionMetadata?: { mode: string; keyId?: string; iv?: string; authTag?: string } };
    const encryptedContent = socketMsg.encryptedContent;
    const encryptionMetadata = socketMsg.encryptionMetadata;

    if (!encryptedContent || !encryptionMetadata || !this.encryptionHandlers?.decrypt) {
      return message;
    }

    try {
      const encryptedPayload: EncryptedPayload = {
        ciphertext: encryptedContent,
        metadata: {
          ...encryptionMetadata,
          protocol: (encryptionMetadata as unknown as { protocol?: string }).protocol ?? (encryptionMetadata.mode === 'e2ee' ? 'signal_v3' : 'aes-256-gcm'),
        } as EncryptedPayload['metadata']
      };
      const senderId = socketMessage.senderId;
      const decryptedContent = await this.encryptionHandlers.decrypt(encryptedPayload, senderId);

      return {
        ...message,
        content: decryptedContent,
        _isEncrypted: true,
        _encryptionMode: encryptionMetadata.mode
      } as Message & { _isEncrypted?: boolean; _encryptionMode?: string };

    } catch (decryptionError) {
      const errorMsg = decryptionError instanceof Error ? decryptionError.message : 'Unknown error';
      const decryptionErrorCode = errorMsg.includes('key')
        ? 'KEY_MISSING'
        : errorMsg.includes('session')
          ? 'SESSION_NOT_FOUND'
          : 'DECRYPTION_FAILED';
      logger.error('[MessagingService]', `Decryption failed (${decryptionErrorCode})`, { conversationId: message.conversationId, messageId: message.id });
      return {
        ...message,
        content: message.content || '[Encrypted message - Unable to decrypt]',
        _isEncrypted: true,
        _decryptionFailed: true,
        _decryptionErrorCode: decryptionErrorCode,
      } as Message & { _isEncrypted?: boolean; _decryptionFailed?: boolean; _decryptionErrorCode?: string };
    }
  }

  /**
   * Le chiffrement d'un message SORTANT, résolu en une valeur plutôt qu'appliqué
   * par mutation sur une charge déjà construite.
   *
   * Rend `null` quand la conversation n'est pas chiffrée, ou quand aucun
   * gestionnaire de chiffrement n'est câblé. Ne rend JAMAIS une enveloppe
   * partielle : un échec de chiffrement propage l'erreur, il ne dégrade pas
   * l'envoi en clair.
   *
   * `content` est rendu à côté de l'enveloppe parce que le mode `e2ee` le
   * REMPLACE par un littéral — c'est une décision de chiffrement, pas une
   * décision d'envoi, et elle appartient donc ici.
   */
  private async resolveOutgoingEncryption(
    conversationId: string,
    content: string
  ): Promise<{ content: string; encryptedContent: string; encryptionMetadata: EncryptedPayload['metadata'] } | null> {
    if (!this.encryptionHandlers?.encrypt || !this.encryptionHandlers?.getConversationMode) return null;

    try {
      const encryptionMode = await this.encryptionHandlers.getConversationMode(conversationId);
      if (!encryptionMode) return null;

      const encryptedPayload = await this.encryptionHandlers.encrypt(content, conversationId);
      if (!encryptedPayload) return null;

      logger.debug('[MessagingService]', 'Message encrypted', { conversationId, mode: encryptionMode });

      return {
        // En `e2ee` le clair ne quitte pas l'appareil : le champ `content` du
        // fil porte un littéral, et le chiffré porte le message. C'est ce
        // remplacement qui rend la liste EXPLICITE de mentionnés indispensable —
        // il ne reste aucun `@` que la passerelle puisse extraire.
        content: encryptionMode === 'e2ee' ? '[Encrypted]' : content,
        encryptedContent: encryptedPayload.ciphertext,
        encryptionMetadata: encryptedPayload.metadata,
      };
    } catch (encryptionError) {
      logger.error('[MessagingService]', 'Encryption failed — aborting send to prevent plaintext leak', { conversationId });
      throw encryptionError;
    }
  }

  /**
   * Send a message
   */
  async sendMessage(
    socket: TypedSocket | null,
    options: MessageSendOptions
  ): Promise<MessageAckResponse> {
    if (!socket || !socket.connected) {
      logger.warn('[MessagingService]', 'Socket not connected');
      return { success: false };
    }

    const {
      conversationId,
      content,
      originalLanguage,
      replyToId,
      forwardedFromId,
      forwardedFromConversationId,
      mentionedUserIds,
      attachmentIds,
      clientMessageId,
    } = options;

    try {
      const hasAttachments = attachmentIds && attachmentIds.length > 0;

      // Le chiffrement est RÉSOLU avant que la charge n'existe, et non appliqué
      // par mutation sur un `Record<string, unknown>` déjà construit. C'est ce
      // qui rend la charge déclarable : tant qu'elle se complétait après coup,
      // aucun type ne pouvait la décrire, et le seul contrat qui la gouvernait
      // était les deux `as unknown as` du site d'émission.
      //
      // La condition est ici, et pas seulement dans l'unité : sans elle, un
      // envoi de conversation NON chiffrée paierait un saut de microtâche avant
      // que l'échéance d'émission n'existe. Le chemin d'envoi reste synchrone
      // jusqu'à l'`emit` tant qu'aucun chiffrement n'est câblé.
      const envelope = this.encryptionHandlers
        ? await this.resolveOutgoingEncryption(conversationId, content)
        : null;

      // La charge, DÉCLARÉE contre le contrat que la passerelle compile.
      //
      // Portée exacte de cette garde, pour qu'on n'en attende pas plus qu'elle
      // ne tient : un champ REQUIS absent et un champ déclaré du MAUVAIS TYPE
      // sont refusés, y compris à travers les spreads conditionnels ci-dessous.
      // Un champ EXCÉDENTAIRE posé par un spread, lui, reste invisible — le
      // contrôle des propriétés excédentaires ne s'applique qu'aux clés écrites
      // directement dans le littéral. C'est celles-là qui portent le contrat.
      const base = {
        conversationId,
        content: envelope?.content ?? content,
        clientMessageId,
        ...(originalLanguage && { originalLanguage }),
        ...(replyToId && { replyToId }),
        ...(forwardedFromId && { forwardedFromId }),
        ...(forwardedFromConversationId && { forwardedFromConversationId }),
        // Les mentionnés que l'utilisateur a NOMMÉS dans le compositeur. La
        // passerelle retombe sinon sur l'extraction des `@` du contenu — un
        // repli qui ne peut rien quand `content` vaut `[Encrypted]`.
        ...(mentionedUserIds && mentionedUserIds.length > 0 && { mentionedUserIds }),
        ...(envelope && {
          encryptedContent: envelope.encryptedContent,
          encryptionMetadata: envelope.encryptionMetadata,
        }),
      };

      // `messageType` n'est PAS posé ici. Il n'a jamais atteint la base sur ce
      // chemin — `SocketMessageSendWithAttachmentsSchema` ne déclare aucun champ
      // de ce nom, et le handler dérive la même règle côté serveur. Il était
      // conservé au motif que « l'objet sert aussi de charge au repli REST » :
      // c'est faux, `sendMessageViaRest` RECONSTRUIT sa charge depuis `options`
      // et recalcule `messageType` lui-même. Le commentaire décrivait un
      // couplage qui n'existait pas.
      //
      // L'émission vit ICI, dans deux branches monomorphes portant chacune un
      // nom d'événement LITTÉRAL : c'est la seule forme que `TypedSocket`
      // vérifie réellement. Un nom en UNION effondre `EventParams` en union de
      // tuples, et laisse alors passer la charge de n'importe lequel des deux
      // membres sous n'importe quel autre.
      const wsResult = await this.emitWithTimeout(
        (ack) =>
          hasAttachments
            ? socket.emit(CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS, { ...base, attachmentIds }, ack)
            : socket.emit(CLIENT_EVENTS.MESSAGE_SEND, base, ack),
        10000
      );

      if (wsResult.success) {
        return {
          success: true,
          messageId: wsResult.messageId,
          clientMessageId: wsResult.clientMessageId,
        };
      }

      // On timeout: mark failed, do NOT fallback to REST (message:new may still arrive)
      if (wsResult.timedOut) {
        return { success: false, timedOut: true };
      }

      // Pas de repli REST pour un message chiffré — non parce que REST ne
      // saurait pas le porter (il le porte : `encryptedContent` y est déclaré,
      // validé et recomposé depuis toujours), mais parce que `sendMessageViaRest`
      // RECONSTRUIT sa charge depuis `options`, où l'enveloppe de chiffrement
      // n'existe pas. Se replier enverrait donc le message EN CLAIR.
      //
      // La phrase précédente — « REST can't handle E2EE yet » — désignait le
      // mauvais coupable, et c'est le socket qui perdait le chiffré : son
      // schéma strippait l'enveloppe en silence (corrigé côté passerelle,
      // `validation/encryption-envelope.ts`).
      if (envelope) {
        return { success: false };
      }

      // WebSocket ack error (not timeout) → REST fallback only if socket still connected
      if (!socket.connected) {
        return { success: false };
      }
      logger.warn('[MessagingService]', 'WebSocket ack failed, attempting REST fallback');
      return this.sendMessageViaRest(options);

    } catch (error) {
      logger.error('[MessagingService]', 'Error sending message', { error: error instanceof Error ? error.message : String(error) });
      return { success: false };
    }
  }

  /**
   * Edit a message
   */
  async editMessage(
    socket: TypedSocket | null,
    messageId: string,
    content: string
  ): Promise<boolean> {
    if (!socket || !socket.connected) {
      logger.warn('[MessagingService]', 'editMessage: socket not connected');
      return false;
    }

    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.MESSAGE_EDIT, { messageId, content }, (response) => {
        if (response?.success) {
          resolve(true);
        } else {
          logger.warn('[MessagingService]', 'Edit failed', response?.error || 'Unknown error');
          resolve(false);
        }
      });
    });
  }

  /**
   * Delete a message
   */
  async deleteMessage(
    socket: TypedSocket | null,
    messageId: string
  ): Promise<boolean> {
    if (!socket || !socket.connected) {
      logger.warn('[MessagingService]', 'deleteMessage: socket not connected');
      return false;
    }

    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.MESSAGE_DELETE, { messageId }, (response) => {
        if (response?.success) {
          resolve(true);
        } else {
          logger.warn('[MessagingService]', 'Delete failed', response?.error || 'Unknown error');
          resolve(false);
        }
      });
    });
  }

  /**
   * REST fallback when WebSocket send fails.
   *
   * An anonymous participant holds no JWT — only an `anon_*` session token —
   * so `POST /conversations/:id/messages` cannot authenticate them and the
   * fallback answered 401 for every anonymous sender: a WebSocket ack error
   * lost the message outright, with no recovery path. Their endpoint is the
   * share-link route, which authenticates on `X-Session-Token`.
   */
  private async sendMessageViaRest(options: MessageSendOptions): Promise<MessageAckResponse> {
    const { anonymousChatService } = await import('../anonymous-chat.service');
    if (anonymousChatService.canSendViaLink()) {
      return this.sendMessageViaLinkRest(anonymousChatService, options);
    }

    try {
      const { conversationsService } = await import('../conversations');

      const response = await conversationsService.sendMessage(options.conversationId, {
        clientMessageId: options.clientMessageId,
        content: options.content,
        originalLanguage: options.originalLanguage,
        // Le SEUL des deux chemins où cette valeur est AUTORITATIVE : la route
        // REST accepte l'enum `messageType`, la persiste, et la dérivation
        // serveur (`deriveMessageTypeForAttachments`) est additive — elle ne
        // repasse jamais derrière une déclaration explicite. Ce que le client
        // dit ici, personne ne le corrige.
        messageType: messageTypeForClientAttachments({
          hasAttachments: !!options.attachmentIds?.length,
          mimeTypes: options.attachmentMimeTypes ?? [],
        }),
        replyToId: options.replyToId,
        forwardedFromId: options.forwardedFromId,
        forwardedFromConversationId: options.forwardedFromConversationId,
        // Les mentionnés nommés par l'utilisateur. `POST /messages` les déclare
        // et les honore ; ce repli les laissait tomber, si bien qu'un message
        // parti par REST après un accusé socket en échec ne notifiait que ceux
        // que l'extraction des `@` du contenu retrouvait.
        mentionedUserIds: options.mentionedUserIds,
        attachmentIds: options.attachmentIds,
      });

      logger.info('[MessagingService]', 'Message sent via REST fallback');
      const msg = response as Message & { data?: { id?: string } };
      return {
        success: true,
        messageId: msg.data?.id ?? msg.id,
        clientMessageId: options.clientMessageId,
      };
    } catch (error) {
      logger.error('[MessagingService]', 'REST fallback also failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false };
    }
  }

  /**
   * REST fallback for an anonymous sender, over the share-link route.
   *
   * The caller's `clientMessageId` travels with the request and comes back in
   * the 201 body: it is the only key linking the server message to the
   * optimistic row already on screen. Minting a fresh one here — or reading the
   * server's `messageId` alone — would leave the optimistic row unreconciled
   * and the message rendered twice.
   */
  private async sendMessageViaLinkRest(
    anonymousChatService: AnonymousChatService,
    options: MessageSendOptions
  ): Promise<MessageAckResponse> {
    try {
      const result = await anonymousChatService.sendMessage({
        content: options.content,
        originalLanguage: options.originalLanguage,
        replyToId: options.replyToId,
        clientMessageId: options.clientMessageId,
      });

      logger.info('[MessagingService]', 'Message sent via share-link REST fallback');
      return {
        success: true,
        messageId: result.messageId ?? result.message?.id,
        clientMessageId: result.message?.clientMessageId ?? options.clientMessageId,
      };
    } catch (error) {
      logger.error('[MessagingService]', 'Share-link REST fallback also failed', { error: error instanceof Error ? error.message : String(error) });
      return { success: false };
    }
  }

  /**
   * Emit with timeout protection — la plomberie du délai, et RIEN du contrat.
   *
   * Elle prenait auparavant `(socket, event, data)` et émettait elle-même, ce
   * qui l'obligeait à corréler nom→charge : deux événements aux charges
   * différentes, une seule signature, donc deux `as unknown as`. La corrélation
   * échouait non pas sur le contrat mais sur la FORME de la charge — un
   * `Record<string, unknown>` complété par mutation, qu'aucun type ne pouvait
   * décrire.
   *
   * Le geste : rendre l'émission à l'appelant, qui la fait en deux branches
   * monomorphes portant chacune un nom LITTÉRAL. `TypedSocket` vérifie alors la
   * charge de chaque branche contre `ClientToServerEvents`, sans une seule
   * assertion. Cette fonction-ci n'a plus à connaître ni le nom ni la charge :
   * elle ne sait que poser une échéance et normaliser l'accusé.
   */
  private async emitWithTimeout(
    emit: (ack: (response: SendAckResponse) => void) => void,
    timeoutMs: number
  ): Promise<MessageAckResponse> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn('[MessagingService]', 'Timeout: Server did not respond in time');
        resolve({ success: false, timedOut: true });
      }, timeoutMs);

      emit((response) => {
        clearTimeout(timeout);
        if (response?.success) {
          resolve({
            success: true,
            messageId: response.data?.messageId,
            clientMessageId: response.data?.clientMessageId,
          });
        } else {
          const errorMsg = response?.message || response?.error || 'Error sending message';
          logger.warn('[MessagingService]', `Send failed: ${errorMsg}`);
          resolve({ success: false });
        }
      });
    });
  }

  /**
   * Event listener: New message
   */
  onNewMessage(listener: MessageListener): UnsubscribeFn {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  /**
   * Event listener: Message edited
   */
  onMessageEdited(listener: MessageEditListener): UnsubscribeFn {
    this.editListeners.add(listener);
    return () => this.editListeners.delete(listener);
  }

  /**
   * Event listener: Message deleted
   */
  onMessageDeleted(listener: MessageDeleteListener): UnsubscribeFn {
    this.deleteListeners.add(listener);
    return () => this.deleteListeners.delete(listener);
  }

  /**
   * Event listener: un message masqué pour moi est revenu en vue.
   *
   * Pas de pendant `onMessageHiddenForMe` : le masquage est routé vers
   * `onMessageDeleted`, dont l'effet local est identique.
   */
  onMessageRestoredForMe(listener: (data: MessageRestoredForMeEventData) => void): UnsubscribeFn {
    this.messageRestoredForMeListeners.add(listener);
    return () => this.messageRestoredForMeListeners.delete(listener);
  }

  /**
   * Event listener: Mention created
   */
  onMentionCreated(listener: (data: unknown) => void): UnsubscribeFn {
    this.mentionListeners.add(listener);
    return () => this.mentionListeners.delete(listener);
  }

  onMessageConsumed(listener: (data: MessageConsumedEventData) => void): UnsubscribeFn {
    this.consumedListeners.add(listener);
    return () => this.consumedListeners.delete(listener);
  }

  onAttachmentStatusUpdated(listener: (data: AttachmentStatusUpdatedEventData) => void): UnsubscribeFn {
    this.attachmentStatusListeners.add(listener);
    return () => this.attachmentStatusListeners.delete(listener);
  }

  onMessageAttachmentUpdated(listener: (data: AttachmentUpdatedEventData) => void): UnsubscribeFn {
    this.messageAttachmentUpdatedListeners.add(listener);
    return () => this.messageAttachmentUpdatedListeners.delete(listener);
  }

  onPendingMessagesDelivered(listener: (data: { count: number; conversationIds: string[] }) => void): UnsubscribeFn {
    this.pendingDeliveredListeners.add(listener);
    return () => this.pendingDeliveredListeners.delete(listener);
  }

  onLinkMessageNew(listener: (data: LinkMessageNewEventData) => void): UnsubscribeFn {
    this.linkMessageNewListeners.add(listener);
    return () => this.linkMessageNewListeners.delete(listener);
  }

  onMessagePinned(listener: (data: MessagePinnedEventData) => void): UnsubscribeFn {
    this.messagePinnedListeners.add(listener);
    return () => this.messagePinnedListeners.delete(listener);
  }

  onMessageUnpinned(listener: (data: MessageUnpinnedEventData) => void): UnsubscribeFn {
    this.messageUnpinnedListeners.add(listener);
    return () => this.messageUnpinnedListeners.delete(listener);
  }

  /**
   * Cleanup all listeners
   */
  cleanup(): void {
    this.messageListeners.clear();
    this.editListeners.clear();
    this.deleteListeners.clear();
    this.mentionListeners.clear();
    this.consumedListeners.clear();
    this.attachmentStatusListeners.clear();
    this.messageAttachmentUpdatedListeners.clear();
    this.pendingDeliveredListeners.clear();
    this.linkMessageNewListeners.clear();
    this.messagePinnedListeners.clear();
    this.messageUnpinnedListeners.clear();
    this.markReceivedTimers.forEach(timer => clearTimeout(timer));
    this.markReceivedTimers.clear();
    this.recentMessageIds.clear();
    this.currentUserId = null;
  }

  /**
   * Get listener counts for diagnostics
   */
  getListenerCounts(): { message: number; edit: number; delete: number } {
    return {
      message: this.messageListeners.size,
      edit: this.editListeners.size,
      delete: this.deleteListeners.size
    };
  }
}
