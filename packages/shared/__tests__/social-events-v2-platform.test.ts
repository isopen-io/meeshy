import { describe, it, expect } from 'vitest';
import { CLIENT_PLATFORMS } from '../types/social-events-v2';

describe('CLIENT_PLATFORMS du contexte v2 de POST /social/events', () => {
  it("contient 'android' (l'application Android native)", () => {
    expect(CLIENT_PLATFORMS).toContain('android');
  });

  it('garde les quatre valeurs historiques', () => {
    expect(CLIENT_PLATFORMS).toEqual(expect.arrayContaining(['ios', 'web', 'android_shell', 'pwa']));
  });

  it("n'unifie pas avec la jumelle de client-session (android_shell avec underscore ici)", () => {
    expect(CLIENT_PLATFORMS).not.toContain('android-shell');
  });
});
