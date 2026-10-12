import type { PostVisibility } from '@meeshy/shared/prisma/client';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { isRepostVisibilityAllowed } from '@meeshy/shared/utils/repost-audience';
import { canUserConsumePost, loadPostAcl, type PostAclPrisma } from './postVisibility';
import { NOT_DELETED } from './softDelete';

/**
 * **CE QUE L'AUTEUR NE PEUT PAS DÉFAIRE D'UN RETRAIT DE MODÉRATION** (#10315).
 *
 * « Mettre hors ligne » force l'audience en PRIVATE. Trois chemins la rouvraient
 * sans qu'aucun rôle ne soit nécessaire — l'audit adversarial du lot les a
 * nommés, et c'est ici qu'ils se ferment :
 *
 * 1. l'édition de l'audience par l'auteur (`PUT /posts/:postId`) ;
 * 2. la republication de la source retirée, d'abord en PRIVATE (la loi
 *    d'audience des republications l'admet), puis rouverte par une édition :
 *    une republication ne s'élargit jamais au-delà de sa source, à l'édition
 *    comme à la création ;
 * 3. la republication par un TIERS qui n'a jamais pu lire la source : il fallait
 *    seulement connaître l'identifiant.
 */

type HoldRow = {
  readonly authorId: string;
  readonly moderationHiddenAt: Date | null;
  readonly moderationPriorVisibility: PostVisibility | null;
  readonly repostOfId: string | null;
};

type SourceRow = {
  readonly visibility: PostVisibility;
  readonly moderationHiddenAt: Date | null;
  readonly deletedAt: Date | null;
  readonly originalRepostOfId: string | null;
};

export type ModerationHoldPrisma = PostAclPrisma;

const HOLD_SELECT = { authorId: true, moderationHiddenAt: true, moderationPriorVisibility: true, repostOfId: true } as const;
const SOURCE_SELECT = { visibility: true, moderationHiddenAt: true, deletedAt: true, originalRepostOfId: true } as const;

async function readHold(prisma: ModerationHoldPrisma, postId: string): Promise<HoldRow | null> {
  return prisma.post.findFirst({ where: { id: postId, deletedAt: NOT_DELETED }, select: HOLD_SELECT });
}

/** La source, SUPPRIMÉE comprise : une source retirée ne rend pas sa republication libre de s'élargir. */
async function readSource(prisma: ModerationHoldPrisma, sourceId: string): Promise<SourceRow | null> {
  return prisma.post.findFirst({ where: { id: sourceId }, select: SOURCE_SELECT });
}

export type AudienceChangeVerdict = {
  /** `held` : la publication (ou sa source) est hors ligne. `repost-broader` : plus large que la source. */
  readonly refusal: 'held' | 'repost-broader' | null;
  /**
   * L'audience retenue par une « mise en privé » est périmée dès que l'auteur
   * choisit lui-même la sienne : « Remettre en ligne » ne doit plus la rendre.
   */
  readonly clearsPriorVisibility: boolean;
};

const NOTHING: AudienceChangeVerdict = { refusal: null, clearsPriorVisibility: false };

/**
 * Le verdict d'une édition d'audience par l'AUTEUR. À tout autre, il ne dit rien :
 * le refus ordinaire (« pas l'auteur ») tombe plus loin, et l'état de modération ne
 * fuit pas par la différence entre deux 403.
 */
export async function audienceChangeVerdict(
  prisma: ModerationHoldPrisma,
  params: { readonly postId: string; readonly userId: string; readonly requestedVisibility: PostVisibility | undefined },
): Promise<AudienceChangeVerdict> {
  if (params.requestedVisibility === undefined || !isValidObjectId(params.postId)) return NOTHING;
  const row = await readHold(prisma, params.postId);
  if (row === null || row.authorId !== params.userId) return NOTHING;
  const clearsPriorVisibility = row.moderationPriorVisibility !== null;
  if (params.requestedVisibility === 'PRIVATE') return { refusal: null, clearsPriorVisibility: clearsPriorVisibility && row.moderationHiddenAt === null };
  if (row.moderationHiddenAt !== null) return { refusal: 'held', clearsPriorVisibility: false };
  if (row.repostOfId === null || !isValidObjectId(row.repostOfId)) return { refusal: null, clearsPriorVisibility };
  const source = await readSource(prisma, row.repostOfId);
  if (source === null) return { refusal: null, clearsPriorVisibility };
  if (source.moderationHiddenAt !== null) return { refusal: 'held', clearsPriorVisibility: false };
  if (source.deletedAt !== null) return { refusal: 'repost-broader', clearsPriorVisibility: false };
  if (!isRepostVisibilityAllowed(source.visibility, params.requestedVisibility)) return { refusal: 'repost-broader', clearsPriorVisibility: false };
  return { refusal: null, clearsPriorVisibility };
}

/**
 * Peut-on republier cette source ? Il faut pouvoir la LIRE (la même audience que
 * l'ouverture : `canUserConsumePost`), et qu'elle ne soit pas hors ligne — même
 * pour son auteur. Refus indistinct : absente, supprimée, hors audience ou hors
 * ligne rendent le même `false`.
 */
export async function mayRepostSource(prisma: ModerationHoldPrisma, sourceId: string, userId: string): Promise<boolean> {
  if (!isValidObjectId(sourceId)) return false;
  const source = await readSource(prisma, sourceId);
  if (source === null || source.deletedAt !== null || source.moderationHiddenAt !== null) return false;
  // Une republication de republication : la RACINE hors ligne ferme aussi la porte.
  if (source.originalRepostOfId !== null && isValidObjectId(source.originalRepostOfId)) {
    const root = await readSource(prisma, source.originalRepostOfId);
    if (root !== null && root.moderationHiddenAt !== null) return false;
  }
  const acl = await loadPostAcl(prisma, sourceId);
  return acl !== null && canUserConsumePost(prisma, acl, userId);
}
