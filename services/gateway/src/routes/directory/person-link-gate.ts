import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { hasBlocked } from '../../utils/blocking';
import { hidesFromSearch } from '../../services/linkUnfurl/person';

/**
 * `GET /directory/people/:handle?via=link` (#18865) — la carte d'une fiche dont le lien a été
 * COLLÉ dans une conversation. La porte reste celle de la fiche (`servirProfilPublic`) ; ce
 * mode ferme EN PLUS ce qu'un lien collé n'a pas à révéler, et le ferme par la MÊME 404 qu'un
 * pseudo inexistant : compte désactivé, inactif ou supprimé, personne cachée de la recherche
 * (préférence illisible ⇒ cachée), personne que le lecteur a bloquée. Le blocage inverse est
 * déjà fermé par la porte de la fiche. Son propre lien se déplie toujours.
 *
 * Rend `false` quand la fiche est introuvable : la porte de la fiche rend alors sa 404.
 */
export async function linkCardIsClosed(prisma: PrismaClient, handle: string, viewerId: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: isValidObjectId(handle) ? { id: handle } : { username: { equals: handle, mode: 'insensitive' } },
    select: { id: true, isActive: true, deletedAt: true, deactivatedAt: true },
  });
  if (user === null) return false;
  const targetId = String(user.id);
  if (targetId === viewerId) return false;
  if (user.isActive === false || user.deletedAt != null || user.deactivatedAt != null) return true;
  const [blocked, hidden] = await Promise.all([hasBlocked(prisma, viewerId, targetId), hidesFromSearch(prisma, targetId)]);
  return blocked || hidden;
}
