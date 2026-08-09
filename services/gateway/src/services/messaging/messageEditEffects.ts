import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import {
  conversationMessageStatsService,
  statsAuthorKey,
} from '../ConversationMessageStatsService';

const log = enhancedLogger.child({ module: 'messageEditEffects' });

/**
 * TOUT ce qu'une édition de message doit écrire en base, en un seul endroit.
 *
 * Troisième unité de la même famille, après `runMessagePostSaveEffects` (ce
 * qu'un message committé doit à sa conversation) et `applyMessageRemovalEffects`
 * (ce que son retrait lui doit). Elle existe pour la même raison mesurée :
 * QUATRE transports écrivent un nouveau contenu — le handler socket
 * `message:edit`, `PUT /conversations/:id/messages/:mid`, `PUT /messages/:id`
 * (iOS) et `PATCH /messages/:id` (Android) — et un seul ajustait les compteurs
 * de la conversation. Chez les trois autres, `totalWords` et `totalCharacters`
 * restaient ceux du texte D'ORIGINE, définitivement : il n'existe aucun
 * recalcul périodique pour les rattraper.
 *
 * C'est le jumeau d'`messageEditAdmission` du côté des ÉCRITURES : celui-là dit
 * qui peut éditer et jusqu'à quand, `messageEditContent` dit ce qu'on a le droit
 * d'écrire, celui-ci dit ce que l'écriture entraîne.
 *
 * BEST-EFFORT, délibérément : quand ceci s'exécute, le nouveau contenu est DÉJÀ
 * committé. Un compteur récalcitrant ne doit jamais transformer une édition
 * réussie en 500.
 */
export interface EditedMessageRecord {
  readonly id: string;
  readonly conversationId: string;
  /** `Participant.id` de l'auteur. */
  readonly senderId: string;
  /** `Participant.userId` — `null` pour un anonyme. Cf. `statsAuthorKey`. */
  readonly senderUserId: string | null;
  /** Le contenu AVANT l'écriture. */
  readonly previousContent: string | null;
  /**
   * Le contenu tel qu'il est PERSISTÉ — après `trim` et après réécriture des
   * liens. C'est lui que relit `recompute()`, l'autorité : compter le contenu
   * de la REQUÊTE ferait diverger l'ajustement de son propre recalcul.
   */
  readonly content: string | null;
}

export async function applyMessageEditEffects(
  prisma: PrismaClient,
  message: EditedMessageRecord
): Promise<void> {
  try {
    await conversationMessageStatsService.onMessageEdited(
      prisma,
      message.conversationId,
      statsAuthorKey(message.senderId, message.senderUserId),
      message.previousContent ?? '',
      message.content ?? ''
    );
  } catch (err) {
    log.warn('message edit: stats adjustment failed', { messageId: message.id, err });
  }
}
