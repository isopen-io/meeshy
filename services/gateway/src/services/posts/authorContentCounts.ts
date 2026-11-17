import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostType, PostVisibility } from '@meeshy/shared/prisma/client';
import { compareRelationLevel, type RelationLevel } from '@meeshy/shared/types/relation';
import { postCircleAudienceFloor } from '@meeshy/shared/utils/relation-levels';
import type { CacheStore } from '../CacheStore';
import { viewerPostAudience } from './feedVisibility';
import { NOT_DELETED } from './softDelete';

/**
 * LES COMPTEURS DE PUBLICATIONS D'UN PROFIL, COMPTÉS POUR UN LECTEUR (#19368).
 *
 * Le profil annonce « Publications · 3 publiques », « 64 au total ». Ces nombres
 * se comptaient en total brut de l'auteur (`authorId` + non supprimé) et partaient
 * à tout lecteur : un inconnu apprenait combien de publications privées, réservées
 * aux amis ou à un cercle existaient. Un compteur est une projection de la LISTE :
 * il se compte avec l'audience même des listes (`viewerPostAudience` — visibilité,
 * nominatifs, cercles, communautés lisibles, blocage), stories et statuts non
 * expirés. Aucune seconde loi n'est écrite ici.
 *
 * - `total` — soi et l'administration : tout ce qui n'est pas supprimé, archive comprise ;
 * - `viewer` — un lecteur inscrit : ce que ses listes lui montrent ;
 * - `anonymous` — le PUBLIC encore en ligne ;
 * - `circle` — « Voir comme » : un lecteur SYNTHÉTIQUE de ce cercle, qui n'est nommé
 *   par aucune audience nominative (ni `ONLY`, ni l'exclusion d'un `EXCEPT`) et
 *   n'est membre d'aucune communauté précise (une publication rattachée à une
 *   communauté n'y compte pas : fail-closed).
 */
export type ContentCountReader =
  | { readonly kind: 'total' }
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'viewer'; readonly viewerId: string }
  | { readonly kind: 'circle'; readonly level: RelationLevel };

export type AuthorContentCounts = {
  readonly postsCount: number;
  readonly reelsCount: number;
  readonly storiesCount: number;
  readonly statusesCount: number;
};

export function contentCountReaderFor(input: {
  readonly subjectId: string;
  readonly viewerId?: string;
  readonly isAdministration: boolean;
  readonly seenAs?: RelationLevel;
}): ContentCountReader {
  if (input.seenAs) return { kind: 'circle', level: input.seenAs };
  if (input.viewerId === input.subjectId || input.isAdministration) return { kind: 'total' };
  if (input.viewerId) return { kind: 'viewer', viewerId: input.viewerId };
  return { kind: 'anonymous' };
}

const UNATTACHED = { OR: [{ communityId: null }, { communityId: { isSet: false } }] };

/** Le cercle minimal qu'exige chaque audience pour un lecteur qu'aucune ne nomme. */
const SYNTHETIC_FLOOR: Readonly<Partial<Record<PostVisibility, RelationLevel>>> = {
  [PostVisibility.PUBLIC]: 'PUBLIC',
  [PostVisibility.COMMUNITY]: 'COMMUNITY',
  [PostVisibility.FRIENDS]: 'FRIEND',
  [PostVisibility.EXCEPT]: 'FRIEND',
  ...Object.fromEntries(
    [PostVisibility.ACQUAINTANCES, PostVisibility.CLOSE, PostVisibility.BLOOD].map((v) => [v, postCircleAudienceFloor(v)]),
  ),
};

function circleAudience(level: RelationLevel) {
  const clauses = (Object.entries(SYNTHETIC_FLOOR) as [PostVisibility, RelationLevel][])
    .filter(([, floor]) => compareRelationLevel(level, floor) >= 0)
    .map(([visibility]) => (visibility === PostVisibility.COMMUNITY ? { visibility, ...UNATTACHED } : { visibility }));
  return { OR: clauses };
}

async function audienceOf(prisma: PrismaClient, reader: ContentCountReader, cache?: CacheStore): Promise<object | null> {
  switch (reader.kind) {
    case 'total':
      return null;
    case 'anonymous':
      return { visibility: PostVisibility.PUBLIC };
    case 'circle':
      return circleAudience(reader.level);
    case 'viewer':
      return viewerPostAudience(prisma, reader.viewerId, cache);
  }
}

const stillLive = (now: Date) => ({
  OR: [{ expiresAt: { isSet: false } }, { expiresAt: { equals: null } }, { expiresAt: { gt: now } }],
});

const EPHEMERAL: ReadonlySet<PostType> = new Set([PostType.STORY, PostType.STATUS]);

export async function countAuthorContent(
  prisma: PrismaClient,
  authorId: string,
  reader: ContentCountReader,
  now: Date = new Date(),
  cache?: CacheStore,
): Promise<AuthorContentCounts> {
  const audience = await audienceOf(prisma, reader, cache);
  const count = (type: PostType) => {
    const clauses = [
      ...(audience ? [audience] : []),
      ...(audience && EPHEMERAL.has(type) ? [stillLive(now)] : []),
    ];
    return prisma.post.count({
      where: { authorId, deletedAt: NOT_DELETED, type, ...(clauses.length > 0 ? { AND: clauses } : {}) },
    });
  };
  const [postsCount, reelsCount, storiesCount, statusesCount] = await Promise.all([
    count(PostType.POST),
    count(PostType.REEL),
    count(PostType.STORY),
    count(PostType.STATUS),
  ]);
  return { postsCount, reelsCount, storiesCount, statusesCount };
}
