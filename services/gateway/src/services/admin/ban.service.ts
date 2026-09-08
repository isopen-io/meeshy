import { PrismaClient, Ban } from '@meeshy/shared/prisma/client';
import type { UserManagementService } from './user-management.service';

export interface CreateBanParams {
  userId: string;
  bannedById: string;
  reason: string;
  /** `null`/`undefined` = bannissement permanent. */
  expiresAt?: Date | null;
}

export interface LiftBanParams {
  banId: string;
  /** `null` distingue un lever AUTOMATIQUE (balayage d'expiration, #5527) d'un lever humain. */
  liftedById: string | null;
  liftReason?: string;
  /** Par défaut l'heure courante ; le balayage d'expiration pose l'échéance du ban elle-même. */
  liftedAt?: Date;
}

/**
 * Marqueur d'acteur SYSTÈME pour un `AdminAuditLog` posé par un balayage
 * automatisé, jamais par un admin humain. `AdminAuditLog.adminId` est un
 * `@db.ObjectId` sans relation Prisma (aucune contrainte de clé étrangère) :
 * ce sentinel — un ObjectId valide, tous zéros — ne désigne aucun `User`
 * réel, convention courante pour un acteur système en base MongoDB. #5527.
 */
export const SYSTEM_ACTOR_ID = '000000000000000000000000';

/**
 * Un ban est EN VIGUEUR quand il n'a pas été levé et (permanent, ou son
 * échéance n'est pas encore atteinte). Calculé, jamais stocké en double —
 * voir le doc-comment du modèle `Ban` (schema.prisma).
 */
export function estEnVigueur(ban: Pick<Ban, 'liftedAt' | 'expiresAt'>, maintenant: Date = new Date()): boolean {
  if (ban.liftedAt !== null) return false;
  if (ban.expiresAt === null) return true;
  return ban.expiresAt.getTime() > maintenant.getTime();
}

/**
 * Bannissement durable d'un utilisateur (#3719). Un `Ban` créé pilote
 * `User.isActive` via `UserManagementService.updateStatus` — le même levier
 * que la suspension existante, pour hériter de sa révocation de sessions.
 *
 * L'expiration AUTOMATIQUE d'un ban à durée est appliquée par
 * `sweepExpiredBans`, consommée par `BanExpirySweepJob` (#5527).
 */
export class BanService {
  constructor(
    private prisma: PrismaClient,
    private userManagementService: UserManagementService
  ) {}

  async createBan(params: CreateBanParams): Promise<Ban> {
    const ban = await this.prisma.ban.create({
      data: {
        userId: params.userId,
        bannedById: params.bannedById,
        reason: params.reason,
        expiresAt: params.expiresAt ?? null,
      },
    });

    await this.userManagementService.updateStatus(params.userId, { isActive: false });

    return ban;
  }

  /**
   * Lève un ban précis. Ne réactive le compte que si AUCUN autre ban de cet
   * utilisateur n'est encore en vigueur — un compte sous deux bans ne doit
   * pas se rouvrir parce que le premier a été levé par erreur.
   */
  async liftBan(params: LiftBanParams): Promise<Ban> {
    const ban = await this.prisma.ban.findUniqueOrThrow({ where: { id: params.banId } });

    const leve = await this.prisma.ban.update({
      where: { id: params.banId },
      data: {
        liftedAt: params.liftedAt ?? new Date(),
        liftedById: params.liftedById,
        liftReason: params.liftReason ?? null,
      },
    });

    const autresEnVigueur = await this.listActiveBans(ban.userId, { excludeBanId: params.banId });
    if (autresEnVigueur.length === 0) {
      await this.userManagementService.updateStatus(ban.userId, { isActive: true });
    }

    return leve;
  }

  async listBans(userId: string): Promise<Ban[]> {
    return this.prisma.ban.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async listActiveBans(userId: string, options: { excludeBanId?: string } = {}): Promise<Ban[]> {
    const tous = await this.prisma.ban.findMany({
      where: { userId, liftedAt: null, id: options.excludeBanId ? { not: options.excludeBanId } : undefined },
    });
    return tous.filter((b) => estEnVigueur(b));
  }

  /**
   * Lève automatiquement tout ban à échéance PASSÉE et non encore levé —
   * sans balayage, `Ban.expiresAt` est décoratif après son échéance : un
   * compte banni 7 jours reste désactivé indéfiniment tant qu'un admin ne
   * lève pas le ban à la main. `liftedAt` reprend l'échéance du ban (pas
   * l'heure du balayage) et `liftedById: null` distingue ce lever
   * automatique d'un lever humain. Réutilise `liftBan` — même garde « aucun
   * autre ban en vigueur » avant de réactiver le compte. Consommé par
   * `BanExpirySweepJob` (#5527).
   */
  async sweepExpiredBans(now: Date = new Date()): Promise<Ban[]> {
    const expires = await this.prisma.ban.findMany({
      where: { liftedAt: null, expiresAt: { not: null, lte: now } },
    });

    const lifted: Ban[] = [];
    for (const ban of expires) {
      const leve = await this.liftBan({
        banId: ban.id,
        liftedById: null,
        liftReason: 'expired',
        liftedAt: ban.expiresAt!,
      });
      lifted.push(leve);
    }
    return lifted;
  }
}
