import type { FastifyInstance, FastifyRequest } from 'fastify';
import { logError } from '../../utils/logger';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  parseRequestLevel,
  relationLevelBelow,
  relationLevelIfAtLeast,
  requestLevelSustains,
  type RelationRequestLevel,
} from '@meeshy/shared/types/relation';
import { backfillFriendship, cooldownEnd, lowerPair } from '../../services/relations/userRelationWriter';
import { niveauEffectif } from '../../services/friendship';
import { thresholdsNow } from '../../services/relations/relationRequestGate';
import { forgetFriends } from '../../services/relations/relationCaches';
import { refuserEnSilence, type DemandeARepondre } from './friend-request-answer';
import type { Resultat } from './friend-request-parties';

type DemandeRetirable = DemandeARepondre & { readonly status?: string };

const niveauDe = (demande: { targetLevel?: string | null }): RelationRequestLevel => parseRequestLevel(demande.targetLevel) ?? 'FRIEND';

/**
 * Supprimer une demande ACCEPTÉE défait le lien qu'elle fondait (#13926), en
 * SILENCE : la baisse ne se notifie pas (RG-07), et le cool-down de 30 jours tombe
 * sur l'AUTRE (RG-08). Le lien retombe sous le cran de la demande — Proche à Ami,
 * Sang à Proche, Ami et Connaissance à Public (le sens historique) — sauf si une
 * AUTRE demande acceptée de même cran ou plus haut relie encore la paire
 * (`FriendRequest` n'a pas d'unique de paire).
 *
 * La rupture précède la suppression, et son échec LÈVE : une demande acceptée
 * supprimée sur une rupture ratée laisserait un lien sans aucune demande, que le
 * rattrapage (qui ne fait que monter) ne corrigerait jamais.
 */
async function rompreLien(
  fastify: FastifyInstance,
  demande: DemandeRetirable,
  acteurId: string
): Promise<void> {
  const niveau = niveauDe(demande);
  const restantes = await fastify.prisma.friendRequest.findMany({
    where: {
      id: { not: demande.id },
      status: 'accepted',
      OR: [
        { senderId: demande.senderId, receiverId: demande.receiverId },
        { senderId: demande.receiverId, receiverId: demande.senderId },
      ],
    },
    select: { id: true, targetLevel: true },
    // Une paire n'a jamais plus d'une demande par cran : la borne est large et ne retient rien.
    take: 20,
  });
  if (restantes.some((restante) => requestLevelSustains(niveauDe(restante), niveau))) return;

  const now = new Date();
  const autre = demande.senderId === acteurId ? demande.receiverId : demande.senderId;
  await lowerPair(fastify.prisma, {
    userA: demande.senderId,
    userB: demande.receiverId,
    level: relationLevelBelow(niveau),
    at: now,
    cooldownFor: { userId: autre, until: cooldownEnd(now, thresholdsNow().cooldownDays) },
  });
  await forgetFriends(fastify, [demande.senderId, demande.receiverId]);
}

type DemandesDb = Pick<PrismaClient, 'friendRequest' | 'userRelation'>;

const entreLesDeux = (a: string, b: string) => ({
  status: 'accepted',
  OR: [
    { senderId: a, receiverId: b },
    { senderId: b, receiverId: a },
  ],
});

/**
 * Un ami d'AVANT les cercles n'a pas encore de ligne de lien : la loi le lit Ami par
 * sa demande acceptée (`friendship.ts`), et l'écrivain ne baisse qu'une ligne qui
 * existe. Avant une baisse, la ligne est donc ÉCRITE telle que le rattrapage la
 * laissera — la même règle (`backfillFriendship`), pour cette seule paire, sur le
 * geste de l'une des deux personnes. Sans demande acceptée, rien ne s'écrit.
 */
export async function asseoirLienHerite(prisma: DemandesDb, a: string, b: string, now: Date): Promise<void> {
  const acceptee = await prisma.friendRequest.findFirst({
    where: entreLesDeux(a, b),
    select: { respondedAt: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (!acceptee) return;
  await backfillFriendship(prisma, { userA: a, userB: b, acceptedAt: acceptee.respondedAt ?? acceptee.updatedAt ?? null, now });
}

/**
 * Après une baisse, aucune demande ACCEPTÉE ne vise plus haut que le niveau effectif :
 * les lecteurs historiques de `FriendRequest` (audience des publications, fan-outs,
 * jeu, suggestions de mention) lisent toute demande acceptée comme une amitié, et un
 * lien baissé sous Ami ne doit plus rien leur ouvrir. La rupture d'une demande
 * (`rompreLien`) lit de même les demandes restantes : une demande de Sang qui
 * survivrait à une baisse retiendrait un lien que plus rien ne fonde.
 */
export async function retirerDemandesAuDessus(prisma: DemandesDb, a: string, b: string): Promise<void> {
  const niveau = await niveauEffectif(prisma, a, b);
  const acceptees = await prisma.friendRequest.findMany({
    where: entreLesDeux(a, b),
    select: { id: true, targetLevel: true },
    take: 20,
  });
  const auDessus = acceptees.filter((d) => relationLevelIfAtLeast(niveau, niveauDe(d)) === null).map((d) => d.id);
  if (auDessus.length === 0) return;
  await prisma.friendRequest.deleteMany({ where: { id: { in: auDessus }, status: 'accepted' } });
}

type StatutSupprime = 'pending' | 'rejected' | 'accepted';

/**
 * Le statut qui gouverne la suite est celui de la ligne SUPPRIMÉE, jamais celui
 * LU plus haut : une demande lue « pending » peut avoir été acceptée entre-temps.
 * Une demande non acceptée ne porte aucun lien, elle part sous cette condition
 * même ; si rien ne part, elle est acceptée (on rompt, puis on supprime) ou déjà
 * partie.
 */
async function supprimerDemande(
  fastify: FastifyInstance,
  demande: DemandeRetirable,
  acteurId: string
): Promise<StatutSupprime | null> {
  for (const statut of ['pending', 'rejected'] as const) {
    const retiree = await fastify.prisma.friendRequest.deleteMany({ where: { id: demande.id, status: statut } });
    if (retiree.count > 0) return statut;
  }

  const acceptee = await fastify.prisma.friendRequest.findFirst({
    where: { id: demande.id, status: 'accepted' },
    select: { id: true, targetLevel: true },
  });
  if (!acceptee) return null;

  await rompreLien(fastify, { ...demande, targetLevel: acceptee.targetLevel }, acteurId);
  await fastify.prisma.friendRequest.deleteMany({ where: { id: demande.id } });
  return 'accepted';
}

const ACCUSE = (id: string): Resultat<Record<string, unknown>> => ({
  valeur: { id, deleted: true, message: 'Demande d\'ami supprimee' },
});

/**
 * `cancel` / `dismiss` : la demande part. Ce que l'AUTRE en apprend dépend de ce
 * qui est parti :
 *
 * - une demande EN ATTENTE annulée par son auteur prévient le receveur (c'est SON
 *   geste, et la demande doit quitter la liste de l'autre) ;
 * - une demande EN ATTENTE écartée par son receveur est une IGNORANCE : un refus
 *   silencieux (RG-07), le statut passe à `rejected`, l'émetteur ne voit rien ;
 * - une demande REFUSÉE ou ACCEPTÉE qui part ne prévient personne : l'une dirait le
 *   refus, l'autre la baisse.
 */
export async function retirerDemande(
  fastify: FastifyInstance,
  request: FastifyRequest,
  demande: DemandeRetirable,
  acteurId: string
): Promise<Resultat<Record<string, unknown>>> {
  if (demande.status === 'pending' && demande.receiverId === acteurId) {
    const ignoree = await refuserEnSilence(fastify, request, demande, acteurId, { retirerNotification: true });
    if (ignoree) return ACCUSE(demande.id);
  }

  const statut = await supprimerDemande(fastify, demande, acteurId);
  if (!statut) return { refus: { code: 404, message: 'Demande d\'ami non trouvee' } };

  const notifications = fastify.notificationService;
  if (!notifications) return ACCUSE(demande.id);

  if (statut === 'pending') {
    const autre = demande.senderId === acteurId ? demande.receiverId : demande.senderId;
    notifications.emitFriendRequestCancelled({ recipientUserId: autre, friendRequestId: demande.id, cancelledBy: acteurId });
  }

  // La ligne vient de partir : la notification « X vous a envoyé une demande »
  // n'a plus rien où mener. On la RETIRE, au lieu de la marquer lue. Elle
  // appartient toujours au RECEVEUR, quel que soit celui des deux qui agit.
  try {
    await notifications.retractFriendRequestNotifications(demande.receiverId, demande.id);
  } catch (error) {
    // Le retrait des notifications ne fait JAMAIS échouer la suppression, déjà committée.
    logError(fastify.log, 'Error retracting friend request notifications:', error);
  }

  return ACCUSE(demande.id);
}
