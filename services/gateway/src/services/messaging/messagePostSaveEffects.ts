import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { conversationStatsService } from '../ConversationStatsService';

/**
 * Le message tel que les effets post-commit le lisent. Volontairement structural
 * et minimal : les deux routes de lien de partage ne construisent pas un
 * `Message` Prisma complet, et rien ici n'a besoin de plus.
 */
export interface PostSaveMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly content: string;
  readonly messageType: string;
  readonly replyToId?: string | null;
}

/**
 * La seule chose que ces effets demandent au service de traduction. Garder le
 * contrat structural évite d'importer `MessageTranslationService` depuis une
 * route — et rend le double de test trivial.
 */
export interface PostSaveTranslationQueue {
  handleNewMessage(message: {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    originalLanguage: string;
    messageType: string;
    replyToId?: string | null;
  }): Promise<unknown>;
}

export type PostSaveEffect = 'lastMessageAt' | 'translation' | 'stats';

/**
 * La poussée d'un message au translator, sous la forme que le service attend.
 *
 * Extraite parce qu'elle a DEUX appelants : les effets post-commit ci-dessous,
 * et la re-poussée d'un doublon dont le blob `translations` est resté vide
 * (`MessagingService.queueTranslation`, translator down au premier insert). Deux
 * littéraux jumeaux dériveraient en silence — un champ ajouté ici et pas là
 * traduirait le doublon avec un contexte amputé.
 */
export function queueMessageTranslation(params: {
  translationService: PostSaveTranslationQueue;
  message: PostSaveMessage;
  originalLanguage: string;
}): Promise<unknown> {
  const { translationService, message, originalLanguage } = params;
  return translationService.handleNewMessage({
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    originalLanguage,
    messageType: message.messageType,
    replyToId: message.replyToId ?? null,
  });
}

/**
 * Ce que TOUT message committé doit à sa conversation, quel que soit le tuyau
 * par lequel il est arrivé.
 *
 * Trois écritures, indépendantes les unes des autres :
 *
 *  1. `Conversation.lastMessageAt` — `GET /conversations` trie dessus
 *     (`orderBy: { lastMessageAt: 'desc' }`) ET pagine par curseur dessus
 *     (`lastMessageAt: { lt: cursor }`). Sans le bump, la conversation reste
 *     enterrée à sa position d'avant, et le prochain refetch redescend celle que
 *     le client venait de remonter localement.
 *  2. La poussée au translator — le Prisme Linguistique. `Message.translations`
 *     n'est jamais rempli après coup : aucune retraduction n'est déclenchée hors
 *     édition ou demande explicite, donc un message non poussé ici reste en
 *     langue originale À VIE pour tous ses lecteurs.
 *  3. Les statistiques de langue de la conversation.
 *
 * Cette unité existe parce que l'obligation vivait dans une méthode PRIVÉE de
 * `MessagingService` : les deux routes de lien de partage contournent la classe
 * entière, donc elles ne pouvaient, par construction, en honorer aucune des
 * trois. Même défaut et même remède que le diffuseur unique du cycle précédent
 * (`broadcastLinkMessage`) — un point d'appel public que tout écrivain peut
 * atteindre, plutôt qu'un contrat recopié.
 *
 * **Un quatrième effet du chemin nominal N'EST PAS ici, délibérément** :
 * l'avancement du curseur de lecture de l'AUTEUR
 * (`MessageReadStatusService.markMessagesAsRead`). Deux raisons : (a) il ne
 * corrige aucun défaut observable — le décompte de non-lus exclut déjà les
 * messages dont on est l'auteur (`senderId: { not: participantId }`) ; (b) la
 * route de lien authentifiée peut porter un participant SYNTHÉTIQUE pour la
 * conversation globale `meeshy` (`{ id: userId }`), et un `markMessagesAsRead`
 * appelé là créerait un `ConversationReadCursor` orphelin sous un id qui n'est
 * participant de rien. Il reste donc chez `MessagingService`, seul appelant qui
 * tient toujours un vrai `Participant`. Écrit ici pour qu'un lecteur ne prenne
 * pas l'absence pour l'oubli auquel elle ressemble.
 *
 * Fire-and-forget, par parité avec `runPostSaveSideEffects` : les trois écritures
 * sont hors du chemin de l'ACK, et chacune porte son propre `.catch` — une panne
 * de translator ne doit pas empêcher le bump, ni l'inverse, et aucune ne doit
 * transformer un envoi réussi en 500. C'est aussi ce qui rend l'unité sûre à
 * appeler depuis une route.
 *
 * @param originalLanguage - la langue SOURCE telle qu'elle est PERSISTÉE
 *   (canonicalisée). Le translator résout `LANGUAGE_MAPPINGS` dessus : un code
 *   région-taggé y retombe silencieusement sur l'anglais.
 */
export function runMessagePostSaveEffects(params: {
  prisma: Pick<PrismaClient, 'conversation'>;
  translationService: PostSaveTranslationQueue | null | undefined;
  message: PostSaveMessage;
  originalLanguage: string;
  onError?: (effect: PostSaveEffect, error: unknown) => void;
}): void {
  const { prisma, translationService, message, originalLanguage, onError } = params;

  const report = (effect: PostSaveEffect) => (error: unknown) => onError?.(effect, error);

  // `Promise.resolve().then(...)` et non un `await` direct : l'accès aux
  // délégués Prisma peut lever SYNCHRONEMENT (un client partiel, un double de
  // test), et cette fonction ne rend rien — une exception synchrone remonterait
  // alors à l'appelant, c'est-à-dire au chemin d'envoi qu'on protège.
  void Promise.resolve()
    .then(() =>
      prisma.conversation.update({
        where: { id: message.conversationId },
        data: { lastMessageAt: new Date() },
      })
    )
    .catch(report('lastMessageAt'));

  if (translationService) {
    void Promise.resolve()
      .then(() => queueMessageTranslation({ translationService, message, originalLanguage }))
      .catch(report('translation'));
  }

  void Promise.resolve()
    .then(() =>
      conversationStatsService.updateOnNewMessage(
        prisma as PrismaClient,
        message.conversationId,
        originalLanguage,
        () => []
      )
    )
    .catch(report('stats'));
}
