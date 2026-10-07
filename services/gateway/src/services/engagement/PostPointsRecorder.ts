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

import { createHash } from 'node:crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { EngagementOperationKey } from '@meeshy/shared/types/engagement-operations';
import type { PostEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { withRetry } from '../MessageMediaConsumptionService';
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

/**
 * L'identifiant de LA ligne d'un (lecteur, post) — dérivé des deux, donc le même
 * pour tout écrivain. Deux premiers gestes simultanés créent ainsi la MÊME clé
 * primaire : la seconde création est refusée par l'index `_id`, le seul qui
 * existe toujours, que l'index unique de la migration soit déjà posé ou non.
 * Aucun doublon ne peut naître — et c'est ce qui compte, parce qu'un doublon ne
 * se contente pas d'exister : une mise à jour par (lecteur, post) incrémente
 * alors les DEUX lignes, et chaque geste suivant se compte deux fois.
 */
export const postPointsRowId = (userId: string, postId: string): string =>
  createHash('sha256').update(`${userId}:${postId}`).digest('hex').slice(0, 24);

export class PostPointsRecorder {
  constructor(
    private readonly prisma: Pick<PrismaClient, 'engagementPostPoints' | 'engagementQuota'>,
    private readonly emitIO: () => ServerEmitIO | undefined,
  ) {}

  async record(credit: PostPointsCredit): Promise<void> {
    const { userId, postId } = credit;
    // Un crédit que le barème paie zéro ne change rien : ni ligne, ni annonce.
    if (credit.points <= 0) return;
    const heldByPublicationMemory = creditLivesInPublicationMemory({
      operationKey: credit.operationKey,
      postId,
      rememberedTargetId: credit.rememberedTargetId,
    });
    try {
      if (!heldByPublicationMemory) await this.add(userId, postId, credit.points);
    } catch (error) {
      // Rien n'a changé pour ce post : rien à annoncer non plus.
      log.warn('post points not added after the credit was written', { userId, postId, error: messageOf(error) });
      return;
    }
    try {
      await this.announce(userId, postId);
    } catch (error) {
      log.warn('engagement:post-updated not announced', { userId, postId, error: messageOf(error) });
    }
  }

  /**
   * Incrément atomique. Un conflit d'écriture (P2034) n'a rien écrit : la
   * tentative se rejoue en entier, sans quoi le crédit resterait au score et
   * manquerait au cumul.
   */
  private async add(userId: string, postId: string, points: number): Promise<void> {
    const where = { userId_postId: { userId, postId } };
    const data = { totalPoints: { increment: points } };
    const create = { id: postPointsRowId(userId, postId), userId, postId, totalPoints: points };
    await withRetry(async () => {
      try {
        await this.prisma.engagementPostPoints.upsert({ where, create, update: data });
      } catch (err) {
        // Deux premiers gestes concurrents : le perdant de la création retombe
        // sur un incrément de la ligne que le gagnant vient de poser.
        if (!isP2002(err)) throw err;
        await this.prisma.engagementPostPoints.update({ where, data });
      }
    });
  }

  /**
   * Retire `points` de ce que ce post a rapporté à `userId` — la reprise d'un
   * contenu retiré (`EngagementReceipts`) — puis annonce la valeur, qui BAISSE.
   * Jamais sous zéro : une ligne qui n'a pas reçu ces points n'est pas touchée.
   */
  async takeBack(userId: string, postId: string, points: number): Promise<void> {
    try {
      await this.prisma.engagementPostPoints.updateMany({
        where: { userId, postId, totalPoints: { gte: points } },
        data: { totalPoints: { decrement: points } },
      });
    } catch (error) {
      log.warn('post points not taken back after the credit was reclaimed', { userId, postId, error: messageOf(error) });
      return;
    }
    try {
      await this.announce(userId, postId);
    } catch (error) {
      log.warn('engagement:post-updated not announced', { userId, postId, error: messageOf(error) });
    }
  }

  private async announce(userId: string, postId: string): Promise<void> {
    const io = this.emitIO();
    if (!io) return;
    const points = await loadViewerPostPoints(this.prisma, userId, [{ id: postId }]);
    const snapshot: PostEngagementSnapshot = { postId, viewerPoints: points.get(postId) ?? 0, at: Date.now() };
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
