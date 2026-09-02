import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SecuritySanitizer } from '../../utils/sanitize.js';
import { withMutationLog } from '../../utils/withMutationLog';
import { logError } from '../../utils/logger';
import { generateCompactConversationIdentifier } from '@meeshy/shared/utils/conversation-helpers';
import { validatePagination } from '../../utils/pagination';
import {
  cursorPage,
  decodePageCursor,
  keysetWhere,
  orderByFor,
  type CursorPosition,
  type CursorSort,
} from '../../utils/cursor-pagination';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { presenceMissingEntryPolicy, viewerFromRequest } from '../users/presence-gate';

/** Le plafond d'une page de demandes. */
export const LIMITE_MAX_DEMANDES = 100;
const LIMITE_DEFAUT_DEMANDES = 20;

/**
 * Ce qu'un profil de demande porte — le minimum pour dessiner une ligne, PLUS
 * la présence.
 *
 * Les TROIS clients déclarent `isOnline` / `lastActiveAt` sur la partie d'une
 * demande — `FriendRequestUser` (iOS, `FriendModels.swift`), le même type porté
 * en Kotlin (`core/model/.../Friend.kt`), et `FriendRequest.sender?: User` côté
 * web. Aucun ne les recevait : la projection ne les chargeait pas. Le coût
 * n'était pas seulement une pastille absente — `FriendListAggregator.aggregate`
 * (iOS) TRIE la liste de contacts sur `isOnline` puis `lastActiveAt`, et
 * `useContactsV2` en dérive son ensemble `onlineUserIds` initial : deux tris
 * sur des champs toujours nuls, donc un ordre arbitraire jusqu'à ce qu'un
 * `user:status` arrive par socket — pour ceux qui en reçoivent un.
 *
 * Ces deux colonnes ne sortent JAMAIS brutes : {@link servirParties} est le
 * site unique par lequel toute ligne de demande quitte ce module.
 */
const PROJECTION_PARTIE = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  displayName: true,
  avatar: true,
  isOnline: true,
  lastActiveAt: true,
} as const;

export const INCLUDE_PARTIES = {
  sender: { select: PROJECTION_PARTIE },
  receiver: { select: PROJECTION_PARTIE },
} as const;

/** Les deux clés d'une demande qui portent une personne — et donc une présence. */
const CLES_PARTIES = ['sender', 'receiver'] as const;

type PartieAvecPresence = {
  readonly id: string;
  readonly isOnline: boolean | null;
  readonly lastActiveAt?: Date | null;
};

/**
 * La LOI DE VISIBILITÉ DE LA PRÉSENCE appliquée aux deux parties d'une demande
 * — le site UNIQUE par lequel une ligne de demande sort de ce module.
 *
 * ## Pourquoi ici, et pas dans la route de listing
 *
 * Trois producteurs rendent une ligne portant `INCLUDE_PARTIES` : l'ENVOI, la
 * RÉPONSE et le LISTING. Le premier s'adresse à un INCONNU par définition —
 * envoyer une demande à quelqu'un qu'on ne connaît pas ne doit pas apprendre
 * s'il est en ligne, ni quand il l'était. Un gate posé sur le seul listing
 * aurait donc laissé la fuite exactement là où elle est la plus grave, et
 * `routes/friends.ts` — l'alias historique de l'envoi, qui appelle le même
 * cœur — l'aurait servie sans que rien ne le signale.
 *
 * Directive du 2026-08-25 : hors amitié ACCEPTÉE (ou soi-même, ou ADMIN+), ni
 * `isOnline` ni `lastActiveAt` ne sont servis. La loi n'est pas réécrite ici :
 * `resolveForTargets` la résout par VIEWER, `applyPresenceVisibilityAsOffline`
 * l'applique, et une entrée absente de la carte est masquée
 * (`presenceMissingEntryPolicy`) — fail-closed.
 *
 * L'acceptation est servie APRÈS l'écriture du statut : la loi lit alors une
 * amitié acceptée et rend la présence du nouvel ami, sans cas particulier.
 */
export async function servirParties<T extends Record<string, unknown>>(
  fastify: FastifyInstance,
  request: FastifyRequest,
  demandes: readonly T[]
): Promise<T[]> {
  const viewer = viewerFromRequest(request);

  const identifiants = demandes.flatMap((demande) =>
    CLES_PARTIES.flatMap((cle) => {
      const partie = demande[cle] as PartieAvecPresence | null | undefined;
      return partie?.id ? [partie.id] : [];
    })
  );

  if (identifiants.length === 0) return [...demandes];

  const carte = await getPresenceVisibilityService(fastify.prisma).resolveForTargets(viewer, identifiants);
  const surEntreeAbsente = presenceMissingEntryPolicy(viewer);

  return demandes.map((demande) => {
    const servie: Record<string, unknown> = { ...demande };
    for (const cle of CLES_PARTIES) {
      const partie = servie[cle] as (PartieAvecPresence & Record<string, unknown>) | null | undefined;
      if (!partie?.id) continue;
      servie[cle] = applyPresenceVisibilityAsOffline(partie, carte.get(partie.id), {
        onMissingEntry: surEntreeAbsente,
      });
    }
    return servie as T;
  });
}

export type Refus = { code: number; message: string; codeMetier?: string };
export type Resultat<T> = { valeur: T } | { refus: Refus };

/** Les quatre gestes, et rien d'autre. */
export type ActionDemande = 'accept' | 'reject' | 'cancel' | 'dismiss';
export const ACTIONS: readonly ActionDemande[] = ['accept', 'reject', 'cancel', 'dismiss'] as const;

export type DirectionDemande = 'received' | 'sent' | 'any';

/**
 * ENVOYER une demande — l'UNION des gardes des deux familles, plus le blocage.
 *
 * ## Ce que chaque famille portait, et ce qu'aucune ne portait
 *
 * Deux familles complètes coexistaient, et le partage du trafic était INVERSÉ :
 * `POST /friend-requests`, celui que tous les clients appellent, n'avait ni
 * garde d'auto-envoi, ni contrôle de blocage, ni contrôle de désactivation, et
 * son `findUnique` était SANS `select`. Son jumeau orphelin
 * `POST /users/friend-requests` avait au moins la garde d'auto-envoi — et
 * personne ne l'appelait.
 *
 * Le BLOCAGE n'existait dans aucune des deux : quelqu'un qu'on a bloqué pouvait
 * continuer d'envoyer des demandes, et chacune poussait une notification.
 */
export async function envoyerDemande(
  fastify: FastifyInstance,
  request: FastifyRequest,
  params: { emetteurId: string; receveurId: string; message?: string }
): Promise<Resultat<Record<string, unknown>>> {
  const { emetteurId, receveurId } = params;

  if (emetteurId === receveurId) {
    return { refus: { code: 400, message: 'You cannot add yourself as a friend' } };
  }

  // Le `select` était ABSENT de la route vivante : elle chargeait la ligne
  // utilisateur ENTIÈRE — mot de passe haché compris — pour tester son
  // existence. Les trois colonnes lues ici sont celles dont les gardes ont
  // besoin, et rien de plus.
  const receveur = await fastify.prisma.user.findUnique({
    where: { id: receveurId },
    select: { id: true, deactivatedAt: true, blockedUserIds: true },
  });

  if (!receveur) return { refus: { code: 404, message: 'Utilisateur non trouve' } };

  // Un compte DÉSACTIVÉ ne reçoit pas de demande : la ligne serait créée, la
  // notification poussée, et personne ne pourrait jamais y répondre.
  if (receveur.deactivatedAt) {
    return { refus: { code: 404, message: 'Utilisateur non trouve' } };
  }

  // Le BLOCAGE, dans les DEUX sens — et le refus est le MÊME message que
  // « déjà une demande ». Distinguer les deux ferait de cette route un oracle :
  // « cette personne vous a bloqué » est une information qu'un bloqueur n'a pas
  // choisi de donner.
  const emetteur = await fastify.prisma.user.findUnique({
    where: { id: emetteurId },
    select: { blockedUserIds: true },
  });

  const bloque =
    (receveur.blockedUserIds ?? []).includes(emetteurId) ||
    (emetteur?.blockedUserIds ?? []).includes(receveurId);

  if (bloque) {
    return { refus: { code: 409, message: 'Une demande d\'ami existe deja entre vous' } };
  }

  const existante = await fastify.prisma.friendRequest.findFirst({
    where: {
      OR: [
        { senderId: emetteurId, receiverId: receveurId },
        { senderId: receveurId, receiverId: emetteurId },
      ],
    },
    select: { id: true },
  });

  if (existante) {
    return { refus: { code: 409, message: 'Une demande d\'ami existe deja entre vous' } };
  }

  const demande = await withMutationLog({
    request,
    fastify,
    userId: emetteurId,
    kind: 'sendFriendRequest',
    // `diverges` — chaque exécution INSÈRE une ligne. Rejouer sur un résultat
    // disparu fabriquerait un doublon, d'où le 410 rendu par la route.
    replayCost: 'diverges',
    op: () => fastify.prisma.friendRequest.create({
      data: {
        senderId: emetteurId,
        receiverId: receveurId,
        message: params.message ? SecuritySanitizer.sanitizeText(params.message) : undefined,
      },
      include: INCLUDE_PARTIES,
    }),
    onDuplicate: (resultId) => fastify.prisma.friendRequest.findUnique({
      where: { id: resultId },
      include: INCLUDE_PARTIES,
    }),
  });

  const notifications = fastify.notificationService;
  if (notifications) {
    await notifications.createFriendRequestNotification({
      recipientUserId: receveurId,
      requesterId: emetteurId,
      friendRequestId: demande.id,
    });
    notifications.emitFriendRequestNew({
      receiverId: receveurId,
      friendRequestId: demande.id,
      senderId: emetteurId,
    });
  }

  // La ligne ne sort JAMAIS brute : le destinataire d'une demande est, par
  // définition, quelqu'un dont on n'est pas encore l'ami — sa présence est donc
  // masquée par la loi, et l'alias `routes/friends.ts` en bénéficie sans le
  // savoir puisqu'il appelle ce même cœur.
  const [servie] = await servirParties(fastify, request, [demande as unknown as Record<string, unknown>]);

  return { valeur: servie };
}

/**
 * Qui peut faire QUOI sur une demande — la seule règle d'autorisation du geste.
 *
 * `accept` et `reject` appartiennent au RECEVEUR ; `cancel` à l'ÉMETTEUR ;
 * `dismiss` à l'un ou l'autre. Les quatre gestes vivaient auparavant sur trois
 * routes et deux verbes, et la règle n'était écrite nulle part en entier.
 */
export function acteurAutorise(
  action: ActionDemande,
  demande: { senderId: string; receiverId: string },
  acteurId: string
): boolean {
  if (action === 'accept' || action === 'reject') return demande.receiverId === acteurId;
  if (action === 'cancel') return demande.senderId === acteurId;
  return demande.senderId === acteurId || demande.receiverId === acteurId;
}

/**
 * RÉPONDRE à une demande — un geste, un verbe.
 *
 * `accept` / `reject` écrivent le statut ; `cancel` / `dismiss` SUPPRIMENT la
 * ligne, ce que faisait le `DELETE` qu'ils remplacent. La différence n'est pas
 * cosmétique : une ligne supprimée n'a plus de notification où mener, d'où le
 * RETRAIT de la notification au lieu de son marquage.
 */
export async function repondreDemande(
  fastify: FastifyInstance,
  request: FastifyRequest,
  params: { acteurId: string; demandeId: string; action: ActionDemande }
): Promise<Resultat<Record<string, unknown>>> {
  const { acteurId, demandeId, action } = params;

  const demande = await fastify.prisma.friendRequest.findUnique({
    where: { id: demandeId },
    select: { id: true, senderId: true, receiverId: true, status: true },
  });

  // Un 404 pour TOUTES les raisons de refus — inexistante, déjà traitée, ou
  // pas à cet acteur. Distinguer « elle existe mais pas pour vous » de « elle
  // n'existe pas » dirait à un inconnu qu'une demande existe entre deux tiers.
  if (!demande || !acteurAutorise(action, demande, acteurId)) {
    return { refus: { code: 404, message: 'Demande d\'ami non trouvee' } };
  }

  if (action === 'cancel' || action === 'dismiss') {
    return { valeur: await retirerDemande(fastify, demande, acteurId) };
  }

  if (demande.status !== 'pending') {
    return { refus: { code: 404, message: 'Demande d\'ami non trouvee ou deja traitee' } };
  }

  return { valeur: await trancherDemande(fastify, request, demande, acteurId, action) };
}

async function retirerDemande(
  fastify: FastifyInstance,
  demande: { id: string; senderId: string; receiverId: string },
  acteurId: string
): Promise<Record<string, unknown>> {
  await fastify.prisma.friendRequest.delete({ where: { id: demande.id } });

  const notifications = fastify.notificationService;
  if (notifications) {
    const autre = demande.senderId === acteurId ? demande.receiverId : demande.senderId;
    notifications.emitFriendRequestCancelled({
      recipientUserId: autre,
      friendRequestId: demande.id,
      cancelledBy: acteurId,
    });

    // La ligne vient de partir : la notification « X vous a envoyé une demande »
    // n'a plus rien où mener. On la RETIRE, au lieu de la marquer lue — c'est
    // ce qui distingue ce geste d'une réponse, qui laisse la ligne en place.
    // Elle appartient toujours au RECEVEUR, quel que soit celui des deux qui
    // agit : c'est lui, et lui seul, que la création a notifié.
    try {
      await notifications.retractFriendRequestNotifications(demande.receiverId, demande.id);
    } catch (error) {
      // Le retrait des notifications ne fait JAMAIS échouer la suppression,
      // qui est déjà committée.
      logError(fastify.log, 'Error retracting friend request notifications:', error);
    }
  }

  return { id: demande.id, deleted: true, message: 'Demande d\'ami supprimee' };
}

async function trancherDemande(
  fastify: FastifyInstance,
  request: FastifyRequest,
  demande: { id: string; senderId: string; receiverId: string },
  acteurId: string,
  action: 'accept' | 'reject'
): Promise<Record<string, unknown>> {
  const statut = action === 'accept' ? 'accepted' : 'rejected';

  const misAJour = await withMutationLog({
    request,
    fastify,
    userId: acteurId,
    kind: 'respondFriendRequest',
    replayCost: 'converges',
    op: () => fastify.prisma.friendRequest.update({
      where: { id: demande.id },
      data: { status: statut },
      include: INCLUDE_PARTIES,
    }),
    onDuplicate: (resultId) => fastify.prisma.friendRequest.findUnique({
      where: { id: resultId },
      include: INCLUDE_PARTIES,
    }),
  });

  const notifications = fastify.notificationService;
  if (notifications) {
    try {
      await notifications.markFriendRequestNotificationsAsRead(acteurId, demande.id);
    } catch (error) {
      logError(fastify.log, 'Error marking friend request notification as read:', error);
    }
  }

  if (action === 'reject') {
    if (notifications) {
      const receveur = misAJour.receiver;
      const nom = receveur.displayName || receveur.username ||
        `${receveur.firstName ?? ''} ${receveur.lastName ?? ''}`.trim();
      await notifications.createSystemNotification({
        recipientUserId: misAJour.senderId,
        content: `${nom} a refuse votre demande d'amitie`,
        priority: 'low',
        systemType: 'announcement',
      });
      notifications.emitFriendRequestRejected({
        senderId: misAJour.senderId,
        friendRequestId: demande.id,
        rejecterId: acteurId,
      });
    }
    // Un REFUS ne crée pas d'amitié : la loi masque donc la présence de celui
    // qu'on vient d'éconduire, exactement comme avant la demande.
    const [refusee] = await servirParties(fastify, request, [misAJour as unknown as Record<string, unknown>]);
    return refusee;
  }

  fastify.socialEvents?.invalidateFriendsCache(demande.senderId);
  fastify.socialEvents?.invalidateFriendsCache(demande.receiverId);

  if (notifications) {
    await notifications.createFriendAcceptedNotification({
      recipientUserId: misAJour.senderId,
      accepterUserId: acteurId,
      conversationId: undefined,
    });
  }

  const conversation = await conversationDirecte(fastify, demande.senderId, demande.receiverId);

  notifications?.emitFriendRequestAccepted({
    senderId: misAJour.senderId,
    friendRequestId: demande.id,
    accepterId: acteurId,
    conversationId: conversation?.id,
  });

  // `conversation` est SERVIE, et ce n'est pas une addition : le site précédent
  // la greffait déjà sur l'objet rendu — mais seulement quand il venait de la
  // CRÉER, et le schéma de réponse ne la déclarait pas, si bien que
  // fast-json-stringify la supprimait. Le client acceptait une demande, ne
  // recevait jamais la conversation, et devait relancer une requête.
  //
  // Elle est désormais servie dans les DEUX cas — créée ou déjà existante :
  // « je viens de la créer » n'est pas une propriété qui intéresse l'appelant,
  // qui veut savoir OÙ parler.
  // Servie APRÈS l'écriture du statut : la loi lit une amitié désormais
  // ACCEPTÉE et rend la présence du nouvel ami, sans cas particulier ici.
  const [acceptee] = await servirParties(fastify, request, [misAJour as unknown as Record<string, unknown>]);

  return { ...acceptee, conversation };
}

/** La conversation directe des deux amis — créée si elle n'existe pas. */
async function conversationDirecte(
  fastify: FastifyInstance,
  aId: string,
  bId: string
): Promise<{ id: string; identifier: string; type: string } | null> {
  const existante = await fastify.prisma.conversation.findFirst({
    where: {
      type: 'direct',
      participants: { every: { userId: { in: [aId, bId] } } },
    },
    select: { id: true, identifier: true, type: true },
  });

  if (existante) return existante;

  // Identifiant COMPACT (17 car.) : il ne concatène plus les deux ObjectId des
  // participants — un identifiant public ne doit pas publier qui parle à qui.
  const [a, b] = await Promise.all([
    fastify.prisma.user.findUnique({ where: { id: aId }, select: { displayName: true, username: true } }),
    fastify.prisma.user.findUnique({ where: { id: bId }, select: { displayName: true, username: true } }),
  ]);

  const permissions = {
    canSendMessages: true, canSendFiles: true, canSendImages: true,
    canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false,
  };

  const conversation = await fastify.prisma.conversation.create({
    data: {
      identifier: generateCompactConversationIdentifier(),
      type: 'direct',
      participants: {
        create: [
          { userId: aId, type: 'user', displayName: a?.displayName || a?.username || 'User', role: 'member', permissions },
          { userId: bId, type: 'user', displayName: b?.displayName || b?.username || 'User', role: 'member', permissions },
        ],
      },
    },
    select: { id: true, identifier: true, type: true },
  });

  // Rejoindre les sockets déjà connectés à la nouvelle room, sans quoi les deux
  // devraient se reconnecter pour recevoir `message:new`.
  const manager = fastify.socketIOHandler?.getManager();
  if (manager) {
    for (const membre of [aId, bId]) {
      manager.joinUserToConversationRoom(membre, conversation.id).catch(
        (err: unknown) => logError(fastify.log, 'Failed to auto-join friend to new DM room:', err)
      );
    }
  }

  return conversation;
}

export type PageDeDemandes = {
  readonly items: ReadonlyArray<Record<string, unknown>>;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly limit: number;
};

/**
 * L'ordre TOTAL de la liste — DÉCLARÉ une fois, et ce que le curseur encode
 * (#4900).
 *
 * « Total » n'est pas décoratif. Cette route bornait sa page par
 * `{ createdAt: { lt } }` SEUL : deux demandes nées dans la même milliseconde que
 * la dernière ligne servie étaient TOUTES LES DEUX jetées de la page suivante, et
 * n'apparaissaient sur AUCUNE page. Son alias DÉPRÉCIÉ (`routes/friends.ts`)
 * ayant rallié la loi partagée au lot #4175, le déprécié départageait ses ex æquo
 * quand son successeur canonique ne le faisait pas — retirer l'alias aurait donc
 * fait PERDRE une correction, l'inversion exacte qu'un plan de dépréciation ne
 * peut pas signaler.
 *
 * La loi partagée dérive de cette seule déclaration l'`orderBy`, la clause de
 * reprise ET la signature inscrite dans le jeton : les trois ne peuvent plus
 * diverger.
 */
const ORDRE_DEMANDES: CursorSort = [
  { field: 'createdAt', direction: 'desc', kind: 'date' },
  { field: 'id', direction: 'desc', kind: 'string' },
];

/**
 * L'ordre — PARTIEL — sous lequel les jetons EN VOL ont été frappés.
 *
 * Cette route a servi son curseur en HORODATAGE ISO EN CLAIR. Le motif que la
 * loi porte déjà pour `/notifications` s'applique : un jeton sans version est
 * accepté quand ses clés sont exactement les champs d'un ordre DÉCLARÉ.
 *
 * ## Qui tient un tel jeton, MESURÉ
 *
 * Aucun client ne le PERSISTE au-delà d'une session : les deux consommateurs le
 * gardent dans une variable LOCALE et drainent la liste entière en une passe —
 * `useFriendRequestsV2` (`apps/web/hooks/v2/use-friend-requests-v2.ts`) met en
 * cache la LISTE drainée, pas le curseur, et `ContactsListViewModel`
 * (`apps/ios/…/Features/Contacts/`) fait de même. L'exposition réelle est donc
 * un drain À CHEVAL sur un déploiement — page N frappée par l'ancien code,
 * page N+1 servie par le nouveau (ou l'inverse, en flotte mixte). Refuser le
 * jeton y interromprait le drain au milieu : la liste de contacts reviendrait
 * TRONQUÉE, et sans erreur visible pour le lecteur.
 *
 * ## Ce que cette position permet, et ce qu'elle ne permet pas
 *
 * L'ordre est PARTIEL : un horodatage seul ne dit pas SUR LAQUELLE des lignes de
 * sa milliseconde le client s'est arrêté. La loi en dérive donc la seule clause
 * que cette position autorise, `{ createdAt: { lt } }` — exactement la fenêtre
 * que le client avait, ni plus étroite ni plus large. Elle ne départage pas les
 * ex æquo, et ne le peut pas : c'est précisément ce qui manquait au jeton, et
 * la raison pour laquelle il est devenu TOTAL. La page reste ORDONNÉE et
 * RÉ-ANCRÉE sous l'ordre total, si bien que le jeton rendu en échange départage
 * — la transition ne dure qu'UNE page.
 */
const ORDRE_HISTORIQUE: CursorSort = ORDRE_DEMANDES.slice(0, 1);

/** Une position de reprise, avec l'ORDRE sous lequel elle a été frappée. */
type Reprise = { readonly ordre: CursorSort; readonly position: CursorPosition };

/**
 * Le jeton d'un appelant relu — opaque d'abord, historique ensuite, `null` sinon.
 *
 * L'ordre des deux tentatives n'est pas indifférent : un jeton opaque est du
 * base64url, qu'aucun analyseur de date ne lit, tandis qu'un horodatage ISO n'est
 * pas un jeton opaque valide. Les deux formes ne se recouvrent pas, et la forme
 * COURANTE est essayée la première.
 *
 * `null` couvre tout le reste — jeton tronqué, d'une version inconnue, ou frappé
 * sous un AUTRE ordre.
 *
 * ## Pourquoi 400, quand l'alias sert la première page
 *
 * Le dépôt connaît les deux lectures d'un jeton illisible et la loi les laisse
 * décider ({@link decodePageCursor}). `routes/friends.ts` sert la première page ;
 * cette route rend 400 (contrat de #4254), et le discriminant est le CLIENT.
 *
 * Les deux consommateurs de cette adresse DRAINENT en boucle et ne s'arrêtent
 * que sur un curseur ABSENT, en APPENDANT à un accumulateur borné à 500 — les
 * deux le disent en commentaire, mot pour mot : « redemander la même page
 * tournerait en rond jusqu'au plafond en collectant des doublons ». Un repli
 * silencieux sur la première page produirait exactement cela : le même lot
 * re-servi jusqu'à la borne, sans qu'aucune erreur ne remonte. Le 400 arrête la
 * boucle, et se voit.
 *
 * L'alias, lui, n'a que des appelants par RANG (`offset`) qui n'envoient jamais
 * de curseur : son repli y est inerte.
 */
function repriseDepuis(cursor: string): Reprise | null {
  const totale = decodePageCursor(cursor, ORDRE_DEMANDES);
  if (totale) return { ordre: ORDRE_DEMANDES, position: totale };

  const horodatage = new Date(cursor);
  if (Number.isNaN(horodatage.getTime())) return null;
  return { ordre: ORDRE_HISTORIQUE, position: { createdAt: horodatage.toISOString() } };
}

/**
 * LISTER — une route pour les trois listings et le fantôme.
 *
 * `GET /friend-requests/received`, `/sent`, `/users/friend-requests` et un
 * `GET /friend-requests` sans suffixe QUI N'EXISTAIT PAS, appelé par deux sites
 * web dont le `if (response.ok)` avalait le 404 : la page contacts historique
 * affichait une liste vide DÉFINITIVE.
 *
 * `q` filtre côté SERVEUR. Sans lui, le web drainait la liste entière page par
 * page pour filtrer en mémoire.
 */
export async function listerDemandes(
  fastify: FastifyInstance,
  request: FastifyRequest,
  params: {
    acteurId: string;
    direction?: DirectionDemande;
    status?: string;
    q?: string;
    cursor?: string;
    limit?: string;
  }
): Promise<Resultat<PageDeDemandes>> {
  const { limit: taille } = validatePagination('0', params.limit, {
    defaultLimit: LIMITE_DEFAUT_DEMANDES,
    maxLimit: LIMITE_MAX_DEMANDES,
  });

  if (params.limit !== undefined && String(taille) !== params.limit.trim()) {
    return { refus: { code: 400, message: `limit must be an integer between 1 and ${LIMITE_MAX_DEMANDES}` } };
  }

  const direction: DirectionDemande = params.direction ?? 'received';
  const identite =
    direction === 'received' ? { receiverId: params.acteurId }
    : direction === 'sent' ? { senderId: params.acteurId }
    : { OR: [{ receiverId: params.acteurId }, { senderId: params.acteurId }] };

  // Le curseur est relu par la LOI PARTAGÉE, jamais borné à la main : elle tient
  // ENSEMBLE l'`orderBy`, la clause de reprise et la signature du jeton, si bien
  // que les trois ne peuvent plus diverger. Un jeton illisible reste un 400, et
  // un horodatage ISO — la forme que cette route servait — reprend toujours
  // (cf. {@link repriseDepuis}).
  const point = params.cursor ? repriseDepuis(params.cursor) : null;
  if (params.cursor && point === null) {
    return { refus: { code: 400, message: 'cursor is not a cursor served by this route' } };
  }

  const filtreTexte = params.q
    ? {
        OR: [
          { sender: { username: { contains: params.q, mode: 'insensitive' as const } } },
          { sender: { displayName: { contains: params.q, mode: 'insensitive' as const } } },
          { receiver: { username: { contains: params.q, mode: 'insensitive' as const } } },
          { receiver: { displayName: { contains: params.q, mode: 'insensitive' as const } } },
        ],
      }
    : {};

  // La clause de reprise, ET-isée avec les gardes de la route et jamais
  // substituée : c'est ce qui rend impossible la faute la plus chère — une page
  // suivante qui « oublie » l'identité du lecteur.
  //
  // La loi rend son `OR` en LECTURE SEULE (elle ne laisse aucun site d'appel
  // muter sa clause) là où Prisma déclare le sien mutable. La COPIE traduit
  // l'une dans l'autre — c'est ce que `cursorQuery` obtient par une assertion
  // de type, que ce site n'a pas besoin de reprendre.
  const reprise = point
    ? [{ OR: [...keysetWhere(point.ordre, point.position).OR] }]
    : [];

  const lignes = await fastify.prisma.friendRequest.findMany({
    where: {
      AND: [
        identite,
        params.status ? { status: params.status } : {},
        filtreTexte,
        ...reprise,
      ],
    },
    include: INCLUDE_PARTIES,
    orderBy: orderByFor(ORDRE_DEMANDES),
    // La ligne SONDE : elle dit `hasMore` sans compter la table.
    take: taille + 1,
  });

  // Le curseur se frappe sur la ligne BRUTE — `servirParties` MASQUE des champs
  // de présence, il ne retire aucune ligne : la ligne lue EST la ligne servie.
  // Faire dépendre la pagination d'une projection filtrée est exactement ce qui
  // produit, ailleurs dans le dépôt, des pages vides que le client compense à la
  // main.
  const servie = cursorPage({
    sort: ORDRE_DEMANDES,
    rows: lignes as unknown as Array<Record<string, unknown>>,
    limit: taille,
  });

  const items = await servirParties(fastify, request, servie.page);

  return {
    valeur: {
      items,
      hasMore: servie.pagination.hasMore,
      nextCursor: servie.pagination.nextCursor,
      limit: taille,
    },
  };
}
