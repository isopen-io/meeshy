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
});
