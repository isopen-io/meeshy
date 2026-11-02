import type { FastifyInstance, FastifyRequest } from 'fastify';
import { logError } from '../../utils/logger';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { generateCompactConversationIdentifier } from '@meeshy/shared/utils/conversation-helpers';
import { withMutationLog } from '../../utils/withMutationLog';
import { EngagementService } from '../../services/engagement/EngagementService';
import { FOUNDING_MEMBER_PERMISSIONS } from '../../services/participantRights';
import { recordLevel, startCooldown, cooldownEnd, type RelationWriteOutcome } from '../../services/relations/userRelationWriter';
import { judgeRelationRequest, thresholdsNow } from '../../services/relations/relationRequestGate';
import { emitRelationLevelRaised, relationIoOf } from '../../socketio/relationEvents';
import { parseRequestLevel, type RelationRequestLevel } from '@meeshy/shared/types/relation';
import { forgetFriends } from '../../services/relations/relationCaches';
import { isBlockedBetween } from '../../utils/blocking';
import { INCLUDE_PARTIES, servirParties, type Resultat } from './friend-request-parties';
import { implicitConversationRegime } from '../../services/conversations/creationRegime';

export const isRecordNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2025';

export type DemandeARepondre = {
  readonly id: string;
  readonly senderId: string;
  readonly receiverId: string;
  readonly targetLevel?: string | null;
};

/** Le cran qu'une demande vise : absent, c'est FRIEND, le sens historique. */
export const niveauVise = (demande: Pick<DemandeARepondre, 'targetLevel'>): RelationRequestLevel =>
  parseRequestLevel(demande.targetLevel) ?? 'FRIEND';

type Statut = 'accepted' | 'rejected';

const dejaTranchee = (): Error => Object.assign(new Error('friend request already settled'), { code: 'P2025' });

const lireAvecParties = (fastify: FastifyInstance, id: string) =>
  fastify.prisma.friendRequest.findUnique({ where: { id }, include: INCLUDE_PARTIES });

type LigneAvecParties = NonNullable<Awaited<ReturnType<typeof lireAvecParties>>>;

/** Une réponse passe par le journal des mutations ; une demande tranchée entre-temps rend `null`. */
async function journaliserReponse(
  fastify: FastifyInstance,
  request: FastifyRequest,
  acteurId: string,
  op: () => Promise<LigneAvecParties>
) {
  return withMutationLog({
    request,
    fastify,
    userId: acteurId,
    kind: 'respondFriendRequest',
    replayCost: 'converges',
    op,
    onDuplicate: (resultId) => lireAvecParties(fastify, resultId),
  }).catch((error: unknown) => {
    if (isRecordNotFound(error)) return null;
    throw error;
  });
}

/** L'écriture CONDITIONNELLE d'une réponse : une demande tranchée entre-temps dans l'AUTRE sens ne se réécrit pas. */
async function ecrireReponse(
  fastify: FastifyInstance,
  request: FastifyRequest,
  demande: DemandeARepondre,
  acteurId: string,
  statut: Statut
) {
  // `respondedAt` date la réponse : le rattrapage du lien s'y fie, jamais à
  // `updatedAt` que toute réécriture ultérieure déplace. Le statut visé reste
  // admis, pour que le rejeu d'une même réponse converge (`replayCost`).
  return journaliserReponse(fastify, request, acteurId, () => fastify.prisma.friendRequest.update({
    where: { id: demande.id, status: { in: ['pending', statut] } },
    data: { status: statut, respondedAt: new Date() },
    include: INCLUDE_PARTIES,
  }));
}

/**
 * Une demande de Connaissance acceptée ne passe JAMAIS par `accepted` (#13933) : les
 * lecteurs historiques de `FriendRequest` et le rattrapage lisent toute demande
 * acceptée comme une amitié. Elle est CONSOMMÉE — supprimée sous la condition
 * qu'elle attende encore — et c'est le lien seul qui dit la Connaissance. La ligne
 * lue avant sert la réponse et, si le lien ne s'écrit pas, la restaure.
 */
async function consommerConnaissance(
  fastify: FastifyInstance,
  request: FastifyRequest,
  demande: DemandeARepondre,
  acteurId: string
) {
  return journaliserReponse(fastify, request, acteurId, async () => {
    const ligne = await lireAvecParties(fastify, demande.id);
    if (!ligne || ligne.status !== 'pending') throw dejaTranchee();
    const { count } = await fastify.prisma.friendRequest.deleteMany({ where: { id: demande.id, status: 'pending' } });
    if (count === 0) throw dejaTranchee();
    return { ...ligne, status: 'accepted', respondedAt: new Date() };
  });
}

type LigneConsommee = Pick<LigneAvecParties, 'id' | 'senderId' | 'receiverId' | 'message' | 'targetLevel' | 'createdAt' | 'updatedAt'>;

const restaurerDemande = (fastify: FastifyInstance, ligne: LigneConsommee) =>
  fastify.prisma.friendRequest.create({
    data: {
      id: ligne.id,
      senderId: ligne.senderId,
      receiverId: ligne.receiverId,
      message: ligne.message ?? undefined,
      targetLevel: ligne.targetLevel ?? undefined,
      respondedAt: null,
      createdAt: ligne.createdAt,
      updatedAt: ligne.updatedAt,
    },
  });

/**
 * REFUSER sans un bruit (RG-07, RG-08, #13933) : le statut passe à `rejected`, et
 * c'est TOUT ce qui bouge pour l'émetteur — ni notification, ni événement
 * `friend-request:rejected`, ni statut lisible (il continue de lire « en attente »,
 * `servirParties`). Le refus retient l'émetteur de redemander pendant 30 jours.
 *
 * Le cool-down est écrit APRÈS le statut et son échec est journalisé sans défaire
 * le refus (le côté indulgent : l'émetteur pourrait redemander plus tôt, jamais
 * l'inverse). `retirerNotification` distingue le refus (la notification se marque
 * lue) de l'ignorance (elle disparaît de la liste du receveur).
 */
export async function refuserEnSilence(
  fastify: FastifyInstance,
  request: FastifyRequest,
  demande: DemandeARepondre,
  acteurId: string,
  options: { readonly retirerNotification: boolean }
) {
  const refusee = await ecrireReponse(fastify, request, demande, acteurId, 'rejected');
  if (!refusee) return null;

  const notifications = fastify.notificationService;
  if (notifications) {
    try {
      if (options.retirerNotification) await notifications.retractFriendRequestNotifications(demande.receiverId, demande.id);
      else await notifications.markFriendRequestNotificationsAsRead(acteurId, demande.id);
    } catch (error) {
      logError(fastify.log, 'Error settling the friend request notification:', error);
    }
  }

  try {
    const now = new Date();
    await startCooldown(fastify.prisma, {
      userId: demande.senderId, otherId: demande.receiverId, at: now, until: cooldownEnd(now, thresholdsNow().cooldownDays),
    });
  } catch (error) {
    logError(fastify.log, 'Error starting the friend request cool-down:', error);
  }

  return refusee;
}

/** Axe `social.friendship` (#5766) : les DEUX parties sont créditées, tir-et-oublie. */
function crediterAmitie(fastify: FastifyInstance, demande: DemandeARepondre): void {
  const engagement = new EngagementService(fastify.prisma);
  const parties = [
    { partie: demande.senderId, autre: demande.receiverId },
    { partie: demande.receiverId, autre: demande.senderId },
  ];
  for (const { partie, autre } of parties) {
    engagement.recordActivity(partie, 'social.friendship', { targetId: autre })
      .catch((err) => logError(fastify.log, 'engagement social.friendship failed:', err));
  }
}

/**
 * Le lien de la paire, au niveau accepté. La demande ACCEPTÉE reste la vérité de
 * repli pour Ami (#13926) : le lien se rattrape. Ailleurs, rien ne le rattrape —
 * au-dessus d'Ami le rattrapage ne relève qu'à Ami, et une Connaissance consommée
 * n'a plus de demande : on défait l'acceptation, sans quoi elle disparaîtrait en
 * silence.
 */
async function ecrireLien(
  fastify: FastifyInstance,
  params: { demande: DemandeARepondre; ligne: LigneConsommee; niveau: RelationRequestLevel; at: Date }
): Promise<RelationWriteOutcome | null> {
  const { demande, ligne, niveau, at } = params;
  const ecrit = await recordLevel(fastify.prisma, {
    userA: demande.senderId, userB: demande.receiverId, level: niveau, origin: 'request', at,
  }).catch((error: unknown) => {
    logError(fastify.log, 'Error recording user relation after friend request acceptance:', error);
    return null;
  });
  if (ecrit !== null || niveau === 'FRIEND') return ecrit;

  const defaire = niveau === 'ACQUAINTANCE'
    ? restaurerDemande(fastify, ligne)
    : fastify.prisma.friendRequest.update({ where: { id: demande.id }, data: { status: 'pending', respondedAt: null } });
  await defaire.catch(() => undefined);
  throw new Error('relation write failed');
}

/**
 * ACCEPTER, au niveau VISÉ (#13933). Le cran est relu AVANT d'écrire : le lien a pu
 * tomber, la série se briser entre la demande et la réponse — la demande reste
 * alors en attente et le refus se dit (409). Un Sang ne s'accepte pas ici : le
 * rituel synchronisé est son seul chemin.
 *
 * Une demande de Connaissance acceptée est CONSOMMÉE, jamais écrite `accepted`
 * (`consommerConnaissance`) : une étape qui échoue après le lien ne peut pas
 * laisser une ligne que les lecteurs historiques liraient comme une amitié.
 */
async function accepterAuNiveau(
  fastify: FastifyInstance,
  request: FastifyRequest,
  demande: DemandeARepondre,
  acteurId: string
): Promise<Resultat<Record<string, unknown>>> {
  const niveau = niveauVise(demande);
  if (niveau === 'BLOOD') {
    return { refus: { code: 409, message: 'Le Sang passe par le rituel', codeMetier: 'RELATION_RITUAL_REQUIRED' } };
  }

  // Le blocage, dans un sens ou dans l'autre, coupe l'acceptation avant toute
  // écriture — et se tait derrière le refus générique d'une demande déjà partie.
  if (await isBlockedBetween(fastify.prisma, demande.senderId, demande.receiverId)) {
    return { refus: { code: 404, message: 'Demande d\'ami non trouvee ou deja traitee' } };
  }

  // Une demande SANS niveau (antérieure aux cercles) vise Ami, et suit la même loi
  // que toutes : aucune exception, aucun saut de cran (D-5).
  const jugement = await judgeRelationRequest(fastify.prisma, {
    requesterId: demande.senderId, otherId: demande.receiverId, targetLevel: niveau, now: new Date(), ignoreCooldown: true,
  });
  if (jugement.allowed === false) {
    return { refus: { code: 409, message: 'La demande ne tient plus', codeMetier: jugement.code } };
  }

  const misAJour = niveau === 'ACQUAINTANCE'
    ? await consommerConnaissance(fastify, request, demande, acteurId)
    : await ecrireReponse(fastify, request, demande, acteurId, 'accepted');
  if (!misAJour) return { refus: { code: 404, message: 'Demande d\'ami non trouvee ou deja traitee' } };

  const notifications = fastify.notificationService;
  if (notifications) {
    try {
      await notifications.markFriendRequestNotificationsAsRead(acteurId, demande.id);
    } catch (error) {
      logError(fastify.log, 'Error marking friend request notification as read:', error);
    }
  }

  const at = new Date();
  const ecrit = await ecrireLien(fastify, { demande, ligne: misAJour, niveau, at });

  await forgetFriends(fastify, [demande.senderId, demande.receiverId]);
  if (ecrit === 'created' || ecrit === 'raised') {
    emitRelationLevelRaised(relationIoOf(fastify), { userA: demande.senderId, userB: demande.receiverId, level: niveau, at });
  }
  if (niveau !== 'ACQUAINTANCE') crediterAmitie(fastify, demande);

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

  // Servie APRÈS l'écriture du statut : la loi lit une amitié désormais ACCEPTÉE
  // et rend la présence du nouvel ami, sans cas particulier ici. `conversation`
  // est servie dans les DEUX cas — créée ou déjà existante.
  const [acceptee] = await servirParties(fastify, request, [misAJour as unknown as Record<string, unknown>]);

  return { valeur: { ...acceptee, conversation } };
}

export async function trancherDemande(
  fastify: FastifyInstance,
  request: FastifyRequest,
  demande: DemandeARepondre,
  acteurId: string,
  action: 'accept' | 'reject'
): Promise<Resultat<Record<string, unknown>>> {
  if (action === 'accept') return accepterAuNiveau(fastify, request, demande, acteurId);

  const refusee = await refuserEnSilence(fastify, request, demande, acteurId, { retirerNotification: false });
  if (!refusee) return { refus: { code: 404, message: 'Demande d\'ami non trouvee ou deja traitee' } };

  // Un REFUS ne crée pas d'amitié : la loi masque la présence de celui qu'on
  // vient d'éconduire, exactement comme avant la demande.
  const [servie] = await servirParties(fastify, request, [refusee as unknown as Record<string, unknown>]);
  return { valeur: servie };
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
    fastify.prisma.user.findUnique({ where: { id: aId }, select: { displayName: true, username: true, ...RECIPIENT_LANG_SELECT } }),
    fastify.prisma.user.findUnique({ where: { id: bId }, select: { displayName: true, username: true, ...RECIPIENT_LANG_SELECT } }),
  ]);

  // #6080 — la table vient du site UNIQUE (`services/participantRights.ts`).
  // Le littéral écrit ici fermait `canSendVideos`/`canSendAudios`, ce que la
  // garde de pièce jointe (#5151) lit comme un REFUS : deux amis ne pouvaient
  // s'envoyer ni vidéo, ni vocal, ni document dans le fil que leur amitié
  // venait d'ouvrir.
  const permissions = { ...FOUNDING_MEMBER_PERMISSIONS };

  // 2026-11-01 — le serveur chiffre toujours au repos : le fil d'une amitié naît `server`.
  const regime = await implicitConversationRegime(fastify.prisma, { enabledBy: aId });

  const conversation = await fastify.prisma.conversation.create({
    data: {
      ...regime,
      identifier: generateCompactConversationIdentifier(),
      type: 'direct',
      participants: {
        create: [
          { userId: aId, type: 'user', displayName: a?.displayName || a?.username || 'User', role: 'member', language: recipientLanguage(a, 'fr'), permissions },
          { userId: bId, type: 'user', displayName: b?.displayName || b?.username || 'User', role: 'member', language: recipientLanguage(b, 'fr'), permissions },
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

