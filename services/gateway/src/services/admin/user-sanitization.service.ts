import {
  FullUser,
  PublicUser,
  AdminUser,
  MaskedUser,
  UserResponse,
  UserAuditLog,
  UserRoleEnum
} from '@meeshy/shared/types';
import { permissionsService } from './permissions.service';

export class UserSanitizationService {
  /**
   * Masque un email : john.doe@example.com → j***@example.com
   */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return '***@***';
    return `${local.charAt(0)}***@${domain}`;
  }

  /**
   * Masque un numéro de téléphone : +33612345678 → +33 6** ** ** **
   */
  private maskPhone(phone: string | null): string | null {
    if (!phone) return null;
    const cleaned = phone.replace(/\s/g, '');
    if (cleaned.length < 6) return '***';
    return `${cleaned.substring(0, 5)}** ** ** **`;
  }

  /**
   * Masque une adresse IP : 192.168.1.100 → 192.168.***.***
   */
  private maskIP(ip: string | null): string | null {
    if (!ip) return null;
    const parts = ip.split('.');
    if (parts.length !== 4) return '***.***.***.***';
    return `${parts[0]}.${parts[1]}.***.***.`;
  }

  /**
   * Sanitize un utilisateur selon le rôle du viewer
   */
  sanitizeUser(user: FullUser, viewerRole: UserRoleEnum): UserResponse {
    const canViewSensitive = permissionsService.canViewSensitiveData(viewerRole);

    // Données publiques (toujours incluses)
    const publicData: PublicUser = {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      bio: user.bio,
      avatar: user.avatar,
      role: user.role,
      isActive: user.isActive,
      isOnline: user.isOnline,
      emailVerifiedAt: user.emailVerifiedAt,
      phoneVerifiedAt: user.phoneVerifiedAt,
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deactivatedAt: user.deactivatedAt,
      profileCompletionRate: user.profileCompletionRate,
      _count: user._count
    };

    // Si peut voir les données sensibles → AdminUser
    if (canViewSensitive) {
      const adminData: AdminUser = {
        ...publicData,
        email: user.email,
        phoneNumber: user.phoneNumber,
        systemLanguage: user.systemLanguage,
        regionalLanguage: user.regionalLanguage,
        customDestinationLanguage: user.customDestinationLanguage,
        lastPasswordChange: user.lastPasswordChange,
        failedLoginAttempts: user.failedLoginAttempts,
        lockedUntil: user.lockedUntil,
        deletedAt: user.deletedAt,
        deletedBy: user.deletedBy,
        userFeature: user.userFeature,
        _count: user._count
      };
      return adminData;
    }

    // Sinon → MaskedUser (données masquées)
    const maskedData: MaskedUser = {
      ...publicData,
      email: this.maskEmail(user.email),
      phoneNumber: this.maskPhone(user.phoneNumber)
    };
    return maskedData;
  }

  /**
   * Sanitize une liste d'utilisateurs
   */
  sanitizeUsers(users: FullUser[], viewerRole: UserRoleEnum): UserResponse[] {
    return users.map(user => this.sanitizeUser(user, viewerRole));
  }

  /**
   * Sanitize un log d'audit selon le rôle du viewer
   */
  sanitizeAuditLog(log: UserAuditLog, viewerRole: UserRoleEnum): UserAuditLog {
    const canViewSensitive = permissionsService.canViewSensitiveData(viewerRole);

    if (canViewSensitive) {
      return log;  // Tout visible
    }

    // Masquer l'IP pour les non-admins
    return {
      ...log,
      ipAddress: this.maskIP(log.ipAddress)
    };
  }
}

// Instance singleton
export const sanitizationService = new UserSanitizationService();
