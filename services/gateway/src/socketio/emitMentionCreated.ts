import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ServerEmitIO } from './serverEmit';

/**
 * La surface Socket.IO minimale de cet éventail, structurale comme celle de
 * `emitConversationPreviewUpdate` : la fonction accepte aussi bien le `Server`
 * de production que le `socketIOManager.getIO()` que tient une route REST.
 */
export type MentionEmitIO = ServerEmitIO;

export interface MentionCreatedParams {
  io: MentionEmitIO | null | undefined;
  /** Les seuls destinataires : ceux que l'édition vient d'ajouter, en `User.id`. */
  newlyMentionedUserIds: readonly string[];
  messageId: string;
  conversationId: string;
  /** L'AUTEUR de l'édition, en `User.id`. Sert aussi de garde d'auto-mention. */
  editorUserId: string;
  content: string;
  timestamp: Date;
  /**
   * Les lecteurs que le PLANCHER D'HISTORIQUE écarte de ce message
   * (`blockedEditKeys`, `editedAudience.ts`).
   *
   * Cette charge porte `content` — le texte APRÈS édition — et c'est la leçon
   * 275 littérale : la garde du plancher retenait la chaîne de
   * `message:edited`, et l'objet voisin la laissait partir, émis à QUATRE
   * lignes de chaque appel gardé. Nommer quelqu'un ne l'autorise pas à lire un
   * message que `GET …/messages` et `/sync` lui refusent : un inscrit entré par
   * un lien sans historique recevait le texte intégral d'un message
   * d'avant son arrivée dès qu'une édition l'y mentionnait.
   *
   * La garde vit ICI, avec celle d'auto-mention, et pour la même raison écrite
   * dans le doc-comment ci-dessous : c'est une garde qu'un nouvel écrivain
   * oublierait. Absente ⇒ aucun lecteur n'est écarté, ce qui est le bon défaut
   * pour un message NEUF (son `createdAt` est postérieur à tout plancher, donc
   * personne ne peut y être sous plancher).
   */
  blockedReaders?: ReadonlySet<string>;
  onError?: (error: unknown) => void;
}

/**
 * Prévenir, dans son salon PERSONNEL, chaque personne qu'une édition vient de
 * nommer.
 *
 * `message:edited` ne fan qu'à `conversation:<id>` : quelqu'un qui n'est pas
 * dans le salon de la conversation — sur sa liste, sur un autre écran,
 * ailleurs dans l'app — n'apprend par RIEN qu'on vient de le nommer. C'est
 * `mention:created` qui porte cette nouvelle, et le chemin d'envoi l'émet déjà
 * (`broadcastNewMessage`).
 *
 * L'éventail vivait déplié dans le seul `MessageHandler.handleMessageEdit`.
 * Aucune des trois routes REST d'édition n'émettait rien : nommer quelqu'un en
 * éditant depuis un iPhone (`PUT /messages/:messageId`, `routes/messages.ts`)
 * ou depuis le web (`PATCH /messages/:messageId`) ne lui parvenait jamais en
 * direct. Un point d'appel unique, donc, plutôt que quatre blocs qu'un
 * cinquième transport aurait la même occasion de ne pas recopier.
 *
 * La garde d'auto-mention vit ICI : l'auteur sait qu'il vient de se nommer, et
 * c'est une garde qu'un nouvel écrivain oublierait.
 *
 * Best-effort — ne lève jamais. L'édition est déjà commise quand cet éventail
 * part ; une socket fermée ne doit pas la transformer en 500, et l'échec d'un
 * destinataire ne doit pas priver les suivants de leur notification.
 */
export function emitMentionCreated(params: MentionCreatedParams): void {
  const { io, newlyMentionedUserIds, messageId, conversationId, editorUserId, content, timestamp, onError } = params;
  if (!io || newlyMentionedUserIds.length === 0) return;
  const blocked = params.blockedReaders;

  for (const mentionedUserId of newlyMentionedUserIds) {
    if (mentionedUserId === editorUserId) continue;
    // Le plancher d'historique : voir `blockedReaders`. Les clés sont des
    // `userId ?? id`, donc comparables à un `User.id` mentionné.
    if (blocked?.has(mentionedUserId)) continue;
    try {
      io.to(ROOMS.user(mentionedUserId)).emit(SERVER_EVENTS.MENTION_CREATED, {
        messageId,
        conversationId,
        senderId: editorUserId,
        mentionedUserId,
        content,
        timestamp: timestamp.toISOString(),
      });
    } catch (error) {
      onError?.(error);
    }
  }
}
