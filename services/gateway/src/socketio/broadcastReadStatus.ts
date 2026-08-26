import type { FastifyInstance } from 'fastify';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { ReadStatusUpdatedEventData, ReadStatusSummary } from '@meeshy/shared/types/socketio-events';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import {
  emitToConversationParticipants,
  type ConversationRoomEmitter,
} from './emitToConversationParticipants.js';
import { bridgeComputed, bridgeNotComputed } from './unreadBridgeField.js';

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

/**
 * Ce que cette diffusion demande à `ConversationBridgeService` — G-123,
 * quatrième et dernier émetteur de `conversation:unread-updated` à être
 * instruit (cycle 63). Interface STRUCTURELLE, comme celle du fan-out d'envoi
 * (`UnreadBridgeBuilder`) : cette unité reste testable sans construire un vrai
 * `PrismaClient`.
 *
 * La passe demandée est celle par CONVERSATIONS (`buildBridgeData`) avec UN
 * seul candidat — ici il y a un lecteur et une conversation, donc les deux
 * passes du service se valent en coût, et c'est celle dont le paramètre
 * `cursorsByParticipant` permet de ne pas relire ce qu'on vient de lire.
 *
 * Aucun `agent` (G-127), et l'interface ne l'expose pas : l'étage agent reste
 * réservé à `GET /conversations`. Un accusé de lecture ne paie pas
 * d'aller-retour HTTP.
 */
export interface ReadStatusBridgeBuilder {
  buildBridgeData(params: {
    readonly viewerId: string;
    readonly candidates: readonly { readonly conversationId: string; readonly unreadCount: number }[];
    readonly cursorsByParticipant?: ReadonlyMap<
      string,
      { readonly lastReadAt: Date | null; readonly lastReadMessageCreatedAt: Date | null }
    >;
  }): Promise<ReadonlyMap<string, { readonly bridge: ConversationBridge }>>;
}

export interface ReadStatusBroadcastDeps {
  io: ConversationRoomEmitter | null | undefined;
  prisma: FastifyInstance['prisma'];
  readStatusService: ReadStatusSummarySource;
  privacyPreferencesService: ReadReceiptVisibility;
  /**
   * Optionnel — absent : la forme courte d'avant, `{conversationId,
   * unreadCount}`. Présent : une lecture PARTIELLE (compteur > 0 après le
   * marquage) emporte aussi son pont ✦, recalculé sur le curseur qui vient de
   * bouger. Cf. le §« Le pont » de la doc de `broadcastReadStatus`.
   */
  bridgeService?: ReadStatusBridgeBuilder;
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
 *
 * ── Le pont ✦ sur ce chemin (G-123, cycle 63) ───────────────────────────────
 *
 * Le badge que cette unité renvoie aux appareils du lecteur voyage sur
 * `conversation:unread-updated`, dont les deux clients recopient `bridge`
 * INCONDITIONNELLEMENT — `undefined` / `nil` compris. Une forme courte n'y est
 * donc pas un silence, c'est un ORDRE D'EFFACEMENT, et il n'était pas justifié
 * ici : une lecture PARTIELLE (le curseur n'avance que sur le préfixe contigu
 * déjà lu) laisse le compteur au-dessus de zéro, et l'événement annonçait « il
 * te reste N messages » en effaçant du même geste le repère qui dit lesquels.
 *
 * Le carnet du cycle 62 avait rangé ce site en arbitrage de coût — « les 5
 * requêtes de la passe à CHAQUE accusé de lecture ». C'était surcompter, de
 * deux façons :
 *
 *   - le gate à ZÉRO non-lu, que les deux émetteurs frères portent déjà, range
 *     le cas DOMINANT du côté gratuit : lire une conversation la vide, le
 *     compteur retombe à 0, le contrat gelé §3.2 dit qu'un compteur nul n'a pas
 *     de pont — l'effacement y est CORRECT et ne coûte aucune requête ;
 *   - la lecture partielle, elle, paie QUATRE requêtes et non cinq : le curseur
 *     que la passe irait relire est exactement celui que cette fonction vient
 *     de lire pour calculer le compteur qu'elle émet. Il lui est passé
 *     (`cursorsByParticipant`), ce qui a l'avantage second d'être une
 *     GARANTIE de cohérence et pas seulement une économie — le pont et le
 *     compteur du même événement sont calculés sur le même instantané de
 *     curseur, sans fenêtre pour une écriture concurrente entre les deux.
 *
 * La passe part sur les DEUX branches de préférence : la resynchro d'un lecteur
 * avec ses propres appareils n'est pas une divulgation, exactement comme le
 * badge qu'elle qualifie (propriété 1 ci-dessus). Posture d'échec identique à
 * ses trois frères : le pont est un confort, la pastille est le produit.
 */
export async function broadcastReadStatus(
  deps: ReadStatusBroadcastDeps,
  args: ReadStatusBroadcastArgs
): Promise<void> {
  const { io, prisma, readStatusService, privacyPreferencesService, bridgeService } = deps;
  if (!io) return;

  const actorUserId = args.isAnonymous ? null : args.userId;
  const personalRoomKey = actorUserId ?? args.participantId;

  // La préférence et l'arriéré de l'acteur ne dépendent pas l'un de l'autre :
  // les attendre en série ajoutait un aller-retour au chemin chaud pour rien.
  // L'arriéré ne se lit QUE sur un `read` — un `received` n'avance aucun
  // curseur, et les deux champs seraient alors une donnée qu'aucun client
  // n'applique.
  const [shouldShowReadReceipts, actorRead] = await Promise.all([
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
            // `lastReadMessageCreatedAt` ne voyage PAS sur le contrat de
            // l'événement (`lastReadAt` seul y figure) : il sert au pont
            // ci-dessous, qui se borne sur la position CHRONOLOGIQUE du curseur
            // et non sur l'horloge murale. Le lire ici épargne à la passe de
            // rejouer cette requête, et l'ancre sur le MÊME instantané que le
            // compteur émis à côté.
            select: { lastReadAt: true, lastReadMessageCreatedAt: true },
          }),
          readStatusService.getUnreadCount(args.participantId, args.conversationId),
        ]).then(([cursor, unreadCount]) => ({
          // Ce qui voyage : la frontière de lecture et l'arriéré, rien d'autre.
          // La ligne de curseur reste À CÔTÉ, jamais dans cet objet — il est
          // étalé tel quel dans le payload de l'acteur, et tout champ qu'on y
          // ajoute part sur le fil.
          sync: { lastReadAt: cursor?.lastReadAt ?? null, unreadCount },
          cursorRow: cursor
            ? {
                lastReadAt: cursor.lastReadAt ?? null,
                lastReadMessageCreatedAt: cursor.lastReadMessageCreatedAt ?? null,
              }
            : null,
        }))
      : Promise.resolve(undefined),
  ]);

  const actorReadSync = actorRead?.sync;

  /**
   * Le pont ✦ de CETTE conversation pour CE lecteur — rendu comme le CHAMP
   * DÉCLARÉ du contrat (cycle 63), jamais comme un `ConversationBridge |
   * undefined` : cet optionnel-là confondait « il n'y a pas de pont » et « je
   * n'ai pas calculé », et les deux clients recopient ce champ autoritairement.
   *
   * Trois gardes de coût, dans l'ordre où elles éliminent — et chacune déclare
   * ce qu'elle SAIT :
   *   1. pas de constructeur ⇒ on ne sait rien, donc `bridgeNotComputed()` :
   *      le client garde le pont qu'il a. C'est le comportement d'avant G-123,
   *      enfin exprimé comme un silence plutôt que comme un effacement ;
   *   2. compteur à ZÉRO ⇒ aucune requête, et pourtant un fait CONNU. C'est le
   *      cas dominant (lire une conversation la vide) et l'effacement y est
   *      correct — contrat gelé §3.2 : un compteur nul n'a pas de pont. On
   *      l'AFFIRME (`bridgeComputed(undefined)` ⇒ `null`) ;
   *   3. la passe TOMBE ⇒ `bridgeNotComputed()`. C'est la moitié que le
   *      recalcul seul ne pouvait pas exprimer : rendre `undefined` ici
   *      effaçait le pont en cache sur la foi d'un incident, et démentait la
   *      posture best-effort que les quatre émetteurs revendiquent.
   *
   * Le curseur n'est PAS relu : celui que la passe irait chercher est celui que
   * `actorRead` vient de lire. La map est donc TOUJOURS fournie, y compris VIDE
   * quand il n'existe aucune ligne de curseur — c'est la convention du service
   * (`participantIds.filter(id => map.has(id))`), et elle dit la vérité :
   * « les curseurs sont lus, ce participant n'en a pas ». L'omettre relancerait
   * la requête pour rien, et y mettre une entrée `{null, null}` dirait « lu, et
   * vide » là où il n'y a rien — dans les deux cas la passe retombe sur
   * `joinedAt`, mais seule la map vide le fait sans repayer la lecture.
   */
  const buildActorBridge = async (): Promise<{ readonly bridge?: ConversationBridge | null }> => {
    // Ne pas AVOIR de constructeur, c'est ne rien savoir — donc ne rien dire.
    if (!bridgeService || !actorRead) return bridgeNotComputed();
    // Un compteur nul, en revanche, est un FAIT connu sans requête (contrat
    // gelé §3.2) : le lecteur a tout lu, son pont doit tomber. On l'affirme.
    if (actorRead.sync.unreadCount <= 0) return bridgeComputed(undefined);
    try {
      const bridges = await bridgeService.buildBridgeData({
        viewerId: personalRoomKey,
        candidates: [
          { conversationId: args.conversationId, unreadCount: actorRead.sync.unreadCount },
        ],
        cursorsByParticipant: new Map(
          actorRead.cursorRow ? [[args.participantId, actorRead.cursorRow]] : []
        ),
      });
      return bridgeComputed(bridges.get(args.conversationId)?.bridge);
    } catch {
      // Best-effort, même posture que les trois émetteurs frères : le pont est
      // un confort, la pastille est le produit. Et depuis le cycle 63, un
      // incident de passe ne détruit plus le pont déjà en cache : on se tait.
      return bridgeNotComputed();
    }
  };

  // Lancée ICI, pas au moment d'émettre : les trois appelants REST attendent
  // cette fonction avant de répondre, et l'éventail des pairs ci-dessous lit le
  // résumé et les participants. Démarrer la passe maintenant la fait recouvrir
  // ces deux lectures — sur la branche où l'accusé part, le pont ne coûte donc
  // AUCUN temps d'attente supplémentaire à la réponse. Le `.catch` est la garde
  // du SITE d'appel, disjointe de celle du callee (§ Critical Gotchas, `void
  // p`) : la promesse peut n'être jamais attendue (aucun `read`), et un rejet
  // sans écouteur tue le process sous Node 22.
  const actorBridgePromise = buildActorBridge().catch(() => bridgeNotComputed());

  // Synchro interne, pas une divulgation : le badge se recale sur les appareils
  // de l'acteur quelle que soit sa préférence — et le pont qui le qualifie part
  // avec lui, sur les DEUX branches. L'arriéré RÉEL, jamais un zéro écrit en
  // dur — une lecture exacte ou partielle n'avance le curseur que sur le
  // préfixe contigu déjà lu, donc des messages peuvent légitimement rester non
  // lus, et un zéro viderait à tort le badge sur TOUS ses appareils.
  //
  // Le champ `bridge` DÉCLARE lequel des trois états il porte (cycle 63) : un
  // pont recalculé, un `null` qui affirme qu'il n'y en a pas, ou RIEN quand la
  // passe n'a pas tourné. Ce dernier cas — pas de constructeur, ou passe tombée
  // — était jusqu'ici indistinguable du deuxième, et effaçait donc le pont que
  // le lecteur avait en cache sur la foi d'un incident.
  const emitUnreadUpdate = async () => {
    if (!actorReadSync) return;
    const bridgeField = await actorBridgePromise;
    io.to(ROOMS.user(personalRoomKey)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
      conversationId: args.conversationId,
      unreadCount: actorReadSync.unreadCount,
      ...bridgeField,
    });
  };

  if (!shouldShowReadReceipts) {
    await emitUnreadUpdate();
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
    event: SERVER_EVENTS.READ_STATUS_UPDATED,
    payload: peerPayload,
    exceptRooms: actorReadSync ? [ROOMS.user(personalRoomKey)] : null,
  });

  // La version de l'acteur, dans sa seule room personnelle — celle que toutes
  // ses sessions ont rejointe à l'authentification, compte ou pas.
  if (actorReadSync) {
    const actorPayload: ReadStatusUpdatedEventData = { ...peerPayload, ...actorReadSync };
    io.to(ROOMS.user(personalRoomKey)).emit(SERVER_EVENTS.READ_STATUS_UPDATED, actorPayload);
  }

  await emitUnreadUpdate();
}
