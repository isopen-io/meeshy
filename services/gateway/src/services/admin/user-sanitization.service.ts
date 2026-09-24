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
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';

/**
 * Les métadonnées d'un compte qu'un administrateur lit sur sa fiche (#7845 A0).
 *
 * Énumérées champ par champ, JAMAIS par un spread de la ligne : `FullUser` est
 * la ligne Prisma coulée telle quelle, et elle porte à côté de ces champs le
 * hash du mot de passe, les secrets 2FA, les jetons et codes de vérification,
 * les clés Signal et `searchTokens`. Un `...user` servirait tout cela d'un coup
 * — la liste explicite est la seule forme où une colonne ajoutée demain au
 * modèle ne sort pas sans qu'on l'ait décidé.
 *
 * `blockedUserIds` n'y entre que par son CARDINAL : savoir qu'un compte en a
 * bloqué douze instruit une plainte ; savoir LESQUELS appartient aux douze.
 */
function adminMetadataOf(user: FullUser): Pick<
  AdminUser,
  | 'deviceLocale' | 'deviceCountry' | 'birthDate' | 'ageVerifiedAt'
  | 'voiceProfileConsentAt' | 'voiceDataConsentAt' | 'dataProcessingConsentAt'
  | 'analyticsConsentAt' | 'voiceCloningEnabledAt' | 'termsAcceptedAt' | 'termsVersion'
  | 'onboardingCompletedAt' | 'currentStreakDays' | 'longestStreakDays' | 'lastStreakDate'
  | 'engagementScore' | 'meeshBalance' | 'meeshMintedLifetime' | 'pendingEmail'
  | 'pendingPhoneNumber' | 'phoneTransferredAt' | 'blockedCount'
> {
  return {
    deviceLocale: user.deviceLocale ?? null,
    deviceCountry: user.deviceCountry ?? null,
    birthDate: user.birthDate ?? null,
    ageVerifiedAt: user.ageVerifiedAt ?? null,
    voiceProfileConsentAt: user.voiceProfileConsentAt ?? null,
    voiceDataConsentAt: user.voiceDataConsentAt ?? null,
    dataProcessingConsentAt: user.dataProcessingConsentAt ?? null,
    analyticsConsentAt: user.analyticsConsentAt ?? null,
    voiceCloningEnabledAt: user.voiceCloningEnabledAt ?? null,
    termsAcceptedAt: user.termsAcceptedAt ?? null,
    termsVersion: user.termsVersion ?? null,
    onboardingCompletedAt: user.onboardingCompletedAt ?? null,
    currentStreakDays: user.currentStreakDays ?? null,
    longestStreakDays: user.longestStreakDays ?? null,
    lastStreakDate: user.lastStreakDate ?? null,
    engagementScore: user.engagementScore ?? null,
    meeshBalance: user.meeshBalance ?? null,
    meeshMintedLifetime: user.meeshMintedLifetime ?? null,
    pendingEmail: user.pendingEmail ?? null,
    pendingPhoneNumber: user.pendingPhoneNumber ?? null,
    phoneTransferredAt: user.phoneTransferredAt ?? null,
    blockedCount: user.blockedUserIds?.length ?? 0,
  };
}

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
    // Directive produit 2026-08-25 : « les utilisateurs avec le rôle ADMIN et
    // supérieur peuvent constamment avoir l'état de présence » — un seuil
    // DISTINCT de canViewSensitiveData (MODERATOR modère du contenu mais ne
    // voit ni l'un ni l'autre).
    const canViewPresence = permissionsService.canViewPresence(viewerRole);

    // Données publiques (toujours incluses)
    const publicDataRaw: PublicUser = {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      bio: user.bio,
      avatar: user.avatar,
      banner: user.banner ?? null,
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

    // `applyPresenceVisibilityAsOffline` est le site UNIQUE déjà bâti (loi de
    // présence partagée) pour la forme que `PublicUser` déclare : `isOnline:
    // boolean` (jamais `null`) et `lastActiveAt: Date | null`. Masqué s'y
    // présente comme HORS LIGNE — `isOnline=false`, `lastActiveAt=null` — et
    // c'est ce que le type du helper (`PresenceAsOffline`) et celui de
    // `PublicUser` DISENT tous deux : la colonne (`FullUser.lastActiveAt:
    // Date`) n'est jamais nulle, la valeur SERVIE peut l'être. Les clés
    // restent présentes (jamais retirées), seule leur valeur change — un rôle
    // non autorisé ne doit jamais pouvoir distinguer « présence masquée » de
    // « réellement hors ligne depuis toujours ».
    const publicData: PublicUser = applyPresenceVisibilityAsOffline(publicDataRaw, {
      showOnline: canViewPresence,
      showLastSeenTimestamp: canViewPresence,
    });

    // Si peut voir les données sensibles → AdminUser
    if (canViewSensitive) {
      const adminData: AdminUser = {
        ...publicData,
        email: user.email,
        phoneNumber: user.phoneNumber,
        phoneCountryCode: user.phoneCountryCode,
        timezone: user.timezone,
        systemLanguage: user.systemLanguage,
        regionalLanguage: user.regionalLanguage,
        customDestinationLanguage: user.customDestinationLanguage,
        lastPasswordChange: user.lastPasswordChange,
        failedLoginAttempts: user.failedLoginAttempts,
        lockedUntil: user.lockedUntil,
        lockedReason: user.lockedReason,
        twoFactorEnabledAt: user.twoFactorEnabledAt,
        twoFactorBackupCodes: user.twoFactorBackupCodes ?? [],
        lastLoginIp: user.lastLoginIp,
        lastLoginLocation: user.lastLoginLocation,
        lastLoginDevice: user.lastLoginDevice,
        registrationIp: user.registrationIp,
        registrationLocation: user.registrationLocation,
        registrationDevice: user.registrationDevice,
        registrationCountry: user.registrationCountry,
        deletedAt: user.deletedAt,
        deletedBy: user.deletedBy,
        userFeature: user.userFeature,
        ...adminMetadataOf(user),
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
