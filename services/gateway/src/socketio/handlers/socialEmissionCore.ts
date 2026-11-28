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
import { createSeparatedRoomsResolver, type SeparatedRoomsResolver, type SeparationPairs } from '../separatedRooms';
import { companionSubjectsOf, withoutSeparatedCompanions } from '../../services/posts/separatedCompanions';
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
 * **CE QU'UN POST DIFFUSÉ PORTE D'UN AUTRE AUTEUR, ET QUI LE SÉPARE DU
 * LECTEUR** (#20711).
 *
 * Deux contenus d'AUTRES auteurs voyagent DANS un post servi : la source d'une
 * republication (`repostOf`) et l'aperçu des commentaires (`comments`). Les
 * douze portes REST les retirent par lecteur (#16894, #20204) ; une diffusion
 * n'a pas de lecteur, et servait donc UNE charge complète à toute son audience.
 *
 * La carte dit, PAR LECTEUR, de quels auteurs de compagnon un blocage le
 * sépare — pas « qui taire ». C'est la différence qui décide de la forme du
 * correctif : un lecteur séparé du commentateur B a droit au post, et ne perd
 * que le commentaire de B. L'exclure, comme le fait {@link PostRoomTarget},
 * lui retirerait le post entier ; lui servir une charge amputée de TOUS les
 * compagnons lui retirerait l'aperçu d'un auteur que rien ne lui cache.
 *
 * Trois états, et non deux :
 *
 * | valeur | la phrase | l'audience |
 * |---|---|---|
 * | carte VIDE | « personne n'est séparé d'un compagnon » — ou il n'y a aucun compagnon, donc aucune lecture payée | reçoit la charge entière |
 * | carte PLEINE | « voici qui est séparé de quoi » | chacun sa charge |
 * | `null` | la lecture a ÉCHOUÉ, on ne sait pas | **ne reçoit RIEN** |
 *
 * `null` ferme l'audience ENTIÈRE, et c'est la règle que #20236 et #20430 ont
 * déjà tranchée pour cette forme exacte : le pré-filtre des feed rooms
 * (`getVisibilityFilteredRecipients` → `withoutBlockedRecipients`) est keyé sur
 * l'AUTEUR du post, qu'aucun compagnon n'est. Les feed rooms ne sont donc PAS
 * gardées contre ces sujets, et n'en fermer qu'une partie ne fermerait rien.
 * Le coût assumé : sur une panne de lecture, une édition ou une republication
 * n'apparaît pas en direct — le prochain fetch REST, qui est gardé, la rend.
 * L'AUTEUR garde son écho, exemption écrite de #20430.
 */
export type CompanionSeparation = SeparationPairs | null;

/**
 * « Ce post ne porte aucun compagnon », à passer EXPLICITEMENT — une carte
 * VIDE, jamais `null`. Elle sert aux appelants qui SAVENT que leur charge n'a
 * ni source republiée ni aperçu : dire « rien à taire » par omission est
 * exactement ce que le paramètre requis interdit.
 */
export const NO_SEPARABLE_COMPANIONS: CompanionSeparation = new Map();

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
    /* #20711 — REQUIS, comme `separated` l'est des deux autres seams, et pour
       la même raison : une garde dont le défaut est l'OUVERTURE n'est pas une
       garde. `NO_SEPARABLE_COMPANIONS` est la façon de dire « rien à taire »
       sans le dire par omission. */
    companions: CompanionSeparation,
    postRoom?: PostRoomTarget,
  ): void {
    const post = withServedPostMedia(loaded);
    const authorRoom = ROOMS.feed(authorId);
    /* **TOUTE charge sortante passe par ICI**, et c'est structurel (audit
       adversarial de #20711, constat F1). La loi fait deux choses : elle retire
       les compagnons séparés du lecteur, et elle retire `repostOf.snapshotAuthorId`
       — la colonne de DÉCISION, que la composition d'une diffusion garde
       justement pour que ce site puisse la lire. Une charge qui ne traverserait
       pas cette fabrique servirait donc la colonne au client ; son témoin de
       non-fuite tient les trois chemins ensemble. */
    const served = (shaped: Post, hidden: ReadonlySet<string> | undefined) =>
      payloadFor(withoutSeparatedCompanions(shaped, hidden));
    /* Un destinataire NOMMÉ deux fois ne reçoit qu'une charge : `case 'ONLY'`
       rend la liste brute de `visibilityUserIds`, doublons compris, et la
       boucle par lecteur émettrait une fois par OCCURRENCE là où l'émission
       unique est dédoublonnée par Socket.IO (constat F6). */
    const recipients = [...new Set(recipientIds)];
    /* L'AUTEUR est un LECTEUR, lui aussi : il a pu bloquer un commentateur de
       son propre post, et le REST le lui retire déjà. Son écho suit donc la
       même loi — mais il part TOUJOURS (exemption de #20430), et sur une panne
       de lecture il part INCHANGÉ : une édition qui n'affiche plus l'aperçu de
       sa propre publication serait une dégradation visible payée pour un
       secret que l'auteur a lui-même hébergé. */
    const authorHidden = companions === null ? undefined : new Set(companions.get(authorId) ?? []);
    const emitToAuthor = () =>
      emitServerEvent(this.io.to(authorRoom), event, served(withAudienceListFor(post, authorId), authorHidden));

    /* FERMÉ (#20711) — `null` ⇒ la séparation des COMPAGNONS n'a pas pu être
       lue. On ne sert alors AUCUNE adresse d'audience : le raisonnement est
       celui du bloc ci-dessous appliqué au bon sujet. Le pré-filtre des feed
       rooms est keyé sur l'AUTEUR du post ; un compagnon n'est pas l'auteur,
       donc ses feed rooms ne sont PAS gardées contre lui, et n'en fermer
       qu'une partie ne fermerait rien — exactement la raison pour laquelle
       #20236 et #20338 n'émettent rien sur un sujet d'ACTIVITÉ. */
    if (companions === null) {
      emitToAuthor();
      return;
    }

    /* Les lecteurs que la loi des compagnons sert AUTREMENT. Ils sortent de la
       charge commune — par `except`, qui porte sur les rooms `user:` et les
       retire donc de TOUTES ses adresses à la fois, feed comme post — et
       reçoivent chacun la leur. La carte est celle de TOUS les lecteurs
       séparés, pas seulement ceux de l'audience : un spectateur présent dans la
       room du post sans être dans l'audience doit être tu lui aussi, et c'est
       la seule adresse où on ne peut pas l'énumérer. */
    const servedApart = [...companions.keys()];
    const companionSilenced = servedApart.map((id) => ROOMS.user(id));
    const apart = new Set(servedApart);
    const audiencePayload = served(withoutAudienceList(post), undefined);
    const audienceRooms = recipients
      .filter((id) => id !== authorId && !apart.has(id))
      .map((id) => ROOMS.feed(id));
    /* Chacun sa charge, par la MÊME loi que les douze portes REST — jamais par
       une forme à part. `repostOf` sort à `null` et l'aperçu perd les seuls
       commentaires qu'un blocage sépare : la clé reste PRÉSENTE, ce qui est la
       propriété dont les trois clients dépendent — mesuré, leurs trois fusions
       sont des REMPLACEMENTS (web `mergeServedPost`, iOS
       `FeedViewModel+Socket`, Android `PostUpdateMerge`), donc une clé ABSENTE
       effacerait l'aperçu rendu au lieu de le corriger. */
    for (const readerId of recipients) {
      if (readerId === authorId || !apart.has(readerId)) continue;
      const hidden = new Set(companions.get(readerId) ?? []);
      emitServerEvent(this.io.to(ROOMS.feed(readerId)), event, served(withoutAudienceList(post), hidden));
    }
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

       ─── CE QUE CE SEAM FERME, ET CE QUE L'AUTRE FERME ───

       Celui-ci ferme la room du post pour le sujet AUTEUR, et rien de plus.
       La charge d'audience porte aussi `comments` (aperçu, auteurs et textes)
       et `repostOf` (la source republiée, auteur et contenu) — deux contenus
       d'AUTRES auteurs, que ce `separated`-ci ne regarde pas : il est keyé sur
       l'auteur du post. C'est `companions` qui les tient (#20711, voir
       {@link CompanionSeparation}), et les deux lois se composent sans se
       recouvrir — la première décide QUI reçoit, la seconde QUOI. */
    const postRoomRooms = postRoom === undefined || postRoom.separated === null
      ? []
      : [ROOMS.post(postRoom.id)];
    const separated = postRoom?.separated;
    if (postRoomRooms.length > 0 && separated != null) {
      emitServerEvent(
        this.exceptSeparated([...audienceRooms, ...postRoomRooms], [...separated, ...companionSilenced, authorRoom]),
        event,
        audiencePayload,
      );
    } else {
      for (const room of audienceRooms) {
        emitServerEvent(this.exceptSeparated(room, companionSilenced), event, audiencePayload);
      }
    }
    /* L'AUTEUR reçoit TOUJOURS son propre contenu, avec sa liste d'audience :
       sa feed room ne contient que ses sockets, aucun tiers n'y lit, et un
       sujet ne se tait pas à lui-même. Exemption ÉCRITE, pas oubli. */
    emitToAuthor();
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

  /**
   * **LA SÉPARATION DES COMPAGNONS D'UN POST** (#20711) — résolue par
   * l'APPELANT, avant la diffusion, et passée à `emitPostToAudience`.
   *
   * Le coût du cas nominal est NUL, et c'est ce qui rend la loi tenable :
   * `companionSubjectsOf` rend `[]` dès qu'un post n'a ni source republiée ni
   * commentaire en aperçu — ce qui est la forme de toute publication NEUVE —
   * et `pairsAround([])` répond une carte vide sans ouvrir de requête. Quand
   * il y a des compagnons, c'est DEUX lectures, quel que soit leur nombre, et
   * le cache de `separatedRooms` les rend une fois par jeu de sujets (les
   * éditions successives d'un même post rejouent la même clé).
   *
   * Le prédicat porte sur ce qui SORT, jamais sur une autorisation : une carte
   * vide veut dire « rien à taire », pas « rien à vérifier ».
   */
  companionSeparation(post: Post): Promise<CompanionSeparation> {
    /* `cached: false`, et c'est la règle que le module ÉCRIT déjà (#20337,
       audit adversarial) : « un ensemble de sujets qui CHANGE à chaque
       événement a des clés à usage unique ». Les sujets sont ici l'auteur
       republié et les trois commentateurs d'aperçu — donc une clé PAR
       PUBLICATION. La cacher ne rend jamais un hit, et au plafond son
       `cache.clear()` évince les entrées des appelants STABLES, dont les sept
       diffusions de CONTENU que ce cache garde (#20216). Mesuré par l'audit de
       ce lot : 512 publications à compagnons évinçaient l'entrée de
       `contentSeparation`. Ce lot a d'abord posé le défaut que #20337 avait
       fait corriger sur l'autre question. */
    return this.separatedRooms.pairsAround(companionSubjectsOf(post), { cached: false });
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
   * Ce n'est pas une commodité : rendre ces diffusions asynchrones décorrélait
   * l'ORDRE du fil de l'ordre des écritures, et leur charge est ABSOLUE
   * (`likeCount`) — un `comment:unliked` qui double son `comment:liked` fige
   * chez le lecteur un compteur que la base contredit, et iOS le PERSISTE.
   * Résolue avant l'écriture, l'émission redevient synchrone juste après elle
   * (audit adversarial du lot).
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
