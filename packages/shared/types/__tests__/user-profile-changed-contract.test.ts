import { describe, expect, it } from 'vitest';
import { SERVER_EVENTS } from '../socketio-events';
import type { ServerToClientEvents, UserProfileChangedEventData } from '../socketio-events';

describe('user:profile-changed — la fiche ouverte se revalide (#19384)', () => {
  it('suit la convention entité:action-mot avec traits d’union', () => {
    expect(SERVER_EVENTS.USER_PROFILE_CHANGED).toBe('user:profile-changed');
    expect(SERVER_EVENTS.USER_PROFILE_CHANGED).toMatch(/^[a-z]+:[a-z]+(-[a-z]+)*$/);
  });

  it('ne transporte que le sujet — ni contenu de fiche, ni horloge qui daterait le geste', () => {
    const payload: UserProfileChangedEventData = { userId: 'u' };
    const listener: ServerToClientEvents[typeof SERVER_EVENTS.USER_PROFILE_CHANGED] = (data) => {
      expect(Object.keys(data)).toEqual(['userId']);
    };
    listener(payload);
  });

  it('laisse user:updated inchangé (rétrocompatible)', () => {
    expect(SERVER_EVENTS.USER_UPDATED).toBe('user:updated');
  });
});
