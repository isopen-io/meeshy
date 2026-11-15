/**
 * #3740 — la clôture d'une conversation désactive ses `ConversationShareLink`,
 * sans supprimer leur ligne : la porte d'admission (`admitLinkEntry`) refuse
 * déjà l'entrée en 410 (`isConversationClosed`), mais le lien restait ACTIF et
 * LISTÉ — il se copiait, se partageait, et échouait chez qui le recevait. Le
 * coût n'était pas porté par le propriétaire du lien mais par un tiers.
 *
 * Décision (issue #3740, 2026-09-02) : à la clôture, les liens passent
 * INACTIFS ; leur ligne est conservée avec son état. Une réouverture future ne
 * les réactive PAS automatiquement — ce serait un effet de bord sur un geste
 * qui n'en parlait pas.
 *
 * Trois portes ferment une conversation aujourd'hui — `DELETE
 * /conversations/:id` (`core-lifecycle.ts`), `DELETE
 * /conversations/:id/delete-for-me` (`delete-for-me.ts`) quand le dernier
 * membre s'efface, et `POST /conversations/:id/leave` (`leave.ts`) quand le
 * dernier membre part — et ce fichier est le site UNIQUE qu'elles appellent,
 * pour ne jamais laisser l'une d'elles fermer un fil sans éteindre ses liens.
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Rend l'opération Prisma (non exécutée) qui désactive tous les liens encore
 * actifs d'une conversation. Composable dans un `prisma.$transaction([...])`
 * aux côtés de l'écriture de clôture elle-même — les deux committent ensemble
 * ou pas du tout, comme les écritures jumelles qui les accompagnent déjà.
 */
export function deactivateShareLinksOnClose(
  prisma: Pick<PrismaClient, 'conversationShareLink'>,
  conversationId: string
): Prisma.PrismaPromise<Prisma.BatchPayload> {
  return prisma.conversationShareLink.updateMany({
    where: { conversationId, isActive: true },
    data: { isActive: false },
  });
}
