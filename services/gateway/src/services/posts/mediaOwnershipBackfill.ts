import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { uploaderIdFromFilePath } from './mediaOwnership';

/**
 * Rattrapage de `PostMedia.uploaderId` sur les lignes créées avant le champ.
 *
 * Tant qu'il reste des médias RÉCLAMABLES sans propriétaire, la garde de
 * rattachement doit rester tolérante (cf. `claimableMediaWhere`) — donc le trou
 * reste ouvert. Ce rattrapage est le préalable à la phase 2, pas un confort.
 *
 * Trois sources, par ordre de fiabilité DÉCROISSANTE :
 * 1. média rattaché à un post → `post.authorId` (exact, c'est le publieur) ;
 * 2. média rattaché à un commentaire → `comment.authorId` (idem) ;
 * 3. média EN ATTENTE → l'uploadeur lu dans `filePath` (`année/mois/<id>/…`).
 *
 * La troisième est la seule disponible pour les médias vulnérables, et c'est
 * aussi la seule inférée : un chemin réécrit ou migré la rendrait fausse. Elle
 * est donc comptée à part dans le rapport, pour qu'on puisse décider en
 * connaissance de cause de resserrer la garde.
 */
export interface BackfillReport {
  scanned: number;
  fromPost: number;
  fromComment: number;
  fromFilePath: number;
  /** Restés sans propriétaire : bloquent la phase 2 s'ils sont réclamables. */
  unresolved: number;
  /** Sous-ensemble d'`unresolved` encore RÉCLAMABLE — le seul chiffre qui compte. */
  unresolvedClaimable: number;
}

export interface BackfillOptions {
  apply: boolean;
  batchSize?: number;
  onResolve?: (info: { mediaId: string; uploaderId: string; source: 'post' | 'comment' | 'filePath' }) => void;
  onUnresolved?: (info: { mediaId: string; filePath: string | null; claimable: boolean }) => void;
}

export async function backfillPostMediaUploader(
  prisma: PrismaClient,
  options: BackfillOptions,
): Promise<BackfillReport> {
  const batchSize = options.batchSize ?? 500;
  const report: BackfillReport = {
    scanned: 0, fromPost: 0, fromComment: 0, fromFilePath: 0,
    unresolved: 0, unresolvedClaimable: 0,
  };

  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.postMedia.findMany({
      where: {
        // Les deux formes : MongoDB distingue un champ ABSENT d'un champ nul,
        // et les lignes héritées n'ont pas la clé du tout.
        OR: [{ uploaderId: null }, { uploaderId: { isSet: false } }],
      },
      select: { id: true, postId: true, commentId: true, filePath: true },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    report.scanned += batch.length;

    // Les auteurs se chargent par LOT : un findUnique par média ferait un N+1
    // sur toute la table.
    const postIds = [...new Set(batch.map((m) => m.postId).filter((id): id is string => !!id))];
    const commentIds = [...new Set(batch.map((m) => m.commentId).filter((id): id is string => !!id))];

    const [posts, comments] = await Promise.all([
      postIds.length
        ? prisma.post.findMany({ where: { id: { in: postIds } }, select: { id: true, authorId: true } })
        : Promise.resolve([]),
      commentIds.length
        ? prisma.postComment.findMany({ where: { id: { in: commentIds } }, select: { id: true, authorId: true } })
        : Promise.resolve([]),
    ]);
    const postAuthor = new Map(posts.map((p) => [p.id, p.authorId]));
    const commentAuthor = new Map(comments.map((c) => [c.id, c.authorId]));

    for (const media of batch) {
      let uploaderId: string | null = null;
      let source: 'post' | 'comment' | 'filePath' | null = null;

      if (media.postId && postAuthor.has(media.postId)) {
        uploaderId = postAuthor.get(media.postId)!;
        source = 'post';
      } else if (media.commentId && commentAuthor.has(media.commentId)) {
        uploaderId = commentAuthor.get(media.commentId)!;
        source = 'comment';
      } else {
        uploaderId = uploaderIdFromFilePath(media.filePath);
        if (uploaderId) source = 'filePath';
      }

      if (!uploaderId || !source) {
        report.unresolved += 1;
        // Un média déjà rattaché n'est plus réclamable : son absence de
        // propriétaire est une lacune d'inventaire, pas une faille.
        const claimable = !media.postId && !media.commentId;
        if (claimable) report.unresolvedClaimable += 1;
        options.onUnresolved?.({ mediaId: media.id, filePath: media.filePath, claimable });
        continue;
      }

      if (source === 'post') report.fromPost += 1;
      else if (source === 'comment') report.fromComment += 1;
      else report.fromFilePath += 1;
      options.onResolve?.({ mediaId: media.id, uploaderId, source });

      if (options.apply) {
        await prisma.postMedia.update({ where: { id: media.id }, data: { uploaderId } });
      }
    }

    if (batch.length < batchSize) break;
  }

  return report;
}
