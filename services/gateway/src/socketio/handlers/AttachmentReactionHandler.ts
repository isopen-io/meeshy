/**
 * Attachment Reaction Handler (BUG2 A')
 * Gère les réactions par-image (ajout / suppression). Miroir de ReactionHandler,
 * substituant la clé attachment + réutilisant `resolveParticipantFromMessage`.
 */
import type { MeeshySocket as Socket, MeeshyIOServer as SocketIOServer } from '../typed-socket';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { AckOf } from '@meeshy/shared/types/socketio-events';
import { resolveParticipantFromMessage } from '../utils/participant-resolver';
import type { SocketUser } from '../utils/socket-helpers';
import { AttachmentReactionService } from '../../services/AttachmentReactionService';
import { E2eeSignalChannelRequiredError } from '../../services/e2ee/e2ee-signal-channel';
import type { RedisDeliveryQueue } from '../../services/RedisDeliveryQueue';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { enqueueForOfflineParticipants } from '../offlineParticipantQueue';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';
import { emitServerEvent, safeBroadcast } from '../serverEmit';
import { emitConversationActivityUpdate, type ActivityPrisma } from '../emitConversationActivityUpdate';
import type { QueuedPayloadFor } from '../queuedEventContract';
import { validateSocketEvent } from '../../middleware/validation.js';
import {
  SocketAttachmentReactionAddSchema,
  SocketAttachmentReactionRemoveSchema,
} from '../../validation/socket-event-schemas.js';

const logger = enhancedLogger.child({ module: 'AttachmentReactionHandler' });

export interface AttachmentReactionHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
  service: AttachmentReactionService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  deliveryQueue?: RedisDeliveryQueue | null;
}

export class AttachmentReactionHandler {
  private rateLimiter = getSocketRateLimiter();
  private deliveryQueue: RedisDeliveryQueue | null;
  constructor(private deps: AttachmentReactionHandlerDependencies) {
    this.deliveryQueue = deps.deliveryQueue ?? null;
  }

  /**
   * Injected after construction by `MeeshySocketIOManager.setDeliveryQueue`
   * (the queue is created after the handlers), mirroring ReactionHandler.
   */
  setDeliveryQueue(queue: RedisDeliveryQueue): void {
    this.deliveryQueue = queue;
  }

  async handleAdd(
    socket: Socket,
    data: { attachmentId: string; messageId: string; emoji: string },
    callback?: AckOf<'attachment:reaction-add'>
  ): Promise<void> {
    await this._apply(socket, data, 'add', callback);
  }

  async handleRemove(
    socket: Socket,
    data: { attachmentId: string; messageId: string; emoji: string },
    callback?: AckOf<'attachment:reaction-remove'>
  ): Promise<void> {
    await this._apply(socket, data, 'remove', callback);
  }

  private async _apply(
    socket: Socket,
    data: { attachmentId: string; messageId: string; emoji: string },
    action: 'add' | 'remove',
    // Les deux accusés de la famille ont la MÊME forme (un reçu) ; ce chemin
    // partagé prend donc l'un des deux, lu sur le contrat comme ses appelants.
    callback?: AckOf<'attachment:reaction-add'>
  ): Promise<void> {
    try {
      // Frontière socket : même garde que les trois jumelles de réaction
      // (`Reaction`/`CommentReaction`/`PostReaction`). Le schéma `mongoId`
      // rejette un `messageId`/`attachmentId` non-ObjectId — dont un id
      // optimiste non réconcilié (`cid_*`), qui ferait throw prisma (P2023) —
      // et borne l'emoji comme les jumelles, avant tout aller-retour DB.
      const schema = action === 'add'
        ? SocketAttachmentReactionAddSchema
        : SocketAttachmentReactionRemoveSchema;
      const schemaValidation = validateSocketEvent(schema, data);
      if (schemaValidation.success === false) {
        callback?.({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.deps.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        callback?.({ success: false, error: 'User not authenticated' });
        return;
      }

      const rateLimit = action === 'add' ? SOCKET_RATE_LIMITS.REACTION_ADD : SOCKET_RATE_LIMITS.REACTION_REMOVE;
      const rateLimitAllowed = await this.rateLimiter.checkLimit(userIdOrToken, rateLimit);
      if (!rateLimitAllowed) {
        callback?.({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      const resolved = await resolveParticipantFromMessage({
        prisma: this.deps.prisma,
        userIdOrToken,
        messageId: validated.messageId,
        connectedUsers: this.deps.connectedUsers,
      });
      if (!resolved) {
        callback?.({ success: false, error: 'Could not resolve participant' });
        return;
      }
      const conversationId = await this.deps.service.resolveConversationId(validated.messageId);
      if (!conversationId) {
        callback?.({ success: false, error: 'Message not found' });
        return;
      }

      // Sécurité (IDOR) — lier l'attachment au message fourni. Sans ça, un client
      // pourrait réagir à une PJ d'une autre conversation en passant un messageId
      // dont il EST participant + un attachmentId étranger.
      const att = await this.deps.prisma.messageAttachment.findUnique({
        where: { id: validated.attachmentId },
        select: { messageId: true },
      });
      if (!att || att.messageId !== validated.messageId) {
        callback?.({ success: false, error: 'Attachment not found' });
        return;
      }

      let activityAt: Date | undefined;
      if (action === 'add') {
        const { changed, at } = await this.deps.service.addAttachmentReaction({
          attachmentId: validated.attachmentId, messageId: validated.messageId,
          participantId: resolved.participantId, emoji: validated.emoji,
        });
        if (!changed) {
          // Idempotent no-op: the participant already had exactly this emoji on
          // this attachment (optimistic double-fire, a socket retry after a lost
          // ACK, or a second device echoing the same tap). Reply success but
          // skip the ATTACHMENT_REACTION_ADDED broadcast — re-emitting it spams
          // every socket in the conversation room. Mirrors ReactionHandler's
          // `unchanged` guard (iter 134).
          callback?.({ success: true });
          return;
        }
        activityAt = at;
      } else {
        const removed = await this.deps.service.removeAttachmentReaction({
          attachmentId: validated.attachmentId, participantId: resolved.participantId, emoji: validated.emoji,
        });
        if (!removed) {
          // Idempotent: the reaction is already absent. Reply success (nothing
          // changed, no broadcast) — re-emitting ATTACHMENT_REACTION_REMOVED
          // would clear the indicator for peers who still hold their own, and
          // replying error would make the client roll its optimistic un-react
          // back and re-show a reaction that is gone. Mirrors ReactionHandler's
          // already-absent guard.
          callback?.({ success: true });
          return;
        }
      }

      // #16951 — L'ACCUSÉ PART ICI, avant tout `await` de plus. La réaction est
      // PERSISTÉE depuis le bloc ci-dessus ; tout ce qui suit — la lecture du
      // résumé, la diffusion de room, la file hors ligne, le rang de liste —
      // est un effet d'APRÈS-SUCCÈS.
      //
      // La jumelle `ReactionHandler` écrit la règle en toutes lettres : « A
      // transient failure in those reads must NOT flip the ACK to failure —
      // that would make the client roll back a reaction already committed to
      // the DB ». Ici l'accusé était la DERNIÈRE instruction du `try` dont le
      // `catch` répond `{ success: false }`. Une levée de `getReactionSummary`
      // (lecture Mongo) ou d'`emitServerEvent` — le dépôt écrit lui-même qu'un
      // `io.to(room).emit(...)` LÈVE quand l'adaptateur ou l'encodeur est en
      // défaut — produisait TROIS choses d'un coup : accusé d'ÉCHEC sur une
      // écriture réussie (le client annule son optimiste et ré-affiche
      // l'absence d'une réaction qui EST en base), aucune diffusion, et aucune
      // entrée de file hors ligne — la seule garantie DURABLE du chemin,
      // sautée par la levée.
      //
      // C'est la forme littérale du cycle 130 bis, rejouée sur la famille
      // jumelle : « l'émission de room n'était pas gardée … la levée ayant
      // sauté la suite, l'entrée de file hors ligne n'était jamais posée ».
      callback?.({ success: true });

      await this._afterApplied(action, conversationId, resolved, validated, activityAt);
    } catch (error: unknown) {
      logger.error('attachment reaction failed', { action, error });
      callback?.({
        success: false,
        error: error instanceof Error ? error.message : 'Failed',
        ...(error instanceof E2eeSignalChannelRequiredError ? { code: error.code } : {}),
      });
    }
  }

  /**
   * Ce qui suit l'accusé : résumé, diffusion de room, file hors ligne, rang de
   * liste.
   *
   * Unité SÉPARÉE, et pas seulement pour la lisibilité — c'est ce qui rend
   * impossible qu'une levée d'ici atteigne le `catch` d'`_apply`, lequel
   * rappellerait le callback avec un échec APRÈS le succès déjà envoyé. La
   * jumelle obtient la même propriété par un `try` imbriqué ; ici le
   * gestionnaire était déjà au budget, et une unité nommée dit mieux ce qu'elle
   * garantit.
   */
  private async _afterApplied(
    action: 'add' | 'remove',
    conversationId: string,
    resolved: { readonly participantId: string; readonly userId: string; readonly isAnonymous: boolean },
    validated: { readonly attachmentId: string; readonly messageId: string; readonly emoji: string },
    activityAt: Date | undefined,
  ): Promise<void> {
    try {
      const reactionSummary = await this.deps.service.getReactionSummary(validated.attachmentId);
      const event = action === 'add'
        ? SERVER_EVENTS.ATTACHMENT_REACTION_ADDED
        : SERVER_EVENTS.ATTACHMENT_REACTION_REMOVED;
      const payload = {
        attachmentId: validated.attachmentId,
        messageId: validated.messageId,
        conversationId,
        participantId: resolved.participantId,
        emoji: validated.emoji,
        action,
        reactionSummary,
        timestamp: new Date().toISOString(),
      };
      // HUITIÈME site de la famille #17026, trouvé par l'audit adversarial — ni
      // par l'issue, ni par ma relecture, ni par le cliquet, qui est AVEUGLE à
      // l'émission par helper (`emitServerEvent` ne porte aucun `.emit(`
      // textuel ici). L'enfilage durable est cinq lignes plus bas, dans le même
      // `try`, dont le `catch` journalise « post-success side-effects failed ».
      //
      // Et la règle est écrite VINGT LIGNES PLUS BAS, dans ce même `try`, pour
      // l'autre canal latéral : « ni emporter l'entrée de file hors ligne qui la
      // précède ». Elle valait déjà pour celui-ci.
      //
      // Ce qui se perdait, définitivement : le `reactionSummary` par pièce
      // jointe d'un participant hors ligne — que seul un rechargement complet
      // de la conversation répare, comme le dit le doc-comment de l'enfilage.
      safeBroadcast(
        'attachment-reaction',
        () => emitServerEvent(this.deps.io.to(ROOMS.conversation(conversationId)), event, payload),
        (error) => logger.error('attachment reaction live emission failed — offline replay unaffected', { conversationId, error }),
      );

      void this._enqueueOfflineAttachmentReactionEvent(
        conversationId,
        resolved.participantId,
        action === 'add' ? 'attachment-reaction-added' : 'attachment-reaction-removed',
        validated,
        payload,
      ).catch((error: unknown) =>
        logger.error('attachment reaction offline enqueue rejected', { conversationId, error })
      );

      // #9026 — le rang SERVI, la seconde moitié de ce que le service vient
      // d'écrire. Sans elle, la conversation ne remonte en tête qu'au prochain
      // `GET /conversations` : l'écriture est durable, la liste ne l'est pas.
      //
      // `rank: true`, JAMAIS `reaction: true` : ce second drapeau fait résoudre
      // `Conversation.lastReactionId` par `prisma.reaction.findUnique`, la table
      // des réactions de MESSAGE, où cette réaction-ci n'a pas de ligne. La
      // réaction de pièce jointe est donc rangée avec l'appel et l'épingle —
      // une activité dont aucun autre événement de liste ne porte le rang.
      //
      // La clé d'acteur suit la loi du dépôt (`userId ?? id`) : un invité de
      // lien partagé n'a pas de ligne `User`, et c'est son `Participant.id` qui
      // nomme sa room personnelle.
      //
      // Isolé dans son propre `.catch`, et APRÈS l'accusé du client : une
      // lecture de liste qui tombe ne doit ni faire échouer une réaction déjà
      // écrite, ni emporter l'entrée de file hors ligne qui la précède.
      if (activityAt) {
        void emitConversationActivityUpdate(this.deps.prisma as ActivityPrisma, this.deps.io, {
          conversationId,
          updatedByUserId: resolved.isAnonymous ? resolved.participantId : resolved.userId,
          rank: true,
        }).catch((error: unknown) =>
          logger.error('attachment reaction list rank update rejected', { conversationId, error })
        );
      }
    } catch (sideEffectError: unknown) {
      // La réaction est écrite et le client a déjà son accusé. Les pairs se
      // réconcilient à la prochaine synchronisation, et l'absent par la file —
      // quand elle a pu être écrite.
      logger.error('attachment reaction post-success side-effects failed', {
        conversationId,
        error: sideEffectError,
      });
    }
  }

  /**
   * Offline delivery queue for attachment reaction add/remove — the exact
   * mirror of `ReactionHandler._enqueueOfflineReactionEvent`. Without it an
   * attachment reaction toggled while a participant is offline is only
   * broadcast to the live conversation room, so the offline peer's cached
   * per-attachment `reactionSummary` stays stale until an unrelated full
   * refetch. On reconnect `MeeshySocketIOManager._drainedEventName` replays the
   * queued entry as ATTACHMENT_REACTION_ADDED / ATTACHMENT_REACTION_REMOVED
   * with the same payload as the live emit.
   *
   * The actor is excluded by participant id (never on message content) and
   * every online peer is skipped since they already received the live
   * broadcast. `dedupKey` is scoped to (attachmentId, reactor, emoji) — finer
   * than a message reaction's (messageId, reactor, emoji) because one message
   * can carry several attachments each with their own reactions; the default
   * (messageId, eventType) dedup would otherwise collapse reactions on
   * different attachments of the same message into one.
   */
  private async _enqueueOfflineAttachmentReactionEvent(
    conversationId: string,
    actorParticipantId: string | null | undefined,
    eventType: 'attachment-reaction-added' | 'attachment-reaction-removed',
    data: { attachmentId: string; messageId: string; emoji: string },
    payload: QueuedPayloadFor<'attachment-reaction-added'>,
  ): Promise<void> {
    await enqueueForOfflineParticipants(
      { deliveryQueue: this.deliveryQueue, prisma: this.deps.prisma, connectedUsers: this.deps.connectedUsers },
      {
        conversationId,
        actorParticipantId,
        eventType,
        messageId: data.messageId,
        payload,
        dedupKey: `${data.attachmentId}:${actorParticipantId ?? 'unknown'}:${data.emoji}`,
      }
    );
  }
}
