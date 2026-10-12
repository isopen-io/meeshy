import { describe, expect, test } from 'bun:test';

import { threadCallOffer, threadHeaderSubtitle } from './thread-header-offer';

/**
 * CE QUE L'EN-TÊTE DU FIL OFFRE À SON LECTEUR (#10205, #10207, #10114) — un
 * visiteur sans compte n'y lit ni l'effectif ni un cadenas qui ne protège rien,
 * et l'appel n'apparaît que là où le lecteur peut le lancer (la loi partagée
 * `canStartCall`) ou rejoindre celui qui est en cours.
 */

describe('threadHeaderSubtitle', () => {
  test('un membre d’un groupe lit l’effectif, sans cadenas quand la conversation n’est pas chiffrée', () => {
    expect(threadHeaderSubtitle({ group: true, guest: false, memberCount: 42, encryptionMode: undefined })).toEqual({ locked: false, label: '42 participants' });
  });

  test('un groupe chiffré de bout en bout porte son cadenas', () => {
    expect(threadHeaderSubtitle({ group: true, guest: false, memberCount: 3, encryptionMode: 'e2ee' })).toEqual({ locked: true, label: '3 participants' });
  });

  test('un chiffrement côté serveur n’est pas un chiffrement de bout en bout : aucun cadenas', () => {
    expect(threadHeaderSubtitle({ group: true, guest: false, memberCount: 3, encryptionMode: 'server' }).locked).toBe(false);
  });

  test('un visiteur sans compte ne lit jamais l’effectif — ni sans le champ, ni avec', () => {
    expect(threadHeaderSubtitle({ group: true, guest: true, memberCount: 42, encryptionMode: null })).toEqual({ locked: false, label: null });
    expect(threadHeaderSubtitle({ group: true, guest: true, memberCount: undefined, encryptionMode: undefined })).toEqual({ locked: false, label: null });
  });

  test('un effectif absent ou illisible ne se peint pas', () => {
    expect(threadHeaderSubtitle({ group: true, guest: false, memberCount: undefined, encryptionMode: undefined }).label).toBeNull();
    expect(threadHeaderSubtitle({ group: true, guest: false, memberCount: Number.NaN, encryptionMode: undefined }).label).toBeNull();
  });

  test('une conversation directe ne se dit chiffrée que si elle l’est', () => {
    expect(threadHeaderSubtitle({ group: false, guest: false, memberCount: 2, encryptionMode: 'e2ee' })).toEqual({ locked: true, label: 'Chiffré de bout en bout' });
    expect(threadHeaderSubtitle({ group: false, guest: false, memberCount: 2, encryptionMode: null })).toEqual({ locked: false, label: null });
  });
});

describe('threadCallOffer', () => {
  const member = { viewerUserId: 'u-1', viewerPlatformRole: null, viewerIsGuest: false } as const;

  test('jamais d’appel dans une conversation global, même pour un administrateur', () => {
    expect(threadCallOffer({ ...member, conversation: { type: 'global', createdBy: 'u-1', currentUserRole: 'creator' }, viewerPlatformRole: 'BIGBOSS' })).toBe('none');
  });

  test('direct et groupe : tout membre lance', () => {
    expect(threadCallOffer({ ...member, conversation: { type: 'direct' } })).toBe('start');
    expect(threadCallOffer({ ...member, conversation: { type: 'group', currentUserRole: 'member' } })).toBe('start');
  });

  test('public : le créateur et les administrateurs lancent, les autres membres rejoignent seulement', () => {
    expect(threadCallOffer({ ...member, conversation: { type: 'public', createdBy: 'u-1' } })).toBe('start');
    expect(threadCallOffer({ ...member, conversation: { type: 'public', createdBy: 'u-2', currentUserRole: 'admin' } })).toBe('start');
    expect(threadCallOffer({ ...member, conversation: { type: 'public', createdBy: 'u-2' }, viewerPlatformRole: 'ADMIN' })).toBe('start');
    expect(threadCallOffer({ ...member, conversation: { type: 'public', createdBy: 'u-2', currentUserRole: 'member' } })).toBe('join-only');
  });

  test('un visiteur sans compte n’a aucun appel', () => {
    expect(threadCallOffer({ ...member, viewerIsGuest: true, conversation: { type: 'group' } })).toBe('none');
    expect(threadCallOffer({ ...member, viewerIsGuest: true, conversation: { type: 'public' } })).toBe('none');
  });

  test('un type sans appel (diffusion, inconnu) n’en offre aucun', () => {
    expect(threadCallOffer({ ...member, conversation: { type: 'broadcast' } })).toBe('none');
  });
});
