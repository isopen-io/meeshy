/**
 * SocialEmissionCore
 * Le socle de diffusion sociale : les audiences, les adresses et la loi de
 * séparation, composé par `SocialEventsHandler`.
 */

import type { MeeshyIOServer as SocketIOServer } from '../typed-socket';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { communityPostAudienceIdsOf, type CommunityPostRef } from '../../services/posts/communityVisibility';
import { emitServerEvent, type ServerEventName, type ServerEventPayload } from '../serverEmit';
import { withAudienceListFor, withoutAudienceList } from '../../services/posts/audienceList';
import { withServedPostMedia } from '../../services/posts/servedPostMedia';
import { withoutBlockedRecipients } from '../../utils/blocking';
import { createSeparatedRoomsResolver, type SeparatedRoomsResolver } from '../separatedRooms';
import { amisAcceptes } from '../../services/friendship';
import { circleAudienceIds } from '../../services/posts/postAudience';
import { POST_CIRCLE_VISIBILITIES, postCircleAudienceFloor } from '@meeshy/shared/utils/relation-levels';
import type {
  Post,
  CommentLikedEventData,
  CommentUnlikedEventData,
} from '@meeshy/shared/types/post';

// enhancedLogger (Pino) sort en prod ; le `logger` Winston de server.ts est
// configuré à `level: 'warn'` en prod et filtre tous les `logger.info(...)`.
// Sans ce logger dédié, le fanout social était totalement invisible côté
// production et empêchait tout diagnostic en cas de "ma story n'arrive pas".
export const logger = enhancedLogger.child({ module: 'SocialEventsHandler' });

/**
 * **LA ROOM D'UN POST NE S'ADRESSE QU'AVEC SON VERDICT DE SÉPARATION** (#20430).
 *
 * Les deux champs voyagent ensemble parce que la room du post est la seule
 * adresse d'une diffusion de contenu que rien d'autre ne filtre : poser un
 * blocage n'en évince aucune socket, et la porte de `post:join` juge au moment
 * du JOIN.
 *
 * **Ce que ce type garantit, exactement** : qu'on ne puisse pas OUBLIER de
 * répondre. Il ne garantit PAS qu'on réponde juste — `{ id, separated: [] }`
 * type-checke et n'exclut personne. C'est une garde contre l'omission, la
 * forme que quatre lots ont passé leur temps à trouver à la main ; la justesse
 * du verdict reste aux témoins (audit du lot, constat C5 : la première
 * rédaction de ce commentaire affirmait l'impossible).
 *
 * `separated: null` = la lecture des blocages a échoué ⇒ on n'adresse pas la
 * room du post.
 */
export type PostRoomTarget = {
  readonly id: string;
  readonly separated: readonly string[] | null;
};

/**
 * « Personne à taire », à passer EXPLICITEMENT. Le paramètre `separated` des
 * deux seams est REQUIS, et ce n'est pas une coquetterie : une garde dont le
 * défaut est l'OUVERTURE n'est pas une garde — la prochaine famille d'activité
 * branchée sur ces seams serait non gardée en silence (audit adversarial de
 * #20338). Omettre devient donc impossible ; déclarer qu'il n'y a rien à taire
 * reste possible, et se lit comme la décision que c'est.
 */
export const NOTHING_TO_SILENCE: readonly string[] = [];

/**
 * Cycle 100 — les quatre seams de diffusion sociale, CONTRAINTS par le contrat.
 *
 * Le cycle 99 a typé le `Socket` d'un handler et rendu impossibles, à la
 * compilation, deux fautes : émettre un nom absent de `ServerToClientEvents`, et
 * émettre un payload d'une autre forme que celle déclarée pour ce nom.
 *
 * Ce handler échappait ENTIÈREMENT à cette garde, et pas par oubli d'import :
 * ses vingt-et-un sites d'émission ne touchent jamais `io.emit` directement.
 * Ils passent par quatre helpers privés déclarés `(event: string, data: unknown)`
 * — une signature qui BLANCHIT le couple. Typer `this.io` ne changeait rien :
 * à l'intérieur du helper, `event` est un `string` quelconque et `data` un
 * `unknown`, donc le contrat ne peut rien exiger, et au site d'appel il n'y a
 * plus rien à vérifier.
 *
 * > Un seam qui prend `(string, unknown)` annule le contrat de tout ce qui passe
 * > par lui. La garde ne vaut que jusqu'au premier paramètre non typé.
 *
 * C'est le chemin le PLUS exposé du dépôt : une diffusion Socket.IO n'a aucun
 * sérialiseur — pas de `fast-json-stringify` pour retirer un champ de trop, pas
 * de schéma de réponse pour signaler un champ manquant. Le typage de l'émission
 * est ici la SEULE garde qui existe entre le producteur et les décodeurs
 * iOS/Android/web, qui sont tous les trois écrits contre `ServerToClientEvents`.
 */
// Alias locaux des deux dérivations du contrat. Elles ont été ÉCRITES ici au
// cycle 100, puis retrouvées mot pour mot au cycle 104 dans les huit portes
// d'émission de la passerelle — c'est ce qui a décidé de leur donner un
// domicile unique (`socketio/serverEmit.ts`). Les noms locaux survivent parce
// que vingt-et-un sites d'appel les lisent dans les signatures publiques.
type SocialEventName = ServerEventName;
type SocialEventPayload<E extends SocialEventName> = ServerEventPayload<E>;

/**
 * L'erasure de corrélation vit désormais dans `emitServerEvent`
 * (`socketio/serverEmit.ts`), partagée avec les huit autres portes d'émission
 * de la passerelle. Elle ne blanchit toujours rien, et pour la même raison
 * qu'ici : `socket.io` enveloppe sa map d'événements dans
 * `DecorateAcknowledgementsWithMultipleResponses<…>` avant d'en dériver la
 * signature d'`emit`, et sur un `E` GÉNÉRIQUE TypeScript ne peut pas prouver
 * que cette enveloppe laisse le paramètre inchangé — alors qu'elle le fait pour
 * tout `E` concret, aucun de nos événements serveur→client ne portant d'accusé
 * de réception. Une limite d'inférence sur type mappé, pas un désaccord de
 * forme.
 *
 * Ce que l'erasure ne touche PAS : le couple `(event, data)` a déjà été vérifié
 * contre `ServerToClientEvents` à la frontière des quatre helpers publics, donc
 * à chacun des vingt-et-un sites d'appel.
 */

export class SocialEmissionCore {
  readonly io: SocketIOServer;
  private prisma: PrismaClient;

  // Cache des amis (TTL court pour éviter des queries trop fréquentes)
  readonly friendsCache: Map<string, { ids: string[]; expiresAt: number }> = new Map();
  private readonly FRIENDS_CACHE_TTL_MS = 30_000; // 30s

  /** La séparation autour des sujets d'une diffusion d'ACTIVITÉ (#20236) — deux lectures pour N sujets, cache court. */
  private readonly separatedRooms: SeparatedRoomsResolver;

  constructor(deps: { io: SocketIOServer; prisma: PrismaClient }) {
    this.io = deps.io;
    this.prisma = deps.prisma;
    this.separatedRooms = createSeparatedRoomsResolver({ prisma: deps.prisma });
  }

  // ==============================================
  // FRIEND IDS (pour le broadcast vers les feed rooms)
  // ==============================================

  private async getFriendIds(userId: string): Promise<string[]> {
    return this.cachedAudience(userId, () => amisAcceptes(this.prisma, userId), 'friend IDs');
  }

  /**
   * L'audience d'un CERCLE de l'auteur (`ACQUAINTANCES`, `CLOSE`, `BLOOD`, #13931) :
   * les comptes de niveau effectif au moins égal, lus par la loi des cercles.
   * `null` pour toute autre visibilité. Le même cache de 30 s que les amis, sous
   * une clé par cran : un like sur un post `CLOSE` ne relit pas le graphe à chaque
   * événement.
   */
  private async getCircleAudience(authorId: string, visibility: string | null | undefined): Promise<string[] | null> {
    if (postCircleAudienceFloor(visibility) === null) return null;
    return this.cachedAudience(
      `${visibility}:${authorId}`,
      async () => (await circleAudienceIds(this.prisma, authorId, visibility)) ?? [],
      'circle audience'
    );
  }

  private async cachedAudience(key: string, load: () => Promise<string[]>, what: string): Promise<string[]> {
    const cached = this.friendsCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ids;
    }

    try {
      const ids = await load();

      if (this.friendsCache.size >= 500) {
        const now = Date.now();
        for (const [k, v] of this.friendsCache) {
          if (v.expiresAt <= now) this.friendsCache.delete(k);
        }
        if (this.friendsCache.size >= 500) {
          const oldest = this.friendsCache.keys().next().value;
          if (oldest !== undefined) this.friendsCache.delete(oldest);
        }
      }
      this.friendsCache.set(key, { ids, expiresAt: Date.now() + this.FRIENDS_CACHE_TTL_MS });
      return ids;
    } catch (error) {
      logger.error(`social events — error fetching ${what}`, { key, error });
      return [];
    }
  }

  /**
   * Retire de l'audience toute personne en relation de blocage avec l'auteur,
   * dans un sens ou dans l'autre (#13350). Appliqué APRÈS le cache d'amitiés,
   * jamais dedans : un blocage prend effet à l'émission suivante, sans attendre
   * l'expiration des 30 s. Une lecture qui échoue ferme l'audience.
   */
  private async withoutBlocked(authorId: string, recipientIds: string[]): Promise<string[]> {
    return withoutBlockedRecipients(this.prisma, authorId, recipientIds);
  }

  /** Les amis de l'auteur hors relation de blocage (#13350). */
  async getUnblockedFriendIds(authorId: string): Promise<string[]> {
    return this.withoutBlocked(authorId, await this.getFriendIds(authorId));
  }

  /**
   * Broadcast vers les feed rooms des amis + l'auteur lui-même
   */
  emitToFriends<E extends SocialEventName>(
    friendIds: string[],
    authorId: string,
    event: E,
    data: SocialEventPayload<E>,
  ): void {
    // Inclure l'auteur pour feedback immédiat
    const targetIds = [...friendIds, authorId];
    for (const id of targetIds) {
      emitServerEvent(this.io.to(ROOMS.feed(id)), event, data);
    }
  }

  /**
   * Émission UNIQUE sur l'union des feed rooms (amis filtrés par visibilité +
   * auteur) ET de la post room (`ROOMS.post`). Socket.IO dédoublonne un socket
   * présent dans plusieurs rooms → livraison EXACTEMENT une fois, ce qui supprime
   * la double-livraison du modèle « boucle feed + emit post room séparé » (un
   * ami-viewer était dans sa feed room ET la post room). Cf. `commentBroadcastRooms`.
   */
  emitToFeedsAndPostRoom<E extends SocialEventName>(
    recipientIds: string[],
    authorId: string,
    postId: string,
    event: E,
    data: SocialEventPayload<E>,
    actorId: string | undefined,
    /* `null` (#20430) = la lecture des blocages a échoué sur une diffusion de
       CONTENU ⇒ la room du post n'est pas adressée, les feed rooms partent
       seules (le discriminant est écrit dans `emitPostToAudience`). Les
       diffusions d'ACTIVITÉ, dont le sujet échappe au pré-filtre des feed
       rooms, ne passent JAMAIS `null` : elles retournent avant (#20236, #20338). */
    separated: readonly string[] | null,
  ): void {
    // **L'ACTEUR fait partie de l'audience de son propre geste** (retour
    // porteur 2026-09-13 : « le like n'est pas synchronisé entre les
    // différentes vues »).
    //
    // `recipientIds` sont les amis de l'AUTEUR, filtrés par visibilité. Celui
    // qui AGIT n'y figurait que par accident — s'il se trouvait être ami de
    // l'auteur, ou l'auteur lui-même. Or le fil sert des posts PUBLICS
    // d'inconnus (`buildPostVisibilityOrFilter` accepte
    // `visibility: PUBLIC` sans restriction d'auteur), et le fil ne rejoint
    // AUCUNE post room — les seuls `joinPostRoom` sont le détail, le reel
    // viewer, la feuille de commentaires et le lecteur de story.
    //
    // Conséquence côté client : aimer depuis le fil le post public d'un
    // inconnu n'émettait rien vers son auteur. Aucun modèle n'apprenait le
    // like — ni `FeedViewModel.posts`, ni `CacheCoordinator`, ni GRDB ; seul
    // l'état optimiste de la VUE le savait, et il meurt avec elle. Le cœur se
    // vidait donc en passant au reel viewer, qui sème son état depuis
    // `FeedPost.isLiked`.
    //
    // `io.to([...])` dédoublonne (cf. `emitToUserFeedAndPostRoom` plus bas) :
    // ajouter l'acteur ne double aucune livraison quand il est déjà ami ou
    // auteur. Les six consommateurs client sont déjà abonnés ET déjà gardés
    // sur l'acteur (`if actorId == currentUserId`) — cette ligne suffit donc à
    // fermer la boucle sur toutes les surfaces à la fois.
    const audience = actorId ? [...recipientIds, authorId, actorId] : [...recipientIds, authorId];
    const rooms = audience.map((id) => ROOMS.feed(id));
    /* #20430 — sur `null`, la room du post sort de l'adresse et les feed rooms
       partent seules : même politique que `emitPostToAudience`, pour la même
       raison (le pré-filtre des feed rooms est keyé sur l'AUTEUR, donc sur le
       sujet d'une diffusion de CONTENU). */
    if (separated !== null) rooms.push(ROOMS.post(postId));
    /* `separated` ferme la room de la CIBLE, que rien ne filtrait (#20338) :
       `getVisibilityFilteredRecipients` ne garde que les FEED rooms, et
       seulement contre les blocages de l'AUTEUR. `except` porte sur les rooms
       `user:` — un socket en est toujours membre —, donc il retire le lecteur
       de TOUTES les adresses de cet emit à la fois, feed comme post. */
    emitServerEvent(this.exceptSeparated(rooms, separated ?? []), event, data);
  }

  /**
   * Broadcast uniquement vers l'auteur du post (notifs personnelles)
   */
  emitToUser<E extends SocialEventName>(
    userId: string,
    event: E,
    data: SocialEventPayload<E>,
  ): void {
    emitServerEvent(this.io.to(ROOMS.feed(userId)), event, data);
  }

  /**
   * Émission UNIQUE sur l'union de la feed room d'un utilisateur ET de la post
   * room — déduplication Socket.IO incluse (`io.to([...])`). Un même socket
   * présent dans LES DEUX rooms (typiquement l'auteur qui regarde sa propre
   * story/statut : il est dans sa feed room ET dans la post room du viewer)
   * reçoit l'événement EXACTEMENT une fois.
   *
   * Avant ce seam, `broadcastStoryReacted`/`broadcastStatusReacted` faisaient
   * deux `.emit()` séparés (feed room PUIS post room) → l'auteur-viewer recevait
   * `story:reacted` DEUX fois → le delta `+1` côté iOS s'appliquait deux fois →
   * compteur de réactions affiché en `+2`. Miroir de `emitToFeedsAndPostRoom`.
   */
  emitToUserFeedAndPostRoom<E extends SocialEventName>(
    userId: string,
    postId: string,
    event: E,
    data: SocialEventPayload<E>,
    separated?: readonly string[],
  ): void {
    const rooms = [ROOMS.feed(userId), ROOMS.post(postId)];
    emitServerEvent(this.exceptSeparated(rooms, separated), event, data);
  }

  /**
   * Une PUBLICATION vers son audience — sa liste d'audience ne part qu'à la
   * salle de son AUTEUR (#7407).
   *
   * `visibilityUserIds` route la diffusion (`getVisibilityFilteredRecipients`
   * a décidé des salles) ; la charge, elle, atteint les amis et, pour une mise
   * à jour, la salle de la publication, où se tient n'importe quel spectateur.
   * Un ami non exclu y apprenait QUI l'auteur avait écarté. L'auteur garde sa
   * liste : ses autres appareils la persistent depuis cet écho. Une
   * republication, dont la liste est HÉRITÉE de sa source, ne la rend à
   * personne, son auteur compris (`audienceList.ts`).
   *
   * Chaque socket reçoit l'événement UNE fois, sous la forme qui lui revient.
   * Sans salle de publication, l'émission garde la forme d'`emitToFriends` :
   * une par salle de fil, personnelle (`feed:subscribe` ne rejoint que la
   * sienne). Avec elle, celle d'`emitToFeedsAndPostRoom` : UNE émission sur
   * l'union — Socket.IO dédoublonne l'ami présent dans sa salle de fil ET dans
   * la salle de la publication — SAUF les sockets de l'auteur (`except`), qui
   * s'y tient quand il regarde sa propre publication et reçoit la sienne.
   *
   * Cinquième seam, contraint comme les quatre du cycle 100 : `payloadFor` rend
   * un `SocialEventPayload<E>`, le couple (événement, charge) reste vérifié.
   */
  emitPostToAudience<E extends SocialEventName>(
    recipientIds: readonly string[],
    authorId: string,
    event: E,
    payloadFor: (post: Post) => SocialEventPayload<E>,
    loaded: Post,
    postRoom?: PostRoomTarget,
  ): void {
    const post = withServedPostMedia(loaded);
    const authorRoom = ROOMS.feed(authorId);
    const audiencePayload = payloadFor(withoutAudienceList(post));
    const audienceRooms = recipientIds.filter((id) => id !== authorId).map((id) => ROOMS.feed(id));
    /* #20430 — la room du post et la séparation qui la gouverne voyagent
       ENSEMBLE. `null` ⇒ on ne l'adresse pas, et les feed rooms partent seules.

       ─── POURQUOI CE N'EST PAS LE « FAIL-CLOSED PARTIEL » DE #20236 ───

       Le discriminant est le SUJET de la diffusion, et il décide seul :

       - une diffusion de CONTENU a pour sujet celui qui a ÉCRIT, et le
         pré-filtre des feed rooms est justement keyé sur LUI
         (`getVisibilityFilteredRecipients(authorId, …)` →
         `withoutBlockedRecipients`, bidirectionnel et lui-même fail-closed :
         son `catch` ne rend que l'auteur). Les feed rooms sont donc DÉJÀ
         gardées contre le sujet, et la room du post est la seule qui ne l'est
         pas : la fermer suffit ;
       - une diffusion d'ACTIVITÉ a pour sujet l'ACTEUR, que ce pré-filtre
         n'a jamais regardé — il ne connaît que les blocages de l'auteur. Ses
         feed rooms ne sont donc PAS gardées contre son sujet, et n'en fermer
         qu'une partie ne fermerait rien : d'où « on n'émet rien », la règle
         que #20236 et #20338 appliquent, et qui reste la leur.

       Fermer ici les feed rooms en plus ne protégerait personne et priverait
       l'audience légitime sur une panne de lecture.

       ─── CE QUE CE SEAM NE FERME PAS ───

       La charge d'audience n'est PAS réduite au seul auteur : `postInclude`
       y attache `comments` (aperçu, auteurs et textes) et `repostOf` (la
       source republiée, auteur et contenu), et la loi qui retire ces
       compagnons séparés est un NO-OP sur une diffusion
       (`separatedCompanions.ts` lit `reader.separatedUserIds`, absent de
       `WIRE_BROADCAST`). Un lecteur séparé de C, mais pas de A, reçoit donc
       encore le commentaire de C sur le post de A — ce que le REST lui
       retire. **Dette ouverte et tracée : #20204**, hors périmètre de ce lot,
       et c'est pourquoi ce seam ne revendique PAS d'être complet : il ferme la
       room du post pour le sujet AUTEUR, et rien de plus. */
    const postRoomRooms = postRoom === undefined || postRoom.separated === null
      ? []
      : [ROOMS.post(postRoom.id)];
    const separated = postRoom?.separated;
    if (postRoomRooms.length > 0 && separated != null) {
      emitServerEvent(
        this.exceptSeparated([...audienceRooms, ...postRoomRooms], [...separated, authorRoom]),
        event,
        audiencePayload,
      );
    } else {
      for (const room of audienceRooms) emitServerEvent(this.io.to(room), event, audiencePayload);
    }
    /* L'AUTEUR reçoit TOUJOURS son propre contenu, avec sa liste d'audience :
       sa feed room ne contient que ses sockets, aucun tiers n'y lit, et un
       sujet ne se tait pas à lui-même. Exemption ÉCRITE, pas oubli. */
    emitServerEvent(this.io.to(authorRoom), event, payloadFor(withAudienceListFor(post, authorId)));
  }

  /**
   * L'ÉNUMÉRATEUR d'audience du temps réel : « à qui pousser cet événement ? »,
   * par dépliage du graphe de l'auteur. Ce n'est pas un test d'admission — pour
   * juger un utilisateur ARBITRAIRE, voir `filterPostConsumers` /
   * `canUserConsumePost` (leçon du cycle 28).
   *
   * `visibility` et `visibilityUserIds` sont REQUIS. Ils portaient un défaut
   * `'PUBLIC'` / `[]` que huit méthodes de diffusion propageaient : un appelant
   * qui les omettait diffusait un post `PRIVATE` à tous les amis de l'auteur, ou
   * un `EXCEPT` sans sa liste noire, sans que rien ne le signale. Aucun appelant
   * ne les omettait — c'est justement pourquoi le défaut ne coûte rien à retirer
   * et tout à garder.
   *
   * Une visibilité INCONNUE retombe sur les amis (`default:`), jamais sur une
   * ouverture plus large : même politique que `filterPostConsumers`.
   *
   * `post` est REQUIS aussi (#17178) : une publication `COMMUNITY` posée dans une
   * communauté ne part qu'aux membres actifs et au créateur de CETTE communauté,
   * jamais aux co-membres de l'auteur dans une autre. Sa communauté est relue
   * quand l'appelant ne la tient pas ; post introuvable ou panne ⇒ personne.
   */
  async getVisibilityFilteredRecipients(
    authorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
    post: CommunityPostRef
  ): Promise<string[]> {
    return this.withoutBlocked(authorId, await this.getAudienceBeforeBlocking(authorId, visibility, visibilityUserIds, post));
  }

  private async getAudienceBeforeBlocking(
    authorId: string,
    visibility: string | null | undefined,
    visibilityUserIds: string[],
    post: CommunityPostRef
  ): Promise<string[]> {
    if (visibility === 'COMMUNITY') {
      return communityPostAudienceIdsOf(this.prisma, authorId, post);
    }

    // Un cercle n'est JAMAIS replié sur « les amis » : ni Proches ni Sang ne
    // doivent recevoir la diffusion d'un Ami qui n'a pas le niveau (#13931).
    const circleAudience = await this.getCircleAudience(authorId, visibility);
    if (circleAudience) return circleAudience;

    const friendIds = await this.getFriendIds(authorId);

    switch (visibility) {
      case 'PUBLIC':
      case 'FRIENDS':
        return friendIds;
      case 'EXCEPT':
        return friendIds.filter(id => !visibilityUserIds.includes(id));
      case 'ONLY':
        return visibilityUserIds;
      case 'PRIVATE':
        return [];
      default:
        return friendIds;
    }
  }

  /**
   * **LA SÉPARATION AUTOUR D'UN DESTINATAIRE UNIQUE** (#20429).
   *
   * {@link activitySeparation} prend DEUX sujets parce que l'audience des sept
   * familles de #20338 contient des TIERS, qu'il faut taire aussi quand ils
   * sont séparés de l'AUTEUR. Quand l'audience est **UNE SEULE personne**, un
   * sujet répond exactement : le destinataire figure dans l'ensemble si et
   * seulement s'il a bloqué l'acteur ou si l'acteur l'a bloqué. Même verdict
   * que la forme à deux sujets, pour **deux lectures quel que soit le nombre
   * de destinataires** au lieu de deux par destinataire — `story:viewed` part
   * d'un chemin CHAUD, jusqu'à 120 événements par requête.
   *
   * Deux formes NUES, délibérément :
   *
   * - **pas de `keep`** — avec un seul sujet il n'a rien à filtrer (`read` ne
   *   rendrait l'acteur que s'il s'était bloqué lui-même, et le destinataire
   *   n'est jamais l'acteur : le producteur retourne tôt). Porter l'option la
   *   ferait lire comme porteuse de sens sans qu'aucun témoin la tienne.
   * - **`cached: false`** — la clé `[acteur]` a pour cardinalité le nombre de
   *   LECTEURS actifs, et ce cache vide ses 512 entrées ENTIÈREMENT au
   *   plafond : le peupler depuis ce chemin éviderait les clés stables des
   *   sept diffusions de CONTENU, l'avertissement que l'audit de #20337 a
   *   laissé sur place. Bornage LRU : #20415.
   *
   * `null` ⇒ l'appelant n'annonce RIEN.
   */
  separationAroundActor(actorId: string): Promise<readonly string[] | null> {
    return this.separatedRooms.roomsAround([actorId], { cached: false });
  }

  /**
   * Rooms devant recevoir un événement de commentaire : les feed rooms de
   * l'auteur du post et de ses amis (fil d'actualité) ET la post room
   * (`ROOMS.post`) où se trouvent les viewers du détail / reel viewer qui ne
   * sont PAS amis de l'auteur (post PUBLIC, co-membre de communauté, ou le
   * commentateur lui-même). Sans la post room, un viewer ouvrant le détail d'un
   * post qui ne suit pas l'auteur ne voyait JAMAIS les nouveaux commentaires en
   * temps réel — il fallait recharger. Miroir de `broadcastPostLiked` /
   * `broadcastStoryReacted` qui atteignent déjà la post room.
   *
   * Émission UNIQUE sur l'union des rooms : Socket.IO dédoublonne les sockets
   * présents dans plusieurs rooms (un viewer ami est dans SA feed room ET dans la
   * post room), donc l'événement est livré EXACTEMENT une fois. C'est requis
   * pour les commentaires : l'insertion d'un commentaire et l'incrément du
   * compteur de réponses côté client ne sont PAS idempotents en cas de double
   * livraison (contrairement au payload absolu de `post:liked`).
   */
  commentBroadcastRooms(recipientIds: string[], postAuthorId: string, postId: string): string[] {
    const feedRooms = [...recipientIds, postAuthorId].map((id) => ROOMS.feed(id));
    return [...feedRooms, ROOMS.post(postId)];
  }

  /**
   * L'émetteur d'un événement qui porte le CONTENU d'un commentaire (#20216) :
   * les rooms du fil, moins la room personnelle de chaque compte qu'un blocage
   * sépare du COMMENTATEUR, dans un sens ou dans l'autre — la loi de la liste
   * REST (#20205), appliquée au direct. Sans elle, qui a bloqué B et garde le
   * détail du post ouvert recevait le commentaire de B dans la room du post.
   *
   * Fermé : une lecture des blocages qui échoue rend `null`, et l'appelant
   * n'émet rien — le lecteur relira le fil par le REST, qui sait quoi taire.
   * Un commentateur inconnu n'a personne à taire.
   */
  /**
   * **LA SÉPARATION AUTOUR DE L'AUTEUR D'UN CONTENU** (#20430).
   *
   * Une diffusion de CONTENU n'a qu'UN sujet : celui qui a ÉCRIT (#20236).
   * `commentEmitter` porte déjà cette loi pour le commentaire ; celle-ci la
   * porte pour le POST, dont la charge est la plus lourde des trois — le `Post`
   * entier, ou le `translation.text` d'une de ses traductions.
   *
   * **Cachée, elle**, contrairement à `separationAroundActor` : la clé
   * `[auteur]` est exactement le genre d'entrée STABLE pour lequel ce cache a
   * été écrit — une traduction diffuse une fois PAR LANGUE CIBLE, chaque
   * résultat arrivant séparément du pipeline, sans boucle où passer le
   * résultat.
   *
   * `null` ⇒ l'appelant n'adresse PAS la room du post.
   */
  contentSeparation(postAuthorId: string): Promise<readonly string[] | null> {
    /* Pas de `keep`, pour la raison que `separationAroundActor` écrit déjà : avec
       UN sujet il n'a rien à filtrer, `related` ne pouvant contenir l'auteur que
       s'il s'était bloqué LUI-MÊME — ce que `routes/directory/blocks.ts` refuse à
       la source (400), et c'est le seul producteur. Porter l'option la ferait lire
       comme porteuse de sens sans qu'aucun témoin la tienne (audit du lot : mutée,
       299 suites restaient vertes). */
    return this.separatedRooms.roomsAround([postAuthorId]);
  }

  async commentEmitter(rooms: string | string[], commentAuthorId: string | null | undefined) {
    const separated = await this.separatedRooms.roomsAround([commentAuthorId], { keep: commentAuthorId });
    return separated === null ? null : this.exceptSeparated(rooms, separated);
  }

  /** La cible, moins les rooms que la loi nomme — aucun `except()` quand il n'y a rien à taire. */
  private exceptSeparated(rooms: string | string[], separated: readonly string[]) {
    const target = this.io.to(rooms);
    return separated.length > 0 ? target.except([...separated]) : target;
  }

  /**
   * **LA SÉPARATION AUTOUR D'UNE ACTIVITÉ DE COMMENTAIRE** (#20236), résolue
   * par l'APPELANT, AVANT sa mutation, et passée aux deux diffusions.
   *
   * Leur charge est ABSOLUE (`likeCount`) : un `comment:unliked` livré avant
   * son `comment:liked` fige chez le lecteur un compteur que la base contredit,
   * et iOS le PERSISTE. Résoudre avant l'écriture RESSERRE cette fenêtre d'un
   * `await` — ce n'est donc pas une commodité, et ce n'est pas davantage une
   * garantie : **aucun ordre de livraison n'est promis**, deux gestes
   * concurrents étant deux gestionnaires indépendants dont les accusés peuvent
   * s'inverser, et l'adaptateur Redis n'ordonnant rien entre deux instances.
   * Ce qui rattrape l'écart est une relecture autoritative — le prochain
   * chargement REST du détail, qui réécrit le total persisté (décision du
   * 2026-11-27, #20414).
   *
   * **Lire avant, ici, est une conséquence du ROSTER, pas une doctrine** : ce
   * chemin le PEUT (il n'a aucun roster à nommer), celui de
   * `CommentReactionHandler.separationAround` lit APRÈS parce qu'il le DOIT. Les
   * deux écrivent les MÊMES lignes `commentReaction` — deux transports d'une
   * seule mutation, donc une seule relecture les réconcilie. Aucun n'est un
   * modèle pour l'autre, et la mesure de ce que vaut chaque mécanisme de
   * convergence est à la seconde décision :
   * {@link ../../../decisions/2026-11-27-les-activites-a-compteur-absolu-ne-promettent-aucun-ordre-de-livraison-20414.md}
   * {@link ../../../decisions/2026-11-28-l-ordre-de-deux-activites-de-commentaire-est-au-mieux-la-convergence-est-sa-garantie-20414.md}
   */
  commentActivitySeparation(actorId: string, commentAuthorId: string | null | undefined): Promise<readonly string[] | null> {
    return this.activitySeparation(actorId, commentAuthorId);
  }

  /**
   * **LA MÊME LOI, POUR TOUTE ACTIVITÉ** (#20338). #20236 l'avait écrite pour le
   * COMMENTAIRE ; six autres familles la devaient — `post:liked` / `-unliked`,
   * `story:reacted` / `-unreacted`, `status:reacted` / `-unreacted` — et
   * `post:liked` est la jumelle EXACTE de `comment:liked`, laissée de côté
   * seulement parce que le lot s'arrêtait au commentaire.
   *
   * DEUX sujets : l'ACTEUR, que la charge nomme (`userId`), et l'AUTEUR de la
   * cible, dont le compteur bouge. Taire un seul des deux ne tait rien.
   *
   * **`keep: actorId` est ici le bon choix, et il faut dire pourquoi** : ces
   * charges ne portent AUCUN roster (`PostReactionAggregation` est
   * `{ emoji, count }` — « NO userIds, count only »), donc rien n'y nomme un
   * TIERS. C'est ce qui les distingue de #20337, où le roster faisait de
   * l'acteur un lecteur à filtrer. L'acteur reste dans l'audience de son propre
   * geste — décision porteur du 2026-09-13, « le like n'est pas synchronisé
   * entre les différentes vues ».
   *
   * `null` ⇒ l'appelant n'annonce RIEN, sur AUCUNE de ses adresses.
   */
  activitySeparation(actorId: string, targetAuthorId: string | null | undefined): Promise<readonly string[] | null> {
    return this.separatedRooms.roomsAround([actorId, targetAuthorId], { keep: actorId });
  }

  /**
   * LES DEUX ADRESSES D'UNE ACTIVITÉ DE COMMENTAIRE, sous la même loi (#20236).
   *
   * 1. la FEED room de l'auteur — « ton commentaire reçoit un cœur » ;
   * 2. la room du POST, où lisent les autres : la charge est ABSOLUE
   *    (`likeCount`), donc idempotente si l'auteur est dans les deux.
   *
   * **La première n'est PAS exemptée.** Elle l'était, au motif que la porte de
   * l'action aurait déjà refusé un acteur séparé de l'auteur — mesuré FAUX :
   * retirer sa réaction reste permis après un blocage (décision écrite), donc
   * `DELETE …/like` et `comment:reaction-remove` n'ont pas cette porte, et
   * l'auteur se voyait annoncer l'activité de qui il a bloqué.
   *
   * `separated === null` (lecture impossible) tait les DEUX adresses : un
   * fail-closed partiel n'est pas un fail-closed.
   */
  emitCommentActivity(
    event: typeof SERVER_EVENTS.COMMENT_LIKED | typeof SERVER_EVENTS.COMMENT_UNLIKED,
    data: CommentLikedEventData | CommentUnlikedEventData,
    commentAuthorId: string,
    separated: readonly string[] | null,
  ): void {
    if (separated === null) return;
    if (!separated.includes(ROOMS.user(commentAuthorId))) {
      emitServerEvent(this.io.to(ROOMS.feed(commentAuthorId)), event, data as SocialEventPayload<typeof event>);
    }
    emitServerEvent(this.exceptSeparated(ROOMS.post(data.postId), separated), event, data as SocialEventPayload<typeof event>);
  }

  /**
   * Invalide les audiences en cache de `userId` après un changement de lien : ses
   * amis ET chacun de ses cercles (`<visibilité>:<id>`). Un Proche baissé en Ami ne
   * doit plus recevoir, même 30 s, la diffusion d'un post `CLOSE` (#13931).
   */
  invalidateFriendsCache(userId: string): void {
    this.friendsCache.delete(userId);
    POST_CIRCLE_VISIBILITIES.forEach((visibility) => this.friendsCache.delete(`${visibility}:${userId}`));
  }
}
