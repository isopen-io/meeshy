import { describe, expect, test } from 'bun:test';

import { VIEWER_HANDLE, VIEWER_ID } from './fixtures-base';
import { resolveViewer } from './viewer';

/** `resolveViewer` — le site UNIQUE de « qui lit » (#5695, étape 9). */

describe('resolveViewer', () => {
  test('source fixtures ⇒ le lecteur de fixture, inscrit', () => {
    const viewer = resolveViewer({ source: 'fixtures', session: { status: 'anonymous' } });
    expect(viewer).toEqual({ id: VIEWER_ID, handle: VIEWER_HANDLE, displayName: 'Vous', isAnonymous: false });
  });

  test('source gateway + session authenticated ⇒ l’utilisateur de session, inscrit', () => {
    const viewer = resolveViewer({
      source: 'gateway',
      session: {
        status: 'authenticated',
        user: { id: 'u1', username: 'amina', displayName: 'Amina Diallo' },
        token: 't',
        sessionToken: 's',
        expiresAt: Date.now() + 1000,
      },
    });
    expect(viewer).toEqual({ id: 'u1', handle: 'amina', displayName: 'Amina Diallo', isAnonymous: false });
  });

  test('source gateway + session anonymous ⇒ isAnonymous: true, id null', () => {
    const viewer = resolveViewer({ source: 'gateway', session: { status: 'anonymous' } });
    expect(viewer).toEqual({ id: null, handle: null, displayName: '', isAnonymous: true });
  });

  test('source gateway + session pending2fa ⇒ anonyme', () => {
    const viewer = resolveViewer({
      source: 'gateway',
      session: {
        status: 'pending2fa',
        twoFactorToken: 'tok',
        user: { id: 'u1', username: 'amina', email: 'a@a.fr', firstName: 'A', lastName: 'D', displayName: 'Amina' },
      },
    });
    expect(viewer.isAnonymous).toBe(true);
    expect(viewer.id).toBeNull();
  });
});
