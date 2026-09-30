import { beforeAll, describe, expect, test } from 'bun:test';

import type { AdminConversationFiche, AdminConversationMember } from '@/lib/api/admin-conversation-fiche';
import type { AdminInstanceParticipant } from '@/lib/api/admin-conversations';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import {
  conversationNameOf,
  conversationRefOf,
  conversationStateOf,
  memberGestures,
  memberRefOf,
  participantName,
  previewMemberRefOf,
  sheetConversationOf,
} from './conversation-model';

/**
 * **CE QU'UNE CONVERSATION ET SES MEMBRES SONT, EN MOTS** (#8876) — le nom
 * n'est JAMAIS un identifiant, l'état est unique et le plus grave d'abord, les
 * gestes d'un membre n'existent que s'ils ont un effet servi.
 */
beforeAll(async () => {
  await loadAdminInterfaceCatalog('fr');
});

const OBJECT_ID = (n: number) => n.toString(16).padStart(24, '0');

const participant = (n: number, overrides: Partial<AdminInstanceParticipant> = {}): AdminInstanceParticipant => ({
  id: OBJECT_ID(100 + n),
  userId: OBJECT_ID(n),
  kind: 'user',
  displayName: ['Awa Diop', 'Jean Kamga', 'Léa Moreau', 'Omar Sy'][n - 1] ?? null,
  avatar: null,
  role: 'member',
  joinedAt: null,
  ...overrides,
});

const conversation = (overrides: Partial<Parameters<typeof conversationNameOf>[0]> = {}) => ({
  title: null,
  type: 'direct',
  memberCount: 2,
  participants: [participant(1), participant(2)],
  ...overrides,
});

describe('le NOM d’une conversation', () => {
  test('son titre quand elle en a un', () => {
    expect(conversationNameOf(conversation({ title: 'Atelier du jeudi', type: 'group' }), 'fr')).toBe('Atelier du jeudi');
  });

  test('un direct sans titre porte les noms de ses deux membres', () => {
    expect(conversationNameOf(conversation(), 'fr')).toBe('Awa Diop et Jean Kamga');
  });

  test('un groupe sans titre compte les autres sur le TOTAL, pas sur l’aperçu de six', () => {
    const name = conversationNameOf(conversation({ type: 'group', memberCount: 9, participants: [participant(1), participant(2), participant(3)] }), 'fr');
    expect(name).toBe('Awa Diop, Jean Kamga et 7 autres');
  });

  test('sans titre ni membres servis : « Conversation sans titre », JAMAIS un identifiant', () => {
    const name = conversationNameOf(conversation({ participants: [], memberCount: 0 }), 'fr');
    expect(name).toBe('Conversation sans titre');
    expect(name).not.toMatch(/[0-9a-f]{24}/);
  });

  test('un invité anonyme sans nom se dit « Invité sans nom »', () => {
    expect(participantName({ kind: 'anonymous', displayName: null }, 'fr')).toBe('Invité sans nom');
    expect(participantName({ kind: 'user', displayName: null, username: 'awa' }, 'fr')).toBe('@awa');
  });
});

describe('l’état UNIQUE, le plus grave d’abord', () => {
  test('fermée > archivée > active', () => {
    expect(conversationStateOf({ isActive: true, closedAt: null }, 'fr').label).toBe('Active');
    expect(conversationStateOf({ isActive: false, closedAt: null }, 'fr').label).toBe('Archivée');
    expect(conversationStateOf({ isActive: true, closedAt: '2026-09-20T09:00:00.000Z' }, 'fr').label).toBe('Fermée à l’écriture');
    expect(conversationStateOf({ isActive: false, closedAt: '2026-09-20T09:00:00.000Z' }, 'fr').raw).toBe('closed');
  });

  test('la fermeture s’explique : le ton avertit et la phrase dit l’effet', () => {
    const closed = conversationStateOf({ isActive: true, closedAt: '2026-09-20T09:00:00.000Z' }, 'fr');
    expect(closed.tone).toBe('warning');
    expect(closed.explain).not.toBe(null);
  });
});

describe('les références d’entité', () => {
  test('la conversation : nom résolu, image seulement si elle existe', () => {
    const ref = conversationRefOf({ ...conversation({ title: 'Atelier', type: 'group' }), id: OBJECT_ID(1), avatar: null }, 'fr');
    expect(ref).toEqual({ kind: 'conversation', id: OBJECT_ID(1), label: 'Atelier' });
    const withImage = conversationRefOf({ ...conversation({ title: 'Atelier', type: 'group' }), id: OBJECT_ID(1), avatar: 'https://cdn.test/a.png' }, 'fr');
    expect(withImage.avatarUrl).toBe('https://cdn.test/a.png');
  });

  test('un invité renvoie à sa fiche d’anonyme par sa LIGNE de participation, un compte par son identifiant de compte', () => {
    const guest = previewMemberRefOf(participant(1, { kind: 'anonymous', userId: null, displayName: 'Visiteur' }), 'fr');
    expect(guest).toMatchObject({ kind: 'anonymous', id: OBJECT_ID(101), label: 'Visiteur' });
    const account = previewMemberRefOf(participant(2), 'fr');
    expect(account).toMatchObject({ kind: 'user', id: OBJECT_ID(2), label: 'Jean Kamga' });
  });

  const member = (overrides: Partial<AdminConversationMember> = {}): AdminConversationMember => ({
    id: OBJECT_ID(111),
    userId: OBJECT_ID(11),
    kind: 'user',
    displayName: 'Awa Diop',
    username: 'awa',
    avatar: null,
    role: 'member',
    isActive: true,
    isOnline: false,
    joinedAt: null,
    ...overrides,
  });

  test('le membre : @pseudo en secondaire, présence seulement s’il est actif ET en ligne', () => {
    expect(memberRefOf(member(), 'fr')).toEqual({ kind: 'user', id: OBJECT_ID(11), label: 'Awa Diop', secondary: '@awa' });
    expect(memberRefOf(member({ isOnline: true }), 'fr').presence).toBe('online');
    expect(memberRefOf(member({ isOnline: true, isActive: false }), 'fr').presence).toBeUndefined();
  });
});

describe('les gestes d’un membre n’existent que s’ils ont un effet servi', () => {
  const member = (overrides: Partial<AdminConversationMember> = {}): AdminConversationMember => ({
    id: OBJECT_ID(111),
    userId: OBJECT_ID(11),
    kind: 'user',
    displayName: 'Awa',
    username: null,
    avatar: null,
    role: 'member',
    isActive: true,
    isOnline: false,
    joinedAt: null,
    ...overrides,
  });

  test('un membre ordinaire : rôle et retrait', () => {
    expect(memberGestures(member(), 'group')).toEqual({ canChangeRole: true, canRemove: true, creatorProtected: false });
  });

  test('le créateur est protégé : aucun geste, et l’écran le dit', () => {
    expect(memberGestures(member({ role: 'creator' }), 'group')).toEqual({ canChangeRole: false, canRemove: false, creatorProtected: true });
  });

  test('un invité anonyme, un robot ou un membre parti : aucun geste (les routes se disent en `:userId`)', () => {
    expect(memberGestures(member({ kind: 'anonymous', userId: null }), 'group')).toEqual({ canChangeRole: false, canRemove: false, creatorProtected: false });
    expect(memberGestures(member({ kind: 'bot', userId: null }), 'group').canRemove).toBe(false);
    expect(memberGestures(member({ isActive: false }), 'group').canChangeRole).toBe(false);
  });

  test('un direct n’a pas de hiérarchie ; la conversation globale ne se vide pas', () => {
    expect(memberGestures(member(), 'direct')).toMatchObject({ canChangeRole: false, canRemove: true });
    expect(memberGestures(member(), 'global')).toMatchObject({ canChangeRole: true, canRemove: false });
  });
});

describe('la fiche sous la forme de la feuille « Configurer »', () => {
  const fiche: AdminConversationFiche = {
    id: OBJECT_ID(1),
    identifier: 'mshy_atelier',
    title: 'Atelier',
    description: 'Le groupe',
    type: 'group',
    avatar: null,
    banner: null,
    isActive: true,
    closedAt: null,
    closedBy: null,
    createdAt: null,
    updatedAt: null,
    lastMessageAt: null,
    memberCount: 3,
    messageCount: 12,
    settings: { defaultWriteRole: 'member', isAnnouncementChannel: false, slowModeSeconds: 0, autoTranslateEnabled: true, encryptionMode: null },
    community: null,
    participantsPreview: [participant(1), participant(2, { kind: 'anonymous', userId: null })],
    shareLinkCount: 0,
    agentEnabled: false,
  };

  test('sans membre administré : `membership` est nul, la feuille ne propose ni rôle ni retrait', () => {
    expect(sheetConversationOf(fiche).membership).toBe(null);
  });

  test('l’aperçu ne garde que les comptes (la feuille parle de membres, pas d’invités)', () => {
    const sheet = sheetConversationOf(fiche);
    expect(sheet.participants.map((p) => p.userId)).toEqual([OBJECT_ID(1)]);
    expect(sheet.memberCount).toBe(3);
    expect(sheet.settings).toEqual(fiche.settings);
  });
});
