import { describe, it, expect } from 'vitest';
import { SERVER_EVENTS } from '../../types/socketio-events';

describe('SERVER_EVENTS', () => {
  it('declares MESSAGE_ATTACHMENT_UPDATED for async attachment enrichments', () => {
    expect(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED).toBe('message:attachment-updated');
  });

  it('uses entity:action-word convention (colons + hyphens, never underscores)', () => {
    const eventName = SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED;
    expect(eventName).toMatch(/^[a-z]+:[a-z-]+$/);
    expect(eventName).not.toContain('_');
  });

  it('declares typed FRIEND_REQUEST_NEW/ACCEPTED/REJECTED events using the naming convention', () => {
    expect(SERVER_EVENTS.FRIEND_REQUEST_NEW).toBe('friend-request:new');
    expect(SERVER_EVENTS.FRIEND_REQUEST_ACCEPTED).toBe('friend-request:accepted');
    expect(SERVER_EVENTS.FRIEND_REQUEST_REJECTED).toBe('friend-request:rejected');
    for (const eventName of [
      SERVER_EVENTS.FRIEND_REQUEST_NEW,
      SERVER_EVENTS.FRIEND_REQUEST_ACCEPTED,
      SERVER_EVENTS.FRIEND_REQUEST_REJECTED,
    ]) {
      expect(eventName).toMatch(/^[a-z-]+:[a-z-]+$/);
      expect(eventName).not.toContain('_');
    }
  });

  it('declares USER_UPDATED for realtime profile propagation to conversation partners', () => {
    expect(SERVER_EVENTS.USER_UPDATED).toBe('user:updated');
    expect(SERVER_EVENTS.USER_UPDATED).toMatch(/^[a-z]+:[a-z-]+$/);
    expect(SERVER_EVENTS.USER_UPDATED).not.toContain('_');
  });
});
