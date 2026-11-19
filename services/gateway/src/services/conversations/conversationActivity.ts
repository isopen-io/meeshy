import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { emitConversationActivityUpdate, type ActivityPrisma } from '../../socketio/emitConversationActivityUpdate';
import type { ServerEmitIO } from '../../socketio/serverEmit';

const logger = enhancedLogger.child({ module: 'ConversationActivity' });

/**
 * **TOUTE ACTIVITÉ REMONTE LA CONVERSATION EN TÊTE, POUR TOUS** (#9026,
 * directive porteur du 2026-10-01, qui remplace la règle PAR LECTEUR de #7592).
 *
 * Un message avance `Conversation.lastMessageAt` ; tout le reste — une réaction
 * posée, un appel (début, fin, manqué), un message épinglé ou dépinglé — avance
 * `Conversation.lastActivityAt`, ici et nulle part ailleurs. Le rang de la liste
 * est max(`lastMessageAt`, `lastActivityAt`) (`utils/conversation-list-rank.ts`) :
 * `GET /conversations` trie dessus, `conversation:updated` le sert.
 *
 * **MONOTONE** : le `where` n'admet que l'absence ou une valeur plus ANCIENNE.
 * Deux activités concurrentes convergent sur la plus récente quel que soit
 * l'ordre d'arrivée — l'atomicité d'un document MongoDB suffit, aucune lecture
 * préalable.
 *
 * **L'absence se dit en DEUX branches, et la première écriture en dépend**
 * (#19800). Sous MongoDB, `{ lastActivityAt: null }` est une ÉGALITÉ : elle
 * exige la clé PRÉSENTE et nulle. Or **aucun chemin de création n'écrit la
 * colonne**, et la mesure qui le prouve se prend par l'autre bout plutôt qu'en
 * énumérant les créations : il existe **un seul** `data: { lastActivityAt }`
 * dans tout le dépôt, et c'est celui-ci (les onze `prisma.conversation.create`
 * de la passerelle, sans aucun `createMany` ni `upsert`, n'en portent pas).
 * Sans `{ isSet: false }`, `updateMany` n'appariait AUCUNE conversation, rendait
 * `count: 0` — ce qui n'est pas une erreur — et la colonne restait absente pour
 * toujours. **Les QUATRE alimenteurs de l'axe « activité » étaient donc inertes
 * pour la population entière**, et le rang de liste se réduisait à
 * `lastMessageAt` : `ReactionService` (réaction de message),
 * `AttachmentReactionService` (réaction de pièce jointe),
 * `callMessageBroadcasters` (appel) et `messages-pin` (épingle) — les quatre
 * seuls importateurs de cette unité, qui est l'unique écrivain de la colonne.
 *
 * (L'issue en nommait CINQ, en comptant `messagePostSaveEffects.ts:160`. C'est un
 * HOMONYME : `EngagementService.recordConversationActivity(userId, axisKey,
 * conversationId)` écrit `EngagementConversationCredit`, et ce fichier n'importe
 * pas cette unité. Un message avance `lastMessageAt`, jamais `lastActivityAt` —
 * ce que le § ci-dessus dit déjà.)
 *
 * Les trois branches sont écrites ICI plutôt que composées par `unsetOrNull` :
 * le prédicat partagé rend une clé `OR` que ce `where`, qui porte déjà la
 * sienne, ne peut pas spreader — et l'écrire au site le garde dans le champ du
 * cliquet `soft-state-equality-filter-guard`, qui reconnaît une BRANCHE
 * littérale du même tableau, jamais un appel de helper.
 *
 * Best-effort : l'action est déjà commise, une liste en retard ne vaut pas de la
 * faire échouer. Ne lève jamais.
 */
export async function recordConversationActivity(params: {
  readonly prisma: Pick<PrismaClient, 'conversation'>;
  readonly conversationId: string;
  readonly at: Date;
}): Promise<void> {
  const { prisma, conversationId, at } = params;
  try {
    await prisma.conversation.updateMany({
      where: {
        id: conversationId,
        OR: [{ lastActivityAt: null }, { lastActivityAt: { isSet: false } }, { lastActivityAt: { lt: at } }],
      },
      data: { lastActivityAt: at },
    });
  } catch (error) {
    logger.warn('lastActivityAt not recorded', { conversationId, error });
  }
}

/**
 * Enregistre l'activité PUIS sert le rang à chaque participant
 * (`conversation:updated` porteur de `listRankAt`, relu depuis la base). Pour
 * les activités dont aucun autre événement de liste ne porte le rang : appel,
 * épingle. La réaction, elle, le porte avec `lastReaction`
 * (`emitConversationActivityUpdate({ reaction: true })`).
 */
export async function announceConversationActivity(params: {
  readonly prisma: ActivityPrisma;
  readonly io: ServerEmitIO | null | undefined;
  readonly conversationId: string;
  readonly at: Date;
  /** `User.id` de l'acteur — `Participant.id` pour un invité. */
  readonly updatedByUserId: string;
}): Promise<void> {
  const { prisma, io, conversationId, at, updatedByUserId } = params;
  await recordConversationActivity({ prisma, conversationId, at });
  await emitConversationActivityUpdate(prisma, io, {
    conversationId,
    updatedByUserId,
    rank: true,
    onError: (error) => logger.warn('conversation:updated listRankAt failed', { conversationId, error }),
  });
}
