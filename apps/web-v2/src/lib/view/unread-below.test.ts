import { describe, expect, test } from 'bun:test';

import { initialUnreadBelowState, reduceUnreadBelow, type UnreadBelowState } from './unread-below';

const VIEWER = 'v1';

const messages = (ids: readonly string[], senderId = 'other') => ids.map((id) => ({ id, senderId }));

describe('unreadBelow — miroir pendingUnreadCount (:2060-2075, :710-717) (T7)', () => {
  test('premier "messages" (seed) -> count 0 meme loin du bas', () => {
    const next = reduceUnreadBelow(initialUnreadBelowState(), {
      type: 'messages',
      messages: messages(['a', 'b', 'c']),
      viewerId: VIEWER,
      nearBottom: false,
    });
    expect(next.count).toBe(0);
    expect(next.lastUnreadId).toBeNull();
  });

  test('un message NOUVEAU d autrui arrive nearBottom:false -> count 1, lastUnreadId = son id', () => {
    let state: UnreadBelowState = reduceUnreadBelow(initialUnreadBelowState(), {
      type: 'messages',
      messages: messages(['a', 'b']),
      viewerId: VIEWER,
      nearBottom: false,
    });
    state = reduceUnreadBelow(state, {
      type: 'messages',
      messages: messages(['a', 'b', 'c']),
      viewerId: VIEWER,
      nearBottom: false,
    });
    expect(state.count).toBe(1);
    expect(state.lastUnreadId).toBe('c');
  });

  test('un message PROPRE (senderId === viewerId) -> count inchange', () => {
    let state = reduceUnreadBelow(initialUnreadBelowState(), {
      type: 'messages',
      messages: messages(['a']),
      viewerId: VIEWER,
      nearBottom: false,
    });
    state = reduceUnreadBelow(state, {
      type: 'messages',
      messages: [...messages(['a']), { id: 'own', senderId: VIEWER }],
      viewerId: VIEWER,
      nearBottom: false,
    });
    expect(state.count).toBe(0);
    expect(state.lastUnreadId).toBeNull();
  });

  test('deux nouveaux d autrui -> count 2, lastUnreadId = le plus RECENT', () => {
    let state = reduceUnreadBelow(initialUnreadBelowState(), {
      type: 'messages',
      messages: messages(['a']),
      viewerId: VIEWER,
      nearBottom: false,
    });
    state = reduceUnreadBelow(state, {
      type: 'messages',
      messages: messages(['a', 'b', 'c']),
      viewerId: VIEWER,
      nearBottom: false,
    });
    expect(state.count).toBe(2);
    expect(state.lastUnreadId).toBe('c');
  });

  test('nouveau arrive nearBottom:true -> 0', () => {
    let state = reduceUnreadBelow(initialUnreadBelowState(), {
      type: 'messages',
      messages: messages(['a']),
      viewerId: VIEWER,
      nearBottom: false,
    });
    state = reduceUnreadBelow(state, {
      type: 'messages',
      messages: messages(['a', 'b']),
      viewerId: VIEWER,
      nearBottom: true,
    });
    expect(state.count).toBe(0);
    expect(state.lastUnreadId).toBeNull();
  });

  test('evenement "near-bottom" -> 0/null', () => {
    let state = reduceUnreadBelow(initialUnreadBelowState(), {
      type: 'messages',
      messages: messages(['a']),
      viewerId: VIEWER,
      nearBottom: false,
    });
    state = reduceUnreadBelow(state, {
      type: 'messages',
      messages: messages(['a', 'b']),
      viewerId: VIEWER,
      nearBottom: false,
    });
    expect(state.count).toBe(1);
    state = reduceUnreadBelow(state, { type: 'near-bottom' });
    expect(state.count).toBe(0);
    expect(state.lastUnreadId).toBeNull();
  });

  test('evenement "reset" (tap) -> 0/null', () => {
    let state = reduceUnreadBelow(initialUnreadBelowState(), {
      type: 'messages',
      messages: messages(['a']),
      viewerId: VIEWER,
      nearBottom: false,
    });
    state = reduceUnreadBelow(state, {
      type: 'messages',
      messages: messages(['a', 'b']),
      viewerId: VIEWER,
      nearBottom: false,
    });
    state = reduceUnreadBelow(state, { type: 'reset' });
    expect(state.count).toBe(0);
    expect(state.lastUnreadId).toBeNull();
  });

  test('un meme id revu (re-fetch identique) ne recompte pas', () => {
    let state = reduceUnreadBelow(initialUnreadBelowState(), {
      type: 'messages',
      messages: messages(['a']),
      viewerId: VIEWER,
      nearBottom: false,
    });
    state = reduceUnreadBelow(state, {
      type: 'messages',
      messages: messages(['a', 'b']),
      viewerId: VIEWER,
      nearBottom: false,
    });
    expect(state.count).toBe(1);
    // Re-fetch identique : memes ids.
    state = reduceUnreadBelow(state, {
      type: 'messages',
      messages: messages(['a', 'b']),
      viewerId: VIEWER,
      nearBottom: false,
    });
    expect(state.count).toBe(1);
    expect(state.lastUnreadId).toBe('b');
  });
});
