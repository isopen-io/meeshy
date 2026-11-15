import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { isBlockedBetween } from '../../utils/blocking';

/**
 * QUI PEUT ÊTRE AJOUTÉ À UNE COMMUNAUTÉ (#6376) — le site unique des deux
 * routes qui ajoutent quelqu'un SANS son accord : `POST …/invite` (un membre)
 * et `POST …/members` (un administrateur).
 *
 * Un compte vivant seulement : ni désactivé par l'administration
 * (`deactivatedAt`), ni supprimé par son titulaire (`isActive: false` +
 * `deletedAt`, sans `deactivatedAt` — `routes/account-deletion.ts`), ni en
 * attente de vérification (`isActive: false`). Et aucun blocage, dans un sens
 * ou dans l'autre. Les deux routes rendent le même 404 qu'un inconnu : la
 * réponse ne dit pas à l'acteur qu'on l'a bloqué.
 */
export async function isAddableUser(prisma: Pick<PrismaClient, 'user'>, actorId: string, targetId: string): Promise<boolean> {
  const target = await prisma.user.findFirst({
    where: { id: targetId, isActive: true, deactivatedAt: null, deletedAt: null },
    select: { id: true },
  });
  if (target === null) return false;
  return !(await isBlockedBetween(prisma, actorId, targetId));
}
