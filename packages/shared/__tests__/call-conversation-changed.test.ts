import { describe, it, expect, expectTypeOf } from 'vitest';
import type { CallConversationChangedEvent } from '../types/call-controls.js';
import { SERVER_EVENTS } from '../types/socketio-events.js';
import type { ServerToClientEvents } from '../types/socketio-events.js';

describe('un appel qui change de conversation par invitation (#19650)', () => {
  it('se dit par call:conversation-changed, au format entity:action-word', () => {
    expect(SERVER_EVENTS.CALL_CONVERSATION_CHANGED).toBe('call:conversation-changed');
  });

  it('la carte des événements serveur porte sa charge', () => {
    expectTypeOf<Parameters<ServerToClientEvents['call:conversation-changed']>[0]>().toEqualTypeOf<CallConversationChangedEvent>();
    const event: CallConversationChangedEvent = {
      callId: '65f000000000000000000001',
      conversationId: '65f000000000000000000002',
      previousConversationId: '65f000000000000000000003',
      conversationType: 'group',
      conversationTitle: null,
      memberUserIds: ['65f000000000000000000004'],
      created: true,
      reason: 'invitation',
    };
    expect(event.reason).toBe('invitation');
  });
});
