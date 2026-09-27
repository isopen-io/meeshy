import { describe, expect, test } from 'bun:test';

import type { AdminUserDetail } from '@/lib/api/admin-user-detail';

import {
  contactDraftOf,
  contactEditOf,
  identityDraftOf,
  identityEditOf,
  roleDraftOf,
  roleEditOf,
  sectionIsDirty,
} from './member-sections';

/**
 * LA FICHE D'UN MEMBRE S'ÉDITE SECTION PAR SECTION (#8289) — chaque section
 * n'envoie QUE ce qui a changé : un champ présenté traverse sa propre loi côté
 * passerelle, et renvoyer un rôle identique exigerait un droit pour rien.
 */
const membre = (surcharge: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
  id: 'u-1',
  username: 'alice',
  displayName: 'Alice',
  firstName: 'Alice',
  lastName: 'Martin',
  bio: 'Traductrice',
  avatar: '',
  banner: '',
  profileCompletionRate: null,
  email: 'alice@example.test',
  phoneNumber: '+33612345678',
  role: 'USER',
  timezone: '',
  systemLanguage: 'fr',
  regionalLanguage: 'en',
  customDestinationLanguage: '',
  isActive: true,
  isOnline: false,
  deactivatedAt: null,
  deletedAt: null,
  deletedBy: null,
  lockedUntil: null,
  lockedReason: null,
  failedLoginAttempts: 0,
  lastPasswordChange: null,
  twoFactorEnabledAt: null,
  twoFactorEnabled: false,
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  lastActiveAt: null,
  createdAt: null,
  updatedAt: null,
  ...surcharge,
});

describe('identité — pseudo, noms, bio, langues', () => {
  test('un brouillon intact ne présente AUCUN champ', () => {
    const m = membre();
    expect(identityEditOf(m, identityDraftOf(m))).toEqual({});
    expect(sectionIsDirty(identityEditOf(m, identityDraftOf(m)))).toBe(false);
  });

  test('le pseudo change, rogné — et lui seul part', () => {
    const m = membre();
    const edit = identityEditOf(m, { ...identityDraftOf(m), username: '  alice_m ' });
    expect(edit).toEqual({ username: 'alice_m' });
    expect(sectionIsDirty(edit)).toBe(true);
  });

  test('un pseudo seulement rogné n’est pas un changement', () => {
    const m = membre();
    expect(identityEditOf(m, { ...identityDraftOf(m), username: ' alice ' })).toEqual({});
  });

  test('vider une langue secondaire ou le nom affiché les RETIRE (null), jamais la chaîne vide', () => {
    const m = membre();
    expect(identityEditOf(m, { ...identityDraftOf(m), regionalLanguage: '', displayName: '' })).toEqual({
      regionalLanguage: null,
      displayName: null,
    });
  });

  test('poser une langue de destination et changer la langue principale', () => {
    const m = membre();
    expect(identityEditOf(m, { ...identityDraftOf(m), systemLanguage: 'es', customDestinationLanguage: 'de' })).toEqual({
      systemLanguage: 'es',
      customDestinationLanguage: 'de',
    });
  });
});

describe('contact — e-mail et téléphone', () => {
  test('l’e-mail change, rogné', () => {
    const m = membre();
    expect(contactEditOf(m, { ...contactDraftOf(m), email: ' alice@new.test ' })).toEqual({ email: 'alice@new.test' });
  });

  test('vider le téléphone le RETIRE (null)', () => {
    const m = membre();
    expect(contactEditOf(m, { ...contactDraftOf(m), phoneNumber: '  ' })).toEqual({ phoneNumber: null });
  });

  test('rien ne part tant que rien ne change', () => {
    const m = membre({ phoneNumber: '' });
    expect(contactEditOf(m, contactDraftOf(m))).toEqual({});
  });
});

describe('rôle et statut', () => {
  test('seul ce qui change part — le rôle sans le statut', () => {
    const m = membre();
    expect(roleEditOf(m, { ...roleDraftOf(m), role: 'MODERATOR' })).toEqual({ role: 'MODERATOR' });
  });

  test('suspendre présente isActive:false', () => {
    const m = membre();
    expect(roleEditOf(m, { ...roleDraftOf(m), isActive: false })).toEqual({ isActive: false });
  });
});
