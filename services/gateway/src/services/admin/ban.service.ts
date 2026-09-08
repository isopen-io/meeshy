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
  liftedById: string;
  liftReason?: string;
}

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
 * L'expiration AUTOMATIQUE d'un ban à durée est un balayage périodique
 * (`jobs/ban-expiry-sweep.ts`, #5527) qui appelle `expireBan` pour chaque
 * `Ban` échu — jamais une vérification paresseuse au premier accès admin :
 * sans balayage, un compte banni 7 jours resterait désactivé indéfiniment
 * tant qu'aucun admin ne consulte sa fiche.
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
        liftedAt: new Date(),
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

  async listActiveBans(
    userId: string,
    options: { excludeBanId?: string; now?: Date } = {}
  ): Promise<Ban[]> {
    const tous = await this.prisma.ban.findMany({
      where: { userId, liftedAt: null, id: options.excludeBanId ? { not: options.excludeBanId } : undefined },
    });
    return tous.filter((b) => estEnVigueur(b, options.now));
  }

  /**
   * Lever AUTOMATIQUE d'un ban dont l'échéance est dépassée (#5527) — appelé
   * par le balayage périodique, jamais par un geste admin. `liftedById` reste
   * `null` : c'est ce qui distingue ce lever d'un lever humain (`liftBan`, qui
   * exige toujours un acteur). `liftedAt` prend la valeur de `expiresAt`
   * elle-même (pas l'instant du balayage) — le ban a cessé d'être en vigueur
   * à son échéance, le balayage ne fait que le CONSTATER.
   */
  async expireBan(banId: string, now: Date = new Date()): Promise<{ ban: Ban; reactivated: boolean }> {
    const ban = await this.prisma.ban.findUniqueOrThrow({ where: { id: banId } });

    const leve = await this.prisma.ban.update({
      where: { id: banId },
      data: {
        liftedAt: ban.expiresAt ?? now,
        liftedById: null,
        liftReason: 'expired',
      },
    });

    const autresEnVigueur = await this.listActiveBans(ban.userId, { excludeBanId: banId, now });
    const reactivated = autresEnVigueur.length === 0;
    if (reactivated) {
      await this.userManagementService.updateStatus(ban.userId, { isActive: true });
    }

    return { ban: leve, reactivated };
  }
}
