import type { FastifyInstance } from 'fastify';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { ReadStatusUpdatedEventData, ReadStatusSummary } from '@meeshy/shared/types/socketio-events';
import {
  emitToConversationParticipants,
  type ConversationRoomEmitter,
} from './emitToConversationParticipants.js';
import { bridgeComputed } from './unreadBridgeField.js';

/**
 * Les deux lectures dont la diffusion a besoin, nommées par ce qu'elles
 * répondent plutôt que par la classe qui les porte. `MessageReadStatusService`
 * les satisfait structurellement ; un test n'a pas à instancier le service
 * entier pour vérifier une règle de diffusion.
 */
export interface ReadStatusSummarySource {
  getLatestMessageSummary(conversationId: string): Promise<ReadStatusSummary>;
  getUnreadCount(participantId: string, conversationId: string): Promise<number>;
}

/** La préférence qui autorise — ou tait — l'accusé. `PrivacyPreferencesService`. */
export interface ReadReceiptVisibility {
  shouldShowReadReceipts(userId: string, isAnonymous: boolean): Promise<boolean>;
}

export interface ReadStatusBroadcastDeps {
  io: ConversationRoomEmitter | null | undefined;
  prisma: FastifyInstance['prisma'];
  readStatusService: ReadStatusSummarySource;
  privacyPreferencesService: ReadReceiptVisibility;
}

export interface ReadStatusBroadcastArgs {
  conversationId: string;
  participantId: string;
  /**
   * L'identité telle que l'authentification la porte — `User.id` pour un
   * inscrit, `Participant.id` pour un invité de lien (`middleware/auth.ts`).
   * C'est la clé que la préférence de confidentialité interroge ; le champ du
   * contrat, lui, se dérive plus bas.
   */
  userId: string;
  isAnonymous: boolean;
  type: 'read' | 'received';
}

/**
 * Diffuse un `read-status:updated` — l'UNIQUE forme de cette diffusion.
 *
 * Elle a existé en quatre exemplaires, et les quatre ont divergé : c'est ainsi
 * qu'une porte a émis un `Participant.id` là où trois émettaient `null`
 * (cycle 38), qu'une autre a livré l'arriéré de l'acteur à toute la
 * conversation (cycle 41), et que la dernière — `POST /messages/:id/status` —
 * n'a jamais consulté la préférence d'accusés de lecture. Une règle de
 * confidentialité qui tient à trois portes sur quatre n'est pas une règle : il
 * suffit d'entrer par la quatrième.
 *
 * Les trois propriétés que cette unité tient ensemble, et qu'aucune copie ne
 * tenait toutes :
 *
 * 1. **La préférence décide de la DIFFUSION, jamais de la LECTURE.** Le curseur
 *    est avancé par l'appelant avant d'arriver ici ; taire l'accusé ne doit
 *    jamais faire perdre à l'acteur la trace de ce qu'il a lu. D'où le badge
 *    émis sur les DEUX branches.
 *
 * 2. **Deux payloads pour deux audiences.** `summary` décrit la conversation et
 *    part à tout le monde. `lastReadAt` et `unreadCount` décrivent UNE personne
 *    — sa frontière de lecture, son retard sur ce fil — et ne partent qu'à ses
 *    propres appareils. La préférence qui autorise cette diffusion consent à
 *    « j'ai lu ton message », pas à la publication d'un arriéré.
 *
 * 3. **Deux identités, deux rôles.** `actorUserId` est le champ du CONTRAT,
 *    `null` pour un participant anonyme qui n'a pas de ligne `User`.
 *    `personalRoomKey` est la CLÉ DE ROOM, qui vaut `userId ?? participantId` —
 *    un participant sans compte a bien une room personnelle, qu'`AuthHandler`
 *    lui fait rejoindre sous son `Participant.id`. Nuller le champ ne doit
 *    jamais nuller la clé : `ROOMS.user(null)` collerait le badge de tous les
 *    invités.
 */
export async function broadcastReadStatus(
  deps: ReadStatusBroadcastDeps,
  args: ReadStatusBroadcastArgs
): Promise<void> {
  const { io, prisma, readStatusService, privacyPreferencesService } = deps;
  if (!io) return;

  const actorUserId = args.isAnonymous ? null : args.userId;
  const personalRoomKey = actorUserId ?? args.participantId;

  // La préférence et l'arriéré de l'acteur ne dépendent pas l'un de l'autre :
  // les attendre en série ajoutait un aller-retour au chemin chaud pour rien.
  // L'arriéré ne se lit QUE sur un `read` — un `received` n'avance aucun
  // curseur, et les deux champs seraient alors une donnée qu'aucun client
  // n'applique.
  const [shouldShowReadReceipts, actorReadSync] = await Promise.all([
    privacyPreferencesService.shouldShowReadReceipts(args.userId, args.isAnonymous),
    args.type === 'read'
      ? Promise.all([
          prisma.conversationReadCursor.findUnique({
            where: {
              conversation_participant_cursor: {
                participantId: args.participantId,
                conversationId: args.conversationId,
              },
            },
            select: { lastReadAt: true },
          }),
          readStatusService.getUnreadCount(args.participantId, args.conversationId),
        ]).then(([cursor, unreadCount]) => ({
          lastReadAt: cursor?.lastReadAt ?? null,
          unreadCount,
        }))
      : Promise.resolve(undefined),
  ]);

  // Synchro interne, pas une divulgation : le badge se recale sur les appareils
  // de l'acteur quelle que soit sa préférence. L'arriéré RÉEL, jamais un zéro
  // écrit en dur — une lecture exacte ou partielle n'avance le curseur que sur
  // le préfixe contigu déjà lu, donc des messages peuvent légitimement rester
  // non lus, et un zéro viderait à tort le badge sur TOUS ses appareils.
  //
  // Le pont ✦ : `null` EXPLICITE, et c'est une affirmation, pas un pis-aller
  // (cycle 63, piste n°1 du cycle 62). Le pont PORTE son propre `unreadCount`,
  // et le rang n'affiche plus aucun autre chiffre — L06 a supprimé le badge
  // chiffré, « le chiffre vit ICI ». L'accusé qu'on diffuse est donc l'acte
  // même qui VIDE le pont précédent : après une lecture partielle qui fait
  // tomber l'arriéré de 12 à 5, le garder ferait lire « Alice · 12 messages »
  // à un lecteur qui n'en a plus que 5.
  //
  // Le cycle 62 posait la question en termes de PRIX — « recalculer coûterait
  // la passe à chaque accusé de lecture, sur l'un des chemins les plus chauds ».
  // La question était mal posée : le serveur n'a pas besoin de recalculer pour
  // savoir que l'ancien pont est void. Il le sait. Il le dit. Zéro requête.
  const emitUnreadUpdate = () => {
    if (!actorReadSync) return;
    io.to(ROOMS.user(personalRoomKey)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
      conversationId: args.conversationId,
      unreadCount: actorReadSync.unreadCount,
      ...bridgeComputed(undefined),
    });
  };

  if (!shouldShowReadReceipts) {
    emitUnreadUpdate();
    return;
  }

  const [summary, activeParticipants] = await Promise.all([
    readStatusService.getLatestMessageSummary(args.conversationId),
    prisma.participant.findMany({
      where: { conversationId: args.conversationId, isActive: true },
      // `id` NOMME la room personnelle d'un participant sans ligne `User` —
      // sans lui, l'identité de repli n'est pas ignorée, elle n'est jamais lue.
      select: { id: true, userId: true },
    }),
  ]);

  // Ce que TOUTE la conversation peut savoir : qui a lu, et où en est le résumé
  // des coches. Rien qui décrive l'arriéré personnel de l'acteur.
  const peerPayload: ReadStatusUpdatedEventData = {
    conversationId: args.conversationId,
    participantId: args.participantId,
    userId: actorUserId,
    type: args.type,
    updatedAt: new Date(),
    summary,
  };

  // L'acteur n'est retiré de l'éventail que lorsqu'il a une version à lui à
  // recevoir : sur un `received`, les deux payloads seraient identiques et
  // l'exclure lui coûterait l'événement sans rien protéger. Retirer sa room
  // personnelle de la chaîne ne suffirait pas — la room de conversation le
  // tient dès qu'il a le fil ouvert, et il recevrait alors les DEUX copies du
  // seul événement où elles diffèrent.
  emitToConversationParticipants({
    io,
    conversationId: args.conversationId,
    participants: activeParticipants,
    events: [SERVER_EVENTS.READ_STATUS_UPDATED, SERVER_EVENTS.MESSAGE_READ_STATUS_UPDATED],
    payload: peerPayload,
    exceptRoom: actorReadSync ? ROOMS.user(personalRoomKey) : null,
  });

  // La version de l'acteur, dans sa seule room personnelle — celle que toutes
  // ses sessions ont rejointe à l'authentification, compte ou pas. Sous les
  // DEUX noms d'événement, pour qu'un client migré comme un client historique
  // recale son curseur.
  if (actorReadSync) {
    const actorPayload: ReadStatusUpdatedEventData = { ...peerPayload, ...actorReadSync };
    const actorRoom = io.to(ROOMS.user(personalRoomKey));
    actorRoom.emit(SERVER_EVENTS.READ_STATUS_UPDATED, actorPayload);
    actorRoom.emit(SERVER_EVENTS.MESSAGE_READ_STATUS_UPDATED, actorPayload);
  }

  emitUnreadUpdate();
}
