import { describe, expect, it } from 'vitest';
import { SERVER_EVENTS } from '../socketio-events';
import type { ServerToClientEvents, UserProfileChangedEventData } from '../socketio-events';

describe('user:profile-changed — la fiche ouverte se revalide (#19384)', () => {
  it('suit la convention entité:action-mot avec traits d’union', () => {
    expect(SERVER_EVENTS.USER_PROFILE_CHANGED).toBe('user:profile-changed');
    expect(SERVER_EVENTS.USER_PROFILE_CHANGED).toMatch(/^[a-z]+:[a-z]+(-[a-z]+)*$/);
  });

  it('ne transporte que le sujet et l’horloge — aucun contenu de fiche', () => {
    const payload: UserProfileChangedEventData = { userId: 'u', updatedAt: '2026-11-17T10:00:00.000Z' };
    const listener: ServerToClientEvents[typeof SERVER_EVENTS.USER_PROFILE_CHANGED] = (data) => {
      expect(Object.keys(data).sort()).toEqual(['updatedAt', 'userId']);
    };
    listener(payload);
  });

  it('laisse user:updated inchangé (rétrocompatible)', () => {
    expect(SERVER_EVENTS.USER_UPDATED).toBe('user:updated');
  });
});
