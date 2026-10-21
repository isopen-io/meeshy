import { describe, expect, test } from 'bun:test';

import type { ConversationMember } from '@/lib/api/conversation-members';

import { managementOf, memberActionsFor, roleOfAction } from './conversation-management';

/**
 * **QUI PEUT QUOI DANS LA FEUILLE D'UN GROUPE** (#10613, #7836) — la loi de
 * `MemberActionPolicy.swift` et de `ConversationSettingsView.swift`, rejouée sur
 * le web. La passerelle reste juge ; cette loi décide seulement quels gestes
 * la feuille MONTRE (un geste refusé d'avance ne s'affiche pas).
 */

const member = (overrides: Partial<ConversationMember> = {}): ConversationMember => ({
  id: 'p-cible',
  userId: 'u-cible',
  username: 'cible',
  displayName: 'Cible',
  avatar: undefined,
  role: 'member',
  ...overrides,
});

const kinds = (params: Parameters<typeof memberActionsFor>[0]) => memberActionsFor(params).map((action) => action.kind);

describe('les gestes sur un membre suivent le rang du lecteur', () => {
  test('le créateur promeut admin ou modérateur, expulse et bannit un simple membre', () => {
    expect(kinds({ member: member(), viewerRole: 'creator', viewerId: 'u-moi', conversationType: 'group' })).toEqual([
      'promote-admin',
      'promote-moderator',
      'expel',
      'ban',
    ]);
  });

  test('un admin promeut modérateur mais jamais admin, et rétrograde un modérateur', () => {
    expect(kinds({ member: member(), viewerRole: 'admin', viewerId: 'u-moi', conversationType: 'group' })).toEqual([
      'promote-moderator',
      'expel',
      'ban',
    ]);
    expect(kinds({ member: member({ role: 'moderator' }), viewerRole: 'admin', viewerId: 'u-moi', conversationType: 'group' })).toEqual([
      'demote-member',
      'expel',
      'ban',
    ]);
  });

  test('un modérateur n’a que l’expulsion et le bannissement, et seulement sous lui', () => {
    expect(kinds({ member: member(), viewerRole: 'moderator', viewerId: 'u-moi', conversationType: 'group' })).toEqual(['expel', 'ban']);
    expect(kinds({ member: member({ role: 'moderator' }), viewerRole: 'moderator', viewerId: 'u-moi', conversationType: 'group' })).toEqual([]);
  });

  test('un simple membre ne voit aucun geste', () => {
    expect(kinds({ member: member(), viewerRole: 'member', viewerId: 'u-moi', conversationType: 'group' })).toEqual([]);
    expect(kinds({ member: member(), viewerRole: undefined, viewerId: 'u-moi', conversationType: 'group' })).toEqual([]);
  });

  test('personne ne touche au créateur, ni à soi-même', () => {
    expect(kinds({ member: member({ role: 'creator' }), viewerRole: 'creator', viewerId: 'u-moi', conversationType: 'group' })).toEqual([]);
    expect(kinds({ member: member({ userId: 'u-moi', role: 'member' }), viewerRole: 'creator', viewerId: 'u-moi', conversationType: 'group' })).toEqual([]);
  });

  test('un rang écrit en MAJUSCULES vaut le même rang', () => {
    expect(kinds({ member: member({ role: 'MODERATOR' }), viewerRole: 'ADMIN', viewerId: 'u-moi', conversationType: 'group' })).toEqual([
      'demote-member',
      'expel',
      'ban',
    ]);
  });

  test('un visiteur sans compte ne change jamais de rang, mais s’expulse par son identifiant de participant', () => {
    const actions = memberActionsFor({ member: member({ userId: null, username: null }), viewerRole: 'creator', viewerId: 'u-moi', conversationType: 'group' });
    expect(actions).toEqual([
      { kind: 'expel', targetKey: 'p-cible' },
      { kind: 'ban', targetKey: 'p-cible' },
    ]);
  });

  test('un compte est visé par son identifiant d’utilisateur', () => {
    const [first] = memberActionsFor({ member: member(), viewerRole: 'creator', viewerId: 'u-moi', conversationType: 'group' });
    expect(first?.targetKey).toBe('u-cible');
  });

  test('un tête-à-tête n’a aucune gestion de membres', () => {
    expect(kinds({ member: member(), viewerRole: 'creator', viewerId: 'u-moi', conversationType: 'direct' })).toEqual([]);
  });

  test('le rang posé par chaque geste de rang', () => {
    expect(roleOfAction('promote-admin')).toBe('admin');
    expect(roleOfAction('promote-moderator')).toBe('moderator');
    expect(roleOfAction('demote-member')).toBe('member');
    expect(roleOfAction('expel')).toBeNull();
    expect(roleOfAction('ban')).toBeNull();
  });
});

describe('ce que la feuille ouvre à un rang donné', () => {
  test('modérateur : identité et membres, pas les permissions', () => {
    expect(managementOf({ type: 'group', currentUserRole: 'moderator' })).toEqual({
      editIdentity: true,
      editPermissions: false,
      addMembers: true,
    });
  });

  test('admin et créateur : tout', () => {
    for (const role of ['admin', 'creator', 'CREATOR']) {
      expect(managementOf({ type: 'group', currentUserRole: role })).toEqual({ editIdentity: true, editPermissions: true, addMembers: true });
    }
  });

  test('membre, invité : rien', () => {
    expect(managementOf({ type: 'group', currentUserRole: 'member' })).toEqual({ editIdentity: false, editPermissions: false, addMembers: false });
    expect(managementOf({ type: 'group', currentUserRole: null })).toEqual({ editIdentity: false, editPermissions: false, addMembers: false });
  });

  test('tête-à-tête et conversation globale : rien ne se règle ici', () => {
    expect(managementOf({ type: 'direct', currentUserRole: 'creator' })).toEqual({ editIdentity: false, editPermissions: false, addMembers: false });
    expect(managementOf({ type: 'global', currentUserRole: 'admin' })).toEqual({ editIdentity: false, editPermissions: false, addMembers: false });
  });
});
