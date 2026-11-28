/**
 * Comment Reaction Handler
 * Gère les réactions emoji sur les commentaires de posts (ajout, suppression, synchronisation)
 *
 * Mirrors ReactionHandler exactly, substituting:
 *   messageId       → commentId
 *   conversationId  → postId
 *   participantId   → userId
 *   ROOMS.conversation → ROOMS.post
 *   ReactionService → CommentReactionService
 *   Anonymous users are rejected (comments require registered users to react)
 */

import type { MeeshySocket as Socket } from '../typed-socket';
import type { MeeshyIOServer as SocketIOServer } from '../typed-socket';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../services/notifications/NotificationService';
import { retractReactionNotifications } from '../../services/notifications/retractReactionNotifications';
import {
  CommentReactionService,
  type CommentReactionSync,
  type CommentReactionUpdateEvent,
} from '../../services/CommentReactionService';
import { getConnectedUser, type SocketUser } from '../utils/socket-helpers';
import type { AckOf, AckResponseOf } from '@meeshy/shared/types/socketio-events';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { validateSocketEvent } from '../../middleware/validation.js';
import {
  SocketCommentReactionAddSchema,
  SocketCommentReactionRemoveSchema,
  SocketCommentReactionRequestSyncSchema,
} from '../../validation/socket-event-schemas.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { SocketRateLimiter } from '../../utils/socket-rate-limiter.js';
import { loadCommentPostAcl, canUserInteractWithThread, canUserConsumeThread } from '../../services/posts/postVisibility.js';
import { commentAuthorSeparatedFrom } from '../../services/posts/separatedCommentAuthors.js';
import { blockedIdsAroundViewer } from '../../services/ContactDirectoryService.js';
import { createSeparatedRoomsResolver, type SeparatedRoomsResolver } from '../separatedRooms.js';
import { emitServerEvent, type ServerEventName, type ServerEventPayload } from '../serverEmit';

const logger = enhancedLogger.child({ module: 'CommentReactionHandler' });

/** Per-user token bucket: 30 reactions/min across add + remove. */
const COMMENT_REACTION_RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 60_000,
  keyPrefix: 'socket:comment:reaction',
} as const;

/** Resynchroniser un commentaire est une lecture : elle ne consomme pas le seau des réactions (#18100). */
const COMMENT_SYNC_RATE_LIMIT = {
  maxRequests: 600,
  windowMs: 60_000,
  keyPrefix: 'socket:comment:sync',
} as const;

const reactionRateLimiter = new SocketRateLimiter();

export interface CommentReactionHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
  notificationService: NotificationService;
  commentReactionService: CommentReactionService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
}

export class CommentReactionHandler {
  private io: SocketIOServer;
  private prisma: PrismaClient;
  private notificationService: NotificationService;
  private commentReactionService: CommentReactionService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private readonly logger = logger;

  /** La séparation autour des sujets d'une diffusion d'ACTIVITÉ (#20236). */
  private readonly separatedRooms: SeparatedRoomsResolver;

  constructor(deps: CommentReactionHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
    this.notificationService = deps.notificationService;
    this.commentReactionService = deps.commentReactionService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.separatedRooms = createSeparatedRoomsResolver({ prisma: deps.prisma });
  }

  /**
   * La séparation autour de TOUS les sujets que l'événement nomme — l'ACTEUR,
   * l'AUTEUR du commentaire (#20236) et chaque RÉACTEUR du roster (#20337).
   * `null` ⇒ on n'annonce rien : on ne diffuse pas une activité sans savoir à
   * qui la taire.
   *
   * Seul l'ACTEUR s'exempte (`keep`). Exempter aussi l'auteur rouvrait la
   * fuite sur le chemin de RETRAIT, qui n'a pas de porte
   * `commentAuthorSeparatedFrom` — retirer sa réaction reste permis après un
   * blocage, par décision écrite.
   *
   * **Elle est lue APRÈS la mutation depuis #20337, et il faut dire ce que
   * cela change.** #20236 la lisait avant, « pour que l'émission reste
   * synchrone après elle (l'ordre du fil porte un compteur d'agrégation) » —
   * une phrase juste du chemin LIKE (`SocialEventsHandler`, où l'émission est
   * bien synchrone) et déjà inexacte ici : `createUpdateEvent` est une LECTURE
   * EN BASE, donc un `await` siégeait déjà entre la mutation et l'émission.
   * Nommer le roster EXIGE de lire après lui, puisque lui seul le produit.
   *
   * La fenêtre de réordonnancement s'élargit donc d'un `await` ; elle ne
   * s'ouvre pas. L'`unchanged`/`!removed` en dispense : un no-op ne lit rien.
   *
   * **Deux phrases de ce doc-comment étaient fausses, et #20414 les corrige.**
   * « Deux lectures concurrentes rendent le même total final » : non — chacune
   * rend le total à l'instant où elle tourne, et c'est la LIVRAISON qui peut
   * les inverser. « Un client qui doute resynchronise
   * (`comment:reaction-request-sync`) » : **aucun client ne le fait** — relevé
   * exhaustif, l'événement n'a zéro appelant applicatif sur iOS et Android et
   * n'existe pas côté web, et le sujet iOS qui porterait son ACK n'a aucun
   * producteur. Ce qui corrige un total périmé aujourd'hui est la relecture
   * REST du fil.
   *
   * Ce que l'ordre garantit, ce que la convergence garantit, et ce que le
   * chemin de resynchronisation vaut :
   * {@link ../../../decisions/2026-11-28-l-ordre-de-deux-activites-de-commentaire-est-au-mieux-la-convergence-est-sa-garantie-20414.md}
   */
  private async separationAround(
    actorId: string,
    commentAuthorId: string | null | undefined,
    roster: readonly (string | null | undefined)[] = [],
  ): Promise<readonly string[] | null> {
    /* DEUX lectures, et elles ne se confondent pas (#20337, audit adversarial
       du lot) :

       — la PAIRE acteur/auteur (#20236) a une clé STABLE, donc elle reste
         CACHEABLE, et l'acteur s'y exempte (`keep`) ;
       — le ROSTER change à chaque événement, donc sa clé est à usage unique :
         elle passe HORS cache, sans quoi elle évince les entrées des appelants
         stables, dont les sept diffusions de CONTENU (#20216).

       **L'ACTEUR EST TOUJOURS EXCLU DE LA DIFFUSION DE ROOM, ET REÇOIT SA
       PROPRE CHARGE, FILTRÉE, SUR SA ROOM PERSONNELLE** (`emitToActor`). Ce
       n'est pas une exclusion : c'est le seul moyen de lui servir un roster
       qui ne nomme personne dont un blocage le sépare SANS lui retirer
       l'événement.

       Le deuxième audit adversarial a mesuré ce que l'exclusion sèche coûtait,
       et c'était le défaut même que ce lot refuse d'infliger aux tiers :
       `CommentHeartLedger` (iOS) garde son delta optimiste après l'envoi —
       « a socket aggregate is authoritative and clears the delta », dit son
       doc-comment, et `settle(delivered: true)` ne purge RIEN — si bien que
       l'acteur privé de la diffusion gardait un `+1` que plus rien n'effaçait :
       **un cœur de trop sur son propre écran**, indéfiniment. Et
       `except(ROOMS.user(actor))` retirant TOUS ses sockets, ses autres
       appareils restaient sur un compteur périmé, que iOS PERSISTE.

       `keep` n'a donc plus de raison d'être : l'acteur sort de la room dans
       tous les cas et reçoit sa charge servie. La décision de #20236 — « un
       sujet ne s'exclut pas de son PROPRE événement » — est mieux tenue
       qu'avec `keep`, puisqu'il le reçoit quelle que soit la séparation. */
    const [pair, rosterRooms] = await Promise.all([
      this.separatedRooms.roomsAround([actorId, commentAuthorId]),
      this.separatedRooms.roomsAround(roster, { cached: false }),
    ]);
    if (pair === null || rosterRooms === null) return null;
    return [...new Set([...pair, ...rosterRooms, ROOMS.user(actorId)])];
  }

  /**
   * La charge SERVIE à l'acteur, sur sa room personnelle — donc sur TOUS ses
   * appareils, et filtrée pour lui. C'est elle qui purge son delta optimiste.
   *
   * **Elle passe par `emitServerEvent`, et le premier jet ne le faisait pas.**
   * Il écrivait `(this.io.to(ROOMS.user(actorId)) as unknown as { emit: … })` —
   * MOT POUR MOT la neuvième porte d'émission du cycle 105, sur la MÊME room,
   * avec le même `as unknown as`, et le cliquet
   * (`__tests__/server-emit-door-sweep.test.ts`) la nommait en rouge. Un cast
   * vers le type NU n'ouvre pas un appel : il relâche le couple
   * `(événement, charge)` d'une ADRESSE NEUVE, que rien d'autre ne vérifie —
   * une diffusion Socket.IO n'a aucun sérialiseur pour rattraper l'écart. Et la
   * signature `(event: string, payload: unknown)` effaçait le couple jusqu'au
   * SITE D'APPEL (la quatrième forme, #18649).
   *
   * Le générique `<E>` porte la corrélation jusqu'aux deux appels, où le nom
   * est CONCRET ; dans ce corps `E` n'est pas résolu, et c'est exactement la
   * seconde surcharge d'`emitServerEvent` — l'unique effacement sanctionné du
   * dépôt. Jumelle : `PostReactionHandler`, qui l'emploie depuis toujours.
   */
  private emitToActor<E extends ServerEventName>(
    actorId: string,
    event: E,
    payload: ServerEventPayload<E>,
  ): void {
    emitServerEvent(this.io.to(ROOMS.user(actorId)), event, payload);
  }

  /**
   * **LE ROSTER EST LE TROISIÈME SUJET DE LA DIFFUSION** (#20337).
   *
   * `CommentReactionAggregation.userIds` nomme TOUS les réacteurs. Une
   * diffusion porte UNE charge pour N lecteurs : il n'existe donc aucun
   * filtrage par lecteur possible dessus, et la seule lecture honnête de la
   * leçon 275 (« une protection se mesure sur tout ce que la charge
   * TRANSPORTE ») est que chaque id nommé par la charge est un SUJET de
   * l'exclusion, au même titre que l'acteur et que l'auteur du commentaire.
   *
   * Sans cela : R a bloqué X ; X réagit au commentaire de B ; R n'est séparé
   * ni de l'acteur ni de B, donc il reçoit l'événement — et y lit l'id de X.
   *
   * **Le roster n'est PAS coupé**, bien que `PostReactionAggregation` porte
   * déjà la coupe (« NO userIds, count only ») : mesuré sur les trois clients,
   * `CommentHeartLedger.reconcile` (iOS) dérive « mon cœur » de
   * `reactorUserIds.contains(myUserId)` — et pas de `hasCurrentUser`, calculé
   * relativement à l'ACTEUR. Un roster tronqué ferait sur-compter d'un cœur
   * les clients DÉJÀ DÉPLOYÉS à chaque événement d'un tiers. La coupe est une
   * décision de contrat (rétrocompatibilité, #9223), pas un correctif de
   * confidentialité — elle se décide avec un train de release, pas ici.
   *
   * Coût : `roomsAround` lit les deux sens pour TOUS les sujets en deux
   * requêtes, quel que soit leur nombre. Ce qui change est le taux de succès
   * du cache (la clé est le tuple trié des sujets) — le roster d'UN emoji sur
   * UN commentaire, pas celui du post.
   */
  private rosterOf(updateEvent: { readonly aggregation?: { readonly userIds?: readonly string[] } }): readonly string[] {
    return updateEvent.aggregation?.userIds ?? [];
  }

  /**
   * **UN ACK NOMINATIF SE FILTRE PAR LECTEUR** (#20337).
   *
   * `comment:reaction-request-sync` rend `reactions[].userIds` : le roster
   * NOMINATIF de chaque emoji. Un `commentId` suffisait donc à obtenir l'id
   * d'un compte qu'on a bloqué — la porte d'accès garde l'AUTEUR du
   * commentaire (`commentAuthorSeparatedFrom`), jamais les RÉACTEURS.
   *
   * Contrairement à la diffusion, cette charge n'a qu'UN lecteur : on la
   * filtre au lieu de la refuser, ce qui est strictement mieux. Le lecteur ne
   * perd jamais son PROPRE id — on n'est séparé de personne de soi-même —
   * donc rien de ce qu'il dérive de « suis-je dans le roster ? » ne change.
   *
   * **Les COMPTES ne bougent pas.** Un agrégat sans identité n'est pas visé,
   * et un `count` par lecteur ferait diverger le même commentaire d'un lecteur
   * à l'autre pour un gain nul — même décision que les compteurs bruts de
   * `separatedCommentAuthors.ts`.
   *
   * FERMÉ : `blockedIdsAroundViewer` propage son échec, et le `catch` de
   * l'appelant rend un ack d'erreur. On ne sert pas un roster sans savoir ce
   * qu'il doit taire.
   */
  /**
   * **L'ACK EST NOMINATIF, DONC IL SE FILTRE — Y COMPRIS POUR L'ACTEUR** (#20337,
   * audit adversarial du lot).
   *
   * `comment:reaction-add` / `-remove` acquittent avec l'`updateEvent`, roster
   * compris, et le contrat « ACK == broadcast » veut que ce soit le même objet.
   * L'acteur est pourtant un LECTEUR comme un autre : rien ne l'empêche de
   * réagir à un commentaire dont le roster nomme un compte qu'il a bloqué —
   * `canUserInteractWithThread` garde l'ACL du post et
   * `commentAuthorSeparatedFrom` n'interroge que l'AUTEUR, jamais les
   * réacteurs ; et le chemin de RETRAIT n'a même pas cette porte.
   *
   * L'ACK n'ayant qu'un destinataire, il se filtre par lui — le seul endroit de
   * ce chemin où un filtrage par lecteur soit possible. L'acteur ne perd jamais
   * son propre id.
   */
  private async updateEventServedTo(
    viewerId: string,
    event: CommentReactionUpdateEvent,
  ): Promise<CommentReactionUpdateEvent> {
    const aggregation = event.aggregation as CommentReactionUpdateEvent['aggregation'] | undefined;
    if (aggregation === undefined || aggregation === null) return event;
    const userIds = aggregation.userIds as readonly string[] | undefined;
    /* Mêmes trois verdicts que `rosterServedTo`, et dans le même ordre : une
       clé ABSENTE est une forme CONNUE — il n'y a aucun roster à taire, et
       projeter y AJOUTERAIT une clé que la charge ne portait pas, ce qui
       casserait le contrat « ACK == ce que l'acteur reçoit ». Seule une valeur
       présente et non-tableau est inattendue, et celle-là se refuse. */
    if (userIds === undefined || userIds === null) return event;
    if (!Array.isArray(userIds)) {
      throw new Error('comment:reaction-* — forme de roster inattendue, filtrage impossible');
    }
    /* **UNE PANNE DE LECTURE DÉGRADE LE ROSTER, ELLE N'ANNULE PAS L'ÉVÉNEMENT**
       (#20337, 3e audit adversarial).
       Cette fonction est appelée APRÈS que la mutation est committée. Laisser
       lever plaçait le `catch` du handler devant une écriture RÉUSSIE : l'ACK
       disait `success: false`, et `separationAround` n'était jamais appelée —
       donc la diffusion était annulée pour TOUTE LA SALLE, alors que sa propre
       lecture de blocage aurait peut-être abouti. Pire, le delta optimiste de
       l'acteur n'était jamais purgé : le cœur de trop revenait par cette porte,
       celle que ce tour venait de fermer.
       L'arbitrage est celui de `NotificationService.messageLiveness` — trois
       états, et `unknown` se traite selon ce qui est en jeu : fail-CLOSED sur le
       SECRET, fail-OPEN sur la LIVRAISON. Ici le secret est le ROSTER, pas
       l'événement : un roster VIDE ne nomme personne, donc on le vide et on
       livre.

       **Et cette dégradation repose sur une propriété d'un AUTRE fichier :**
       `getBlockRelatedUserIds` (`utils/blocking.ts`) fait ses deux lectures en
       `Promise.all`, donc l'échec de l'une rejette l'ENSEMBLE. Avec un
       `allSettled` « pour la résilience », une demi-lecture rendrait un
       `separated` INCOMPLET — donc un roster PARTIELLEMENT filtré, fail-OPEN
       sous un `.catch` qui se croit fermé. Le `=== null` ci-dessous distingue
       « lecture tombée » (`[]`, ne nomme personne) de « aucun blocage »
       (roster entier) ; il ne peut rien contre une lecture à moitié servie. */
    const separated = await blockedIdsAroundViewer(this.prisma, viewerId)
      .then((ids) => new Set(ids))
      .catch((error: unknown) => {
        /* `error`, pas `warn` : un filtre de CONFIDENTIALITÉ vient de cesser
           de fonctionner. Un `warn` ne sera pas regardé, et la dégradation est
           silencieuse pour l'utilisateur (son roster est vide, pas absent). */
        this.logger.error('roster de l’acteur non filtrable — servi VIDE, l’événement part quand même', error, { viewerId });
        return null;
      });
    const served = separated === null ? [] : userIds.filter((id) => !separated.has(id));
    /* **LISTE BLANCHE, INCONDITIONNELLE** — jumelle de `rosterServedTo`, et le
       deuxième audit a eu raison de la réclamer ici aussi : cette fonction est
       NÉE dans le lot qui condamnait le spread, et elle spreadait. Projeter
       même quand il n'y a rien à taire rend la FORME servie indépendante du
       lecteur : sans cela, un champ ajouté en amont disparaîtrait pour les
       seuls lecteurs qui ont des blocages — le défaut le plus coûteux à
       reproduire qui soit. */
    return {
      ...event,
      aggregation: {
        emoji: aggregation.emoji,
        count: aggregation.count,
        hasCurrentUser: aggregation.hasCurrentUser,
        userIds: served,
      },
    };
  }

  private async rosterServedTo(
    viewerId: string,
    sync: CommentReactionSync,
  ): Promise<CommentReactionSync> {
    const reactions = sync?.reactions as CommentReactionSync['reactions'] | undefined;
    /* Une forme INATTENDUE se REFUSE, elle ne se sert pas telle quelle : un
       garde qui ne sait pas filtrer doit lever, pas passer (#20337, audit
       adversarial — ce prédicat était fail-OPEN). Le `catch` de l'appelant rend
       alors un ack d'erreur. Un tableau VIDE, lui, est une forme connue : il
       n'y a rien à taire. */
    if (reactions === undefined || reactions === null) return sync;
    if (!Array.isArray(reactions)) {
      throw new Error('comment:reaction-request-sync — forme de roster inattendue, filtrage impossible');
    }
    if (reactions.length === 0) return sync;
    const separated = new Set(await blockedIdsAroundViewer(this.prisma, viewerId));
    /* **UNE LISTE BLANCHE, JAMAIS UN SPREAD, ET INCONDITIONNELLEMENT.** `{ ...reaction, userIds: filtré }`
       garde la chaîne gardée et RECOPIE tout champ voisin — c'est ainsi que
       `users[]` (nom affiché, avatar, horodatage) a traversé ce filtre en
       citant la leçon 275 dans son propre doc-comment. Les quatre champs du
       contrat sont donc PROJETÉS un par un : un champ nominatif ajouté en amont
       ne peut plus rider, et s'il est légitime il faudra l'ajouter ICI — c'est
       fail-closed, le bon défaut pour un filtre de confidentialité. */
    return {
      ...sync,
      reactions: reactions.map((reaction) => ({
        emoji: reaction.emoji,
        count: reaction.count,
        hasCurrentUser: reaction.hasCurrentUser,
        userIds: (reaction.userIds ?? []).filter((id: string) => !separated.has(id)),
      })),
    };
  }

  /**
   * La room du post, moins ce que la loi nomme.
   *
   * La branche sans `except()` est **morte pour ses deux appelants** depuis que
   * l'acteur sort toujours de la diffusion (#20337) : `separated` porte au
   * minimum `ROOMS.user(actorId)`. Elle reste parce que la fonction ne
   * présuppose pas ses appelants — mais son doc-comment ne doit pas laisser
   * croire qu'un `except()` est l'exception ici : il est la règle.
   */
  private postRoom(postId: string, separated: readonly string[]) {
    const target = this.io.to(ROOMS.post(postId));
    return separated.length > 0 ? target.except([...separated]) : target;
  }

  /**
   * Ajoute une réaction à un commentaire
   */
  async handleAddReaction(
    socket: Socket,
    data: { commentId: string; postId: string; emoji: string },
    callback?: AckOf<'comment:reaction-add'>
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketCommentReactionAddSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        const errorResponse: AckResponseOf<'comment:reaction-add'> = {
          success: false,
          error: 'User not authenticated',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const user = userResult?.user;
      const userId = userResult?.realUserId || userIdOrToken;
      const isAnonymous = user?.isAnonymous || false;

      if (isAnonymous) {
        const errorResponse: AckResponseOf<'comment:reaction-add'> = {
          success: false,
          error: 'Only registered users can react',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const rateLimitAllowed = await reactionRateLimiter.checkLimit(userId, COMMENT_REACTION_RATE_LIMIT);
      if (!rateLimitAllowed) {
        this.logger.warn('[CommentReactionHandler] comment:reaction-add rate limit exceeded', { userId, commentId: validated.commentId });
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      // Le fil hérite de l'audience de son post, et réagir est une INTERACTION.
      // Le post est résolu DEPUIS le commentaire : le `postId` du payload est
      // fourni par le client et n'est JAMAIS cru — ni pour l'audience, ni pour
      // adresser la diffusion (voir `postId` ci-dessous).
      // Refus indistinct d'un commentaire inexistant — pas d'oracle.
      const thread = await loadCommentPostAcl(this.prisma, validated.commentId);
      if (
        !thread ||
        !(await canUserInteractWithThread(this.prisma, thread, userId)) ||
        (await commentAuthorSeparatedFrom(this.prisma, thread, userId))
      ) {
        this.logger.warn('[CommentReactionHandler] comment:reaction-add denied (visibility)', { userId, commentId: validated.commentId });
        if (callback) callback({ success: false, error: 'Comment not found' });
        return;
      }
      const postId = thread.postId;

      const reaction = await this.commentReactionService.addReaction({
        commentId: validated.commentId,
        userId,
        emoji: validated.emoji,
      });

      if (!reaction) {
        const errorResponse: AckResponseOf<'comment:reaction-add'> = {
          success: false,
          error: 'Failed to add reaction',
        };
        if (callback) callback(errorResponse);
        return;
      }

      // `postId` = celui du COMMENTAIRE, jamais celui du payload. Trois raisons,
      // et la vérité est déjà en main (`thread.postId`), donc gratuite :
      //
      // 1. ADRESSE. `handleJoinPost` fait entrer les viewers dans la room de la
      //    cible RÉSOLUE (`resolveConsumptionTarget` : un repost simple n'a pas
      //    de vie sociale propre, sa room est celle de sa racine). Un
      //    commentaire est lui aussi toujours écrit sur la cible résolue
      //    (`routes/posts/comments.ts` § `targetPostId`). Diffuser vers l'id
      //    brut du client — celui de la carte affichée, donc le REPOST —
      //    envoyait l'événement dans une room où personne n'est jamais entré :
      //    tous les autres lecteurs gardaient un compteur périmé, en silence,
      //    puisque l'ACK de l'acteur, lui, disait `success`.
      // 2. INTÉGRITÉ. `postId` est la CLÉ de cache côté client
      //    (`patchCommentInPostCaches` web, `FeedPersistenceActor` iOS). Un
      //    `postId` arbitraire y injectait l'agrégation d'un commentaire
      //    étranger, et divulguait au passage son existence et son décompte à
      //    l'audience d'un post sans rapport.
      // 3. INVARIANT PARTAGÉ. `PostReactionHandler` porte déjà la cible
      //    résolue dans SA room et SON payload (`targetPostId`, tâche 9). Les
      //    deux handlers implémentent la même règle ; seul celui-ci croyait le
      //    client — le seul écart qu'aucun test ne regardait, parce qu'en
      //    nominal les deux ids coïncident.
      const updateEvent = await this.commentReactionService.createUpdateEvent(
        validated.commentId,
        validated.emoji,
        'add',
        userId,
        postId
      );

      // Contrat ACK == broadcast : on renvoie l'`updateEvent` (commentId, postId,
      // userId, emoji, action, aggregation, timestamp) — le MÊME objet que le
      // broadcast `comment:reaction-added`. Le web ignore `data`, l'iOS le décode en
      // `SocketCommentReactionUpdateEvent`. La `reaction` brute cassait le décodage iOS.
      /* UNE seule lecture des blocages de l'acteur, pour son ACK ET pour sa
         charge personnelle (#20337, 2e audit — elle était payée pour un ACK
         qu'aucun client ne lit). */
      const servedToActor = await this.updateEventServedTo(userId, updateEvent);
      const successResponse: AckResponseOf<'comment:reaction-add'> = {
        success: true,
        data: servedToActor,
      };
      if (callback) callback(successResponse);

      if (reaction.unchanged) {
        // Idempotent no-op: the user already had exactly this emoji on this comment
        // (re-fire — optimistic double-fire, a socket retry after a lost ACK, or a
        // second device echoing the same tap). Nothing changed in the DB, so the
        // success ACK above already gives the client its desired end-state. Skip the
        // broadcast and the author notification — re-emitting them spams every
        // post-room socket and re-notifies the author for a reaction that never
        // changed state. Mirrors ReactionHandler.handleReactionAdd's `unchanged`
        // guard and this handler's own already-absent guard on remove.
        return;
      }

      /* APRÈS `createUpdateEvent`, parce que les sujets incluent le ROSTER que
         lui seul produit (#20337). L'émission reste synchrone après la lecture,
         et l'`unchanged` ci-dessus en dispense : un no-op ne lit rien. */
      const separated = await this.separationAround(userId, thread.authorId, this.rosterOf(updateEvent));

      if (separated !== null) {
        this.postRoom(postId, separated).emit(SERVER_EVENTS.COMMENT_REACTION_ADDED, updateEvent);
        /* L'acteur est hors de la room (voir `separationAround`) : sa charge
           SERVIE part sur sa room personnelle, donc sur tous ses appareils.
           C'est elle qui purge son delta optimiste. */
        this.emitToActor(userId, SERVER_EVENTS.COMMENT_REACTION_ADDED, servedToActor);
      }

      // Fire-and-forget: notification errors must not reach the outer catch after
      // success was already confirmed to the client.
      this._createCommentReactionNotification(
        validated.commentId,
        postId,
        validated.emoji,
        userId
      ).catch(err => this.logger.error('comment reaction notification failed', err, { commentId: validated.commentId }));
    } catch (error: unknown) {
      this.logger.error('Failed to add comment reaction', error, { userId: this.socketToUser.get(socket.id) });
      const errorResponse: AckResponseOf<'comment:reaction-add'> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add reaction',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Supprime une réaction d'un commentaire
   */
  async handleRemoveReaction(
    socket: Socket,
    data: { commentId: string; postId: string; emoji: string },
    callback?: AckOf<'comment:reaction-remove'>
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketCommentReactionRemoveSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        const errorResponse: AckResponseOf<'comment:reaction-remove'> = {
          success: false,
          error: 'User not authenticated',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const user = userResult?.user;
      const userId = userResult?.realUserId || userIdOrToken;
      const isAnonymous = user?.isAnonymous || false;

      if (isAnonymous) {
        const errorResponse: AckResponseOf<'comment:reaction-remove'> = {
          success: false,
          error: 'Only registered users can react',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const rateLimitAllowed = await reactionRateLimiter.checkLimit(userId, COMMENT_REACTION_RATE_LIMIT);
      if (!rateLimitAllowed) {
        this.logger.warn('[CommentReactionHandler] comment:reaction-remove rate limit exceeded', { userId, commentId: validated.commentId });
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      // Retirer reste une interaction avec le fil — même garde que la pose.
      const thread = await loadCommentPostAcl(this.prisma, validated.commentId);
      if (!thread || !(await canUserInteractWithThread(this.prisma, thread, userId))) {
        this.logger.warn('[CommentReactionHandler] comment:reaction-remove denied (visibility)', { userId, commentId: validated.commentId });
        if (callback) callback({ success: false, error: 'Comment not found' });
        return;
      }
      // Symétrique de la pose : room ET payload portent le post du COMMENTAIRE,
      // jamais l'id du payload (rationale complet dans `handleAddReaction`). Un
      // retrait mal adressé est pire qu'un ajout mal adressé : les lecteurs
      // gardent une réaction qui n'existe plus, et rien ne la rattrape tant
      // qu'ils ne refetchent pas le fil entier.
      const postId = thread.postId;

      const removed = await this.commentReactionService.removeReaction({
        commentId: validated.commentId,
        userId,
        emoji: validated.emoji,
      });

      if (!removed) {
        // Idempotent: the reaction is already absent — the caller's desired
        // end-state is achieved. Reply success (no broadcast, nothing changed)
        // instead of an error, which the client would treat as a failed un-react
        // and roll the optimistic removal back, re-showing a reaction that is
        // gone. Mirrors ReactionHandler.handleReactionRemove (message reactions).
        //
        // SANS `data`, et c'est la règle « ACK == broadcast » appliquée à la
        // lettre : rien n'a changé, donc AUCUN `updateEvent` n'est diffusé, donc
        // il n'y a rien à refléter dans l'accusé. Ce site portait
        // `{ message: 'Reaction already absent' }` — une phrase anglaise que le
        // décodeur iOS de `Socket*ReactionUpdateEvent` rejette, sur le chemin
        // que déclenche exactement le double-tap qu'un accusé idempotent existe
        // pour absorber. Les deux autres familles portaient la même, recopiée du
        // même endroit ; c'est la porte typée (`AckOf<…>`) qui les a nommées.
        if (callback) callback({ success: true });
        return;
      }

      const updateEvent = await this.commentReactionService.createUpdateEvent(
        validated.commentId,
        validated.emoji,
        'remove',
        userId,
        postId
      );

      // Contrat ACK == broadcast (voir handleAddReaction) : on renvoie l'`updateEvent`,
      // identique au broadcast `comment:reaction-removed`, au lieu d'un simple {message}.
      const servedToActor = await this.updateEventServedTo(userId, updateEvent);
      const successResponse: AckResponseOf<'comment:reaction-remove'> = {
        success: true,
        data: servedToActor,
      };
      if (callback) callback(successResponse);

      /* C'est CE chemin qui rend l'exclusion de l'AUTEUR nécessaire (#20236) :
         il n'a pas de porte `commentAuthorSeparatedFrom` — retirer sa réaction
         reste permis après un blocage, par décision écrite — donc l'auteur se
         voyait annoncer l'activité de qui il a bloqué. Et le ROSTER rejoint les
         sujets (#20337), ce qui impose de lire APRÈS `createUpdateEvent`. */
      const separated = await this.separationAround(userId, thread.authorId, this.rosterOf(updateEvent));

      if (separated !== null) {
        this.postRoom(postId, separated).emit(SERVER_EVENTS.COMMENT_REACTION_REMOVED, updateEvent);
        this.emitToActor(userId, SERVER_EVENTS.COMMENT_REACTION_REMOVED, servedToActor);
      }

      // Le symétrique du `_createCommentReactionNotification` du chemin
      // d'ajout. Le retrait couvre les DEUX familles que le commentaire
      // produit — `comment_reaction` (ce handler) et `comment_like` (la route
      // REST) — parce qu'il filtre sur les deux chemins d'id : quel que soit
      // le transport qui a posé la réaction, celui qui la défait la retire.
      void retractReactionNotifications(
        this.prisma,
        { subject: { kind: 'comment', id: validated.commentId }, actorId: userId, emoji: validated.emoji },
        this.notificationService
      ).catch(err => this.logger.error('comment reaction notification retraction failed', err, { commentId: validated.commentId }));
    } catch (error: unknown) {
      this.logger.error('Failed to remove comment reaction', error, { userId: this.socketToUser.get(socket.id) });
      const errorResponse: AckResponseOf<'comment:reaction-remove'> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove reaction',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Synchronise les réactions d'un commentaire
   */
  async handleRequestSync(
    socket: Socket,
    data: { commentId: string },
    callback?: AckOf<'comment:reaction-request-sync'>
  ): Promise<void> {
    try {
      // Validate at the socket boundary like every sibling method — otherwise a
      // malformed payload reaches `CommentReactionService.validateCommentId`, whose
      // error-message template dereferences `commentId.substring(...)` and throws
      // an opaque `TypeError` instead of the intended clean validation error.
      const schemaValidation = validateSocketEvent(SocketCommentReactionRequestSyncSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        const errorResponse: AckResponseOf<'comment:reaction-request-sync'> = {
          success: false,
          error: 'User not authenticated',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const userId = userResult?.realUserId || userIdOrToken;

      const syncAllowed = await reactionRateLimiter.checkLimit(userId, COMMENT_SYNC_RATE_LIMIT);
      if (!syncAllowed) {
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      // Synchroniser, c'est LIRE le fil : même audience que le lire
      // (`canUserConsumePost` — amis ∪ contacts DM), celle que `handleJoinPost`
      // applique déjà pour laisser entrer dans la room. Ses deux frères
      // (`handleAddReaction`, `handleRemoveReaction`) gardaient leur accès ;
      // celui-ci ne gardait rien, alors qu'il rend PLUS que le broadcast :
      // `CommentReactionSync` porte les `userIds` de chaque réacteur. Un
      // `commentId` suffisait donc à obtenir le roster nominatif d'un
      // commentaire sur un post PRIVATE dont on n'est pas l'audience.
      //
      // Audience de CONSOMMATION, pas d'INTERACTION : un contact DM non-ami lit
      // légitimement le fil (cf. `postVisibility.ts` § `canUserConsumePost`) —
      // le gater sur les amis stricts en ferait un 404, ce que la lecture REST
      // du même fil n'impose pas.
      // La liste nominative des réactions d'un commentaire d'un auteur séparé
      // ne se sert pas plus que le commentaire lui-même (#20216).
      const thread = await loadCommentPostAcl(this.prisma, validated.commentId);
      if (
        !thread ||
        !(await canUserConsumeThread(this.prisma, thread, userId)) ||
        (await commentAuthorSeparatedFrom(this.prisma, thread, userId))
      ) {
        this.logger.warn('[CommentReactionHandler] comment:reaction-sync denied (visibility)', { userId, commentId: validated.commentId });
        if (callback) callback({ success: false, error: 'Comment not found' });
        return;
      }

      const reactionSync = await this.commentReactionService.getCommentReactions({
        commentId: validated.commentId,
        currentUserId: userId,
      });

      const successResponse: AckResponseOf<'comment:reaction-request-sync'> = {
        success: true,
        data: await this.rosterServedTo(userId, reactionSync),
      };
      if (callback) callback(successResponse);
    } catch (error: unknown) {
      this.logger.error('Failed to sync comment reactions', error, { userId: this.socketToUser.get(socket.id) });
      const errorResponse: AckResponseOf<'comment:reaction-request-sync'> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync reactions',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Crée une notification de réaction sur commentaire
   */
  private async _createCommentReactionNotification(
    commentId: string,
    postId: string,
    emoji: string,
    reactorUserId: string
  ): Promise<void> {
    // Fetch comment + post in parallel pour récupérer le contexte nécessaire
    // à un body riche : "[reactor] a réagi [emoji] à votre commentaire sur la
    // story de [story_author]" (spec user 2026-05-28 — la notif sommaire
    // actuelle « XXX » + emoji nu n'expose pas le contexte du commentaire).
    const [comment, post] = await Promise.all([
      this.prisma.postComment.findUnique({
        where: { id: commentId },
        select: { authorId: true, content: true },
      }),
      this.prisma.post.findUnique({
        where: { id: postId },
        select: {
          type: true,
          author: { select: { displayName: true, username: true } },
        },
      }),
    ]);

    if (!comment?.authorId) return;

    const postAuthorName = post?.author?.displayName?.trim()
      || post?.author?.username?.trim()
      || '';

    this.notificationService
      .createCommentReactionNotification({
        commentAuthorId: comment.authorId,
        reactorUserId,
        commentId,
        postId,
        reactionEmoji: emoji,
        commentPreview: comment.content ?? '',
        postAuthorName,
        // Forward the real post type (mirror PostReactionHandler) so a reaction on a
        // comment under a REEL/STATUS keeps its entity typing instead of collapsing to POST.
        postType: post?.type,
      })
      .catch((error) => {
        this.logger.error('[CommentReactionHandler] Failed to create comment reaction notification', error, { reactorUserId, commentId, postId, emoji });
      });
  }
}
