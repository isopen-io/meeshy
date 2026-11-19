import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { isBlockedBetween } from '../../utils/blocking';
import { USABLE_ACCOUNT_WHERE } from '../../services/relations/usableAccount';

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
 *
 * « Vivant » vient de `USABLE_ACCOUNT_WHERE`, jamais d'une égalité écrite ici.
 * Composé à la main (`deactivatedAt: null, deletedAt: null`), ce filtre
 * n'appariait AUCUN compte — aucune création n'écrit ces colonnes — et les deux
 * routes rendaient 404 pour tout le monde : personne ne pouvait être invité dans
 * une communauté, ni ajouté par un administrateur (#19799).
 */
export async function isAddableUser(prisma: Pick<PrismaClient, 'user'>, actorId: string, targetId: string): Promise<boolean> {
  const target = await prisma.user.findFirst({
    where: { id: targetId, ...USABLE_ACCOUNT_WHERE },
    select: { id: true },
  });
  if (target === null) return false;
  return !(await isBlockedBetween(prisma, actorId, targetId));
}
