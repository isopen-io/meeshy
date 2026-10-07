/**
 * Ce qu'un post a rapporté à UN utilisateur (#9569) — l'ÉCRITURE.
 *
 * Seul écrivain de `EngagementPostPoints`, appelé par `EngagementService` une
 * fois le crédit d'un geste ÉCRIT (compteur et score), quand ce geste nomme un
 * post. Un geste refusé par un plafond n'arrive donc jamais ici. Deux rôles :
 *
 * - le CUMUL — les points du geste s'ajoutent, par incrément atomique, à ce que
 *   ce post a déjà rapporté à cet utilisateur. Le crédit de publication d'un
 *   contenu lourd n'y entre pas : il vit dans sa mémoire par contenu
 *   (`creditLivesInPublicationMemory`), que la reprise remet à zéro ;
 * - l'ANNONCE — `engagement:post-updated` vers la seule room personnelle du
 *   crédité, avec la valeur que `loadViewerPostPoints` servirait au même
 *   instant. Ce que l'événement dit et ce qu'une lecture rend viennent de la
 *   même loi : un client pose la valeur, il ne la calcule pas.
 *
 * BEST-EFFORT, délibérément : quand ceci s'exécute, le compteur et le score
 * sont déjà crédités. Un cumul qui ne s'écrit pas ou une annonce qui ne part pas
 * ne défait pas le crédit et n'arrête pas ce qui le suit — `record` ne rejette
 * jamais.
 *
 * `purgePostPoints` retire les lignes d'un post qui disparaît : le modèle n'a
 * ni relation ni cascade vers `Post`, donc rien d'autre ne le ferait.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { EngagementOperationKey } from '@meeshy/shared/types/engagement-operations';
import type { PostEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { creditLivesInPublicationMemory, loadViewerPostPoints } from './viewerPostPoints';

const log = enhancedLogger.child({ module: 'PostPointsRecorder' });

export type PostPointsCredit = {
  readonly userId: string;
  readonly postId: string;
  readonly operationKey: EngagementOperationKey;
  readonly points: number;
  /** La cible sous laquelle `EngagementQuotas.remember` vient de garder ce crédit — absente s'il ne l'a pas gardé. */
  readonly rememberedTargetId?: string;
};

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class PostPointsRecorder {
  constructor(
    private readonly prisma: Pick<PrismaClient, 'engagementPostPoints' | 'engagementQuota'>,
    private readonly emitIO: () => ServerEmitIO | undefined,
  ) {}

  async record(credit: PostPointsCredit): Promise<void> {
    const { userId, postId } = credit;
    try {
      const heldByPublicationMemory = creditLivesInPublicationMemory({
        operationKey: credit.operationKey,
        postId,
        rememberedTargetId: credit.rememberedTargetId,
      });
      if (!heldByPublicationMemory && credit.points > 0) await this.add(userId, postId, credit.points);
      await this.announce(userId, postId);
    } catch (error) {
      log.warn('post points not recorded after the credit was written', { userId, postId, error: messageOf(error) });
    }
  }

  private async add(userId: string, postId: string, points: number): Promise<void> {
    const where = { userId_postId: { userId, postId } };
    const data = { totalPoints: { increment: points } };
    try {
      await this.prisma.engagementPostPoints.upsert({ where, create: { userId, postId, totalPoints: points }, update: data });
    } catch (err) {
      // Deux premiers gestes concurrents : le perdant de la création retombe
      // sur un incrément de la ligne que le gagnant vient de poser.
      if (!isP2002(err)) throw err;
      await this.prisma.engagementPostPoints.update({ where, data });
    }
  }

  private async announce(userId: string, postId: string): Promise<void> {
    const io = this.emitIO();
    if (!io) return;
    const points = await loadViewerPostPoints(this.prisma, userId, [{ id: postId }]);
    const snapshot: PostEngagementSnapshot = { postId, viewerPoints: points.get(postId) ?? 0 };
    io.to(ROOMS.user(userId)).emit(SERVER_EVENTS.ENGAGEMENT_POST_UPDATED, snapshot);
  }
}

/** Retire ce que des posts DISPARUS ont rapporté à chacun — idempotent, rend le nombre de lignes retirées. */
export async function purgePostPoints(
  prisma: Pick<PrismaClient, 'engagementPostPoints'>,
  postIds: readonly string[],
): Promise<number> {
  if (postIds.length === 0) return 0;
  const removed = await prisma.engagementPostPoints.deleteMany({ where: { postId: { in: [...postIds] } } });
  return removed.count;
}
