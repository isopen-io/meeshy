import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { registerCallControlEvents } from '../call-controls';

describe('les contrôles d’un appel en cours sont écoutés (#8433, #8438, #8439)', () => {
  it('inviter, couper un micro et réagir sont enregistrés sur le socket', () => {
    const registered: string[] = [];
    registerCallControlEvents(
      {
        io: {} as never,
        prisma: {} as never,
        callService: {} as never,
        rateLimiter: { checkLimit: async () => true },
        pushService: () => null,
      },
      { id: 's', on: (event: string) => registered.push(event) } as never,
      () => 'alice'
    );

    expect(registered).toEqual([
      CLIENT_EVENTS.CALL_INVITE_PARTICIPANT,
      CLIENT_EVENTS.CALL_MUTE_PARTICIPANT,
      CLIENT_EVENTS.CALL_REACTION,
    ]);
  });

  it('CallEventsHandler les branche sur chaque socket authentifié', () => {
    const source = readFileSync(join(__dirname, '../CallEventsHandler.ts'), 'utf-8');

    expect(source).toMatch(/registerCallControlEvents\(\{.*\}, socket, getUserId\);/);
  });
});
