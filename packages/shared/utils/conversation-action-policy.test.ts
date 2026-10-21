import { describe, expect, it } from 'vitest';

import { conversationActionsFor } from './conversation-action-policy';
import type { ActionConversation, ActionViewer } from './message-action-policy';

const viewer = (overrides: Partial<ActionViewer> = {}): ActionViewer => ({
  id: 'user-viewer', participantId: 'part-viewer', hasAccount: true, isAnonymous: false, platformRole: 'USER',
  conversationRole: 'member', isActiveMember: true, canSendMessages: true, isDeclaredMinor: false, ...overrides,
});

const conversation = (overrides: Partial<ActionConversation> = {}): ActionConversation => ({
  type: 'group', encryptionMode: null, isActive: true, closedAt: null, isAnnouncementChannel: false, defaultWriteRole: 'everyone', ...overrides,
});

const actionsOf = (parts: { conversation?: Partial<ActionConversation>; viewer?: Partial<ActionViewer> } = {}) =>
  conversationActionsFor({ conversation: conversation(parts.conversation), viewer: viewer(parts.viewer) });

describe('conversationActionsFor — rôles de plateforme et de conversation (#11205)', () => {
  it('un membre ne renomme pas, un moderator si', () => {
    expect(actionsOf().rename).toBe(false);
    expect(actionsOf({ viewer: { conversationRole: 'moderator' } }).rename).toBe(true);
  });

  it('personne ne renomme Global, pas même un BIGBOSS', () => {
    expect(actionsOf({ conversation: { type: 'global' }, viewer: { platformRole: 'BIGBOSS' } }).rename).toBe(false);
  });

  it('un creator invite ; dans Global, seuls ADMIN et BIGBOSS de plateforme', () => {
    expect(actionsOf({ viewer: { conversationRole: 'creator' } }).invite).toBe(true);
    expect(actionsOf({ conversation: { type: 'global' }, viewer: { conversationRole: 'creator' } }).invite).toBe(false);
    expect(actionsOf({ conversation: { type: 'global' }, viewer: { platformRole: 'ADMIN' } }).invite).toBe(true);
  });

  it.each(['AUDIT', 'ANALYST', 'MODERATOR', 'inconnu'])('%s de plateforme vaut USER dans une conversation', (platformRole) => {
    expect(actionsOf({ viewer: { platformRole } })).toEqual(actionsOf());
  });

  it('un ADMIN de plateforme membre agit avec les droits du créateur', () => {
    const actions = actionsOf({ viewer: { platformRole: 'ADMIN' } });
    expect([actions.rename, actions.deleteForAll, actions.manageMembers, actions.adminOpen]).toEqual([true, true, true, true]);
  });

  it('un rang de conversation inconnu échoue fermé', () => {
    expect(actionsOf({ viewer: { conversationRole: 'owner' } }).manageMembers).toBe(false);
  });

  it('on ne quitte ni un direct ni Global', () => {
    expect(actionsOf({ conversation: { type: 'direct' } }).leave).toBe(false);
    expect(actionsOf({ conversation: { type: 'global' } }).leave).toBe(false);
    expect(actionsOf().leave).toBe(true);
  });

  it('l’appel suit canStartCall : jamais en Global, ni pour un invité', () => {
    expect(actionsOf({ conversation: { type: 'global' }, viewer: { platformRole: 'BIGBOSS' } }).call).toBe(false);
    expect(actionsOf({ viewer: { hasAccount: false, isAnonymous: true } }).videoCall).toBe(false);
    expect(actionsOf({ conversation: { type: 'direct' } }).videoCall).toBe(true);
  });

  it('le badge de chiffrement suit le régime de la conversation', () => {
    expect(actionsOf({ conversation: { encryptionMode: 'e2ee' } }).e2eeBadge).toBe(true);
    expect(actionsOf({ conversation: { encryptionMode: 'server' } }).e2eeBadge).toBe(false);
  });

  it.each(['E2EE', ' e2ee ', 'signal_v3'])('un régime %j porte le badge : la loi des messages y retire les services', (encryptionMode) => {
    expect(actionsOf({ conversation: { encryptionMode } }).e2eeBadge).toBe(true);
  });

  it.each([null, 'SERVER', 'hybrid'])('un régime %j que le serveur lit ne porte pas le badge', (encryptionMode) => {
    expect(actionsOf({ conversation: { encryptionMode } }).e2eeBadge).toBe(false);
  });

  it('une conversation close ne se supprime plus pour tous : la route écraserait closedAt', () => {
    expect(actionsOf({ conversation: { closedAt: '2026-10-19T00:00:00Z' }, viewer: { conversationRole: 'admin' } }).deleteForAll).toBe(false);
    expect(actionsOf({ viewer: { conversationRole: 'admin' } }).deleteForAll).toBe(true);
  });

  it('un lecteur à la fois inscrit et anonyme se lit comme un invité', () => {
    const actions = actionsOf({ viewer: { isAnonymous: true } });
    expect([actions.hide, actions.report, actions.call]).toEqual([false, false, false]);
  });

  it('dans une conversation publique, tout membre inscrit fabrique un lien, comme mayMintShareLink', () => {
    expect(actionsOf({ conversation: { type: 'public' } }).invite).toBe(true);
    expect(actionsOf({ conversation: { type: 'public' }, viewer: { hasAccount: false, isAnonymous: true, platformRole: null } }).invite).toBe(false);
    expect(actionsOf({ conversation: { type: 'public' }, viewer: { isActiveMember: false, conversationRole: null } }).invite).toBe(false);
  });

  it('une chaîne broadcast reste réservée aux moderators : seul public ouvre le lien au membre', () => {
    expect(actionsOf({ conversation: { type: 'broadcast' } }).invite).toBe(false);
    expect(actionsOf({ conversation: { type: 'broadcast' }, viewer: { conversationRole: 'moderator' } }).invite).toBe(true);
  });

  it('un invité ne quitte pas par cette route : POST /leave refuse les anonymes', () => {
    expect(actionsOf({ viewer: { hasAccount: false, isAnonymous: true, platformRole: null } }).leave).toBe(false);
  });

  it.each([
    ['MODERATOR', 'rename'],
    ['ADMIN', 'deleteForAll'],
    ['Creator', 'manageMembers'],
  ] as const)('un rang de ligne %j se lit casse pliée, comme effectiveConversationRole', (conversationRole, verdict) => {
    expect(actionsOf({ viewer: { conversationRole } })[verdict]).toBe(true);
  });
});
