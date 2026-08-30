import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { amitieAcceptee } from '../../services/friendship';

/**
 * La cible d'un signalement EXISTE-t-elle, et le signalant pouvait-il la voir ?
 *
 * ## Le défaut qu'elle ferme
 *
 * `POST /admin/reports` écrivait `reportedEntityId` tel quel : **on signalait
 * des ObjectId arbitraires**. Rien ne vérifiait ni l'existence de l'entité, ni
 * que le signalant y avait accès. Une ligne de modération pointant vers un
 * identifiant inventé coûte le temps d'un modérateur à chaque fois, et un
 * signalement massif d'identifiants tirés au hasard ensevelit la file.
 *
 * ## Le sens du refus
 *
 * Un signalement est un mécanisme de SÉCURITÉ : refuser un signalement
 * légitime est plus grave qu'en accepter un sur un contenu que le signalant
 * n'aurait vu qu'indirectement. La règle est donc « a-t-il pu ATTEINDRE cette
 * entité », pas « la voit-il en cet instant » — et elle reste néanmoins fermée
 * sur l'identifiant inventé, qui est le seul abus visé.
 *
 * On ne dit jamais LEQUEL des deux refus s'applique au client : distinguer
 * « cette entité n'existe pas » de « tu n'y as pas accès » transforme la route
 * en oracle d'existence, exactement ce que la garde de hiérarchie de #4154
 * refuse de faire.
 */

export type TypeSignale =
  | 'message'
  | 'user'
  | 'conversation'
  | 'community'
  | 'post'
  | 'story'
  | 'sound';

export type VerdictCible = { atteignable: true } | { atteignable: false; raison: 'introuvable' | 'inaccessible' };

const INTROUVABLE = { atteignable: false, raison: 'introuvable' } as const;
const INACCESSIBLE = { atteignable: false, raison: 'inaccessible' } as const;
const ATTEIGNABLE = { atteignable: true } as const;

/** Un ObjectId MongoDB — vérifié AVANT toute requête, qui lèverait sinon. */
function estObjectId(valeur: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(valeur);
}

/**
 * Le SIGNALANT, tel que le serveur le connaît — inscrit ou anonyme.
 *
 * Un participant anonyme (lien de partage) n'a pas de `userId` : sa
 * participation se lit sur l'identifiant de sa LIGNE `Participant`, que
 * `authContext.anonymousUser.id` porte. Sans cette seconde forme, la
 * vérification de cible refuserait tout signalement anonyme — une régression
 * silencieuse, puisque l'ancienne route les acceptait explicitement.
 */
export type Signalant = { userId?: string; participantId?: string };

async function participe(
  prisma: PrismaClient,
  conversationId: string,
  qui: Signalant
): Promise<boolean> {
  if (qui.userId) {
    const ligne = await prisma.participant.findFirst({
      where: { conversationId, userId: qui.userId, isActive: true },
      select: { id: true },
    });
    return ligne !== null;
  }

  if (qui.participantId) {
    const ligne = await prisma.participant.findFirst({
      where: { id: qui.participantId, conversationId, isActive: true },
      select: { id: true },
    });
    return ligne !== null;
  }

  return false;
}

/**
 * Un post ou une story est atteignable si sa visibilité le permet — la même
 * loi que la lecture, pas une seconde écrite ici.
 */
async function postAtteignable(
  prisma: PrismaClient,
  post: { authorId: string; visibility: string; visibilityUserIds: string[] },
  viewerId: string
): Promise<boolean> {
  if (post.authorId === viewerId) return true;

  // Un signalant anonyme n'a ni amitié ni appartenance : seul le PUBLIC lui est
  // atteignable. Ce n'est pas une restriction ajoutée ici, c'est la loi de
  // lecture — il ne peut voir que ça.
  if (!viewerId) return post.visibility === 'PUBLIC';

  switch (post.visibility) {
    case 'PUBLIC':
      return true;
    case 'PRIVATE':
      return false;
    case 'ONLY':
      return post.visibilityUserIds.includes(viewerId);
    case 'EXCEPT':
      return !post.visibilityUserIds.includes(viewerId)
        && (await amitieAcceptee(prisma, post.authorId, viewerId));
    case 'FRIENDS':
    case 'COMMUNITY':
    default:
      return amitieAcceptee(prisma, post.authorId, viewerId);
  }
}

export async function verifierCible(options: {
  prisma: PrismaClient;
  signalant: Signalant;
  type: TypeSignale;
  entityId: string;
}): Promise<VerdictCible> {
  const { prisma, signalant, type, entityId } = options;
  const viewerId = signalant.userId ?? '';

  if (!estObjectId(entityId)) return INTROUVABLE;

  switch (type) {
    case 'user': {
      const cible = await prisma.user.findUnique({ where: { id: entityId }, select: { id: true } });
      if (!cible) return INTROUVABLE;
      // Se signaler soi-même n'a aucun sens et est le geste le moins cher à
      // répéter : c'est un refus, pas un cas limite. Un anonyme n'a pas de
      // compte, donc la question ne se pose pas pour lui.
      return viewerId !== '' && cible.id === viewerId ? INACCESSIBLE : ATTEIGNABLE;
    }

    case 'message': {
      const message = await prisma.message.findUnique({
        where: { id: entityId },
        select: { conversationId: true },
      });
      if (!message) return INTROUVABLE;
      return (await participe(prisma, message.conversationId, signalant)) ? ATTEIGNABLE : INACCESSIBLE;
    }

    case 'conversation': {
      const conversation = await prisma.conversation.findUnique({
        where: { id: entityId },
        select: { id: true },
      });
      if (!conversation) return INTROUVABLE;
      return (await participe(prisma, entityId, signalant)) ? ATTEIGNABLE : INACCESSIBLE;
    }

    case 'post':
    case 'story': {
      const post = await prisma.post.findUnique({
        where: { id: entityId },
        select: { authorId: true, visibility: true, visibilityUserIds: true, deletedAt: true },
      });
      if (!post || post.deletedAt) return INTROUVABLE;
      const vu = await postAtteignable(
        prisma,
        {
          authorId: post.authorId,
          visibility: String(post.visibility),
          visibilityUserIds: post.visibilityUserIds ?? [],
        },
        viewerId
      );
      return vu ? ATTEIGNABLE : INACCESSIBLE;
    }

    case 'community': {
      const communaute = await prisma.community.findUnique({ where: { id: entityId }, select: { id: true } });
      return communaute ? ATTEIGNABLE : INTROUVABLE;
    }

    case 'sound': {
      const son = await prisma.sound.findUnique({ where: { id: entityId }, select: { id: true } });
      return son ? ATTEIGNABLE : INTROUVABLE;
    }
  }
}
