/**
 * Location Handler
 * Handles live location sharing events.
 *
 * Real-time only — no Prisma persistence (no Location model in schema).
 * Validates participant membership, then broadcasts to conversation room.
 *
 * ─── Le registre des sessions ────────────────────────────────────────────────
 *
 * « Real-time only » ne veut pas dire « sans état ». Tant que le handler n'a
 * gardé AUCUNE trace des partages en cours, `location:live-stopped` n'était émis
 * que par un `location:live-stop` EXPLICITE, et trois fins de vie n'en
 * produisaient donc aucun :
 *
 *   1. le socket du partageur meurt (arrêt forcé, crash, perte de réseau) — les
 *      pairs gardent une épingle qui se présente comme vivante, figée sur la
 *      dernière position connue, jusqu'à `expiresAt` : **jusqu'à 8 heures**
 *      (`durationMinutes` ≤ 480). Sur une fonction dont le contrat entier est
 *      « voici où je suis MAINTENANT », c'est un défaut de sécurité avant d'être
 *      un défaut d'affichage ;
 *   2. le terme lui-même — `expiresAt` était calculé, expédié, puis oublié : un
 *      indice que le serveur n'appliquait jamais ;
 *   3. et faute d'état, `socket.to(room)` ne touchant que les sockets présents à
 *      l'instant du départ, un participant qui ouvre la conversation ENSUITE
 *      n'apprenait jamais l'existence du partage.
 *
 * Le registre tient une entrée par `(conversationId, userId)` — un compte ne
 * partage qu'une position par conversation, et c'est le DERNIER appareil à
 * l'avoir démarrée qui en est propriétaire. Il est borné par le nombre de
 * partageurs connectés : la déconnexion ferme l'entrée, qui est donc son propre
 * ramasse-miettes.
 *
 * Une session INCONNUE n'est jamais une session TERMINÉE. Après un redémarrage
 * de la passerelle le registre est vide alors que des partages tournent : leurs
 * `live-update` continuent d'être relayés. Couper sur « pas d'entrée » ferait
 * mourir tout partage en cours à chaque déploiement.
 *
 * `conversation:leave` ne retracte RIEN, à l'inverse de la frappe : côté client
 * il signifie « j'ai quitté cet écran », pas « j'ai quitté le groupe » — un
 * partage légitimement poursuivi en arrière-plan y perdrait la vie.
 *
 * ─── La quatrième fin de vie : la CLÔTURE du fil ─────────────────────────────
 *
 * Les trois fins ci-dessus sont celles du PARTAGE. Il en manquait une, et c'est
 * celle du CONTENEUR : `Conversation.closedAt` est documenté par « Conversation
 * closed for all — no one can write, messages stay readable », et fermer
 * n'éteignait aucun partage en cours du fil fermé.
 *
 * Le coût est exactement celui que l'en-tête chiffre déjà pour le socket mort,
 * aggravé d'un cran : les clients RETIRENT la conversation de leur cache sur
 * `conversation:closed` (web `use-socket-cache-sync`, iOS `SocialSocketManager`),
 * si bien que l'épingle survivait dans un fil que son propriétaire ne peut même
 * plus ouvrir pour l'arrêter — jusqu'à huit heures, sans recours.
 *
 * `endSessionsForClosedConversation` n'invente AUCUN mécanisme : elle avance le
 * terme à MAINTENANT et diffuse le retrait, c'est-à-dire qu'elle fait de la
 * clôture une expiration anticipée. Toutes les propriétés du terme sont donc
 * déjà écrites et déjà gardées — les `live-update` d'après sont tus par la borne
 * de `handleLiveLocationUpdate`, le rattrapage saute l'entrée, et la
 * déconnexion la ramasse sans rediffuser une fin déjà annoncée.
 *
 * ─── La cinquième : la fin de l'APPARTENANCE ────────────────────────────────
 *
 * La quatrième est la mort du conteneur. Reste celle qui ne tue NI le partage NI
 * le conteneur, mais en sort le partageur : quitter, être banni, être retiré par
 * un modérateur, supprimer le fil pour soi. Le fil VIT, les autres membres
 * restent dans la room — et le partage y survivait.
 *
 * Son coût est celui de la clôture, obtenu par le chemin inverse. Là, le fil
 * disparaissait des écrans avec, dedans, l'unique commande d'arrêt. Ici l'écran
 * disparaît de la même façon, mais la commande est déjà morte AVANT :
 * `handleLiveLocationStop` commence par `_resolveParticipantId`, qui exige
 * `isActive: true`. La sortie fait donc taire le SEUL verbe capable de retirer
 * l'épingle, et il tombe en silence — un `return` sans callback ni erreur. La
 * position réelle du sortant restait affichée au groupe qui vient de l'exclure,
 * figée sur sa dernière valeur (les `live-update` d'après butent sur la même
 * garde), jusqu'à huit heures. Son appareil, lui, n'apprenait jamais rien : il
 * gardait le GPS allumé pour un partage que le serveur jette.
 *
 * `endSessionsForDepartedMember` n'invente pas davantage : même avance du terme,
 * mais sur UNE entrée — le fil vit, et les partages des membres restants avec
 * lui. Elle est appelée par `socketio/endConversationMembership.ts`, le point de
 * convergence des quatre chemins de sortie, AVANT que les sockets du partant ne
 * quittent la room : c'est par cette room que passe le seul signal capable de
 * couper son GPS.
 *
 * ─── LE BLOCAGE : un FILTRE D'ANNONCE, et rien d'autre (#16745) ────────────
 *
 * Deux signaux du MÊME salon filtrent déjà le blocage bidirectionnel, et le
 * disent : la frappe (`StatusHandler._getBlockedSocketIdsInRoom` — « typing is
 * a more sensitive, moment-to-moment signal than presence ») et le regard
 * (`ConversationViewingHandler` — « exclut les pairs bloqués dans les deux
 * sens »). Ce handler n'avait AUCUNE occurrence de `block` : ses quatre
 * diffusions partaient au salon entier, et `replayLiveLocationsTo` rejouait
 * spontanément la dernière position connue à tout socket qui entre.
 *
 * Un blocage ne retire personne d'une conversation — `routes/directory/blocks.ts`
 * pousse l'id dans `User.blockedUserIds` et coupe NOMMÉMENT les canaux temps
 * réel (`cancelAutoAcquaintanceOnBlock`, `stopBringsAfterUserBlock`,
 * `cutTalkiesOnBlock`, `refreshNowPlayingAfter`). La position en direct n'était
 * pas dans cette énumération, et c'est le plus révélateur des cinq.
 *
 * `LiveLocationSession.blockRelated` est un **FILTRE D'ANNONCE**. Il ne sert
 * qu'aux deux événements qui RÉVÈLENT une coordonnée — `started` et `updated` —
 * et il n'est JAMAIS utilisé autrement :
 *
 *   - comme liste d'EXCLUSION, jamais comme liste de DESTINATAIRES. La loi
 *     partagée `getBlockRelatedUserIds` rend l'ensemble bidirectionnel ENTIER du
 *     partageur, **à l'échelle du dépôt et sans notion de conversation** — son
 *     doc-comment le dit : « an id in this set that owns no socket contributes
 *     nothing to AN EXCLUSION LIST ». L'INVERSER en destinations adresserait des
 *     gens qui ne sont pas dans le fil, et leur apprendrait l'existence d'un
 *     identifiant de conversation et d'un partage. Une première version de ce
 *     lot le faisait, pour retirer l'épingle d'un pair bloqué en cours de route ;
 *     c'était une porte NEUVE, pire que le défaut fermé ;
 *   - et **les RÉTRACTATIONS ne sont pas filtrées du tout.**
 *
 * ─── Pourquoi une rétractation ne se filtre pas ─────────────────────────────
 *
 * `location:live-stopped` ne porte aucune position : `{conversationId, userId,
 * stoppedAt}`. Le filtrer coûterait beaucoup plus qu'il ne protège, et le
 * raisonnement se tient en deux lignes.
 *
 * Qui porte l'épingle ? Ceux à qui un `started` est parvenu. Cet ensemble n'est
 * PAS le complément de `blockRelated` : il dépend de l'instant de chaque
 * annonce, d'un redémarrage de partage sur un second appareil, d'une
 * reconnexion, d'un rafraîchissement arrivé entre-temps. Le serveur ne peut pas
 * le connaître sans tenir une algèbre d'intersections à travers toutes les
 * annonces de la session — et la moindre erreur, dans ce sens-là, LAISSE une
 * position RÉELLE plantée sur la carte d'un pair bloqué jusqu'au terme, c'est-à-
 * dire jusqu'à huit heures, sans aucun chemin de retrait.
 *
 * Le filtre inverse, lui, concède UN événement sans position à un
 * CO-PARTICIPANT, qui apprend qu'un partage a eu lieu dans un fil qu'il partage
 * déjà. Entre les deux, le choix n'est pas serré :
 *
 * | posture du retrait | ce qu'elle coûte |
 * |---|---|
 * | filtré | une épingle sur une position réelle, jusqu'à 8 h, chez un bloqué |
 * | **non filtré** | un événement sans position, une fois par partage, à un membre du fil |
 *
 * Conséquence directe, et c'est la propriété qui rend le tout robuste : **aucun
 * invariant d'état ne porte le retrait.** Il n'y a rien à tenir à jour, rien à
 * rejouer si une émission se perd, rien à recalculer au redémarrage d'un
 * partage, et rien à décider entre union et intersection quand un compte a deux
 * appareils. Les quatre chemins de retrait du cycle de vie (arrêt explicite,
 * terme, socket mort, clôture ou sortie du fil) diffusent au salon.
 *
 * Même principe au regard, #16752 : là-bas `SocketViewing.blockRelated` filtre
 * `viewing:start`, l'instantané et `viewing:activity`, et les deux rétractations
 * partent sans exclusion.
 */

import type { MeeshySocket as Socket } from '../typed-socket';
import type { MeeshyIOServer as SocketIOServer } from '../typed-socket';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type {
  SocketIOResponse,
  LocationLiveStartData,
  LocationLiveStartedEventData,
  LocationLiveUpdateData,
  LocationLiveUpdatedEventData,
  LocationLiveStopData,
  LocationLiveStoppedEventData,
} from '@meeshy/shared/types/socketio-events';
import { getConnectedUser, type SocketUser } from '../utils/socket-helpers';
import {
  isConversationClosed,
  GLOBAL_ADULTS_ONLY_CODE,
  MINOR_GLOBAL_REFUSAL_MESSAGE,
} from '../../services/messaging/conversationWriteAdmission';
import { refusesMinorInConversation, refusesMinorInConversationOfType } from '../../services/messaging/globalMinorGate';
import { GLOBAL_CONVERSATION_TYPE } from '@meeshy/shared/utils/global-minor-restriction';
import { validateSocketEvent } from '../../middleware/validation.js';
import {
  SocketLocationLiveStartSchema,
  SocketLocationLiveUpdateSchema,
  SocketLocationLiveStopSchema,
} from '../../validation/socket-event-schemas.js';
import { getBlockRelatedUserIds } from '../../utils/blocking';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';
import { EngagementService } from '../../services/engagement/EngagementService';
import { guardedTimeout } from '../../utils/guarded-timer.js';

const logger = enhancedLogger.child({ module: 'LocationHandler' });

export interface LocationHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  /**
   * `userId` → ses sockets, pour composer la liste d'exclusion d'un blocage
   * (#16745). Même dépendance, même usage et même forme que chez les deux
   * jumeaux de salon, `StatusHandler` et `ConversationViewingHandler` : un
   * ensemble d'ids de comptes s'y traduit en ids de sockets en O(|bloqués|),
   * jamais par un balayage de la population connectée.
   */
  userSockets: Map<string, Set<string>>;
  normalizeConversationId: (conversationId: string) => Promise<string>;
  /**
   * Le moteur d'engagement (#8959 `tool.location`, variante `live`). Absent ⇒
   * le moteur réel ; `null` ⇒ aucun crédit.
   */
  engagement?: Pick<EngagementService, 'recordActivity'> | null;
  /** Injectable pour les tests ; l'horloge murale en production. */
  now?: () => Date;
}

/** Un partage en cours, tel que le serveur le connaît. */
interface LiveLocationSession {
  readonly conversationId: string;
  readonly userId: string;
  readonly username: string;
  /** Le socket qui a démarré CE partage — le seul dont la mort le retire. */
  readonly socketId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly durationMinutes: number;
  readonly startedAt: Date;
  readonly expiresAt: Date;
  /**
   * #9927 — le partage vit dans Meeshy Global : chaque mise à jour revérifie
   * que le partageur n'est pas devenu mineur déclaré entre-temps (une lecture
   * de date de naissance, et seulement pour ces partages-là).
   */
  readonly inGlobal: boolean;
  /**
   * LE FILTRE D'ANNONCE (#16745) — l'ensemble bidirectionnel du blocage, tel
   * qu'il a été PROUVÉ au plus tard il y a `BLOCK_SET_REFRESH_MS`.
   *
   * Il ne gouverne que `started` et `updated`, les deux événements qui révèlent
   * une coordonnée, et seulement comme liste d'EXCLUSION. Les rétractations ne
   * le lisent pas (cf. l'en-tête : une rétractation ne se filtre pas).
   */
  readonly blockRelated: ReadonlySet<string>;
  /** L'instant de la dernière TENTATIVE de lecture — échouée comprise. */
  readonly blockRelatedAt: number;
}

/**
 * Le pas de rafraîchissement de `blockRelated` sur le chemin chaud.
 *
 * Un partage vit jusqu'à huit heures (`durationMinutes` ≤ 480) : une lecture
 * faite au seul départ laisserait un blocage POSTÉRIEUR sans effet pendant tout
 * le reste — c'est-à-dire le symptôme même qu'on corrige, à un instant près.
 * Relire à chaque `live-update` est l'autre extrême : une position par seconde
 * et par partageur, sur le chemin que l'en-tête de `_readConversationGate`
 * protège explicitement.
 *
 * Une minute borne l'exposition sans mettre la base sur le trajet du GPS, et
 * une TENTATIVE échouée repousse l'horloge de la même façon : une base en
 * difficulté est interrogée une fois par minute, pas à chaque point.
 *
 * CE QUE CETTE MINUTE VAUT, EN POINTS, parce qu'une borne de temps ne dit pas
 * son coût : `LOCATION_LIVE_UPDATE` plafonne à **120 points par minute et par
 * compte** (`socket-rate-limiter.ts`, « ~2 GPS updates/sec »). Un blocage qui
 * tombe juste après un rafraîchissement laisse donc passer jusqu'à **120
 * positions successives** — une trajectoire, pas un instant. Le jumeau de la
 * frappe relit à CHAQUE `typing:start` ; ici ce serait 120 lectures par minute
 * et par partageur. La seule façon de fermer la fenêtre sans la payer est de
 * faire couper le partage par la ROUTE de blocage, comme `cutTalkiesOnBlock`
 * coupe le talkie — c'est #16794, et cela exige un canal inter-instances que ce
 * registre en mémoire n'a pas.
 */
const BLOCK_SET_REFRESH_MS = 60_000;

// Préfixée par la longueur plutôt que jointe par un séparateur : les deux
// moitiés sont des identifiants opaques (ObjectId, ou jeton de session pour
// un anonyme), et aucun caractère ne peut être déclaré absent des deux.
const sessionKey = (conversationId: string, userId: string): string =>
  `${conversationId.length}:${conversationId}:${userId}`;

export class LocationHandler {
  private io: SocketIOServer;
  private prisma: PrismaClient;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private userSockets: Map<string, Set<string>>;
  private normalizeConversationId: (conversationId: string) => Promise<string>;
  private rateLimiter = getSocketRateLimiter();
  private sessions = new Map<string, LiveLocationSession>();
  private expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly engagement: Pick<EngagementService, 'recordActivity'> | null;
  private readonly now: () => Date;

  constructor(deps: LocationHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.userSockets = deps.userSockets;
    this.normalizeConversationId = deps.normalizeConversationId;
    this.engagement = deps.engagement === undefined ? new EngagementService(deps.prisma) : deps.engagement;
    this.now = deps.now ?? (() => new Date());
  }

  async handleLiveLocationStart(
    socket: Socket,
    data: LocationLiveStartData,
    callback?: (response: SocketIOResponse<LocationLiveStartedEventData>) => void
  ): Promise<void> {
    try {
      // Frontière socket : même garde Zod que les onze jumelles. Le schéma borne
      // coordonnées et durée (ce que faisait `_validateCoordinates` + la garde
      // de durée), et remonte le message métier sous `'Validation failed: …'`.
      const schemaValidation = validateSocketEvent(SocketLocationLiveStartSchema, data);
      if (schemaValidation.success === false) {
        this._sendError(callback, schemaValidation.error);
        return;
      }
      const validated = schemaValidation.data;

      const context = this._getUserContext(socket);
      if (!context) {
        this._sendError(callback, 'User not authenticated');
        return;
      }

      const allowed = await this.rateLimiter.checkLimit(context.userId, SOCKET_RATE_LIMITS.LOCATION_LIVE_START);
      if (!allowed) {
        this._sendError(callback, 'Rate limit exceeded');
        return;
      }

      const normalizedId = await this.normalizeConversationId(validated.conversationId);

      const participantId = await this._resolveParticipantId(context, normalizedId);
      if (!participantId) {
        this._sendError(callback, 'Not a participant in this conversation');
        return;
      }

      // Posée APRÈS l'appartenance, et c'est le seul ordre défendable : l'état
      // d'un fil ne se raconte pas à qui n'y est pas. La garde de clôture est
      // celle des quatre portes d'entrée (cycles 70/71/72) — même prédicat,
      // même source de vérité, et il lit les DEUX colonnes parce que les fils
      // fermés par l'ancien `leave.ts` n'ont qu'`isActive: false`.
      const conversation = await this._readConversationGate(normalizedId);
      if (isConversationClosed(conversation)) {
        this._sendError(callback, 'Conversation is closed');
        return;
      }

      // #9927 — une épingle en direct paraît à tout le salon : un mineur
      // déclaré ne la pose pas dans Meeshy Global (règle 5 de l'envoi).
      const now = this.now();
      const minorInGlobal = await refusesMinorInConversationOfType(this.prisma, {
        conversationType: conversation?.type,
        userId: context.isAnonymous ? null : context.userId,
        now,
      });
      if (minorInGlobal) {
        callback?.({ success: false, error: MINOR_GLOBAL_REFUSAL_MESSAGE, code: GLOBAL_ADULTS_ONLY_CODE });
        return;
      }

      // LE BLOCAGE, FAIL-CLOSED (#16745) — une coordonnée vivante ne part pas
      // sans audience PROUVÉE. Le refus se présente comme les quatre autres de
      // ce verbe : l'appareil n'allume pas son GPS pour un partage que le
      // serveur n'a pas ouvert.
      const blockRelated = await this._blockRelatedOf(context);
      if (blockRelated === null) {
        this._sendError(callback, 'Unable to resolve sharing audience');
        return;
      }

      const expiresAt = new Date(now.getTime() + validated.durationMinutes * 60_000);

      const eventData: LocationLiveStartedEventData = {
        conversationId: normalizedId,
        userId: context.userId,
        username: context.displayName,
        latitude: validated.latitude,
        longitude: validated.longitude,
        durationMinutes: validated.durationMinutes,
        expiresAt,
        startedAt: now,
      };

      this._openSession({
        conversationId: normalizedId,
        userId: context.userId,
        username: context.displayName,
        socketId: socket.id,
        latitude: validated.latitude,
        longitude: validated.longitude,
        durationMinutes: validated.durationMinutes,
        startedAt: now,
        expiresAt,
        inGlobal: conversation?.type === GLOBAL_CONVERSATION_TYPE,
        blockRelated,
        blockRelatedAt: now.getTime(),
      });

      callback?.({ success: true, data: eventData });
      // Diffuser aux AUTRES participants uniquement (socket.to, pas io.to) : le
      // partageur connaît déjà sa propre session via l'ACK ci-dessus, et les
      // clients traitent tout LOCATION_LIVE_* reçu comme l'état d'un pair DISTANT
      // (cf. StatusHandler typing + CallEventsHandler media-toggle). Un self-echo
      // ferait apparaître le partageur comme un partageur distant sur sa carte.
      this._fromSocketExcept(socket, ROOMS.conversation(normalizedId), blockRelated)
        .emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, eventData);
      this._creditLiveLocation(context, normalizedId);
    } catch (error: unknown) {
      logger.error('Error handling location:live-start', error);
      this._sendError(callback, error instanceof Error ? error.message : 'Failed to start live location');
    }
  }

  async handleLiveLocationUpdate(
    socket: Socket,
    data: LocationLiveUpdateData
  ): Promise<void> {
    try {
      // Frontière socket : même garde Zod que les jumelles. Un stream sans
      // callback — un refus se traduit par un `return` silencieux, comme le
      // faisait `_validateCoordinates`.
      const schemaValidation = validateSocketEvent(SocketLocationLiveUpdateSchema, data);
      if (schemaValidation.success === false) return;
      const validated = schemaValidation.data;

      const context = this._getUserContext(socket);
      if (!context) return;

      const allowed = await this.rateLimiter.checkLimit(context.userId, SOCKET_RATE_LIMITS.LOCATION_LIVE_UPDATE);
      if (!allowed) return;

      const normalizedId = await this.normalizeConversationId(validated.conversationId);

      const participantId = await this._resolveParticipantId(context, normalizedId);
      if (!participantId) return;

      const now = this.now();
      const key = sessionKey(normalizedId, context.userId);
      const session = this.sessions.get(key);
      // #9927 — une session CONNUE a passé la règle 5 à son départ. Une session
      // INCONNUE (redémarrage, ou client qui n'a jamais démarré) passe la même
      // vérification avant d'être relayée : sans elle, `live-update` seul
      // posait une épingle dans Global sans jamais rencontrer la garde.
      if (!session && await refusesMinorInConversation(this.prisma, {
        conversationId: normalizedId,
        userId: context.isAnonymous ? null : context.userId,
        now,
      })) return;
      // Passé le terme, la position n'est plus relayée. Sans cette borne le
      // retrait diffusé à l'expiration serait défait par la mise à jour
      // suivante : le pair recevrait un `stopped`, puis un `updated` qui
      // recrée l'épingle. Une session inconnue, elle, passe (cf. l'en-tête).
      if (session && now >= session.expiresAt) return;
      if (session?.inGlobal && await refusesMinorInConversationOfType(this.prisma, {
        conversationType: GLOBAL_CONVERSATION_TYPE,
        userId: context.isAnonymous ? null : context.userId,
        now,
      })) {
        this._expireSessionNow(key, session, now);
        return;
      }
      // LE BLOCAGE, RAFRAÎCHI PAR PAS D'UNE MINUTE (#16745). Trois états, et
      // ils se nomment : `undefined` = pas l'heure de relire ; `null` = relu
      // et RIEN PROUVÉ ; un ensemble = prouvé. Les deux premiers conduisent à
      // la même action — garder l'ensemble retenu — et c'est voulu : on
      // n'élargit JAMAIS l'audience d'une position sur un doute.
      let hidden: ReadonlySet<string>;
      if (session) {
        const dueForRefresh = now.getTime() - session.blockRelatedAt >= BLOCK_SET_REFRESH_MS;
        const refreshed = dueForRefresh ? await this._blockRelatedOf(context) : undefined;
        hidden = refreshed ?? session.blockRelated;

        // La dernière position connue est ce que le rattrapage rejouera : sans
        // ce rafraîchissement, un arrivant recevrait le point de DÉPART, qui
        // peut avoir des heures.
        this.sessions.set(key, {
          ...session,
          latitude: validated.latitude,
          longitude: validated.longitude,
          blockRelated: hidden,
          blockRelatedAt: refreshed === undefined ? session.blockRelatedAt : now.getTime(),
        });
      } else {
        // Session INCONNUE (redémarrage, ou client qui n'a jamais démarré) :
        // elle passe la même porte que le départ, pas un chemin plus large.
        // Fail-closed — un point non relayé revient à la seconde suivante, une
        // position servie à un pair bloqué ne se retire pas.
        //
        // COÛT ASSUMÉ, ET IL NE DATE PAS DE CE LOT : faute de session, il n'y a
        // rien où amortir, donc cette lecture a lieu à CHAQUE point — jusqu'à
        // 120 par minute et par partageur (`LOCATION_LIVE_UPDATE`). C'est
        // exactement le régime que `refusesMinorInConversation`, dix lignes
        // plus haut, paie déjà sur ce même chemin : ce lot double une dépense
        // existante, il ne l'invente pas, et la situation est transitoire (un
        // redémarrage, le temps que les partages en cours s'éteignent).
        // Amortir les DEUX ensemble est le suivi #16791.
        const fresh = await this._blockRelatedOf(context);
        if (fresh === null) return;
        hidden = fresh;
      }

      const eventData: LocationLiveUpdatedEventData = {
        conversationId: normalizedId,
        userId: context.userId,
        latitude: validated.latitude,
        longitude: validated.longitude,
        altitude: validated.altitude,
        accuracy: validated.accuracy,
        speed: validated.speed,
        heading: validated.heading,
        timestamp: now,
      };

      // Aux autres participants uniquement — le partageur est la source des
      // updates, un self-echo n'aurait aucune valeur (cf. handleLiveLocationStart).
      this._fromSocketExcept(socket, ROOMS.conversation(normalizedId), hidden)
        .emit(SERVER_EVENTS.LOCATION_LIVE_UPDATED, eventData);
    } catch (error: unknown) {
      logger.error('Error handling location:live-update', error);
    }
  }

  async handleLiveLocationStop(
    socket: Socket,
    data: LocationLiveStopData
  ): Promise<void> {
    try {
      // Frontière socket : la PREMIÈRE garde de ce verbe (il n'en avait aucune).
      // Sans callback — refus = `return` silencieux.
      const schemaValidation = validateSocketEvent(SocketLocationLiveStopSchema, data);
      if (schemaValidation.success === false) return;
      const validated = schemaValidation.data;

      const context = this._getUserContext(socket);
      if (!context) return;

      const allowed = await this.rateLimiter.checkLimit(context.userId, SOCKET_RATE_LIMITS.LOCATION_LIVE_STOP);
      if (!allowed) return;

      const normalizedId = await this.normalizeConversationId(validated.conversationId);

      const participantId = await this._resolveParticipantId(context, normalizedId);
      if (!participantId) return;

      this._closeSession(sessionKey(normalizedId, context.userId));

      const eventData: LocationLiveStoppedEventData = {
        conversationId: normalizedId,
        userId: context.userId,
        stoppedAt: new Date(),
      };

      // Aux autres participants uniquement (cf. handleLiveLocationStart), et
      // SANS exclusion de blocage : une rétractation ne se filtre pas (#16745,
      // cf. l'en-tête). Ce verbe n'exige d'ailleurs pas qu'un partage ait jamais
      // existé — ses quatre gardes sont Zod, le contexte, le débit et
      // l'appartenance — si bien qu'une exclusion tirée d'une session absente
      // n'aurait rien dit de vrai sur qui porte une épingle.
      socket.to(ROOMS.conversation(normalizedId)).emit(SERVER_EVENTS.LOCATION_LIVE_STOPPED, eventData);
    } catch (error: unknown) {
      logger.error('Error handling location:live-stop', error);
    }
  }

  /**
   * Retire les partages que CE socket portait. Jumeau exact du `typing:stop`
   * de `StatusHandler.handleSocketDisconnecting` — la position en direct était
   * le seul état éphémère par socket à ne pas l'avoir.
   *
   * Synchrone À DESSEIN : le point d'appel est `disconnecting`, la dernière
   * fenêtre où le socket est encore dans ses rooms. Rien ici n'a besoin de la
   * base — le registre porte déjà tout — et une seule `await` suffirait à
   * laisser la diffusion partir après la sortie des rooms.
   *
   * La propriété est portée par la session, pas par le compte : un second
   * appareil qui a repris le partage de la même conversation en est devenu
   * propriétaire, et la mort du premier ne le retire donc pas.
   */
  handleSocketDisconnecting(socketId: string): void {
    const now = new Date();
    for (const [key, session] of [...this.sessions]) {
      if (session.socketId !== socketId) continue;
      // Une entrée SURVIT à son terme — c'est elle qui fait taire les
      // `live-update` d'après, et c'est cette déconnexion qui la ramasse. Mais
      // son retrait a déjà été diffusé par la minuterie : le rediffuser ici
      // annoncerait deux fois la même fin.
      const wasLive = now < session.expiresAt;
      this._closeSession(key);
      if (wasLive) this._broadcastStopped(session);
    }
  }

  /**
   * Rejoue les partages en cours au socket qui entre dans la conversation.
   *
   * Le seul rattrapage possible : `location:live-started` n'existe pas en
   * version « snapshot », et les clients savent déjà le traiter. La position
   * servie est la DERNIÈRE connue, pas celle du départ.
   *
   * Le partageur ne se reçoit jamais lui-même : les clients lisent tout
   * `LOCATION_LIVE_*` comme l'état d'un pair DISTANT, un self-echo le ferait
   * apparaître comme partageur distant sur sa propre carte (même raison que
   * `socket.to` plutôt que `io.to` dans les trois diffusions).
   *
   * ─── LE BLOCAGE SE LIT DU CÔTÉ DE L'ARRIVANT (#16745) ──────────────────────
   *
   * C'était la pire des cinq portes : sa seule exclusion était
   * `session.userId === joiner.realUserId`, si bien qu'un pair bloqué qui
   * OUVRAIT le fil recevait la dernière position connue du partageur sans avoir
   * rien demandé.
   *
   * La question est par PAIRE, et l'ensemble bidirectionnel de l'ARRIVANT y
   * répond pour TOUS les partageurs d'un coup — une lecture par jonction, jamais
   * une par session, et l'ensemble retenu côté partageur n'y suffirait pas (il
   * peut avoir jusqu'à une minute, cf. `BLOCK_SET_REFRESH_MS`, alors qu'une
   * jonction n'est pas un chemin chaud).
   *
   * FAIL-CLOSED : sans ensemble prouvé, aucun rattrapage. Un rejeu perdu se
   * rattrape au `live-update` suivant ; une position servie à un pair bloqué ne
   * se retire pas. C'est aussi ce que le site d'appel accepte déjà — « un rejeu
   * perdu ne doit de toute façon jamais faire échouer une jonction ».
   */
  async replayLiveLocationsTo(socket: Socket, conversationId: string): Promise<void> {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return;
    const joiner = getConnectedUser(userIdOrToken, this.connectedUsers);
    if (!joiner) return;

    const now = this.now();
    const live = [...this.sessions.values()].filter(session =>
      session.conversationId === conversationId
      && session.userId !== joiner.realUserId
      && now < session.expiresAt
    );
    // La lecture n'a lieu que s'il y a quelque chose à rejouer : une jonction
    // dans un fil sans partage en cours — le cas de l'immense majorité — ne
    // coûte pas une requête de plus.
    if (live.length === 0) return;

    const hidden = await this._blockRelatedOf({
      userId: joiner.realUserId,
      isAnonymous: joiner.user.isAnonymous,
    });
    if (hidden === null) return;

    // L'APPARTENANCE SE REVÉRIFIE APRÈS L'`await` (#16745). Avant ce lot cette
    // unité était synchrone : il n'y avait aucune fenêtre entre le contrôle
    // d'appartenance du site d'appel et l'émission. La lecture de blocage en
    // ouvre une, et `socket.emit` vise le SOCKET, pas la room — donc une
    // éviction concurrente (bannissement, retrait par un modérateur, départ)
    // ne le retiendrait pas, et l'ex-membre recevrait la dernière position d'un
    // tiers dans un fil dont il vient d'être exclu.
    //
    // La room EST l'autorisation mise en cache de ce chemin (#5947), et
    // `endConversationMembership` en évince le partant : la relire est le
    // contrôle le moins cher qui couvre les quatre chemins de sortie, sans une
    // requête de plus.
    if (!socket.rooms.has(ROOMS.conversation(conversationId))) return;

    for (const session of live) {
      if (hidden.has(session.userId)) continue;

      const eventData: LocationLiveStartedEventData = {
        conversationId: session.conversationId,
        userId: session.userId,
        username: session.username,
        latitude: session.latitude,
        longitude: session.longitude,
        durationMinutes: session.durationMinutes,
        expiresAt: session.expiresAt,
        startedAt: session.startedAt,
      };
      socket.emit(SERVER_EVENTS.LOCATION_LIVE_STARTED, eventData);
    }
  }

  /**
   * Éteint les partages en cours d'une conversation qui vient d'être CLOSE.
   *
   * Appelée par `announceConversationClosed` — le point de convergence des
   * trois chemins de clôture — AVANT que `conversation:closed` ne parte : les
   * clients retirent le fil de leur cache sur cette annonce, et un
   * `location:live-stopped` qui arriverait après tomberait sur une
   * conversation qu'ils ne connaissent plus.
   *
   * Avancer le terme plutôt que supprimer l'entrée est ce qui fait tenir les
   * trois propriétés du cycle de vie sans en écrire une seule (cf. l'en-tête) :
   * les `live-update` d'après sont tus par la borne de
   * `handleLiveLocationUpdate`, `replayLiveLocationsTo` saute l'entrée, et
   * `handleSocketDisconnecting` la ramasse en voyant qu'elle n'est plus vive —
   * donc sans rediffuser une fin déjà annoncée.
   *
   * Un partage DÉJÀ terminé est sauté : son retrait a été diffusé par la
   * minuterie, et la clôture n'a pas à l'annoncer deux fois.
   */
  endSessionsForClosedConversation(conversationId: string): void {
    const now = new Date();
    for (const [key, session] of [...this.sessions]) {
      if (session.conversationId !== conversationId) continue;
      this._expireSessionNow(key, session, now);
    }
  }

  /**
   * Éteint le partage qu'un membre tenait dans un fil dont il vient de SORTIR.
   *
   * La cinquième fin de vie, et la seule qui ne touche ni le partage ni le fil :
   * quitter, être banni, être retiré par un admin, supprimer le fil pour soi. Le
   * fil VIT, les autres membres restent dans la room — et le partage y survivait.
   *
   * Ce qu'elle coûtait est le symétrique exact de la clôture : le sortant perd
   * en sortant le seul pouvoir d'arrêter. `handleLiveLocationStop` commence par
   * `_resolveParticipantId`, qui exige `isActive: true` ; la sortie fait donc
   * taire le SEUL verbe capable de retirer l'épingle, et il tombe en silence —
   * un `return` sans callback ni erreur. L'épingle reste plantée dans un groupe
   * dont il ne fait plus partie, figée sur sa dernière position (les
   * `live-update` d'après sont refusés par la même garde), jusqu'à huit heures.
   *
   * `userId` est l'identifiant qui NOMME la room personnelle — `User.id` pour un
   * compte, `Participant.id` pour un invité de lien partagé. C'est exactement la
   * clé sous laquelle le registre range ses sessions (`SocketUser.id`, posé par
   * `AuthHandler` sous les deux formes) et exactement ce que les quatre routes
   * de sortie passent à `ROOMS.user()`. Les trois se lisent donc sans conversion.
   *
   * Appelée par `endConversationMembership` — le point de convergence des quatre
   * chemins — AVANT que les sockets du sortant ne quittent la room : la
   * diffusion vise `ROOMS.conversation(...)`, et c'est le seul point d'accroche
   * par lequel son propre appareil apprend qu'il doit couper le GPS.
   */
  endSessionsForDepartedMember(conversationId: string, userId: string): void {
    const key = sessionKey(conversationId, userId);
    const session = this.sessions.get(key);
    if (!session) return;
    this._expireSessionNow(key, session, new Date());
  }

  /**
   * Avance le terme à MAINTENANT et diffuse le retrait — l'extinction, en un
   * seul geste et pour les deux fins qui l'exigent.
   *
   * Avancer le terme plutôt que supprimer l'entrée est ce qui fait tenir les
   * trois propriétés du cycle de vie sans en écrire une seule : les
   * `live-update` d'après sont tus par la borne de `handleLiveLocationUpdate`,
   * `replayLiveLocationsTo` saute l'entrée, et `handleSocketDisconnecting` la
   * ramasse en voyant qu'elle n'est plus vive — donc sans rediffuser une fin
   * déjà annoncée.
   *
   * Un partage DÉJÀ terminé est sauté : son retrait a été diffusé par la
   * minuterie, et rien n'a à l'annoncer deux fois.
   */
  private _expireSessionNow(key: string, session: LiveLocationSession, now: Date): void {
    if (now >= session.expiresAt) return;

    const timer = this.expiryTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(key);
    }
    this.sessions.set(key, { ...session, expiresAt: now });
    this._broadcastStopped(session);
  }

  /** Désarme les minuteries — arrêt de la passerelle, et isolation des tests. */
  dispose(): void {
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
    this.sessions.clear();
  }

  private _openSession(session: LiveLocationSession): void {
    const key = sessionKey(session.conversationId, session.userId);
    // Un redémarrage remplace la session précédente : sa minuterie doit mourir
    // avec elle, sinon l'ancien terme retirerait le NOUVEAU partage.
    this._closeSession(key);
    this.sessions.set(key, session);

    const timer = guardedTimeout({ name: 'live-location-expiry', afterMs: Math.max(0, session.expiresAt.getTime() - session.startedAt.getTime()), logger, run: () => {
      this.expiryTimers.delete(key);
      // L'entrée SURVIT à son terme, elle n'est pas supprimée ici : c'est elle
      // qui fait taire les `live-update` d'après (cf. handleLiveLocationUpdate).
      // La déconnexion du partageur est ce qui la ramasse.
      this._broadcastStopped(session);
    } });
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as { unref: () => void }).unref();
    }
    this.expiryTimers.set(key, timer);
  }

  private _closeSession(key: string): void {
    const timer = this.expiryTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(key);
    }
    this.sessions.delete(key);
  }

  /**
   * Diffusion À TOUTE la room, partageur inclus — la seule des quatre à ne pas
   * passer par `socket.to`. Elle porte une décision du SERVEUR (le terme est
   * atteint, ou le socket est mort), pas le geste d'un pair : le partageur doit
   * l'apprendre pour cesser d'émettre. Les clients rangent les
   * `LOCATION_LIVE_*` par `userId` de pair distant, où sa propre entrée n'existe
   * pas — un self-echo de `stopped` y est donc sans effet, et il est le seul
   * point d'accroche possible pour un client qui voudra arrêter sa minuterie.
   */
  private _broadcastStopped(session: LiveLocationSession): void {
    const eventData: LocationLiveStoppedEventData = {
      conversationId: session.conversationId,
      userId: session.userId,
      stoppedAt: new Date(),
    };
    // AUCUNE exclusion : une rétractation ne se filtre pas (#16745, cf.
    // l'en-tête). C'est aussi ce qui rend cette unité tenable là où elle est
    // appelée — `handleSocketDisconnecting` est synchrone À DESSEIN (dernière
    // fenêtre où le socket est dans ses rooms), et une seule `await` suffirait
    // à laisser la diffusion partir après la sortie des rooms.
    this.io.to(ROOMS.conversation(session.conversationId)).emit(
      SERVER_EVENTS.LOCATION_LIVE_STOPPED,
      eventData
    );
  }

  /**
   * L'ensemble bidirectionnel du blocage pour ce partageur, ou `null` quand la
   * lecture N'A RIEN PROUVÉ (#16745) — trois états, jamais deux (cycle 127).
   *
   * Un `Set` vide se lirait « personne à exclure » : confondre les deux ferait
   * d'une bascule de réplique une autorisation de diffusion. L'arbitrage du
   * `unknown` se décide par ce qui est en jeu, et une coordonnée GPS vivante
   * est un secret — chaque appelant qui RÉVÈLE se tait donc plutôt que
   * d'élargir son audience.
   *
   * Un participant ANONYME n'a pas de ligne `User` : il ne peut ni bloquer ni
   * être bloqué, et l'ensemble vide est alors une PREUVE, pas une ignorance.
   */
  private async _blockRelatedOf(
    context: { userId: string; isAnonymous: boolean }
  ): Promise<ReadonlySet<string> | null> {
    if (context.isAnonymous) return new Set();
    try {
      return await getBlockRelatedUserIds(this.prisma, context.userId);
    } catch (error: unknown) {
      logger.error('live location block lookup failed', { error, userId: context.userId });
      return null;
    }
  }

  /** Les sockets des comptes à exclure — O(|bloqués|), comme chez les jumeaux. */
  private _socketIdsOf(userIds: ReadonlySet<string>): string[] {
    if (userIds.size === 0) return [];
    return [...userIds].flatMap(id => [...(this.userSockets.get(id) ?? [])]);
  }

  /**
   * Le salon MOINS les pairs bloqués, depuis le socket du partageur — qui
   * s'exclut déjà lui-même.
   *
   * L'UNIQUE composeur d'exclusion du fichier, et il n'a que deux appelants :
   * `started` et `updated`, les deux ANNONCES. Il n'existe pas de jumeau côté
   * serveur (`this.io.to(...)`) parce qu'aucune rétractation ne se filtre, et
   * que les rétractations sont les seules émissions que ce handler fait depuis
   * le serveur plutôt que depuis le socket du partageur.
   *
   * La forme conditionnelle est celle du voisin (`StatusHandler:385`) et elle
   * n'est pas cosmétique : sans blocage — le cas de la quasi-totalité des
   * partages — la chaîne d'émission est EXACTEMENT celle d'avant ce lot, donc
   * aucune diffusion nominale ne change de forme.
   */
  private _fromSocketExcept(socket: Socket, room: string, hidden: ReadonlySet<string>) {
    const excluded = this._socketIdsOf(hidden);
    return excluded.length > 0 ? socket.to(room).except(excluded) : socket.to(room);
  }

  /**
   * `tool.location`, variante `live` (#8959) — un partage en direct DÉMARRÉ.
   * Le lieu fixe, lui, voyage dans un message et se crédite à son envoi. Un
   * anonyme n'a pas de compteur. Hors du chemin de l'ACK.
   */
  private _creditLiveLocation(context: { userId: string; isAnonymous: boolean }, conversationId: string): void {
    const engagement = this.engagement;
    if (!engagement || context.isAnonymous) return;
    void Promise.resolve()
      .then(() => engagement.recordActivity(context.userId, 'tool.location', { conversationId, variant: 'live' }))
      .catch((error: unknown) => logger.warn('tool.location live engagement credit failed', { conversationId, error }));
  }

  private _getUserContext(socket: Socket): { userId: string; isAnonymous: boolean; participantId?: string; displayName: string } | null {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return null;

    const result = getConnectedUser(userIdOrToken, this.connectedUsers);
    if (!result) return null;

    return {
      userId: result.realUserId,
      isAnonymous: result.user.isAnonymous,
      participantId: result.user.participantId,
      displayName: result.user.displayName || 'Unknown',
    };
  }

  private async _resolveParticipantId(
    context: { userId: string; isAnonymous: boolean; participantId?: string },
    conversationId: string
  ): Promise<string | undefined> {
    if (context.isAnonymous) {
      if (!context.participantId) return undefined;
      const participant = await this.prisma.participant.findFirst({
        where: { id: context.participantId, conversationId, isActive: true },
        select: { id: true },
      });
      return participant?.id;
    }

    const participant = await this.prisma.participant.findFirst({
      where: { userId: context.userId, conversationId, isActive: true },
      select: { id: true },
    });
    return participant?.id;
  }

  /**
   * L'état terminal du fil ET son type (règle 5, #9927), sur le seul verbe qui
   * les interroge.
   *
   * Une lecture de plus, et seulement au DÉPART — jamais sur `live-update` d'une
   * session connue, qui est le chemin chaud (une position par seconde et par
   * partageur ; seule une session INCONNUE du registre relit le type). Les mises à
   * jour d'un partage ouvert AVANT la clôture sont tues par le terme avancé que
   * `endSessionsForClosedConversation` leur pose, sans interroger la base.
   *
   * Le `select` demande les DEUX colonnes : `isConversationClosed` accepte une
   * ligne qui n'en porte qu'une, si bien qu'en retirer une compile — et laisse
   * passer toute la population héritée. C'est la garde de REQUÊTE du cycle
   * 70-bis, et le témoin qui la tient est le seul que la mutation fait tomber.
   */
  private async _readConversationGate(
    conversationId: string
  ): Promise<{ isActive: boolean; closedAt: Date | null; type: string } | null> {
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { isActive: true, closedAt: true, type: true },
    });
  }

  private _sendError<T>(callback: ((response: SocketIOResponse<T>) => void) | undefined, message: string): void {
    callback?.({ success: false, error: message });
  }
}
