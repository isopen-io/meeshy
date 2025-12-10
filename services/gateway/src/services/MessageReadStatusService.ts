/**
 * Service de gestion des statuts de lecture/réception des messages
 * Utilise un système de curseur par utilisateur par conversation
 *
 * Logique:
 * - Un utilisateur a UN SEUL MessageStatus par conversation
 * - messageId pointe vers le dernier message reçu/lu
 * - receivedAt = date de réception du dernier message
 * - readAt = date de lecture du dernier message
 */

import { PrismaClient, Message } from '@meeshy/shared/prisma/client';

export class MessageReadStatusService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Calcule le nombre de messages non lus dans une conversation pour un utilisateur
   * Basé sur le curseur de lecture : messages après le curseur = non lus
   */
  async getUnreadCount(userId: string, conversationId: string): Promise<number> {
    try {
      // Récupérer le curseur de l'utilisateur
      const cursor = await this.prisma.messageStatus.findUnique({
        where: {
          userId_conversationId: { userId, conversationId }
        },
        include: {
          message: { select: { createdAt: true } }
        }
      });

      // Si pas de curseur ou readAt = null, compter tous les messages (sauf ceux de l'utilisateur)
      if (!cursor || !cursor.readAt) {
        return await this.prisma.message.count({
          where: {
            conversationId,
            isDeleted: false,
            senderId: { not: userId }  // Exclure ses propres messages
          }
        });
      }

      // Compter les messages créés APRÈS le dernier message lu
      const unreadCount = await this.prisma.message.count({
        where: {
          conversationId,
          isDeleted: false,
          senderId: { not: userId },
          createdAt: { gt: cursor.message.createdAt }
        }
      });

      return unreadCount;
    } catch (error) {
      console.error('[MessageReadStatus] Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Calcule le unreadCount pour plusieurs conversations d'un utilisateur
   * Optimisé pour afficher la liste des conversations avec leurs compteurs
   */
  async getUnreadCountsForConversations(
    userId: string,
    conversationIds: string[]
  ): Promise<Map<string, number>> {
    try {
      // Récupérer tous les curseurs de l'utilisateur (1 seule requête)
      const cursors = await this.prisma.messageStatus.findMany({
        where: {
          userId,
          conversationId: { in: conversationIds }
        },
        include: {
          message: { select: { createdAt: true } }
        }
      });

      // Map conversationId → cursor
      const cursorMap = new Map(cursors.map(c => [c.conversationId, c]));

      // Map conversationId → unreadCount
      const unreadCounts = new Map<string, number>();

      // Calculer pour chaque conversation
      for (const convId of conversationIds) {
        const cursor = cursorMap.get(convId);

        let unreadCount = 0;

        if (!cursor || !cursor.readAt) {
          // Tous les messages non lus
          unreadCount = await this.prisma.message.count({
            where: {
              conversationId: convId,
              isDeleted: false,
              senderId: { not: userId }
            }
          });
        } else {
          // Messages après le curseur
          unreadCount = await this.prisma.message.count({
            where: {
              conversationId: convId,
              isDeleted: false,
              senderId: { not: userId },
              createdAt: { gt: cursor.message.createdAt }
            }
          });
        }

        unreadCounts.set(convId, unreadCount);
      }

      return unreadCounts;
    } catch (error) {
      console.error('[MessageReadStatus] Error getting unread counts:', error);
      return new Map();
    }
  }

  /**
   * Marque les messages comme reçus pour un utilisateur connecté
   * Appelé quand:
   * - L'utilisateur se connecte via WebSocket
   * - Un nouveau message arrive alors que l'utilisateur est connecté
   */
  async markMessagesAsReceived(
    userId: string,
    conversationId: string,
    latestMessageId?: string
  ): Promise<void> {
    try {
      // Si pas de messageId fourni, récupérer le dernier message de la conversation
      let messageId = latestMessageId;
      if (!messageId) {
        const latestMessage = await this.prisma.message.findFirst({
          where: {
            conversationId,
            isDeleted: false
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true }
        });

        if (!latestMessage) return; // Pas de messages dans la conversation
        messageId = latestMessage.id;
      } else {
        // Valider que le message fourni appartient bien à la conversation
        const messageCheck = await this.prisma.message.findFirst({
          where: {
            id: latestMessageId,
            conversationId: conversationId,
            isDeleted: false
          }
        });

        if (!messageCheck) {
          throw new Error(
            `Message ${latestMessageId} does not belong to conversation ${conversationId} or is deleted`
          );
        }
      }

      // Mettre à jour ou créer le curseur
      // IMPORTANT: On ne réinitialise PAS readAt lors de la réception d'un nouveau message
      // readAt doit être conservé pour garder la position de lecture de l'utilisateur
      await this.prisma.messageStatus.upsert({
        where: {
          userId_conversationId: {
            userId,
            conversationId
          }
        },
        create: {
          userId,
          conversationId,
          messageId,
          receivedAt: new Date(),
          readAt: null  // Pas encore lu (nouveau curseur)
        },
        update: {
          messageId,
          receivedAt: new Date()
          // ✅ FIX: On ne touche PAS à readAt ici - il garde sa valeur précédente
          // L'utilisateur a peut-être déjà lu des messages précédents
        }
      });

      console.log(`✅ [MessageReadStatus] User ${userId} received message ${messageId} in conversation ${conversationId}`);
    } catch (error) {
      console.error('[MessageReadStatus] Error marking messages as received:', error);
      throw error;
    }
  }

  /**
   * Marque les messages comme lus pour un utilisateur
   * Appelé quand:
   * - L'utilisateur ouvre une conversation
   * - L'utilisateur scrolle jusqu'au dernier message
   *
   * ✅ AMÉLIORATION: Marque aussi automatiquement les notifications de la conversation comme lues
   */
  async markMessagesAsRead(
    userId: string,
    conversationId: string,
    latestMessageId?: string
  ): Promise<void> {
    try {
      // Si pas de messageId fourni, récupérer le dernier message de la conversation
      let messageId = latestMessageId;
      if (!messageId) {
        const latestMessage = await this.prisma.message.findFirst({
          where: {
            conversationId,
            isDeleted: false
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true }
        });

        if (!latestMessage) return; // Pas de messages dans la conversation
        messageId = latestMessage.id;
      } else {
        // Valider que le message fourni appartient bien à la conversation
        const messageCheck = await this.prisma.message.findFirst({
          where: {
            id: latestMessageId,
            conversationId: conversationId,
            isDeleted: false
          }
        });

        if (!messageCheck) {
          throw new Error(
            `Message ${latestMessageId} does not belong to conversation ${conversationId} or is deleted`
          );
        }
      }

      // Mettre à jour ou créer le curseur
      // On met à jour à la fois receivedAt ET readAt
      await this.prisma.messageStatus.upsert({
        where: {
          userId_conversationId: {
            userId,
            conversationId
          }
        },
        create: {
          userId,
          conversationId,
          messageId,
          receivedAt: new Date(),
          readAt: new Date()
        },
        update: {
          messageId,
          receivedAt: new Date(),
          readAt: new Date()
        }
      });

      console.log(`✅ [MessageReadStatus] User ${userId} read message ${messageId} in conversation ${conversationId}`);

      // ✅ FIX BUG #3: Synchroniser avec les notifications
      // Marquer automatiquement les notifications de cette conversation comme lues
      try {
        const { NotificationService } = await import('./NotificationService.js');
        const notificationService = new NotificationService(this.prisma);
        const notifCount = await notificationService.markConversationNotificationsAsRead(userId, conversationId);

        if (notifCount > 0) {
          console.log(`✅ [MessageReadStatus] Marked ${notifCount} notifications as read for conversation ${conversationId}`);
        }
      } catch (notifError) {
        // Ne pas faire échouer l'opération si la synchronisation des notifications échoue
        console.warn('[MessageReadStatus] Error syncing notifications:', notifError);
      }
    } catch (error) {
      console.error('[MessageReadStatus] Error marking messages as read:', error);
      throw error;
    }
  }

  /**
   * Récupère le statut de lecture d'un message spécifique
   * Retourne combien d'utilisateurs ont reçu/lu ce message
   */
  async getMessageReadStatus(
    messageId: string,
    conversationId: string
  ): Promise<{
    messageId: string;
    totalMembers: number;
    receivedCount: number;
    readCount: number;
    receivedBy: Array<{ userId: string; username: string; receivedAt: Date }>;
    readBy: Array<{ userId: string; username: string; readAt: Date }>;
  }> {
    try {
      // Récupérer le message pour avoir son createdAt et les IDs des expéditeurs
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          createdAt: true,
          senderId: true,
          anonymousSenderId: true,  // Ajouter pour les messages anonymes
          conversationId: true
        }
      });

      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }

      // Déterminer l'ID de l'expéditeur (authentifié ou anonyme)
      const authorId = message.senderId || message.anonymousSenderId;

      // Compter les membres de la conversation (exclure l'expéditeur authentifié)
      const totalMembers = await this.prisma.conversationMember.count({
        where: {
          conversationId,
          isActive: true,
          ...(message.senderId ? { userId: { not: message.senderId } } : {})
        }
      });

      // Récupérer tous les curseurs de lecture de cette conversation
      const cursors = await this.prisma.messageStatus.findMany({
        where: {
          conversationId
        },
        include: {
          message: {
            select: { createdAt: true }
          },
          user: {
            select: { id: true, username: true }
          }
        }
      });

      // Déterminer qui a reçu et qui a lu le message
      const receivedBy: Array<{ userId: string; username: string; receivedAt: Date }> = [];
      const readBy: Array<{ userId: string; username: string; readAt: Date }> = [];

      for (const cursor of cursors) {
        // Exclure l'expéditeur du message (ne pas compter l'auteur)
        if (cursor.userId === authorId) continue;

        // Si le curseur pointe vers un message >= au message cible (en date)
        if (cursor.message.createdAt >= message.createdAt) {
          // L'utilisateur a reçu le message
          if (cursor.receivedAt) {
            receivedBy.push({
              userId: cursor.userId,
              username: cursor.user.username,
              receivedAt: cursor.receivedAt
            });
          }

          // L'utilisateur a lu le message
          if (cursor.readAt) {
            readBy.push({
              userId: cursor.userId,
              username: cursor.user.username,
              readAt: cursor.readAt
            });
          }
        }
      }

      return {
        messageId,
        totalMembers,
        receivedCount: receivedBy.length,
        readCount: readBy.length,
        receivedBy,
        readBy
      };
    } catch (error) {
      console.error('[MessageReadStatus] Error getting message read status:', error);
      throw error;
    }
  }

  /**
   * Récupère les statuts de lecture pour tous les messages d'une conversation
   * Optimisé pour afficher les compteurs sur chaque message
   */
  async getConversationReadStatuses(
    conversationId: string,
    messageIds: string[]
  ): Promise<Map<string, { receivedCount: number; readCount: number }>> {
    try {
      // Récupérer tous les messages avec leurs dates
      const messages = await this.prisma.message.findMany({
        where: {
          id: { in: messageIds },
          conversationId
        },
        select: {
          id: true,
          createdAt: true,
          senderId: true
        }
      });

      // Récupérer tous les curseurs de cette conversation
      const cursors = await this.prisma.messageStatus.findMany({
        where: { conversationId },
        include: {
          message: {
            select: { createdAt: true }
          }
        }
      });

      // Calculer les statuts pour chaque message
      const statusMap = new Map<string, { receivedCount: number; readCount: number }>();

      for (const msg of messages) {
        let receivedCount = 0;
        let readCount = 0;

        for (const cursor of cursors) {
          // Si le curseur pointe vers un message >= au message cible
          if (cursor.message.createdAt >= msg.createdAt && cursor.userId !== msg.senderId) {
            if (cursor.receivedAt) receivedCount++;
            if (cursor.readAt) readCount++;
          }
        }

        statusMap.set(msg.id, { receivedCount, readCount });
      }

      return statusMap;
    } catch (error) {
      console.error('[MessageReadStatus] Error getting conversation read statuses:', error);
      throw error;
    }
  }

  /**
   * Nettoie les curseurs obsolètes (pour maintenance)
   * Supprime les curseurs pointant vers des messages supprimés
   * Optimisé: Utilise deleteMany au lieu de N requêtes individuelles
   */
  async cleanupObsoleteCursors(conversationId: string): Promise<number> {
    try {
      // Récupérer tous les curseurs de la conversation
      const cursors = await this.prisma.messageStatus.findMany({
        where: { conversationId },
        select: { id: true, messageId: true }
      });

      if (cursors.length === 0) {
        console.log(`✅ [MessageReadStatus] No cursors to clean up in conversation ${conversationId}`);
        return 0;
      }

      // Extraire tous les messageIds
      const messageIds = cursors.map(c => c.messageId);

      // Récupérer tous les messages existants et non supprimés (1 seule requête)
      const existingMessages = await this.prisma.message.findMany({
        where: {
          id: { in: messageIds },
          isDeleted: false
        },
        select: { id: true }
      });

      // Créer un Set pour recherche rapide
      const existingMessageIds = new Set(existingMessages.map(m => m.id));

      // Identifier les curseurs obsolètes
      const obsoleteCursorIds = cursors
        .filter(c => !existingMessageIds.has(c.messageId))
        .map(c => c.id);

      // Supprimer en batch (1 seule requête)
      if (obsoleteCursorIds.length > 0) {
        await this.prisma.messageStatus.deleteMany({
          where: { id: { in: obsoleteCursorIds } }
        });
      }

      console.log(`✅ [MessageReadStatus] Cleaned up ${obsoleteCursorIds.length} obsolete cursors in conversation ${conversationId}`);
      return obsoleteCursorIds.length;
    } catch (error) {
      console.error('[MessageReadStatus] Error cleaning up cursors:', error);
      throw error;
    }
  }
}
