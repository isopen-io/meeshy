/**
 * Ban Expiry Sweep Job (#5527)
 *
 * Un `Ban.expiresAt` non nul ne réactivait rien tout seul (#3719 livrait le
 * modèle et le lever explicite, jamais l'échéance) : un compte banni 7 jours
 * restait désactivé indéfiniment tant qu'un admin ne cliquait pas « Lever ».
 * Ce job balaie périodiquement les bans échus et les lève automatiquement.
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { UserAuditAction } from '@meeshy/shared/types';
import type { BanService } from '../services/admin/ban.service';
import type { UserAuditService } from '../services/admin/user-audit.service';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'BanExpirySweepJob' });

/**
 * Marqueur d'acteur SYSTÈME pour `AdminAuditLog.adminId` — colonne requise
 * (`@db.ObjectId`), donc `null` n'est pas une option, alors qu'un lever par
 * échéance n'est prononcé par AUCUN admin humain. Format ObjectId valide
 * (24 hex) qu'aucun `User.id` réel ne porte jamais : un `ObjectId` généré par
 * MongoDB encode un timestamp non nul dans ses 4 premiers octets, ce qui
 * exclut structurellement la valeur toute à zéro. La distinction humain/
 * automatique que cette constante ne peut pas porter sur `adminId` (colonne
 * requise) est portée par `Ban.liftedById`, LUI nullable — `expireBan` y pose
 * toujours `null`.
 */
export const SYSTEM_ACTOR_ID = '000000000000000000000000';

export class BanExpirySweepJob {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly intervalMinutes: number = 60; // toutes les heures

  constructor(
    private readonly prisma: PrismaClient,
    private readonly banService: BanService,
    private readonly userAuditService: UserAuditService
  ) {}

  start(): void {
    if (this.intervalId) {
      logger.warn('Job already running');
      return;
    }

    logger.info(`Starting ban expiry sweep job (interval: ${this.intervalMinutes} min)`);

    // Run immediately on start, like the sibling account-unlock job.
    this.sweep();

    this.intervalId = setInterval(() => {
      this.sweep();
    }, this.intervalMinutes * 60 * 1000);
    this.intervalId.unref?.();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Ban expiry sweep job stopped');
    }
  }

  /**
   * Run sweep manually (for testing / manual trigger).
   */
  async runNow(): Promise<void> {
    await this.sweep();
  }

  private async sweep(): Promise<void> {
    try {
      const now = new Date();
      const expired = await this.prisma.ban.findMany({
        where: { liftedAt: null, expiresAt: { not: null, lte: now } },
      });

      if (expired.length === 0) {
        logger.debug('No expired bans found');
        return;
      }

      logger.info(`Found ${expired.length} expired bans to lift`);

      for (const ban of expired) {
        try {
          const { reactivated } = await this.banService.expireBan(ban.id, now);

          await this.userAuditService.createAuditLog({
            userId: ban.userId,
            adminId: SYSTEM_ACTOR_ID,
            action: UserAuditAction.UNBAN_USER,
            entityId: ban.id,
            changes: reactivated ? { isActive: { before: false, after: true } } : {},
            metadata: {
              reason: 'expired',
              banId: ban.id,
              expiresAt: ban.expiresAt ? ban.expiresAt.toISOString() : null,
            },
          });
        } catch (error) {
          // Best-effort par ban : un échec isolé ne doit pas empêcher le
          // balayage des autres bans échus de la même passe.
          logger.error(`Failed to lift expired ban ${ban.id}`, error as Error);
        }
      }
    } catch (error) {
      logger.error('Error during ban expiry sweep', error as Error);
    }
  }
}
