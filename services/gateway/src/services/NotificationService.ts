/**
 * NotificationService - Gestion centralisée des notifications
 *
 * Responsabilités :
 * - Créer des notifications pour différents événements (messages, appels manqués, etc.)
 * - Émettre les notifications via Socket.IO en temps réel
 * - Gérer le formatage et la troncature du contenu
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';
import { notificationLogger, securityLogger } from '../utils/logger-enhanced';
import { SecuritySanitizer } from '../utils/sanitize';
import type { Server as SocketIOServer } from 'socket.io';
import * as fs from 'fs';

// ==============================================
// FIREBASE ADMIN SDK (OPTIONAL)
// ==============================================
let admin: any = null;
let firebaseInitialized = false;

try {
  admin = require('firebase-admin');
} catch (error) {
  logger.warn('[Notifications] firebase-admin not installed - Push notifications disabled');
  logger.warn('[Notifications] Install with: npm install firebase-admin');
}

export interface CreateNotificationData {
  userId: string;
  type: 'new_message' | 'new_conversation_direct' | 'new_conversation_group' | 'message_reply' | 'member_joined' | 'contact_request' | 'contact_accepted' | 'user_mentioned' | 'message_reaction' | 'missed_call' | 'system' | 'new_conversation' | 'message_edited'; // Anciens types maintenus pour compatibilité
  title: string;
  content: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  // Informations de l'expéditeur
  senderId?: string;
  senderUsername?: string;
  senderAvatar?: string;
  senderDisplayName?: string;
  senderFirstName?: string;
  senderLastName?: string;

  // Aperçu du message
  messagePreview?: string;

  // Références pour navigation
  conversationId?: string;
  messageId?: string;
  callSessionId?: string;
  friendRequestId?: string;
  reactionId?: string;

  // Données supplémentaires
  data?: any;
  expiresAt?: Date;
}

export interface NotificationEventData {
  id: string;
  userId: string;
  type: string;
  title: string;
  content: string;
  priority: string;
  isRead: boolean;
  createdAt: Date;

  // Informations enrichies
  senderId?: string;
  senderUsername?: string;
  senderAvatar?: string;
  senderDisplayName?: string;
  senderFirstName?: string;
  senderLastName?: string;
  messagePreview?: string;
  conversationId?: string;
  messageId?: string;
  callSessionId?: string;
  data?: any;
}

// ==============================================
// FIREBASE STATUS CHECKER
// ==============================================
class FirebaseStatusChecker {
  private static firebaseAvailable = false;
  private static checked = false;

  /**
   * Vérifie si Firebase Admin SDK est disponible et configuré
   * CRITICAL: Cette vérification ne doit JAMAIS crasher l'application
   */
  static checkFirebase(): boolean {
    if (this.checked) {
      return this.firebaseAvailable;
    }

    this.checked = true;

    try {
      // 1. Vérifier que le module firebase-admin est installé
      if (!admin) {
        logger.warn('[Notifications] Firebase Admin SDK not installed');
        logger.warn('[Notifications] → Push notifications DISABLED (WebSocket only)');
        this.firebaseAvailable = false;
        return false;
      }

      // 2. Vérifier la variable d'environnement
      const credPath = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
      if (!credPath) {
        logger.warn('[Notifications] FIREBASE_ADMIN_CREDENTIALS_PATH not configured');
        logger.warn('[Notifications] → Push notifications DISABLED (WebSocket only)');
        this.firebaseAvailable = false;
        return false;
      }

      // 3. Vérifier que le fichier de credentials existe
      if (!fs.existsSync(credPath)) {
        logger.warn(`[Notifications] Firebase credentials file not found: ${credPath}`);
        logger.warn('[Notifications] → Push notifications DISABLED (WebSocket only)');
        this.firebaseAvailable = false;
        return false;
      }

      // 4. Vérifier que le fichier est lisible et valide JSON
      try {
        const credContent = fs.readFileSync(credPath, 'utf8');
        JSON.parse(credContent); // Valider que c'est du JSON valide
      } catch (parseError) {
        logger.error('[Notifications] Firebase credentials file is invalid JSON:', parseError);
        logger.warn('[Notifications] → Push notifications DISABLED (WebSocket only)');
        this.firebaseAvailable = false;
        return false;
      }

      // 5. Initialiser Firebase Admin SDK
      try {
        if (!firebaseInitialized) {
          admin.initializeApp({
            credential: admin.credential.cert(credPath)
          });
          firebaseInitialized = true;
        }

        this.firebaseAvailable = true;
        logger.info('[Notifications] ✅ Firebase Admin SDK initialized successfully');
        logger.info('[Notifications] → Push notifications ENABLED (WebSocket + Firebase)');
        return true;

      } catch (initError) {
        logger.error('[Notifications] Firebase initialization failed:', initError);
        logger.warn('[Notifications] → Push notifications DISABLED (WebSocket only)');
        this.firebaseAvailable = false;
        return false;
      }

    } catch (error) {
      logger.error('[Notifications] Unexpected error during Firebase check:', error);
      logger.warn('[Notifications] → Push notifications DISABLED (WebSocket only)');
      this.firebaseAvailable = false;
      return false;
    }
  }

  /**
   * Vérifie si Firebase est disponible (sans réinitialiser)
   */
  static isFirebaseAvailable(): boolean {
    if (!this.checked) {
      this.checkFirebase();
    }
    return this.firebaseAvailable;
  }
}

export class NotificationService {
  private io: SocketIOServer | null = null;
  private userSocketsMap: Map<string, Set<string>> = new Map();

  // Anti-spam: tracking des mentions récentes par paire (sender, recipient)
  // Structure: Map<"senderId:recipientId", timestamp[]>
  private recentMentions: Map<string, number[]> = new Map();

  // Limite: max 5 mentions par minute d'un sender vers un recipient
  private readonly MAX_MENTIONS_PER_MINUTE = 5;
  private readonly MENTION_WINDOW_MS = 60000; // 1 minute

  // Compteurs de métriques
  private metrics = {
    notificationsCreated: 0,
    webSocketSent: 0,
    firebaseSent: 0,
    firebaseFailed: 0
  };

  constructor(private prisma: PrismaClient) {
    // Nettoyer les mentions anciennes toutes les 2 minutes
    setInterval(() => this.cleanupOldMentions(), 120000);

    // Vérifier Firebase au démarrage (ne crashe jamais)
    FirebaseStatusChecker.checkFirebase();
  }

  /**
   * Initialiser le service avec Socket.IO
   */
  setSocketIO(io: SocketIOServer, userSocketsMap: Map<string, Set<string>>) {
    this.io = io;
    this.userSocketsMap = userSocketsMap;
    logger.info('📢 NotificationService: Socket.IO initialized');
  }

  /**
   * Obtenir les métriques du service de notifications
   */
  getMetrics() {
    return {
      ...this.metrics,
      firebaseEnabled: FirebaseStatusChecker.isFirebaseAvailable()
    };
  }

  /**
   * Envoyer une notification push Firebase (avec fallback gracieux)
   * CRITICAL: Ne JAMAIS crasher si Firebase échoue
   */
  private async sendFirebasePushNotification(
    userId: string,
    notification: NotificationEventData
  ): Promise<boolean> {
    // 1. Vérifier si Firebase est disponible
    if (!FirebaseStatusChecker.isFirebaseAvailable()) {
      // Pas de Firebase, mais c'est OK - WebSocket fonctionne
      return false;
    }

    try {
      // 2. Récupérer le FCM token de l'utilisateur depuis la DB
      // NOTE: Il faudra ajouter un champ fcmToken dans le modèle User
      // Pour l'instant, on simule avec un token vide
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true } // TODO: Ajouter fcmToken quand le champ existera
      });

      if (!user) {
        logger.debug(`[Notifications] User ${userId} not found for FCM push`);
        return false;
      }

      // TODO: Récupérer le fcmToken réel
      // const fcmToken = user.fcmToken;
      const fcmToken = null; // Temporaire

      if (!fcmToken) {
        // Utilisateur n'a pas de token FCM enregistré
        // C'est normal, pas d'erreur
        return false;
      }

      // 3. Préparer le message Firebase
      const message = {
        token: fcmToken,
        notification: {
          title: notification.title,
          body: notification.content
        },
        data: {
          notificationId: notification.id,
          type: notification.type,
          conversationId: notification.conversationId || '',
          messageId: notification.messageId || '',
          ...(notification.data && { additionalData: JSON.stringify(notification.data) })
        },
        android: {
          priority: 'high' as const,
          notification: {
            sound: 'default',
            channelId: 'meeshy_notifications'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      // 4. Envoyer via Firebase (avec timeout)
      const response = await Promise.race([
        admin.messaging().send(message),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Firebase timeout')), 5000)
        )
      ]);

      this.metrics.firebaseSent++;
      logger.debug(`[Notifications] ✅ Firebase push sent successfully to ${userId}`);
      return true;

    } catch (error: any) {
      this.metrics.firebaseFailed++;

      // Logger l'erreur mais NE PAS crasher
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        logger.debug(`[Notifications] Invalid FCM token for user ${userId}, skipping`);
        // TODO: Nettoyer le token invalide de la DB
      } else {
        logger.error(`[Notifications] Firebase push failed for user ${userId}:`, error.message);
      }

      return false;
    }
  }

  /**
   * Nettoie les mentions anciennes du cache anti-spam
   */
  private cleanupOldMentions(): void {
    const now = Date.now();
    const cutoff = now - this.MENTION_WINDOW_MS;

    for (const [key, timestamps] of this.recentMentions.entries()) {
      // Filtrer les timestamps trop anciens
      const recent = timestamps.filter(ts => ts > cutoff);

      if (recent.length === 0) {
        this.recentMentions.delete(key);
      } else {
        this.recentMentions.set(key, recent);
      }
    }
  }

  /**
   * Vérifie si une notification de mention doit être créée (anti-spam)
   * @returns true si la notification doit être créée, false si rate-limitée
   */
  private shouldCreateMentionNotification(senderId: string, recipientId: string): boolean {
    const key = `${senderId}:${recipientId}`;
    const now = Date.now();
    const cutoff = now - this.MENTION_WINDOW_MS;

    // Récupérer les mentions récentes
    const timestamps = this.recentMentions.get(key) || [];

    // Filtrer les mentions dans la fenêtre temporelle
    const recentTimestamps = timestamps.filter(ts => ts > cutoff);

    // Vérifier la limite
    if (recentTimestamps.length >= this.MAX_MENTIONS_PER_MINUTE) {
      console.warn(
        `[NotificationService] Anti-spam: ${senderId} a déjà mentionné ${recipientId} ${recentTimestamps.length} fois dans la dernière minute`
      );
      return false;
    }

    // Ajouter le timestamp actuel
    recentTimestamps.push(now);
    this.recentMentions.set(key, recentTimestamps);

    return true;
  }

  /**
   * Tronquer un message à une longueur maximale (en mots pour le texte)
   */
  private truncateMessage(message: string, maxWords: number = 25): string {
    if (!message) return '';

    const words = message.trim().split(/\s+/);
    if (words.length <= maxWords) {
      return message;
    }
    return words.slice(0, maxWords).join(' ') + '...';
  }

  /**
   * Vérifier si l'utilisateur a activé ce type de notification
   */
  private async shouldSendNotification(userId: string, type: string): Promise<boolean> {
    try {
      const preferences = await this.prisma.notificationPreference.findUnique({
        where: { userId }
      });

      // Si aucune préférence, envoyer par défaut
      if (!preferences) {
        return true;
      }

      // Vérifier Do Not Disturb
      if (preferences.dndEnabled && preferences.dndStartTime && preferences.dndEndTime) {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        if (currentTime >= preferences.dndStartTime && currentTime <= preferences.dndEndTime) {
          logger.debug('📢 Notification supprimée (Do Not Disturb)', { userId, type });
          return false;
        }
      }

      // Vérifier les préférences par type
      switch (type) {
        case 'new_message':
          return preferences.newMessageEnabled;
        case 'message_reply':
          return preferences.replyEnabled || preferences.newMessageEnabled;
        case 'user_mentioned':
          return preferences.mentionEnabled || preferences.newMessageEnabled;
        case 'message_reaction':
          return preferences.reactionEnabled;
        case 'missed_call':
          return preferences.missedCallEnabled;
        case 'system':
          return preferences.systemEnabled;
        case 'new_conversation':
        case 'new_conversation_direct':
        case 'new_conversation_group':
        case 'message_edited':
          return preferences.conversationEnabled;
        case 'contact_request':
        case 'contact_accepted':
          return preferences.contactRequestEnabled;
        case 'member_joined':
          return preferences.memberJoinedEnabled;
        default:
          return true;
      }
    } catch (error) {
      logger.error('❌ Error checking notification preferences:', error);
      // En cas d'erreur, envoyer quand même
      return true;
    }
  }

  /**
   * Créer une notification et l'émettre en temps réel
   */
  async createNotification(data: CreateNotificationData): Promise<NotificationEventData | null> {
    try {
      // SECURITY: Validate notification type against whitelist
      if (!SecuritySanitizer.isValidNotificationType(data.type)) {
        securityLogger.logViolation('INVALID_NOTIFICATION_TYPE', {
          type: data.type,
          userId: data.userId
        });
        throw new Error(`Invalid notification type: ${data.type}`);
      }

      // SECURITY: Validate priority if provided
      if (data.priority && !SecuritySanitizer.isValidPriority(data.priority)) {
        securityLogger.logViolation('INVALID_NOTIFICATION_PRIORITY', {
          priority: data.priority,
          userId: data.userId
        });
        throw new Error(`Invalid notification priority: ${data.priority}`);
      }

      // Vérifier les préférences de l'utilisateur
      const shouldSend = await this.shouldSendNotification(data.userId, data.type);
      if (!shouldSend) {
        notificationLogger.debug('Notification skipped due to user preferences', {
          type: data.type,
          userId: data.userId
        });
        return null;
      }

      notificationLogger.info('Creating notification', {
        type: data.type,
        userId: data.userId,
        conversationId: data.conversationId
      });

      // SECURITY: Sanitize all text inputs before storing
      const sanitizedTitle = SecuritySanitizer.sanitizeText(data.title);
      const sanitizedContent = SecuritySanitizer.sanitizeText(data.content);
      const sanitizedSenderUsername = data.senderUsername
        ? SecuritySanitizer.sanitizeUsername(data.senderUsername)
        : undefined;
      const sanitizedSenderAvatar = data.senderAvatar
        ? SecuritySanitizer.sanitizeURL(data.senderAvatar)
        : undefined;
      const sanitizedSenderDisplayName = data.senderDisplayName
        ? SecuritySanitizer.sanitizeText(data.senderDisplayName)
        : undefined;
      const sanitizedSenderFirstName = data.senderFirstName
        ? SecuritySanitizer.sanitizeText(data.senderFirstName)
        : undefined;
      const sanitizedSenderLastName = data.senderLastName
        ? SecuritySanitizer.sanitizeText(data.senderLastName)
        : undefined;
      const sanitizedMessagePreview = data.messagePreview
        ? SecuritySanitizer.sanitizeText(data.messagePreview)
        : undefined;

      // SECURITY: Sanitize JSON data object
      const sanitizedData = data.data
        ? SecuritySanitizer.sanitizeJSON(data.data)
        : null;

      // Créer la notification en base de données avec données sanitizées
      const notification = await this.prisma.notification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: sanitizedTitle,
          content: sanitizedContent,
          priority: data.priority || 'normal',
          senderId: data.senderId,
          senderUsername: sanitizedSenderUsername,
          senderAvatar: sanitizedSenderAvatar,
          senderDisplayName: sanitizedSenderDisplayName,
          senderFirstName: sanitizedSenderFirstName,
          senderLastName: sanitizedSenderLastName,
          messagePreview: sanitizedMessagePreview,
          conversationId: data.conversationId,
          messageId: data.messageId,
          callSessionId: data.callSessionId,
          data: sanitizedData ? JSON.stringify(sanitizedData) : null,
          expiresAt: data.expiresAt,
          isRead: false
        }
      });

      // Créer l'événement pour Socket.IO
      const notificationEvent: NotificationEventData = {
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        content: notification.content,
        priority: notification.priority,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
        senderId: notification.senderId || undefined,
        senderUsername: notification.senderUsername || undefined,
        senderAvatar: notification.senderAvatar || undefined,
        senderDisplayName: notification.senderDisplayName || undefined,
        senderFirstName: notification.senderFirstName || undefined,
        senderLastName: notification.senderLastName || undefined,
        messagePreview: notification.messagePreview || undefined,
        conversationId: notification.conversationId || undefined,
        messageId: notification.messageId || undefined,
        callSessionId: notification.callSessionId || undefined,
        data: notification.data ? JSON.parse(notification.data) : undefined
      };

      // Incrémenter les métriques
      this.metrics.notificationsCreated++;

      // 1. Émettre via WebSocket (TOUJOURS en priorité)
      this.emitNotification(data.userId, notificationEvent);

      // 2. Tenter d'envoyer via Firebase Push (FALLBACK GRACIEUX)
      // CRITICAL: Ne JAMAIS bloquer ou crasher si Firebase échoue
      if (FirebaseStatusChecker.isFirebaseAvailable()) {
        // Fire-and-forget: on n'attend pas le résultat
        this.sendFirebasePushNotification(data.userId, notificationEvent)
          .catch(error => {
            // Logger silencieusement, ne pas propager l'erreur
            logger.debug('[Notifications] Firebase push skipped:', error.message);
          });
      }

      logger.info('✅ Notification created and emitted', {
        notificationId: notification.id,
        type: notification.type,
        webSocketSent: this.io !== null,
        firebaseAvailable: FirebaseStatusChecker.isFirebaseAvailable()
      });

      return notificationEvent;
    } catch (error) {
      logger.error('❌ Error creating notification:', error);
      return null;
    }
  }

  /**
   * Créer une notification pour un nouveau message
   */
  async createMessageNotification(data: {
    recipientId: string;
    senderId: string;
    senderUsername: string;
    senderAvatar?: string;
    senderDisplayName?: string;
    senderFirstName?: string;
    senderLastName?: string;
    messageContent: string;
    conversationId: string;
    messageId: string;
    conversationIdentifier?: string;
    conversationType?: string;
    conversationTitle?: string;
    attachments?: Array<{ id: string; filename: string; mimeType: string; fileSize: number }>;
  }): Promise<NotificationEventData | null> {
    let messagePreview: string;
    let attachmentInfo: any = null;

    // Si le message a des attachments, créer un aperçu spécial
    if (data.attachments && data.attachments.length > 0) {
      const attachment = data.attachments[0];
      const attachmentType = attachment.mimeType.split('/')[0]; // image, video, audio, application

      // Créer une description de l'attachment
      let attachmentDescription = '';
      switch (attachmentType) {
        case 'image':
          attachmentDescription = '📷 Photo';
          break;
        case 'video':
          attachmentDescription = '🎥 Vidéo';
          break;
        case 'audio':
          attachmentDescription = '🎵 Audio';
          break;
        case 'application':
          if (attachment.mimeType === 'application/pdf') {
            attachmentDescription = '📄 PDF';
          } else {
            attachmentDescription = '📎 Document';
          }
          break;
        default:
          attachmentDescription = '📎 Fichier';
      }

      // Si plusieurs attachments
      if (data.attachments.length > 1) {
        attachmentDescription += ` (+${data.attachments.length - 1})`;
      }

      // Combiner le texte du message (s'il y en a) avec l'aperçu d'attachment
      if (data.messageContent && data.messageContent.trim().length > 0) {
        const textPreview = this.truncateMessage(data.messageContent, 15);
        messagePreview = `${textPreview} ${attachmentDescription}`;
      } else {
        messagePreview = attachmentDescription;
      }

      // Ajouter les infos d'attachment pour le frontend
      attachmentInfo = {
        count: data.attachments.length,
        firstType: attachmentType,
        firstFilename: attachment.filename,
        firstMimeType: attachment.mimeType
      };
    } else {
      messagePreview = this.truncateMessage(data.messageContent, 25);
    }

    // Le titre sera construit côté frontend à partir des données brutes
    // On garde un titre minimal comme fallback
    const title = 'Nouveau message';

    return this.createNotification({
      userId: data.recipientId,
      type: 'new_message',
      title, // Titre fallback (le frontend construira le vrai titre)
      content: messagePreview,
      priority: 'normal',
      senderId: data.senderId,
      senderUsername: data.senderUsername,
      senderAvatar: data.senderAvatar,
      senderDisplayName: data.senderDisplayName,
      senderFirstName: data.senderFirstName,
      senderLastName: data.senderLastName,
      messagePreview,
      conversationId: data.conversationId,
      messageId: data.messageId,
      data: {
        conversationIdentifier: data.conversationIdentifier,
        conversationType: data.conversationType,
        conversationTitle: data.conversationTitle,
        attachments: attachmentInfo
      }
    });
  }

  /**
   * Créer une notification pour un appel manqué
   */
  async createMissedCallNotification(data: {
    recipientId: string;
    callerId: string;
    callerUsername: string;
    callerAvatar?: string;
    conversationId: string;
    callSessionId: string;
    callType?: 'video' | 'audio';
  }): Promise<NotificationEventData | null> {
    const callTypeLabel = data.callType === 'audio' ? 'audio' : 'vidéo';

    // Récupérer les informations complètes de l'appelant
    const senderInfo = await this.fetchSenderInfo(data.callerId);
    if (!senderInfo) {
      // Fallback si l'utilisateur n'est pas trouvé
      return this.createNotification({
        userId: data.recipientId,
        type: 'missed_call',
        title: `Appel ${callTypeLabel} manqué`,
        content: `Appel manqué de ${data.callerUsername}`,
        priority: 'high',
        senderId: data.callerId,
        senderUsername: data.callerUsername,
        senderAvatar: data.callerAvatar,
        conversationId: data.conversationId,
        callSessionId: data.callSessionId,
        data: {
          callType: data.callType || 'video'
        }
      });
    }

    return this.createNotification({
      userId: data.recipientId,
      type: 'missed_call',
      title: `Appel ${callTypeLabel} manqué`,
      content: `Appel manqué`,
      priority: 'high',
      senderId: data.callerId,
      senderUsername: senderInfo.senderUsername,
      senderAvatar: senderInfo.senderAvatar,
      senderDisplayName: senderInfo.senderDisplayName,
      senderFirstName: senderInfo.senderFirstName,
      senderLastName: senderInfo.senderLastName,
      conversationId: data.conversationId,
      callSessionId: data.callSessionId,
      data: {
        callType: data.callType || 'video'
      }
    });
  }

  /**
   * Créer une notification pour une nouvelle conversation / invitation
   */
  async createConversationInviteNotification(data: {
    invitedUserId: string;
    inviterId: string;
    inviterUsername: string;
    inviterAvatar?: string;
    conversationId: string;
    conversationTitle?: string | null;
    conversationType: string;
  }): Promise<NotificationEventData | null> {
    // Récupérer les informations complètes de l'inviteur
    const senderInfo = await this.fetchSenderInfo(data.inviterId);

    // Déterminer le contenu selon le type de conversation
    let title: string;
    let content: string;

    if (data.conversationType === 'direct') {
      // Conversation directe: juste le nom de l'inviteur
      // Le titre sera construit côté frontend
      title = 'Nouvelle conversation';
      content = senderInfo
        ? 'a démarré une conversation avec vous'
        : `${data.inviterUsername} a démarré une conversation avec vous`;
    } else {
      // Conversation de groupe: nom de l'inviteur + titre de la conversation
      const conversationName = data.conversationTitle || 'une conversation';
      // Le titre sera construit côté frontend
      title = 'Invitation de groupe';
      content = senderInfo
        ? `vous a invité à rejoindre ${conversationName}`
        : `${data.inviterUsername} vous a invité à rejoindre ${conversationName}`;
    }

    return this.createNotification({
      userId: data.invitedUserId,
      type: 'new_conversation',
      title,
      content,
      priority: 'normal',
      senderId: data.inviterId,
      senderUsername: senderInfo?.senderUsername || data.inviterUsername,
      senderAvatar: senderInfo?.senderAvatar || data.inviterAvatar,
      senderDisplayName: senderInfo?.senderDisplayName,
      senderFirstName: senderInfo?.senderFirstName,
      senderLastName: senderInfo?.senderLastName,
      conversationId: data.conversationId,
      data: {
        conversationTitle: data.conversationTitle,
        conversationType: data.conversationType,
        action: 'view_conversation'
      }
    });
  }

  /**
   * Créer une notification pour rejoindre une conversation via lien
   */
  async createConversationJoinNotification(data: {
    userId: string;
    conversationId: string;
    conversationTitle?: string | null;
    conversationType: string;
    isJoiner: boolean; // true = utilisateur qui rejoint, false = admin qui est notifié
    joinerUsername?: string; // Nom de l'utilisateur qui rejoint (pour les admins)
    joinerAvatar?: string;
  }): Promise<NotificationEventData | null> {
    let title: string;
    let content: string;

    if (data.isJoiner) {
      // Notification de confirmation pour l'utilisateur qui rejoint
      const conversationName = data.conversationTitle || 'la conversation';
      // Le titre sera construit côté frontend
      title = 'Bienvenue';
      content = `Vous avez rejoint ${conversationName} avec succès`;

      return this.createNotification({
        userId: data.userId,
        type: 'new_conversation',
        title,
        content,
        priority: 'normal',
        conversationId: data.conversationId,
        data: {
          conversationTitle: data.conversationTitle,
          conversationType: data.conversationType,
          action: 'view_conversation',
          joinType: 'via_link'
        }
      });
    } else {
      // Notification pour les admins qu'un nouveau membre a rejoint
      const conversationName = data.conversationTitle || 'la conversation';
      const joinerName = data.joinerUsername || 'Un utilisateur';
      // Le titre sera construit côté frontend
      title = 'Nouveau membre';
      content = `${joinerName} a rejoint ${conversationName} via un lien partagé`;

      // Pour les admins, on peut récupérer les infos du joiner si on a son ID
      // mais dans cette fonction on n'a pas forcément le senderId, donc on utilise juste le username

      return this.createNotification({
        userId: data.userId,
        type: 'new_conversation',
        title,
        content,
        priority: 'low',
        senderUsername: data.joinerUsername,
        senderAvatar: data.joinerAvatar,
        conversationId: data.conversationId,
        data: {
          conversationTitle: data.conversationTitle,
          conversationType: data.conversationType,
          joinerUsername: data.joinerUsername,
          action: 'view_conversation',
          notificationType: 'member_joined'
        }
      });
    }
  }

  /**
   * PERFORMANCE: Créer des notifications de mention en batch (évite N+1 queries)
   * Crée toutes les notifications en une seule query avec createMany
   *
   * @param mentionedUserIds - Liste des IDs d'utilisateurs mentionnés
   * @param commonData - Données communes à toutes les notifications
   * @param memberIds - IDs des membres de la conversation (pour déterminer isMember)
   * @returns Nombre de notifications créées
   */
  async createMentionNotificationsBatch(
    mentionedUserIds: string[],
    commonData: {
      senderId: string;
      senderUsername: string;
      senderAvatar?: string;
      senderDisplayName?: string;
      senderFirstName?: string;
      senderLastName?: string;
      messageContent: string;
      conversationId: string;
      conversationTitle?: string | null;
      messageId: string;
      attachments?: Array<{ id: string; filename: string; mimeType: string; fileSize: number }>;
    },
    memberIds: string[]
  ): Promise<number> {
    if (mentionedUserIds.length === 0) {
      return 0;
    }

    try {
      // Préparer le messagePreview et attachmentInfo (une fois pour tous)
      let messagePreview: string;
      let attachmentInfo: any = null;

      if (commonData.attachments && commonData.attachments.length > 0) {
        const attachment = commonData.attachments[0];
        const attachmentType = attachment.mimeType.split('/')[0];

        let attachmentDescription = '';
        switch (attachmentType) {
          case 'image': attachmentDescription = '📷 Photo'; break;
          case 'video': attachmentDescription = '🎥 Vidéo'; break;
          case 'audio': attachmentDescription = '🎵 Audio'; break;
          case 'application':
            attachmentDescription = attachment.mimeType === 'application/pdf' ? '📄 PDF' : '📎 Document';
            break;
          default: attachmentDescription = '📎 Fichier';
        }

        if (commonData.attachments.length > 1) {
          attachmentDescription += ` (+${commonData.attachments.length - 1})`;
        }

        if (commonData.messageContent && commonData.messageContent.trim().length > 0) {
          const textPreview = this.truncateMessage(commonData.messageContent, 15);
          messagePreview = `${textPreview} ${attachmentDescription}`;
        } else {
          messagePreview = attachmentDescription;
        }

        attachmentInfo = {
          count: commonData.attachments.length,
          firstType: attachmentType,
          firstFilename: attachment.filename,
          firstMimeType: attachment.mimeType
        };
      } else {
        messagePreview = this.truncateMessage(commonData.messageContent, 20);
      }

      // Le titre sera construit côté frontend
      const title = 'Mention';
      const mentionPrefix = '';

      // Filtrer les utilisateurs qui ont dépassé le rate limit
      const validMentionedUserIds: string[] = [];
      for (const mentionedUserId of mentionedUserIds) {
        // Ne pas créer de notification pour le sender
        if (mentionedUserId === commonData.senderId) continue;

        // SÉCURITÉ: Vérifier le rate limit
        if (!this.shouldCreateMentionNotification(commonData.senderId, mentionedUserId)) {
          console.log(`[NotificationService] Notification de mention bloquée (rate limit): ${commonData.senderId} → ${mentionedUserId}`);
          continue;
        }

        validMentionedUserIds.push(mentionedUserId);
      }

      if (validMentionedUserIds.length === 0) {
        console.log('[NotificationService] Aucune notification de mention à créer après filtrage rate limit');
        return 0;
      }

      // Vérifier les préférences de notification pour chaque utilisateur
      const usersToNotify: string[] = [];
      await Promise.all(
        validMentionedUserIds.map(async (userId) => {
          const shouldSend = await this.shouldSendNotification(userId, 'user_mentioned');
          if (shouldSend) {
            usersToNotify.push(userId);
          }
        })
      );

      if (usersToNotify.length === 0) {
        console.log('[NotificationService] Aucune notification de mention à créer après vérification des préférences');
        return 0;
      }

      // Préparer les données pour createMany
      const notificationsData = usersToNotify.map(mentionedUserId => {
        const isMember = memberIds.includes(mentionedUserId);

        // Déterminer le contenu et les données selon si l'utilisateur est membre
        let content: string;
        let notificationData: any;

        if (isMember) {
          content = `${mentionPrefix} ${messagePreview}`;
          notificationData = {
            conversationTitle: commonData.conversationTitle,
            isMember: true,
            action: 'view_message',
            attachments: attachmentInfo
          };
        } else {
          content = `${mentionPrefix} ${messagePreview}\n\nVous n'êtes pas membre de cette conversation. Cliquez pour la rejoindre.`;
          notificationData = {
            conversationTitle: commonData.conversationTitle,
            isMember: false,
            action: 'join_conversation',
            attachments: attachmentInfo
          };
        }

        return {
          userId: mentionedUserId,
          type: 'user_mentioned',
          title,
          content,
          priority: 'normal',
          senderId: commonData.senderId,
          senderUsername: commonData.senderUsername,
          senderAvatar: commonData.senderAvatar,
          senderDisplayName: commonData.senderDisplayName,
          senderFirstName: commonData.senderFirstName,
          senderLastName: commonData.senderLastName,
          messagePreview,
          conversationId: commonData.conversationId,
          messageId: commonData.messageId,
          data: JSON.stringify(notificationData),
          isRead: false
        };
      });

      // PERFORMANCE: Créer toutes les notifications en une seule query
      // Note: skipDuplicates n'est pas supporté avec MongoDB
      const result = await this.prisma.notification.createMany({
        data: notificationsData
      });

      console.log(`[NotificationService] ✅ Created ${result.count} mention notifications in batch`);

      // Récupérer les notifications créées pour les émettre via Socket.IO
      // Note: createMany ne retourne pas les objets créés, on doit les récupérer
      const createdNotifications = await this.prisma.notification.findMany({
        where: {
          messageId: commonData.messageId,
          type: 'user_mentioned',
          userId: { in: usersToNotify }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: usersToNotify.length
      });

      // Émettre les notifications via Socket.IO
      for (const notification of createdNotifications) {
        this.emitNotification(notification.userId, this.formatNotificationEvent(notification));
      }

      return result.count;
    } catch (error) {
      console.error('[NotificationService] ❌ Error creating batch mention notifications:', error);
      return 0;
    }
  }

  /**
   * Créer une notification pour une mention d'utilisateur
   * SÉCURITÉ: Limite à 5 mentions/minute d'un sender vers un recipient
   * NOTE: Préférer createMentionNotificationsBatch pour des performances optimales
   */
  async createMentionNotification(data: {
    mentionedUserId: string;
    senderId: string;
    senderUsername: string;
    senderAvatar?: string;
    senderDisplayName?: string;
    senderFirstName?: string;
    senderLastName?: string;
    messageContent: string;
    conversationId: string;
    conversationTitle?: string | null;
    messageId: string;
    isMemberOfConversation: boolean;
    attachments?: Array<{ id: string; filename: string; mimeType: string; fileSize: number }>;
  }): Promise<NotificationEventData | null> {
    // SÉCURITÉ: Anti-spam - Vérifier le rate limit
    if (!this.shouldCreateMentionNotification(data.senderId, data.mentionedUserId)) {
      console.log(`[NotificationService] Notification de mention bloquée (rate limit): ${data.senderId} → ${data.mentionedUserId}`);
      return null;
    }
    // Traiter le message avec attachments si présents
    let messagePreview: string;
    let attachmentInfo: any = null;

    if (data.attachments && data.attachments.length > 0) {
      const attachment = data.attachments[0];
      const attachmentType = attachment.mimeType.split('/')[0];

      // Créer une description de l'attachment
      let attachmentDescription = '';
      switch (attachmentType) {
        case 'image':
          attachmentDescription = '📷 Photo';
          break;
        case 'video':
          attachmentDescription = '🎥 Vidéo';
          break;
        case 'audio':
          attachmentDescription = '🎵 Audio';
          break;
        case 'application':
          if (attachment.mimeType === 'application/pdf') {
            attachmentDescription = '📄 PDF';
          } else {
            attachmentDescription = '📎 Document';
          }
          break;
        default:
          attachmentDescription = '📎 Fichier';
      }

      // Si plusieurs attachments
      if (data.attachments.length > 1) {
        attachmentDescription += ` (+${data.attachments.length - 1})`;
      }

      // Combiner le texte avec l'aperçu d'attachment
      if (data.messageContent && data.messageContent.trim().length > 0) {
        const textPreview = this.truncateMessage(data.messageContent, 15);
        messagePreview = `${textPreview} ${attachmentDescription}`;
      } else {
        messagePreview = attachmentDescription;
      }

      // Ajouter les infos d'attachment
      attachmentInfo = {
        count: data.attachments.length,
        firstType: attachmentType,
        firstFilename: attachment.filename,
        firstMimeType: attachment.mimeType
      };
    } else {
      // Tronquer le message à 20 mots pour l'aperçu
      messagePreview = this.truncateMessage(data.messageContent, 20);
    }

    // Le titre sera construit côté frontend
    const title = 'Mention';

    // Déterminer le contenu et les données selon si l'utilisateur est membre
    let content: string;
    let notificationData: any;

    if (data.isMemberOfConversation) {
      // Utilisateur est membre: afficher l'aperçu du message
      content = messagePreview;
      notificationData = {
        conversationTitle: data.conversationTitle,
        isMember: true,
        action: 'view_message',
        attachments: attachmentInfo
      };
    } else {
      // Utilisateur n'est pas membre: invitation à rejoindre
      content = `${messagePreview}\n\nVous n'êtes pas membre de cette conversation. Cliquez pour la rejoindre.`;
      notificationData = {
        conversationTitle: data.conversationTitle,
        isMember: false,
        action: 'join_conversation',
        attachments: attachmentInfo
      };
    }

    return this.createNotification({
      userId: data.mentionedUserId,
      type: 'user_mentioned',
      title,
      content,
      priority: 'normal',
      senderId: data.senderId,
      senderUsername: data.senderUsername,
      senderAvatar: data.senderAvatar,
      senderDisplayName: data.senderDisplayName,
      senderFirstName: data.senderFirstName,
      senderLastName: data.senderLastName,
      messagePreview,
      conversationId: data.conversationId,
      messageId: data.messageId,
      data: notificationData
    });
  }

  /**
   * Émettre une notification via Socket.IO
   * CRITICAL: Ne JAMAIS crasher, juste logger et continuer
   */
  private emitNotification(userId: string, notification: NotificationEventData) {
    try {
      if (!this.io) {
        logger.warn('⚠️ Socket.IO not initialized, cannot emit notification');
        return;
      }

      // Récupérer tous les sockets de l'utilisateur
      const userSockets = this.userSocketsMap.get(userId);

      if (!userSockets || userSockets.size === 0) {
        logger.debug('📢 User not connected, notification saved for later', { userId });
        return;
      }

      // Émettre la notification à tous les sockets de l'utilisateur
      userSockets.forEach(socketId => {
        this.io!.to(socketId).emit('notification', notification);
        logger.debug('📢 Notification emitted to socket', {
          socketId,
          notificationId: notification.id,
          type: notification.type
        });
      });

      // Incrémenter métrique
      this.metrics.webSocketSent++;

      logger.info('📢 Notification broadcasted to user', {
        userId,
        socketCount: userSockets.size,
        notificationId: notification.id
      });
    } catch (error) {
      logger.error('❌ Error emitting notification via WebSocket:', error);
      // Ne pas crasher, juste logger
    }
  }

  /**
   * Marquer une notification comme lue
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      await this.prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId
        },
        data: {
          isRead: true
        }
      });
      return true;
    } catch (error) {
      logger.error('❌ Error marking notification as read:', error);
      return false;
    }
  }

  /**
   * Marquer toutes les notifications d'un utilisateur comme lues
   */
  async markAllAsRead(userId: string): Promise<boolean> {
    try {
      await this.prisma.notification.updateMany({
        where: {
          userId,
          isRead: false
        },
        data: {
          isRead: true
        }
      });
      return true;
    } catch (error) {
      logger.error('❌ Error marking all notifications as read:', error);
      return false;
    }
  }

  /**
   * Supprimer une notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
      await this.prisma.notification.deleteMany({
        where: {
          id: notificationId,
          userId
        }
      });
      return true;
    } catch (error) {
      logger.error('❌ Error deleting notification:', error);
      return false;
    }
  }

  /**
   * Récupérer le nombre de notifications non lues
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      return await this.prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });
    } catch (error) {
      logger.error('❌ Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Marquer toutes les notifications d'une conversation comme lues
   * Cette méthode est appelée automatiquement quand l'utilisateur ouvre une conversation
   * et marque les messages comme lus
   */
  async markConversationNotificationsAsRead(userId: string, conversationId: string): Promise<number> {
    try {
      const result = await this.prisma.notification.updateMany({
        where: {
          userId,
          conversationId,
          isRead: false
        },
        data: {
          isRead: true
        }
      });

      logger.info('✅ Marked conversation notifications as read', {
        userId,
        conversationId,
        count: result.count
      });

      return result.count;
    } catch (error) {
      logger.error('❌ Error marking conversation notifications as read:', error);
      return 0;
    }
  }

  // ==============================================
  // NOUVELLES MÉTHODES - SYSTÈME DE NOTIFICATIONS V2
  // ==============================================

  /**
   * Créer une notification de réponse à un message
   */
  async createReplyNotification(data: {
    originalMessageAuthorId: string;
    replierId: string;
    replierUsername: string;
    replierAvatar?: string;
    replyContent: string;
    conversationId: string;
    conversationTitle?: string;
    originalMessageId: string;
    replyMessageId: string;
    attachments?: Array<{ id: string; filename: string; mimeType: string; fileSize: number }>;
  }): Promise<NotificationEventData | null> {
    // Ne pas notifier si l'auteur répond à son propre message
    if (data.originalMessageAuthorId === data.replierId) {
      return null;
    }

    // Récupérer les informations complètes du répondeur
    const senderInfo = await this.fetchSenderInfo(data.replierId);
    if (!senderInfo) {
      // Fallback si l'utilisateur n'est pas trouvé
      const messagePreview = this.formatMessagePreview(data.replyContent, data.attachments);
      return this.createNotification({
        userId: data.originalMessageAuthorId,
        type: 'message_reply',
        title: 'Réponse',
        content: messagePreview,
        priority: 'normal',
        senderId: data.replierId,
        senderUsername: data.replierUsername,
        senderAvatar: data.replierAvatar,
        messagePreview,
        conversationId: data.conversationId,
        messageId: data.replyMessageId,
        data: {
          originalMessageId: data.originalMessageId,
          conversationTitle: data.conversationTitle,
          attachments: this.formatAttachmentInfo(data.attachments),
          action: 'view_message'
        }
      });
    }

    const messagePreview = this.formatMessagePreview(
      data.replyContent,
      data.attachments
    );

    // Le titre sera construit côté frontend
    const title = 'Réponse';
    const content = messagePreview;

    return this.createNotification({
      userId: data.originalMessageAuthorId,
      type: 'message_reply',
      title,
      content,
      priority: 'normal',
      senderId: data.replierId,
      senderUsername: senderInfo.senderUsername,
      senderAvatar: senderInfo.senderAvatar,
      senderDisplayName: senderInfo.senderDisplayName,
      senderFirstName: senderInfo.senderFirstName,
      senderLastName: senderInfo.senderLastName,
      messagePreview,
      conversationId: data.conversationId,
      messageId: data.replyMessageId,
      data: {
        originalMessageId: data.originalMessageId,
        conversationTitle: data.conversationTitle,
        attachments: this.formatAttachmentInfo(data.attachments),
        action: 'view_message'
      }
    });
  }

  /**
   * Créer des notifications pour des membres qui rejoignent un groupe (batch)
   * Envoyées uniquement aux admins/créateur
   */
  async createMemberJoinedNotification(data: {
    groupId: string;
    groupTitle: string;
    newMemberId: string;
    newMemberUsername: string;
    newMemberAvatar?: string;
    adminIds: string[];
    joinMethod?: 'via_link' | 'invited';
  }): Promise<number> {
    if (data.adminIds.length === 0) return 0;

    // Récupérer les informations complètes du nouveau membre
    const senderInfo = await this.fetchSenderInfo(data.newMemberId);

    // Le titre sera construit côté frontend
    const title = 'Nouveau membre';
    const content = `${senderInfo?.senderDisplayName || senderInfo?.senderFirstName || data.newMemberUsername} a rejoint le groupe`;

    // Créer en batch pour tous les admins
    const notificationsData = data.adminIds.map(adminId => ({
      userId: adminId,
      type: 'member_joined',
      title,
      content,
      priority: 'low',
      senderId: data.newMemberId,
      senderUsername: senderInfo?.senderUsername || data.newMemberUsername,
      senderAvatar: senderInfo?.senderAvatar || data.newMemberAvatar,
      senderDisplayName: senderInfo?.senderDisplayName,
      senderFirstName: senderInfo?.senderFirstName,
      senderLastName: senderInfo?.senderLastName,
      conversationId: data.groupId,
      data: JSON.stringify({
        groupTitle: data.groupTitle,
        joinMethod: data.joinMethod || 'invited',
        action: 'view_conversation'
      }),
      isRead: false
    }));

    try {
      const result = await this.prisma.notification.createMany({
        data: notificationsData
      });

      // Récupérer les notifications créées pour les émettre via Socket.IO
      const createdNotifications = await this.prisma.notification.findMany({
        where: {
          conversationId: data.groupId,
          type: 'member_joined',
          userId: { in: data.adminIds },
          senderId: data.newMemberId
        },
        orderBy: { createdAt: 'desc' },
        take: data.adminIds.length
      });

      for (const notification of createdNotifications) {
        this.emitNotification(notification.userId, this.formatNotificationEvent(notification));
      }

      logger.info('✅ Created member joined notifications', {
        count: result.count,
        groupId: data.groupId
      });

      return result.count;
    } catch (error) {
      logger.error('❌ Error creating member joined notifications:', error);
      return 0;
    }
  }

  /**
   * Créer une notification de demande de contact
   */
  async createContactRequestNotification(data: {
    recipientId: string;
    requesterId: string;
    requesterUsername: string;
    requesterAvatar?: string;
    message?: string;
    friendRequestId: string;
  }): Promise<NotificationEventData | null> {
    // Récupérer les informations complètes du demandeur
    const senderInfo = await this.fetchSenderInfo(data.requesterId);
    if (!senderInfo) {
      // Fallback si l'utilisateur n'est pas trouvé
      const content = data.message || `${data.requesterUsername} vous a envoyé une invitation`;
      return this.createNotification({
        userId: data.recipientId,
        type: 'contact_request',
        title: 'Demande de contact',
        content,
        priority: 'high',
        senderId: data.requesterId,
        senderUsername: data.requesterUsername,
        senderAvatar: data.requesterAvatar,
        data: {
          friendRequestId: data.friendRequestId,
          message: data.message,
          action: 'accept_or_reject_contact'
        }
      });
    }

    // Le titre sera construit côté frontend
    const title = 'Demande de contact';
    const content = data.message || 'Nouvelle demande de contact';

    return this.createNotification({
      userId: data.recipientId,
      type: 'contact_request',
      title,
      content,
      priority: 'high',
      senderId: data.requesterId,
      senderUsername: senderInfo.senderUsername,
      senderAvatar: senderInfo.senderAvatar,
      senderDisplayName: senderInfo.senderDisplayName,
      senderFirstName: senderInfo.senderFirstName,
      senderLastName: senderInfo.senderLastName,
      data: {
        friendRequestId: data.friendRequestId,
        message: data.message,
        action: 'accept_or_reject_contact'
      }
    });
  }

  /**
   * Créer une notification d'acceptation de contact
   */
  async createContactAcceptedNotification(data: {
    requesterId: string;
    accepterId: string;
    accepterUsername: string;
    accepterAvatar?: string;
    conversationId: string;
  }): Promise<NotificationEventData | null> {
    // Récupérer les informations complètes de celui qui accepte
    const senderInfo = await this.fetchSenderInfo(data.accepterId);
    if (!senderInfo) {
      // Fallback
      return this.createNotification({
        userId: data.requesterId,
        type: 'contact_accepted',
        title: 'Contact accepté',
        content: `${data.accepterUsername} a accepté votre invitation. Vous pouvez maintenant discuter ensemble.`,
        priority: 'normal',
        senderId: data.accepterId,
        senderUsername: data.accepterUsername,
        senderAvatar: data.accepterAvatar,
        conversationId: data.conversationId,
        data: {
          conversationId: data.conversationId,
          action: 'view_conversation'
        }
      });
    }

    // Le titre sera construit côté frontend
    const title = 'Contact accepté';
    const content = 'a accepté votre invitation. Vous pouvez maintenant discuter ensemble.';

    return this.createNotification({
      userId: data.requesterId,
      type: 'contact_accepted',
      title,
      content,
      priority: 'normal',
      senderId: data.accepterId,
      senderUsername: senderInfo.senderUsername,
      senderAvatar: senderInfo.senderAvatar,
      senderDisplayName: senderInfo.senderDisplayName,
      senderFirstName: senderInfo.senderFirstName,
      senderLastName: senderInfo.senderLastName,
      conversationId: data.conversationId,
      data: {
        conversationId: data.conversationId,
        action: 'view_conversation'
      }
    });
  }

  /**
   * Créer une notification de réaction à un message
   */
  async createReactionNotification(data: {
    messageAuthorId: string;
    reactorId: string;
    reactorUsername: string;
    reactorAvatar?: string;
    emoji: string;
    messageContent: string;
    conversationId: string;
    conversationTitle?: string;
    messageId: string;
    reactionId: string;
  }): Promise<NotificationEventData | null> {
    // Ne pas notifier si l'utilisateur réagit à son propre message
    if (data.messageAuthorId === data.reactorId) {
      return null;
    }

    // Récupérer les informations complètes du réacteur
    const senderInfo = await this.fetchSenderInfo(data.reactorId);
    if (!senderInfo) {
      // Fallback
      const messagePreview = this.truncateMessage(data.messageContent, 15);
      return this.createNotification({
        userId: data.messageAuthorId,
        type: 'message_reaction',
        title: 'Réaction',
        content: `${data.emoji} ${messagePreview}`,
        priority: 'low',
        senderId: data.reactorId,
        senderUsername: data.reactorUsername,
        senderAvatar: data.reactorAvatar,
        messagePreview,
        conversationId: data.conversationId,
        messageId: data.messageId,
        data: {
          reactionId: data.reactionId,
          emoji: data.emoji,
          conversationTitle: data.conversationTitle,
          action: 'view_message'
        }
      });
    }

    const messagePreview = this.truncateMessage(data.messageContent, 15);
    // Le titre sera construit côté frontend
    const title = 'Réaction';
    const content = `${data.emoji} ${messagePreview}`;

    return this.createNotification({
      userId: data.messageAuthorId,
      type: 'message_reaction',
      title,
      content,
      priority: 'low',
      senderId: data.reactorId,
      senderUsername: senderInfo.senderUsername,
      senderAvatar: senderInfo.senderAvatar,
      senderDisplayName: senderInfo.senderDisplayName,
      senderFirstName: senderInfo.senderFirstName,
      senderLastName: senderInfo.senderLastName,
      messagePreview,
      conversationId: data.conversationId,
      messageId: data.messageId,
      data: {
        reactionId: data.reactionId,
        emoji: data.emoji,
        conversationTitle: data.conversationTitle,
        action: 'view_message'
      }
    });
  }

  /**
   * Créer une notification de nouvelle conversation directe
   */
  async createDirectConversationNotification(data: {
    invitedUserId: string;
    inviterId: string;
    inviterUsername: string;
    inviterAvatar?: string;
    conversationId: string;
  }): Promise<NotificationEventData | null> {
    // Récupérer les informations complètes de l'inviteur
    const senderInfo = await this.fetchSenderInfo(data.inviterId);
    if (!senderInfo) {
      // Fallback
      return this.createNotification({
        userId: data.invitedUserId,
        type: 'new_conversation_direct',
        title: 'Nouvelle conversation',
        content: `${data.inviterUsername} a démarré une conversation avec vous`,
        priority: 'normal',
        senderId: data.inviterId,
        senderUsername: data.inviterUsername,
        senderAvatar: data.inviterAvatar,
        conversationId: data.conversationId,
        data: {
          conversationType: 'direct',
          action: 'view_conversation'
        }
      });
    }

    // Le titre sera construit côté frontend
    const title = 'Nouvelle conversation';
    const content = 'a démarré une conversation avec vous';

    return this.createNotification({
      userId: data.invitedUserId,
      type: 'new_conversation_direct',
      title,
      content,
      priority: 'normal',
      senderId: data.inviterId,
      senderUsername: senderInfo.senderUsername,
      senderAvatar: senderInfo.senderAvatar,
      senderDisplayName: senderInfo.senderDisplayName,
      senderFirstName: senderInfo.senderFirstName,
      senderLastName: senderInfo.senderLastName,
      conversationId: data.conversationId,
      data: {
        conversationType: 'direct',
        action: 'view_conversation'
      }
    });
  }

  /**
   * Créer une notification de nouvelle conversation de groupe
   */
  async createGroupConversationNotification(data: {
    invitedUserId: string;
    inviterId: string;
    inviterUsername: string;
    inviterAvatar?: string;
    conversationId: string;
    conversationTitle: string;
  }): Promise<NotificationEventData | null> {
    // Récupérer les informations complètes de l'inviteur
    const senderInfo = await this.fetchSenderInfo(data.inviterId);
    if (!senderInfo) {
      // Fallback
      return this.createNotification({
        userId: data.invitedUserId,
        type: 'new_conversation_group',
        title: 'Invitation de groupe',
        content: `${data.inviterUsername} vous a invité à rejoindre ${data.conversationTitle}`,
        priority: 'normal',
        senderId: data.inviterId,
        senderUsername: data.inviterUsername,
        senderAvatar: data.inviterAvatar,
        conversationId: data.conversationId,
        data: {
          conversationTitle: data.conversationTitle,
          conversationType: 'group',
          action: 'view_conversation'
        }
      });
    }

    // Le titre sera construit côté frontend
    const title = 'Invitation de groupe';
    const content = `vous a invité à rejoindre ${data.conversationTitle}`;

    return this.createNotification({
      userId: data.invitedUserId,
      type: 'new_conversation_group',
      title,
      content,
      priority: 'normal',
      senderId: data.inviterId,
      senderUsername: senderInfo.senderUsername,
      senderAvatar: senderInfo.senderAvatar,
      senderDisplayName: senderInfo.senderDisplayName,
      senderFirstName: senderInfo.senderFirstName,
      senderLastName: senderInfo.senderLastName,
      conversationId: data.conversationId,
      data: {
        conversationTitle: data.conversationTitle,
        conversationType: 'group',
        action: 'view_conversation'
      }
    });
  }

  /**
   * Créer une notification système
   */
  async createSystemNotification(data: {
    userId: string;
    title: string;
    content: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    systemType?: 'maintenance' | 'security' | 'announcement' | 'feature';
    action?: string;
    expiresAt?: Date;
  }): Promise<NotificationEventData | null> {
    return this.createNotification({
      userId: data.userId,
      type: 'system',
      title: data.title,
      content: data.content,
      priority: data.priority || 'normal',
      expiresAt: data.expiresAt,
      data: {
        systemType: data.systemType || 'announcement',
        action: data.action || 'view_details'
      }
    });
  }

  // ==============================================
  // MÉTHODES HELPER PRIVÉES
  // ==============================================

  /**
   * Récupérer les informations complètes d'un utilisateur pour les notifications
   */
  private async fetchSenderInfo(senderId: string): Promise<{
    senderUsername: string;
    senderAvatar?: string;
    senderDisplayName?: string;
    senderFirstName?: string;
    senderLastName?: string;
  } | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: {
          username: true,
          avatar: true,
          displayName: true,
          firstName: true,
          lastName: true
        }
      });

      if (!user) {
        logger.warn(`[NotificationService] User ${senderId} not found for notification`);
        return null;
      }

      return {
        senderUsername: user.username,
        senderAvatar: user.avatar || undefined,
        senderDisplayName: user.displayName || undefined,
        senderFirstName: user.firstName,
        senderLastName: user.lastName
      };
    } catch (error) {
      logger.error(`[NotificationService] Error fetching sender info:`, error);
      return null;
    }
  }

  /**
   * Formater les informations d'attachment pour les notifications
   */
  private formatAttachmentInfo(attachments?: Array<{ id: string; filename: string; mimeType: string; fileSize: number }>): any {
    if (!attachments || attachments.length === 0) return null;

    const firstAttachment = attachments[0];
    const attachmentType = firstAttachment.mimeType.split('/')[0];

    return {
      count: attachments.length,
      firstType: attachmentType,
      firstFilename: firstAttachment.filename,
      firstMimeType: firstAttachment.mimeType
    };
  }

  /**
   * Formater un message avec attachments pour l'aperçu de notification
   */
  private formatMessagePreview(
    messageContent: string,
    attachments?: Array<{ id: string; filename: string; mimeType: string; fileSize: number }>
  ): string {
    let messagePreview: string;

    if (attachments && attachments.length > 0) {
      const attachment = attachments[0];
      const attachmentType = attachment.mimeType.split('/')[0];

      let attachmentDescription = '';
      switch (attachmentType) {
        case 'image':
          attachmentDescription = '📷 Photo';
          break;
        case 'video':
          attachmentDescription = '🎥 Vidéo';
          break;
        case 'audio':
          attachmentDescription = '🎵 Audio';
          break;
        case 'application':
          if (attachment.mimeType === 'application/pdf') {
            attachmentDescription = '📄 PDF';
          } else {
            attachmentDescription = '📎 Document';
          }
          break;
        default:
          attachmentDescription = '📎 Fichier';
      }

      if (attachments.length > 1) {
        attachmentDescription += ` (+${attachments.length - 1})`;
      }

      if (messageContent && messageContent.trim().length > 0) {
        const textPreview = this.truncateMessage(messageContent, 15);
        messagePreview = `${textPreview} ${attachmentDescription}`;
      } else {
        messagePreview = attachmentDescription;
      }
    } else {
      messagePreview = this.truncateMessage(messageContent, 25);
    }

    return messagePreview;
  }

  /**
   * Formater une notification Prisma en événement Socket.IO
   */
  private formatNotificationEvent(notification: any): NotificationEventData {
    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      priority: notification.priority,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      senderId: notification.senderId || undefined,
      senderUsername: notification.senderUsername || undefined,
      senderAvatar: notification.senderAvatar || undefined,
      senderDisplayName: notification.senderDisplayName || undefined,
      senderFirstName: notification.senderFirstName || undefined,
      senderLastName: notification.senderLastName || undefined,
      messagePreview: notification.messagePreview || undefined,
      conversationId: notification.conversationId || undefined,
      messageId: notification.messageId || undefined,
      callSessionId: notification.callSessionId || undefined,
      data: notification.data ? JSON.parse(notification.data) : undefined
    };
  }

  /**
   * Supprimer toutes les notifications lues d'un utilisateur
   */
  async deleteAllReadNotifications(userId: string): Promise<number> {
    try {
      const result = await this.prisma.notification.deleteMany({
        where: {
          userId,
          isRead: true
        }
      });

      logger.info('✅ Deleted all read notifications', {
        userId,
        count: result.count
      });

      return result.count;
    } catch (error) {
      logger.error('❌ Error deleting read notifications:', error);
      return 0;
    }
  }

  /**
   * Obtenir les statistiques des notifications par type
   */
  async getNotificationStats(userId: string): Promise<{
    total: number;
    unread: number;
    byType: Record<string, number>;
  }> {
    try {
      const stats = await this.prisma.notification.groupBy({
        by: ['type'],
        where: { userId },
        _count: {
          id: true
        }
      });

      const totalCount = await this.prisma.notification.count({
        where: { userId }
      });

      const unreadCount = await this.prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });

      return {
        total: totalCount,
        unread: unreadCount,
        byType: stats.reduce((acc: any, stat: any) => {
          acc[stat.type] = stat._count.id;
          return acc;
        }, {} as Record<string, number>)
      };
    } catch (error) {
      logger.error('❌ Error getting notification stats:', error);
      return {
        total: 0,
        unread: 0,
        byType: {}
      };
    }
  }
}
