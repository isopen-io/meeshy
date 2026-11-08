import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ServerEmitIO } from './serverEmit';

import { blockedEditKeys, type EditReadership } from './editedAudience';
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
   * QUI a le droit de LIRE ce message — le verdict ENTIER
   * (`editReadership`, `editedAudience.ts`), jamais l'ensemble de clés qu'il
   * contient.
   *
   * **La distinction n'est pas cosmétique, et c'est la leçon `[]`-vs-`undefined`
   * du cycle 116.** Un `ReadonlySet` ne peut pas dire « je ne sais pas » :
   * `blockedEditKeys({kind:'unknown'})` rend un ensemble VIDE, donc transforme
   * une IGNORANCE en AFFIRMATION (« personne n'est bloqué »). Passer l'ensemble
   * faisait donc partir le texte édité vers TOUS les nommés à l'instant même
   * où `message:edited` se taisait sur ses deux canaux — deux sorties de la
   * MÊME résolution, arbitrées en sens OPPOSÉS depuis la même valeur, et
   * fail-OPEN du côté où un secret est en jeu.
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
   * oublierait.
   *
   * Absent ⇒ aucun lecteur n'est écarté. C'est le bon défaut pour un véritable
   * chemin d'ENVOI (le `createdAt` d'un message neuf est postérieur à tout
   * plancher), et **un chemin d'ÉDITION n'a pas le droit de l'omettre** : les
   * QUATRE transports d'édition le passent, y compris
   * `PUT /messages/:messageId`, que le client iOS emploie réellement pour
   * éditer — omis au premier essai sur la foi d'un « c'est un envoi » que le
   * commentaire du site contredisait.
   */
  readership?: EditReadership;
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
  // `'unknown'` ⇒ on ne sait NI qui est bloqué, NI qui est autorisé. Rien ne
  // part : c'est le MÊME arbitrage que `message:edited` prend au même instant,
  // depuis la même résolution. Voir `readership`.
  if (params.readership?.kind === 'unknown') return;
  const blocked = params.readership ? blockedEditKeys(params.readership) : undefined;

  for (const mentionedUserId of newlyMentionedUserIds) {
    if (mentionedUserId === editorUserId) continue;
    // Le plancher d'historique : voir `readership`. Les clés sont des
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
