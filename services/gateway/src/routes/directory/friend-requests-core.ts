import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SecuritySanitizer } from '../../utils/sanitize.js';
import { withMutationLog } from '../../utils/withMutationLog';
import { logError } from '../../utils/logger';
import { generateCompactConversationIdentifier } from '@meeshy/shared/utils/conversation-helpers';
import { validatePagination } from '../../utils/pagination';

/** Le plafond d'une page de demandes. */
export const LIMITE_MAX_DEMANDES = 100;
const LIMITE_DEFAUT_DEMANDES = 20;

/** Ce qu'un profil de demande porte — le minimum pour dessiner une ligne. */
const PROJECTION_PARTIE = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  displayName: true,
  avatar: true,
} as const;

export const INCLUDE_PARTIES = {
  sender: { select: PROJECTION_PARTIE },
  receiver: { select: PROJECTION_PARTIE },
} as const;

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

  return { valeur: demande as unknown as Record<string, unknown> };
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
    return misAJour as unknown as Record<string, unknown>;
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
  return { ...(misAJour as unknown as Record<string, unknown>), conversation };
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

  // Le curseur est l'HORODATAGE, pas l'identifiant : c'est la clé de tri, et
  // les deux index composés se terminent par elle. Un curseur sur l'id ferait
  // trier en mémoire ce que l'index sait rendre ordonné.
  const borne = params.cursor ? { createdAt: { lt: new Date(params.cursor) } } : {};

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

  const lignes = await fastify.prisma.friendRequest.findMany({
    where: {
      AND: [
        identite,
        params.status ? { status: params.status } : {},
        borne,
        filtreTexte,
      ],
    },
    include: INCLUDE_PARTIES,
    orderBy: { createdAt: 'desc' },
    take: taille + 1,
  });

  const hasMore = lignes.length > taille;
  const page = hasMore ? lignes.slice(0, taille) : lignes;

  return {
    valeur: {
      items: page as unknown as Array<Record<string, unknown>>,
      hasMore,
      nextCursor: hasMore
        ? (page[page.length - 1] as unknown as { createdAt: Date }).createdAt.toISOString()
        : null,
      limit: taille,
    },
  };
}
