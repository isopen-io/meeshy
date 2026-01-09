import { PrismaClient } from '@meeshy/shared/prisma/client';
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
import * as bcrypt from 'bcrypt';

export class UserManagementService {
  constructor(private prisma: PrismaClient) {}

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

    if (filters.lastSeenAfter || filters.lastSeenBefore) {
      where.lastSeen = {};
      if (filters.lastSeenAfter) {
        (where.lastSeen as Record<string, unknown>).gte = filters.lastSeenAfter;
      }
      if (filters.lastSeenBefore) {
        (where.lastSeen as Record<string, unknown>).lte = filters.lastSeenBefore;
      }
    }

    // Construction du tri
    const orderBy: Record<string, string> = {};
    if (filters.sortBy) {
      orderBy[filters.sortBy] = filters.sortOrder || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

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
      users: users as FullUser[],
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
            sentMessages: true,
            conversations: true
          }
        }
      }
    });

    return user as FullUser | null;
  }

  /**
   * Crée un nouvel utilisateur
   */
  async createUser(data: CreateUserDTO, creatorId: string): Promise<FullUser> {
    // Hash du mot de passe
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: hashedPassword,
        displayName: data.displayName,
        bio: data.bio || '',
        phoneNumber: data.phoneNumber,
        role: data.role || 'USER',
        systemLanguage: data.systemLanguage || 'en',
        regionalLanguage: data.regionalLanguage || 'en',
        isActive: true,
        autoTranslateEnabled: false,
        translateToSystemLanguage: true,
        translateToRegionalLanguage: false,
        useCustomDestination: false,
        lastSeen: new Date(),
        lastActiveAt: new Date()
      }
    });

    return user as FullUser;
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
      }
    });

    return user as FullUser;
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

    const isPasswordValid = await bcrypt.compare(data.password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    // Mettre à jour l'email
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: data.newEmail,
        updatedAt: new Date()
      }
    });

    return updatedUser as FullUser;
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
        role: data.role,
        updatedAt: new Date()
      }
    });

    return user as FullUser;
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
      }
    });

    return user as FullUser;
  }

  /**
   * Réinitialise le mot de passe d'un utilisateur
   */
  async resetPassword(
    userId: string,
    data: ResetPasswordDTO,
    resetById: string
  ): Promise<FullUser> {
    const hashedPassword = await bcrypt.hash(data.newPassword, 10);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        updatedAt: new Date()
      }
    });

    return user as FullUser;
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
      }
    });

    return user as FullUser;
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
      }
    });

    return user as FullUser;
  }

  /**
   * Met à jour l'avatar d'un utilisateur
   */
  async updateAvatar(userId: string, avatarUrl: string): Promise<FullUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatar: avatarUrl,
        updatedAt: new Date()
      }
    });

    return user as FullUser;
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
      }
    });

    return user as FullUser;
  }
}
