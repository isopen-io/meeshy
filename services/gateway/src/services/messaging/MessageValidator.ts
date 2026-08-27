/**
 * Message Validation Module
 * Handles all validation logic for message requests
 *
 * `checkPermissions` VIVAIT ICI, et n'a jamais été appelée par une seule ligne
 * de production : `MessagingService.handleMessage` — l'entonnoir des trois
 * transports d'envoi — n'invoque de ce module que `validateRequest`,
 * `resolveConversationId` et `detectLanguage`. Les règles qu'elle portait ne
 * gouvernaient donc rien : le canal d'annonces acceptait les messages de tout
 * membre, et une conversation clôturée acceptait encore des écritures.
 *
 * Elles vivent désormais dans `conversationWriteAdmission.ts`, CÂBLÉE dans
 * l'entonnoir et prouvée par ses témoins. Ce module ne garde que ce qu'il fait
 * réellement — un garde orphelin à côté d'un garde réel est pire qu'aucun
 * garde : il fait croire la règle appliquée.
 *
 * Ses règles ANONYMES (lien actif, non expiré, `allowAnonymousMessages`,
 * `permissions.canSendMessages`) n'ont rien perdu : `routes/links/messages.ts`
 * les applique en propre sur le chemin REST anonyme, qui est le seul à les
 * avoir jamais fait respecter.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type {
  MessageRequest,
  MessageValidationResult
} from '@meeshy/shared/types';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '@meeshy/shared/types/attachment';
import { MESSAGE_LIMITS } from '../../config/message-limits';
import { resolveConversationId as resolveConvId } from '../../utils/conversation-id-cache';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'MessageValidator' });

export class MessageValidator {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Validation complète d'une requête de message
   */
  async validateRequest(request: MessageRequest): Promise<MessageValidationResult> {
    const errors: MessageValidationResult['errors'] = [];
    const warnings: MessageValidationResult['warnings'] = [];

    // Validation du contenu - permettre les messages sans contenu si il y a des attachements ou un payload chiffré
    const hasAttachments = (request.attachments && request.attachments.length > 0) ||
                          (request.attachmentIds && request.attachmentIds.length > 0);

    // Un transfert rend aussi le corps non-vide : ses attachments sont copiés
    // CÔTÉ SERVEUR (MessageProcessor.copyForwardedAttachments), le client
    // n'envoie ni content ni attachmentIds pour un forward de média. Même
    // exemption que le refine Zod de la route REST — sans elle, tout transfert
    // de média mourait ici en CONTENT_EMPTY après avoir passé la route.
    //
    // RÈGLE JUMELLE, trois portes pour un seul envoi : le refine Zod de
    // `routes/conversations/messages.ts`, la garde de longueur de
    // `MessageHandler.handleMessageSend` (transport socket) et celle-ci. Toute
    // évolution de l'exemption touche les trois — une seule porte restée
    // fermée refuse le transfert de média que les deux autres laissent passer.
    // Ce que l'exemption ouvre ici, `admitMessageForward` le referme plus bas
    // (`bodyOnlyFromSource`) : un corps entièrement emprunté à une source
    // muette ne doit rien faire naître.
    //
    // `copyAttachmentsFromMessageId` porte la MÊME exemption pour la MÊME
    // raison : une diffusion à plusieurs destinataires copie aussi ses pièces
    // jointes côté serveur (`copyAttachments.ts`), sans jamais poser
    // `forwardedFromId` — ce n'est pas un transfert. Sans cette ligne, une
    // diffusion de média sans texte mourrait ici en CONTENT_EMPTY.
    //
    // Sur le transport socket, ce champ doit d'abord SURVIVRE au schéma :
    // `SocketMessageSendSchema` est un `z.object`, qui strippe en silence tout
    // champ non déclaré. Il y est déclaré, et la garde de
    // `MessageHandler.handleMessageSend` l'exempte comme ici — les trois portes
    // ne s'ouvrent qu'ensemble.
    //
    // `location` porte la MÊME exemption : une géolocalisation partagée SEULE
    // (ni texte, ni pièce jointe) est un contenu à part entière. Sans cette
    // ligne, ce message meurt ici en CONTENT_EMPTY sur CHAQUE tentative — une
    // erreur de validation permanente, jamais transitoire — et reste bloqué
    // pour toujours dans la file de retentative côté client (#4039).
    if ((!request.content || request.content.trim().length === 0) && !hasAttachments && !request.encryptedPayload && !request.forwardedFromId && !request.copyAttachmentsFromMessageId && !request.location) {
      errors.push({
        field: 'content',
        message: 'Message content cannot be empty (unless attachments or encrypted payload are included)',
        code: 'CONTENT_EMPTY'
      });
    }

    if (request.content && request.content.length > MESSAGE_LIMITS.MAX_MESSAGE_LENGTH) {
      errors.push({
        field: 'content',
        message: `Message content cannot exceed ${MESSAGE_LIMITS.MAX_MESSAGE_LENGTH} characters`,
        code: 'CONTENT_TOO_LONG'
      });
    }

    // Validation conversationId
    if (!request.conversationId) {
      errors.push({
        field: 'conversationId',
        message: 'Conversation ID is required',
        code: 'CONVERSATION_ID_REQUIRED'
      });
    }

    // Validation messaging anonyme
    if (request.isAnonymous && !request.anonymousDisplayName) {
      errors.push({
        field: 'anonymousDisplayName',
        message: 'Anonymous display name is required for anonymous messages',
        code: 'ANONYMOUS_NAME_REQUIRED'
      });
    }

    // Validation des pièces jointes
    // Ce cap est le SEUL qui s'applique aux deux transports (REST et socket
    // convergent ici via `MessagingService.handleMessage`). Il vaut donc le
    // plafond produit, et se lit dans `@meeshy/shared` — figé en dur à 10, il
    // rejetait tout envoi iOS de plus de dix pièces depuis que le composer y
    // est passé à 199.
    const attachmentCount = (request.attachments?.length || 0) + (request.attachmentIds?.length || 0);
    if (attachmentCount > MAX_ATTACHMENTS_PER_MESSAGE) {
      errors.push({
        field: 'attachments',
        message: `Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message`,
        code: 'TOO_MANY_ATTACHMENTS'
      });
    }

    // Warnings pour optimisation
    if (request.content && request.content.length > 1000) {
      warnings.push({
        field: 'content',
        message: 'Long message - premium translation recommended',
        code: 'LONG_CONTENT_WARNING'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Résout l'ID de conversation réel à partir de différents formats
   */
  async resolveConversationId(identifier: string): Promise<string | null> {
    return resolveConvId(this.prisma, identifier);
  }

  /**
   * Détection automatique de la langue via le service translator
   */
  async detectLanguage(content: string): Promise<string> {
    try {
      const translatorUrl = process.env.ML_API_URL || 'http://translator:8000';
      const response = await fetch(`${translatorUrl}/detect-language`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content.slice(0, 5000) }),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return 'fr';
      const { language } = await response.json() as { language: string };
      return language || 'fr';
    } catch (error) {
      logger.error('Language detection failed, fallback to fr', error as Error);
      return 'fr';
    }
  }
}
