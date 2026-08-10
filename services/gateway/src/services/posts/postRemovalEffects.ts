import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import type { RetractedNotificationAnnouncer } from '../notifications/retractedNotifications';
import { retractPostNotifications } from './retractPostNotifications';
import { SoundCaptureService } from './SoundCaptureService';

const log = enhancedLogger.child({ module: 'postRemovalEffects' });

/**
 * TOUT ce qu'un retrait de post doit écrire en base, en un seul endroit.
 *
 * Deux routes retirent le même objet : `DELETE /posts/:postId` (l'app, via
 * `PostService.deletePost`) et `DELETE /admin/posts/:postId` (la console, qui
 * écrit `deletedAt` en direct). La console a rattrapé un par un, à trois
 * cycles d'intervalle, ce que le service faisait et qu'elle ne faisait pas :
 * les usages de sons, puis la diffusion temps réel, puis l'audit et les liens
 * de partage. Chaque omission a attendu son propre incident parce que rien ne
 * NOMMAIT la liste — il fallait relire le service pour la reconstituer.
 *
 * C'est cette liste. Un effet ajouté ici s'applique aux deux chemins ; il n'y
 * a plus de « second écrivain » à tenir à jour de mémoire. Pendant `Post`, le
 * jumeau `broadcastPostRemoval` tient l'autre moitié — la moitié volatile,
 * celle qui s'annonce et ne se stocke pas.
 *
 * BEST-EFFORT, délibérément : quand ceci s'exécute, `deletedAt` est DÉJÀ
 * committé. Une trace d'audit perdue ou un lien récalcitrant ne doit jamais
 * transformer une suppression réussie en 500 — le contenu est retiré, c'est
 * l'invariant qui compte pour la personne qui a cliqué.
 */

/** Le document retiré, tel que Prisma le rend. */
export interface RemovedPostRecord {
  id: string;
  authorId: string;
  type?: string | null;
}

/** Qui a tranché, et pourquoi si la surface le demande. */
export interface PostRemovalActor {
  id: string;
  /**
   * Motif de modération. `DELETE /admin/posts/:postId` l'accepte en body et
   * son schéma OpenAPI le documente « for audit trail » : sans ce champ, la
   * promesse était fausse — la raison n'allait que dans une ligne de log.
   */
  reason?: string;
}

/** La seule chose dont ce chemin a besoin de `SoundCaptureService`. */
export interface PostSoundReleaser {
  releasePost(postId: string): Promise<void>;
}

export async function applyPostRemovalEffects(
  prisma: PrismaClient,
  post: RemovedPostRecord,
  actor: PostRemovalActor,
  soundCapture: PostSoundReleaser = new SoundCaptureService(prisma),
  // Défaut = le service partagé du processus, le seul câblé avec `io`. Même
  // résolution que le jumeau `applyMessageRemovalEffects` : les deux routes qui
  // retirent un post n'ont ainsi rien à câbler, et un appelant hors serveur
  // (worker, script, test) retire quand même les lignes, sans annonce.
  announcer: RetractedNotificationAnnouncer | undefined = getSharedNotificationService()
): Promise<void> {
  // Retrait par un tiers habilité : trace d'audit. Un auteur qui retire son
  // propre contenu n'est pas un acte de modération — c'est ce qui distingue
  // les deux, pas la route empruntée.
  if (actor.id !== post.authorId) {
    try {
      await prisma.adminAuditLog.create({
        data: {
          userId: post.authorId,
          adminId: actor.id,
          action: 'DELETE_POST',
          entity: 'Post',
          entityId: post.id,
          metadata: JSON.stringify({
            type: post.type,
            ...(actor.reason ? { reason: actor.reason } : {}),
          }),
        },
      });
    } catch (err) {
      log.warn('post removal: audit log write failed', { postId: post.id, actorId: actor.id, err });
    }
  }

  // Les notifications que le post a produites. Placées juste après l'audit —
  // qui doit rester le premier effet écrit, c'est la trace de modération — et
  // avant les deux autres, parce que c'est le SEUL des quatre dont le retard se
  // voit : tant qu'il n'a pas eu lieu, l'extrait du contenu retiré et la
  // vignette de son média restent affichés dans l'inbox de toute l'audience.
  // Les liens de partage et les usages de sons, eux, ne se lisent nulle part en
  // temps réel.
  try {
    await retractPostNotifications(prisma, [post.id], announcer);
  } catch (err) {
    log.warn('post removal: notification retraction failed', { postId: post.id, err });
  }

  // Le soft-delete ne bascule que `deletedAt` — le `onDelete: Cascade` de
  // Prisma ne se déclenche jamais. Les `/l/<token>` qui visent ce post
  // resteraient donc opérationnels, et un contenu retiré POUR MODÉRATION
  // resterait atteignable par le lien même qui l'a diffusé.
  try {
    await prisma.trackingLink.updateMany({
      where: { targetId: post.id },
      data: { isActive: false },
    });
  } catch (err) {
    log.warn('post removal: tracking link deactivation failed', { postId: post.id, err });
  }

  // Les usages meurent avec le post ; le `Sound`, lui, SURVIT. Sans ceci, une
  // story supprimée garde ses usages jusqu'au hard-delete (7 j) et un post
  // non-STORY les garde POUR TOUJOURS — un `usageCount` gonflé indéfiniment,
  // alors que c'est lui qui trie la découverte. `releasePost` ne rejette
  // jamais : la suppression n'a pas à dépendre de la bibliothèque.
  await soundCapture.releasePost(post.id);
}
