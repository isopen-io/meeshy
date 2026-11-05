import { beforeAll, describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';

import { departureStore, markObsoleteRefused } from '@/lib/conversation-departure';

import { rowConversationActions, rowMenuItems, type RowActionId, type RowViewer } from './row-actions';

/**
 * LE MENU D'UNE LIGNE SUIT LES RÔLES (#11211) — `rowMenuItems` lit les
 * verdicts de `conversationActionsFor` (`@meeshy/shared`) : Renommer et
 * Inviter selon le rang dans la conversation, Quitter hors direct, « Ouvrir
 * dans l'administration » pour ADMIN et BIGBOSS, rien de ce qui demande un
 * compte pour un visiteur anonyme.
 */

beforeAll(async () => {
  await loadRowMenuCatalog('fr');
});

const conversationOf = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c-lyon',
    type: 'group',
    title: 'Équipe Lyon',
    isActive: true,
    memberCount: 4,
    participants: [],
    currentUserRole: 'member',
    isMember: true,
    ...overrides,
  }) as unknown as Conversation;

const viewerOf = (overrides: Partial<RowViewer> = {}): RowViewer => ({
  id: 'u-moi',
  hasAccount: true,
  isAnonymous: false,
  platformRole: 'USER',
  ...overrides,
});

const idsFor = (conversation: Conversation, viewer: RowViewer): readonly RowActionId[] =>
  rowMenuItems({
    flags: { isPinned: false, isMuted: false, isArchived: false },
    unread: false,
    language: 'fr',
    canCall: true,
    canDelete: viewer.hasAccount,
    more: { details: true, rename: conversation.type !== 'direct', organize: viewer.hasAccount, favorite: undefined, block: null },
    actions: rowConversationActions({ conversation, viewer }),
  }).map((item) => item.id);

describe('rowMenuItems — les actions que le rôle permet', () => {
  test('un USER membre ordinaire ne renomme ni n’invite, mais peut quitter', () => {
    const ids = idsFor(conversationOf(), viewerOf());
    expect(ids.includes('rename')).toBe(false);
    expect(ids.includes('invite')).toBe(false);
    expect(ids.includes('leave')).toBe(true);
    expect(ids.includes('adminOpen')).toBe(false);
  });

  test('un MODÉRATEUR de la conversation renomme et invite', () => {
    const ids = idsFor(conversationOf({ currentUserRole: 'moderator' }), viewerOf({ platformRole: 'MODERATOR' }));
    expect(ids.includes('rename')).toBe(true);
    expect(ids.includes('invite')).toBe(true);
    expect(ids.includes('manageMembers')).toBe(true);
  });

  test('le CRÉATEUR invite', () => {
    const ids = idsFor(conversationOf({ currentUserRole: 'creator' }), viewerOf());
    expect(ids.includes('invite')).toBe(true);
    expect(ids.includes('rename')).toBe(true);
  });

  test('un BIGBOSS non membre ouvre la conversation dans l’administration, sans la quitter', () => {
    const ids = idsFor(conversationOf({ currentUserRole: null, isMember: false }), viewerOf({ platformRole: 'BIGBOSS' }));
    expect(ids.includes('adminOpen')).toBe(true);
    expect(ids.includes('leave')).toBe(false);
  });

  test('un visiteur anonyme ne supprime ni ne quitte', () => {
    const ids = idsFor(conversationOf({ currentUserRole: 'member' }), viewerOf({ hasAccount: false, isAnonymous: true, platformRole: null }));
    expect(ids.includes('delete')).toBe(false);
    expect(ids.includes('leave')).toBe(false);
    expect(ids.includes('adminOpen')).toBe(false);
  });

  test('un direct ne se quitte pas, et ne se renomme pas', () => {
    const ids = idsFor(conversationOf({ type: 'direct', currentUserRole: 'creator' }), viewerOf());
    expect(ids.includes('leave')).toBe(false);
    expect(ids.includes('rename')).toBe(false);
    expect(ids.includes('delete')).toBe(true);
  });

  test('l’appel suit la loi partagée : une publique n’appelle que pour son créateur ou un admin', () => {
    expect(idsFor(conversationOf({ type: 'public', currentUserRole: 'member' }), viewerOf()).includes('callAudio')).toBe(false);
    expect(idsFor(conversationOf({ type: 'public', currentUserRole: 'admin' }), viewerOf()).includes('callAudio')).toBe(true);
  });

  test('Quitter rougit, comme Supprimer, et passe avant lui', () => {
    const items = rowMenuItems({
      flags: { isPinned: false, isMuted: false, isArchived: false },
      unread: false,
      language: 'fr',
      canDelete: true,
      actions: rowConversationActions({ conversation: conversationOf(), viewer: viewerOf() }),
    });
    const leave = items.find((item) => item.id === 'leave');
    expect(leave?.label).toBe('Quitter');
    expect(leave?.destructive).toBe(true);
    expect(items.map((item) => item.id).slice(-2)).toEqual(['leave', 'delete']);
  });

  test('sans verdicts (le balayage), le menu reste celui d’avant', () => {
    const ids = rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: false }, unread: false, language: 'fr', canDelete: true }).map((item) => item.id);
    expect(ids).toEqual(['pin', 'mute', 'read', 'archive', 'delete']);
  });

  test('RENDRE OBSOLÈTE (#14645) : un administrateur de la conversation, en dernier, en rouge ; jamais un membre ordinaire', () => {
    const items = rowMenuItems({
      flags: { isPinned: false, isMuted: false, isArchived: false },
      unread: false,
      language: 'fr',
      canDelete: true,
      actions: rowConversationActions({ conversation: conversationOf({ currentUserRole: 'admin' }), viewer: viewerOf() }),
    });
    const last = items[items.length - 1];
    expect(last?.id).toBe('obsolete');
    expect(last?.label).toBe('Rendre obsolète');
    expect(last?.destructive).toBe(true);
    expect(idsFor(conversationOf({ currentUserRole: 'creator' }), viewerOf()).includes('obsolete')).toBe(true);
    expect(idsFor(conversationOf({ currentUserRole: 'member' }), viewerOf()).includes('obsolete')).toBe(false);
    expect(idsFor(conversationOf({ currentUserRole: 'admin' }), viewerOf({ hasAccount: false, isAnonymous: true, platformRole: null })).includes('obsolete')).toBe(false);
  });

  test('#14653 — dans un tête-à-tête, l’un OU l’autre des deux membres le rend obsolète', () => {
    const direct = (overrides: Partial<Conversation> = {}) => conversationOf({ type: 'direct', currentUserRole: 'member', ...overrides });
    expect(idsFor(direct(), viewerOf()).includes('obsolete')).toBe(true);
    expect(idsFor(direct({ currentUserRole: 'creator' }), viewerOf()).includes('obsolete')).toBe(true);
    expect(rowConversationActions({ conversation: direct(), viewer: viewerOf() }).obsolete).toBe(true);
  });

  test('#14653 — jamais un ancien membre, un anonyme, ni un tête-à-tête fermé ; un groupe reste à l’administrateur', () => {
    const direct = (overrides: Partial<Conversation> = {}) => conversationOf({ type: 'direct', currentUserRole: 'member', ...overrides });
    expect(rowConversationActions({ conversation: direct({ isMember: false }), viewer: viewerOf() }).obsolete).toBe(false);
    expect(rowConversationActions({ conversation: direct(), viewer: viewerOf({ hasAccount: false, isAnonymous: true, platformRole: null }) }).obsolete).toBe(false);
    expect(rowConversationActions({ conversation: direct({ isActive: false }), viewer: viewerOf() }).obsolete).toBe(false);
    expect(rowConversationActions({ conversation: conversationOf({ currentUserRole: 'member' }), viewer: viewerOf() }).obsolete).toBe(false);
    expect(rowConversationActions({ conversation: conversationOf({ currentUserRole: 'admin' }), viewer: viewerOf() }).obsolete).toBe(true);
  });
});

describe('#14690 — un refus de la passerelle retire « Rendre obsolète » de cette conversation', () => {
  test('l’expéditeur d’une demande non acceptée, refusé une fois, ne se le voit plus proposer ; les autres conversations le gardent', () => {
    departureStore.setState({ obsoleteRefused: [] });
    const pending = conversationOf({ id: 'c-demande', type: 'direct', currentUserRole: 'member' });
    const other = conversationOf({ id: 'c-autre', type: 'direct', currentUserRole: 'member' });
    expect(rowConversationActions({ conversation: pending, viewer: viewerOf() }).obsolete).toBe(true);

    markObsoleteRefused('c-demande');

    expect(rowConversationActions({ conversation: pending, viewer: viewerOf() }).obsolete).toBe(false);
    expect(rowConversationActions({ conversation: other, viewer: viewerOf() }).obsolete).toBe(true);
    expect(rowMenuItems({ flags: { isPinned: false, isMuted: false, isArchived: false }, unread: false, language: 'fr', canDelete: true, actions: rowConversationActions({ conversation: pending, viewer: viewerOf() }) }).map((item) => item.id)).not.toContain('obsolete');
    departureStore.setState({ obsoleteRefused: [] });
  });
});

describe('#14690 — la capacité servie au lecteur décide seule ; absente, la règle locale reste', () => {
  const served = (canMakeObsolete: boolean) => ({ viewerCapabilities: { canMakeObsolete } });
  const direct = (overrides: Partial<Conversation> = {}) => conversationOf({ type: 'direct', currentUserRole: 'member', ...overrides });

  test('servie fausse, l’expéditeur d’une demande ne se voit jamais proposer l’action, au menu comme à la fiche', () => {
    departureStore.setState({ obsoleteRefused: [] });
    expect(rowConversationActions({ conversation: direct(served(false)), viewer: viewerOf() }).obsolete).toBe(false);
    expect(idsFor(direct(served(false)), viewerOf())).not.toContain('obsolete');
    expect(rowConversationActions({ conversation: conversationOf({ currentUserRole: 'admin', ...served(false) }), viewer: viewerOf() }).obsolete).toBe(false);
  });

  test('servie vraie, elle l’ouvre là où la règle locale le refusait', () => {
    departureStore.setState({ obsoleteRefused: [] });
    expect(rowConversationActions({ conversation: conversationOf({ currentUserRole: 'member', ...served(true) }), viewer: viewerOf() }).obsolete).toBe(true);
    expect(idsFor(conversationOf({ currentUserRole: 'member', ...served(true) }), viewerOf())).toContain('obsolete');
  });

  test('absente ou illisible, la règle locale d’avant s’applique, jamais un « faux » implicite', () => {
    departureStore.setState({ obsoleteRefused: [] });
    const unreadable = { viewerCapabilities: { canMakeObsolete: 'oui' } } as unknown as Partial<Conversation>;
    expect(rowConversationActions({ conversation: direct(), viewer: viewerOf() }).obsolete).toBe(true);
    expect(rowConversationActions({ conversation: direct(unreadable), viewer: viewerOf() }).obsolete).toBe(true);
    expect(rowConversationActions({ conversation: conversationOf({ currentUserRole: 'member', ...unreadable }), viewer: viewerOf() }).obsolete).toBe(false);
  });

  test('un refus mesuré de la route l’emporte sur un instantané vrai', () => {
    departureStore.setState({ obsoleteRefused: [] });
    markObsoleteRefused('c-lyon');
    expect(rowConversationActions({ conversation: conversationOf({ currentUserRole: 'admin', ...served(true) }), viewer: viewerOf() }).obsolete).toBe(false);
    departureStore.setState({ obsoleteRefused: [] });
  });
});
