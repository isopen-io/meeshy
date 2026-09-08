import { describe, expect, test } from 'bun:test';

import { conversationStore, effectiveFlagsOf, effectiveUnreadOf } from './conversation-store';
import type { Conversation } from './api/types';

const conversation = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c1',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    unreadCount: 2,
    ...partial,
  }) as Conversation;

/** Fusion PARTIELLE (jamais `replace: true`, qui effacerait aussi les
 * actions du store — elles vivent dans le même état). */
const freshStore = () => {
  conversationStore.setState({ overrides: {} });
  return conversationStore;
};

describe('togglePin (#5559 T4)', () => {
  test('wire isPinned: false + toggle ⇒ effectiveFlagsOf rend true ; second toggle ⇒ false', () => {
    const store = freshStore();
    const c = conversation({ userPreferences: [{ isPinned: false }] });

    store.getState().togglePin(c.id, false);
    expect(effectiveFlagsOf(c, store.getState().overrides).isPinned).toBe(true);

    store.getState().togglePin(c.id, true);
    expect(effectiveFlagsOf(c, store.getState().overrides).isPinned).toBe(false);
  });

  test("l'override PRIME sur le wire", () => {
    const store = freshStore();
    const c = conversation({ userPreferences: [{ isPinned: true }] });

    store.getState().togglePin(c.id, true);
    expect(effectiveFlagsOf(c, store.getState().overrides).isPinned).toBe(false);
  });

  test('effet observable par subscribe : un abonné est notifié', () => {
    const store = freshStore();
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    store.getState().togglePin('c1', false);
    unsubscribe();

    expect(notified).toBe(1);
  });
});

describe('toggleMute / toggleArchive — même loi', () => {
  test('toggleMute', () => {
    const store = freshStore();
    const c = conversation({ userPreferences: [{ isMuted: false }] });
    store.getState().toggleMute(c.id, false);
    expect(effectiveFlagsOf(c, store.getState().overrides).isMuted).toBe(true);
  });

  test('toggleArchive', () => {
    const store = freshStore();
    const c = conversation({ userPreferences: [{ isArchived: false }] });
    store.getState().toggleArchive(c.id, false);
    expect(effectiveFlagsOf(c, store.getState().overrides).isArchived).toBe(true);
  });
});

describe('markRead / markUnread (#5559 T5)', () => {
  test('markRead ⇒ effectiveUnreadOf = 0', () => {
    const store = freshStore();
    const c = conversation({ unreadCount: 5 });
    store.getState().markRead(c.id);
    expect(effectiveUnreadOf(c, store.getState().overrides)).toBe(0);
  });

  test('markUnread ⇒ effectiveUnreadOf >= 1 (loi iOS : le serveur recule le curseur)', () => {
    const store = freshStore();
    const c = conversation({ unreadCount: 0 });
    store.getState().markUnread(c.id);
    expect(effectiveUnreadOf(c, store.getState().overrides) >= 1).toBe(true);
  });

  test('conversation jamais surchargée ⇒ la valeur wire passe inchangée', () => {
    const store = freshStore();
    const c = conversation({ unreadCount: 3 });
    expect(effectiveUnreadOf(c, store.getState().overrides)).toBe(3);
  });
});
