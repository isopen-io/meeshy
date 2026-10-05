/**
 * La fiche d'un membre sert ses MÉTADONNÉES de compte, et plus jamais ses codes
 * de secours (#8876, § 6.8 — clôt la part passerelle de #8005).
 *
 * Deux décisions, une seule porte (`sanitizeUser`) :
 *
 *  - `adminMetadata` — langue et pays de l'appareil, âge, consentements, conditions
 *    acceptées, série, score, solde, blocages, changements en attente — n'est servi
 *    qu'avec `canViewSensitiveData`, et seulement quand l'appelant le demande (la
 *    fiche, pas la liste : dix-neuf champs de plus par ligne ne servent à personne) ;
 *  - `twoFactorBackupCodes` — les EMPREINTES des codes de secours — n'est servi sur
 *    AUCUNE ligne : on en sert le NOMBRE restant. Une empreinte de code à usage
 *    unique n'a aucune raison d'atteindre un navigateur, même celui du propriétaire.
 *
 * Ce qui ne part JAMAIS : la valeur d'un changement en attente (`pendingEmail`,
 * `pendingPhoneNumber`) — l'administrateur sait QU'IL y en a un, pas ce qu'il dit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { UserRoleEnum, type FullUser } from '@meeshy/shared/types';

const SENSITIVE_ROLES: ReadonlySet<string> = new Set(['BIGBOSS', 'ADMIN']);

jest.mock('../../../../services/admin/permissions.service', () => ({
  permissionsService: {
    canViewSensitiveData: (role: string) => SENSITIVE_ROLES.has(role),
    canViewPresence: (role: string) => SENSITIVE_ROLES.has(role),
  },
}));

import { UserSanitizationService } from '../../../../services/admin/user-sanitization.service';

const fullUser = (over: Record<string, unknown> = {}): FullUser =>
  ({
    id: '507f1f77bcf86cd799439011',
    username: 'awa',
    firstName: 'Awa',
    lastName: 'Diop',
    displayName: 'Awa Diop',
    bio: null,
    email: 'awa@exemple.fr',
    phoneNumber: '+221700000000',
    avatar: null,
    banner: null,
    role: 'USER',
    isActive: true,
    isOnline: false,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    lastActiveAt: new Date('2026-09-01T00:00:00.000Z'),
    systemLanguage: 'fr',
    regionalLanguage: 'fr',
    customDestinationLanguage: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deactivatedAt: null,
    deletedAt: null,
    deletedBy: null,
    profileCompletionRate: 80,
    phoneCountryCode: 'SN',
    timezone: 'Africa/Dakar',
    lastPasswordChange: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    lockedReason: null,
    twoFactorEnabledAt: new Date('2026-03-01T00:00:00.000Z'),
    twoFactorBackupCodes: ['hash-secret-1', 'hash-secret-2', 'hash-secret-3'],
    lastLoginIp: null,
    lastLoginLocation: null,
    lastLoginDevice: null,
    registrationIp: null,
    registrationLocation: null,
    registrationDevice: null,
    registrationCountry: 'SN',
    userFeature: null,
    _count: { sentMessages: 5 },
    deviceLocale: 'fr-SN',
    deviceCountry: 'SN',
    birthDate: new Date('1990-05-01T00:00:00.000Z'),
    ageVerifiedAt: new Date('2026-02-01T00:00:00.000Z'),
    voiceProfileConsentAt: new Date('2026-02-02T00:00:00.000Z'),
    voiceDataConsentAt: null,
    dataProcessingConsentAt: new Date('2026-02-03T00:00:00.000Z'),
    analyticsConsentAt: null,
    voiceCloningEnabledAt: null,
    termsAcceptedAt: new Date('2026-02-04T00:00:00.000Z'),
    termsVersion: 'cgu-v7',
    onboardingCompletedAt: new Date('2026-02-05T00:00:00.000Z'),
    currentStreakDays: 4,
    longestStreakDays: 21,
    engagementScore: 350,
    meeshBalance: 12,
    blockedUserIds: ['507f1f77bcf86cd799439021', '507f1f77bcf86cd799439022'],
    pendingEmail: 'nouvelle@exemple.fr',
    pendingPhoneNumber: null,
    ...over,
  }) as unknown as FullUser;

const service = new UserSanitizationService();

describe('twoFactorBackupCodes — les empreintes ne partent plus', () => {
  it.each([UserRoleEnum.BIGBOSS, UserRoleEnum.ADMIN])(
    'un %s reçoit le NOMBRE de codes restants, jamais leur liste',
    (role) => {
      const served = service.sanitizeUser(fullUser(), role) as unknown as Record<string, unknown>;

      expect(served.twoFactorBackupCodesRemaining).toBe(3);
      expect(served).not.toHaveProperty('twoFactorBackupCodes');
      expect(JSON.stringify(served)).not.toContain('hash-secret');
    }
  );

  it('sans codes (ou colonne absente), il en reste zéro — pas une erreur', () => {
    const none = service.sanitizeUser(fullUser({ twoFactorBackupCodes: [] }), UserRoleEnum.ADMIN) as unknown as Record<string, unknown>;
    const missing = service.sanitizeUser(fullUser({ twoFactorBackupCodes: undefined }), UserRoleEnum.ADMIN) as unknown as Record<string, unknown>;

    expect(none.twoFactorBackupCodesRemaining).toBe(0);
    expect(missing.twoFactorBackupCodesRemaining).toBe(0);
  });

  it('un rôle qui ne voit pas les données sensibles ne reçoit ni la liste ni le compte', () => {
    const served = service.sanitizeUser(fullUser(), UserRoleEnum.MODERATOR) as unknown as Record<string, unknown>;

    expect(served).not.toHaveProperty('twoFactorBackupCodes');
    expect(served).not.toHaveProperty('twoFactorBackupCodesRemaining');
  });
});

describe('adminMetadata — la fiche, pas la liste', () => {
  it.each([UserRoleEnum.BIGBOSS, UserRoleEnum.ADMIN])('un %s reçoit le bloc, champ par champ, quand la fiche le demande', (role) => {
    const served = service.sanitizeUser(fullUser(), role, { withAdminMetadata: true }) as unknown as {
      adminMetadata: Record<string, unknown>;
    };

    expect(served.adminMetadata).toEqual({
      deviceLocale: 'fr-SN',
      deviceCountry: 'SN',
      birthDate: new Date('1990-05-01T00:00:00.000Z'),
      ageVerifiedAt: new Date('2026-02-01T00:00:00.000Z'),
      voiceProfileConsentAt: new Date('2026-02-02T00:00:00.000Z'),
      voiceDataConsentAt: null,
      dataProcessingConsentAt: new Date('2026-02-03T00:00:00.000Z'),
      analyticsConsentAt: null,
      voiceCloningEnabledAt: null,
      termsAcceptedAt: new Date('2026-02-04T00:00:00.000Z'),
      termsVersion: 'cgu-v7',
      onboardingCompletedAt: new Date('2026-02-05T00:00:00.000Z'),
      currentStreakDays: 4,
      longestStreakDays: 21,
      engagementScore: 350,
      meeshBalance: 12,
      blockedCount: 2,
      hasPendingEmail: true,
      hasPendingPhone: false,
    });
  });

  it('une ligne de LISTE (sans l’option) n’en porte pas', () => {
    const served = service.sanitizeUser(fullUser(), UserRoleEnum.ADMIN) as unknown as Record<string, unknown>;
    expect(served).not.toHaveProperty('adminMetadata');
  });

  it.each([UserRoleEnum.MODERATOR, UserRoleEnum.AUDIT])(
    'un %s ne le reçoit pas, même quand la fiche le demande',
    (role) => {
      const served = service.sanitizeUser(fullUser(), role, { withAdminMetadata: true }) as unknown as Record<string, unknown>;
      expect(served).not.toHaveProperty('adminMetadata');
      expect(JSON.stringify(served)).not.toMatch(/fr-SN|1990-05-01|cgu-v7/);
    }
  );

  it('ne sert JAMAIS la valeur d’un changement en attente — seulement qu’il existe', () => {
    const served = service.sanitizeUser(
      fullUser({ pendingEmail: 'nouvelle@exemple.fr', pendingPhoneNumber: '+33611223344' }),
      UserRoleEnum.ADMIN,
      { withAdminMetadata: true }
    ) as unknown as { adminMetadata: Record<string, unknown> };
    const json = JSON.stringify(served);

    expect(served.adminMetadata).toMatchObject({ hasPendingEmail: true, hasPendingPhone: true });
    expect(json).not.toContain('nouvelle@exemple.fr');
    expect(json).not.toContain('+33611223344');
    expect(json).not.toMatch(/pendingEmail|pendingPhoneNumber|blockedUserIds/);
  });

  it('un blocage absent vaut zéro, une colonne manquante aussi', () => {
    const empty = service.sanitizeUser(fullUser({ blockedUserIds: [] }), UserRoleEnum.ADMIN, { withAdminMetadata: true }) as unknown as {
      adminMetadata: Record<string, unknown>;
    };
    const missing = service.sanitizeUser(fullUser({ blockedUserIds: undefined }), UserRoleEnum.ADMIN, { withAdminMetadata: true }) as unknown as {
      adminMetadata: Record<string, unknown>;
    };

    expect(empty.adminMetadata.blockedCount).toBe(0);
    expect(missing.adminMetadata.blockedCount).toBe(0);
  });
});
