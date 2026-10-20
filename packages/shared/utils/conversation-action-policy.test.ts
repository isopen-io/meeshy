import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { conversationActionsFor, type ConversationActionInput, type ConversationActions } from './conversation-action-policy';
import type { ActionConversation, ActionViewer } from './message-action-policy';

const viewer = (overrides: Partial<ActionViewer> = {}): ActionViewer => ({
  id: 'user-viewer',
  participantId: 'part-viewer',
  hasAccount: true,
  isAnonymous: false,
  platformRole: 'USER',
  conversationRole: 'member',
  isActiveMember: true,
  canSendMessages: true,
  isDeclaredMinor: false,
  ...overrides,
});

const conversation = (overrides: Partial<ActionConversation> = {}): ActionConversation => ({
  type: 'group',
  encryptionMode: null,
  isActive: true,
  closedAt: null,
  isAnnouncementChannel: false,
  defaultWriteRole: 'everyone',
  ...overrides,
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
});

type ConversationVector = { readonly _label: string; readonly input: ConversationActionInput; readonly expected: ConversationActions };

const vectors: readonly ConversationVector[] = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/action-policy/conversation-actions.vectors.json', import.meta.url)), 'utf-8'),
).vectors;

describe('vecteurs : conversation-actions', () => {
  it('le fichier porte des cas, jamais zéro (leçon 257)', () => {
    expect(vectors.length).toBeGreaterThan(20);
  });

  it.each(vectors.map((vector) => [vector._label, vector] as const))('%s', (_label, vector) => {
    expect(conversationActionsFor(vector.input)).toEqual(vector.expected);
  });
});
