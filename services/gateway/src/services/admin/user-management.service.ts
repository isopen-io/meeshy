import { PrismaClient, UserRole } from '@meeshy/shared/prisma/client';
import {
  FullUser,
  UserFilters,
  CreateUserDTO,
  UpdateUserProfileDTO,
  UpdateEmailDTO,
  UpdateRoleDTO,
  UpdateStatusDTO,
  ResetPasswordDTO
} from '@meeshy/shared/types';
import { hashPassword, verifyPassword } from '../../utils/password-hash';
import { logger, logWarn } from '../../utils/logger';
import { searchTokensFor } from '../../utils/search-tokens';
import {
  ensureGlobalConversationMembership,
  type GlobalMembershipSocketManager,
} from '../conversations/ensureGlobalConversationMembership';

type UserSortKey = NonNullable<UserFilters['sortBy']>;

const USER_SORT_KEYS: Readonly<Record<UserSortKey, true>> = {
  createdAt: true,
  lastActiveAt: true,
  username: true,
  email: true,
  firstName: true,
  lastName: true
};

const isUserSortKey = (value: unknown): value is UserSortKey =>
  typeof value === 'string' && Object.hasOwn(USER_SORT_KEYS, value);

const resolveUserSortKey = (sortBy: unknown): UserSortKey =>
  isUserSortKey(sortBy) ? sortBy : 'createdAt';

const resolveSortOrder = (sortOrder: unknown): 'asc' | 'desc' =>
  sortOrder === 'asc' ? 'asc' : 'desc';

/**
 * Coupe tout canal temps réel que `userId` tient encore. Injecté par la route
 * (qui seule atteint le manager Socket.IO) ; résolu à l'appel, jamais à la
 * construction, parce que le manager naît après l'enregistrement des routes.
 */
export type SessionRevoker = (userId: string) => Promise<unknown>;

export type UserManagementServiceDeps = {
  readonly revokeSessions?: SessionRevoker;
  /**
   * Résolu PARESSEUSEMENT, comme `deactivatedUserSessionRevoker` : le manager
   * n'existe pas encore quand les routes s'enregistrent. Absent = pas de
   * socket, l'ajout au salon global reste persisté (voir
   * `ensureGlobalConversationMembership`).
   */
  readonly resolveSocketManager?: () => GlobalMembershipSocketManager | null | undefined;
};

export class UserManagementService {
  constructor(
    private prisma: PrismaClient,
    private readonly deps: UserManagementServiceDeps = {}
  ) {}

  /**
   * Récupère la liste des utilisateurs avec filtres et pagination
   */
  async getUsers(
    filters: UserFilters,
    pagination: { offset: number; limit: number }
  ): Promise<{ users: FullUser[]; total: number }> {
    const { offset, limit } = pagination;

    // Construction des filtres Prisma
    const where: Record<string, unknown> = {};

    if (filters.search) {
      where.OR = [
        { username: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } }
      ];
    }

    if (filters.role) {
      where.role = filters.role;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.emailVerified !== undefined) {
      where.emailVerifiedAt = filters.emailVerified ? { not: null } : null;
    }

    if (filters.phoneVerified !== undefined) {
      where.phoneVerifiedAt = filters.phoneVerified ? { not: null } : null;
    }

    if (filters.twoFactorEnabled !== undefined) {
      where.twoFactorEnabledAt = filters.twoFactorEnabled ? { not: null } : null;
    }

    if (filters.createdAfter || filters.createdBefore) {
      where.createdAt = {};
      if (filters.createdAfter) {
        (where.createdAt as Record<string, unknown>).gte = filters.createdAfter;
      }
      if (filters.createdBefore) {
        (where.createdAt as Record<string, unknown>).lte = filters.createdBefore;
      }
    }

    if (filters.lastActiveAfter || filters.lastActiveBefore) {
      where.lastActiveAt = {};
      if (filters.lastActiveAfter) {
        (where.lastActiveAt as Record<string, unknown>).gte = filters.lastActiveAfter;
      }
      if (filters.lastActiveBefore) {
        (where.lastActiveAt as Record<string, unknown>).lte = filters.lastActiveBefore;
      }
    }

    const orderBy = { [resolveUserSortKey(filters.sortBy)]: resolveSortOrder(filters.sortOrder) };

    // Exécution de la requête
    const [users, totalUsers] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit
      }),
      this.prisma.user.count({ where })
    ]);

    return {
      users: users as unknown as FullUser[],
      total: totalUsers
    };
  }

  /**
   * Récupère un utilisateur par son ID
   */
  async getUserById(userId: string): Promise<FullUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            participations: true,
            createdShareLinks: true,
            createdTrackingLinks: true,
            createdAffiliateTokens: true,
            affiliateRelations: true,
            referredRelations: true,
            sentFriendRequests: true,
            receivedFriendRequests: true,
          }
        }
      }
    });

    return user as unknown as FullUser | null;
  }

  /**
   * Crée un nouvel utilisateur
   *
   * Rejoint le salon global "meeshy" COMME UN INSCRIT (#3876) : avant ce lot,
   * seule l'inscription publique (`AuthService.register`) faisait cet ajout —
   * un compte créé par un administrateur n'y entrait jamais.
   * `ensureGlobalConversationMembership` est la SOURCE UNIQUE, partagée par
   * l'inscription, cette création admin et le seed (`InitService`).
   *
   * Best-effort, comme l'inscription publique : une panne de l'ajout au salon
   * global ne doit pas faire échouer la création du compte.
   */
  async createUser(data: CreateUserDTO, creatorId: string): Promise<FullUser> {
    // Le coût de hachage était 10 ICI et 12 aux trois autres portes (#3629,
    // soldé au #5216) : un compte créé par un administrateur repartait avec un
    // hash quatre fois moins cher à casser que celui d'un compte inscrit par la
    // porte publique, sans que rien ne le signale. Le facteur vit désormais dans
    // `utils/password-hash`, et il n'y a plus de site où le retaper.
    const hashedPassword = await hashPassword(data.password);

    const user = await this.prisma.user.create({
      data: {
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: hashedPassword,
        displayName: data.displayName,
        // Écrits en même temps que les noms : un compte créé sans jetons serait
        // introuvable jusqu'à sa prochaine modification de profil (#4159).
        searchTokens: searchTokensFor({
          username: data.username,
          displayName: data.displayName,
          firstName: data.firstName,
          lastName: data.lastName,
        }),
        bio: data.bio || '',
        phoneNumber: data.phoneNumber,
        role: (data.role || 'USER') as UserRole,
        systemLanguage: data.systemLanguage || 'en',
        regionalLanguage: data.regionalLanguage || 'en',
        isActive: true,
        lastActiveAt: new Date()
        // TODO: Initialize UserPreferences.application when implemented
      }
    });

    try {
      await ensureGlobalConversationMembership(
        { prisma: this.prisma, resolveSocketManager: this.deps.resolveSocketManager },
        { userId: user.id, displayName: user.displayName || user.username }
      );
    } catch (error) {
      logWarn(logger, `[UserManagement] Global conversation join failed for admin-created user ${user.id}`, error);
    }

    return user as unknown as FullUser;
  }

  /**
   * Met à jour le profil d'un utilisateur
   */
  async updateUser(
    userId: string,
    data: UpdateUserProfileDTO,
    updaterId: string
  ): Promise<FullUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...data,
        updatedAt: new Date()
      },
    });

    return user as unknown as FullUser;
  }

  /**
   * Met à jour l'email d'un utilisateur
   */
  async updateEmail(
    userId: string,
    data: UpdateEmailDTO,
    updaterId: string
  ): Promise<FullUser> {
    // Vérifier le mot de passe actuel
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    const isPasswordValid = await verifyPassword(data.password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    // Mettre à jour l'email
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: data.newEmail,
        updatedAt: new Date()
      },
    });

    return updatedUser as unknown as FullUser;
  }

  /**
   * Met à jour le rôle d'un utilisateur
   */
  async updateRole(
    userId: string,
    data: UpdateRoleDTO,
    updaterId: string
  ): Promise<FullUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        role: data.role as UserRole,
        updatedAt: new Date()
      },
    });

    return user as unknown as FullUser;
  }

  /**
   * Active ou désactive un utilisateur
   */
  async updateStatus(
    userId: string,
    data: UpdateStatusDTO,
    updaterId: string
  ): Promise<FullUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: data.isActive,
        deactivatedAt: data.isActive ? null : new Date(),
        updatedAt: new Date()
      },
    });

    if (!data.isActive) await this.revokeSessionsAfterDeactivation(userId);

    return user as unknown as FullUser;
  }

  /**
   * Un compte mis hors service — désactivé (`deactivatedAt` non nul) ou
   * supprimé en douceur (`isActive: false` seul) — est masqué pour TOUS ; un
   * socket qui lui resterait ouvert continuerait de recevoir ses fils temps
   * réel, d'émettre des `typing:start` (lus « en ligne ») et de voir la
   * présence des autres. Après l'écriture, jamais avant ; best-effort : la
   * ligne est déjà posée, une coupure qui échoue ne rend pas la désactivation.
   */
  private async revokeSessionsAfterDeactivation(userId: string): Promise<void> {
    const revoke = this.deps.revokeSessions;
    if (!revoke) return;
    try {
      await revoke(userId);
    } catch (error) {
      logWarn(logger, `[UserManagement] Session revocation failed after deactivation of user ${userId}`, error);
    }
  }

  /**
   * Réinitialise le mot de passe d'un utilisateur
   */
  async resetPassword(
    userId: string,
    data: ResetPasswordDTO,
    resetById: string
  ): Promise<FullUser> {
    const hashedPassword = await hashPassword(data.newPassword);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        updatedAt: new Date()
      },
    });

    return user as unknown as FullUser;
  }

  /**
   * Supprime un utilisateur (soft delete)
   */
  async deleteUser(userId: string, deletedById: string): Promise<FullUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        updatedAt: new Date()
      },
    });

    await this.revokeSessionsAfterDeactivation(userId);

    return user as unknown as FullUser;
  }

  /**
   * Restaure un utilisateur supprimé
   */
  async restoreUser(userId: string, restoredById: string): Promise<FullUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        updatedAt: new Date()
      },
    });

    return user as unknown as FullUser;
  }

  /**
   * Met à jour l'avatar d'un utilisateur
   */
  async updateAvatar(userId: string, avatar: string): Promise<FullUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatar,
        updatedAt: new Date()
      },
    });

    return user as unknown as FullUser;
  }

  /**
   * Supprime l'avatar d'un utilisateur
   */
  async deleteAvatar(userId: string): Promise<FullUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatar: null,
        updatedAt: new Date()
      },
    });

    return user as unknown as FullUser;
  }

  /**
   * Vérifie ou dévérifie l'email d'un utilisateur
   */
  async verifyEmail(
    userId: string,
    verified: boolean,
    updaterId: string
  ): Promise<FullUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: verified ? new Date() : null,
        updatedAt: new Date()
      },
    });

    return user as unknown as FullUser;
  }

  /**
   * Vérifie ou dévérifie le téléphone d'un utilisateur
   */
  async verifyPhone(
    userId: string,
    verified: boolean,
    updaterId: string
  ): Promise<FullUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        phoneVerifiedAt: verified ? new Date() : null,
        updatedAt: new Date()
      },
    });

    return user as unknown as FullUser;
  }

  /**
   * Déverrouille un compte utilisateur
   */
  async unlockAccount(userId: string, updaterId: string): Promise<FullUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lockedReason: null,
        updatedAt: new Date()
      },
    });

    return user as unknown as FullUser;
  }

  /**
   * Active la 2FA pour un utilisateur
   */
  async enable2FA(userId: string, updaterId: string): Promise<FullUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabledAt: new Date(),
        updatedAt: new Date()
      },
    });

    return user as unknown as FullUser;
  }

  /**
   * Désactive la 2FA pour un utilisateur.
   *
   * `twoFactorBackupCodes` est déclaré `String[] @default([])` : une liste
   * scalaire ne s'ANNULE pas, elle se VIDE. Y écrire `null` faisait échouer la
   * requête Prisma, que le `catch` de la route rendait en « Internal server
   * error » — le désarmement administrateur, seul chemin de récupération pour
   * qui a PERDU son appareil, n'a donc jamais abouti (#4206).
   *
   * Les champs effacés sont ceux du chemin utilisateur (`TwoFactorService`),
   * `twoFactorPendingSecret` compris : sans lui, un appairage entamé survivait
   * au désarmement et pouvait être repris là où il s'était arrêté.
   */
  async disable2FA(userId: string, updaterId: string): Promise<FullUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabledAt: null,
        twoFactorSecret: null,
        twoFactorPendingSecret: null,
        twoFactorBackupCodes: [],
        updatedAt: new Date()
      },
    });

    return user as unknown as FullUser;
  }

  /**
   * Active ou désactive un consentement voice/GDPR
   */
  async toggleVoiceConsent(
    userId: string,
    consentType: 'voiceProfile' | 'voiceData' | 'dataProcessing' | 'voiceCloning',
    enabled: boolean,
    updaterId: string
  ): Promise<FullUser> {
    const fieldMap = {
      voiceProfile: 'voiceProfileConsentAt',
      voiceData: 'voiceDataConsentAt',
      dataProcessing: 'dataProcessingConsentAt',
      voiceCloning: 'voiceCloningEnabledAt'
    };

    const field = fieldMap[consentType];
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        [field]: enabled ? new Date() : null,
        updatedAt: new Date()
      },
    });

    return user as unknown as FullUser;
  }

  /**
   * Vérifie ou dévérifie l'âge d'un utilisateur
   */
  async verifyAge(
    userId: string,
    verified: boolean,
    updaterId: string
  ): Promise<FullUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ageVerifiedAt: verified ? new Date() : null,
        updatedAt: new Date()
      },
    });

    return user as unknown as FullUser;
  }
}
