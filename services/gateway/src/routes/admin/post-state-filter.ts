import type { Prisma } from '@meeshy/shared/prisma/client';
import type { AdminPostState } from '@meeshy/shared/types/admin-publications';
import { NOT_DELETED } from '../../services/posts/softDelete';

/**
 * **LE FILTRE D'ÉTAT DE LA LISTE DES PUBLICATIONS** (#10392) — la traduction en
 * requête de `adminPostStateOf` (`@meeshy/shared/types/admin-publications`) : un
 * état par publication, par priorité (supprimée > hors ligne > expirée > privée >
 * publiée). Une colonne ABSENTE du document vaut `null` lu (leçon 318) : un post
 * ordinaire n'a ni `moderationHiddenAt` ni `expiresAt`.
 */
const NOT_HIDDEN: Prisma.PostWhereInput = { OR: [{ moderationHiddenAt: null }, { moderationHiddenAt: { isSet: false } }] };

const notExpired = (now: Date): Prisma.PostWhereInput => ({ OR: [{ expiresAt: null }, { expiresAt: { isSet: false } }, { expiresAt: { gt: now } }] });

export function adminPostStateWhere(state: AdminPostState, now: Date): Prisma.PostWhereInput {
  switch (state) {
    case 'deleted':
      return { deletedAt: { not: null } };
    case 'offline':
      return { deletedAt: NOT_DELETED, moderationHiddenAt: { not: null } };
    case 'expired':
      return { deletedAt: NOT_DELETED, expiresAt: { lte: now }, AND: [NOT_HIDDEN] };
    case 'private':
      return { deletedAt: NOT_DELETED, visibility: 'PRIVATE', AND: [NOT_HIDDEN, notExpired(now)] };
    case 'published':
      return { deletedAt: NOT_DELETED, visibility: { not: 'PRIVATE' }, AND: [NOT_HIDDEN, notExpired(now)] };
  }
}
