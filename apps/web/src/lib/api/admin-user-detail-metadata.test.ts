import { describe, expect, test } from 'bun:test';

import { decodeAdminUserDetail } from './admin-user-detail';

/**
 * LES MÉTADONNÉES DE COMPTE (#8005) — le bloc `adminMetadata` que la fiche sert
 * sous `canViewSensitiveData`, décodé CHAMP PAR CHAMP à forme figée, et tout ce
 * que la charge porte à côté et que la fiche ne doit jamais garder : les codes de
 * secours, les adresses IP, un jeton ou un changement d'e-mail en attente.
 */
const BLOC = {
  deviceLocale: 'pt-BR',
  deviceCountry: 'BR',
  birthDate: '1994-03-12T00:00:00.000Z',
  ageVerifiedAt: '2026-08-01T10:00:00.000Z',
  voiceProfileConsentAt: '2026-08-02T10:00:00.000Z',
  voiceDataConsentAt: null,
  dataProcessingConsentAt: '2026-08-03T10:00:00.000Z',
  analyticsConsentAt: null,
  voiceCloningEnabledAt: null,
  termsAcceptedAt: '2026-07-01T10:00:00.000Z',
  termsVersion: '2026-06',
  onboardingCompletedAt: '2026-07-02T10:00:00.000Z',
  currentStreakDays: 4,
  longestStreakDays: 21,
  engagementScore: 73.5,
  meeshBalance: 120,
  blockedCount: 2,
  hasPendingEmail: true,
  hasPendingPhone: false,
};

const SERVIE = {
  id: 'u-1',
  username: 'amina',
  displayName: 'Amina Diallo',
  email: 'amina@example.test',
  role: 'MODERATOR',
  registrationCountry: 'SN',
  lastLoginLocation: 'Dakar, SN',
  lastLoginDevice: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1',
  registrationLocation: 'Dakar, SN',
  registrationDevice: 'Mozilla/5.0 (Macintosh) Chrome/120.0',
  twoFactorBackupCodesRemaining: 6,
  adminMetadata: BLOC,
  _count: {
    sentMessages: 1200,
    conversations: 31,
    createdShareLinks: 3,
    createdTrackingLinks: 2,
    createdAffiliateTokens: 1,
    affiliateRelations: 4,
    referredRelations: 5,
    sentFriendRequests: 6,
    receivedFriendRequests: 7,
  },
  // À côté, et à ne JAMAIS garder.
  twoFactorBackupCodes: ['empreinte-1', 'empreinte-2'],
  lastLoginIp: '196.0.0.1',
  registrationIp: '196.0.0.2',
  sessionToken: 'jeton-secret',
};

describe('decodeAdminUserDetail — le bloc adminMetadata, forme figée (#8005)', () => {
  test('chaque champ du bloc est décodé, rien de plus', () => {
    expect(decodeAdminUserDetail(SERVIE)?.adminMetadata).toEqual(BLOC);
  });

  test('un champ inconnu DANS le bloc ne traverse pas (pas de spread)', () => {
    const membre = decodeAdminUserDetail({ ...SERVIE, adminMetadata: { ...BLOC, pendingEmail: 'nouveau@example.test', blockedUserIds: ['x', 'y'] } });
    expect(Object.keys(membre?.adminMetadata ?? {})).not.toContain('pendingEmail');
    expect(Object.keys(membre?.adminMetadata ?? {})).not.toContain('blockedUserIds');
    expect(membre?.adminMetadata?.hasPendingEmail).toBe(true);
    expect(membre?.adminMetadata?.blockedCount).toBe(2);
  });

  test('sans bloc servi (rôle sans donnée sensible), `adminMetadata` est null : l’écran ne le dessine pas', () => {
    const { adminMetadata: _absent, ...sansBloc } = SERVIE;
    expect(decodeAdminUserDetail(sansBloc)?.adminMetadata).toBeNull();
  });

  test('un bloc illisible vaut « non servi », jamais un bloc de zéros', () => {
    expect(decodeAdminUserDetail({ ...SERVIE, adminMetadata: 'texte' })?.adminMetadata).toBeNull();
  });

  test('les nombres absents valent zéro, les dates absentes null', () => {
    const vide = decodeAdminUserDetail({ ...SERVIE, adminMetadata: {} })?.adminMetadata;
    expect(vide?.currentStreakDays).toBe(0);
    expect(vide?.engagementScore).toBe(0);
    expect(vide?.birthDate).toBeNull();
    expect(vide?.hasPendingEmail).toBe(false);
  });
});

describe('decodeAdminUserDetail — codes de secours, lieux, compteurs', () => {
  test('le NOMBRE de codes de secours restants est gardé ; leurs empreintes, jamais', () => {
    const membre = decodeAdminUserDetail(SERVIE);
    expect(membre?.twoFactorBackupCodesRemaining).toBe(6);
    expect(Object.keys(membre ?? {})).not.toContain('twoFactorBackupCodes');
  });

  test('non servi ⇒ null (ce n’est pas zéro : on ne nous remet pas le chiffre)', () => {
    const { twoFactorBackupCodesRemaining: _absent, ...sansCodes } = SERVIE;
    expect(decodeAdminUserDetail(sansCodes)?.twoFactorBackupCodesRemaining).toBeNull();
    expect(decodeAdminUserDetail({ ...SERVIE, twoFactorBackupCodesRemaining: 0 })?.twoFactorBackupCodesRemaining).toBe(0);
  });

  test('lieu, appareil et pays d’inscription sont gardés (chaîne vide quand ils ne sont pas servis)', () => {
    const membre = decodeAdminUserDetail(SERVIE);
    expect(membre?.registrationCountry).toBe('SN');
    expect(membre?.lastLoginLocation).toBe('Dakar, SN');
    expect(membre?.registrationDevice).toContain('Macintosh');
    const nu = decodeAdminUserDetail({ id: 'u-2', username: 'k' });
    expect([nu?.registrationCountry, nu?.lastLoginLocation, nu?.lastLoginDevice]).toEqual(['', '', '']);
  });

  test('les adresses IP et les jetons ne traversent jamais', () => {
    const clefs = Object.keys(decodeAdminUserDetail(SERVIE) ?? {});
    for (const interdit of ['lastLoginIp', 'registrationIp', 'sessionToken', 'twoFactorBackupCodes']) expect(clefs).not.toContain(interdit);
  });

  test('les compteurs de liens (`_count`) sont décodés à forme figée, null quand non servis', () => {
    expect(decodeAdminUserDetail(SERVIE)?.counts).toEqual({
      shareLinks: 3,
      trackingLinks: 2,
      affiliateTokens: 1,
      affiliateRelations: 4,
      referredRelations: 5,
      sentFriendRequests: 6,
      receivedFriendRequests: 7,
    });
    expect(decodeAdminUserDetail({ id: 'u-2', username: 'k' })?.counts).toBeNull();
  });
});
