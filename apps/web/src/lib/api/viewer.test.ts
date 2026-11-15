import { describe, expect, test } from 'bun:test';

import { VIEWER_HANDLE, VIEWER_ID, portraitStandIn } from './fixtures-base';
import { resolveViewer } from './viewer';

/** `resolveViewer` — le site UNIQUE de « qui lit » (#5695, étape 9). */

describe('resolveViewer', () => {
  test('source fixtures ⇒ le lecteur de fixture, inscrit, AVEC sa photo (#6975)', () => {
    const viewer = resolveViewer({ source: 'fixtures', session: { status: 'anonymous' } });
    expect(viewer).toEqual({
      id: VIEWER_ID,
      handle: VIEWER_HANDLE,
      displayName: 'Vous',
      isAnonymous: false,
      /* `avatar` — le lecteur de fixture n'en portait AUCUN, donc la pastille
         « moi » du rail n'avait aucune photo à peindre et un gate de pixels y
         mesurait un vide LÉGITIME. */
      avatar: portraitStandIn('#fb7185', '#7f1d1d'),
    });
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

  /**
   * MON PORTRAIT (revue #5652) — la pastille « moi » du rail de stories est la
   * première surface à en avoir besoin ; le lire ici plutôt que dans l'écran
   * évite qu'une deuxième, puis une troisième, relise `sessionStore` à sa
   * façon. Une chaîne VIDE est une ABSENCE, jamais une URL (`<img src="">`
   * recharge le document).
   */
  test('un avatar servi voyage sur le lecteur', () => {
    const viewer = resolveViewer({
      source: 'gateway',
      session: {
        status: 'authenticated',
        user: { id: 'u1', username: 'amina', avatar: 'https://cdn.test/a.jpg' },
        token: 't',
        sessionToken: 's',
        expiresAt: Date.now() + 1000,
      },
    });
    expect(viewer.avatar).toBe('https://cdn.test/a.jpg');
  });

  test('un avatar VIDE est OMIS — jamais une clé posée à la chaîne vide', () => {
    const viewer = resolveViewer({
      source: 'gateway',
      session: {
        status: 'authenticated',
        user: { id: 'u1', username: 'amina', avatar: '  ' },
        token: 't',
        sessionToken: 's',
        expiresAt: Date.now() + 1000,
      },
    });
    expect('avatar' in viewer).toBe(false);
  });

  /**
   * L'INVITÉ D'UN LIEN (#5561) — il n'a pas de compte (`isAnonymous: true`),
   * mais il a bien une IDENTITÉ : un participant. `id` non nul est ce qui fait
   * que ses propres bulles sont les siennes dans le fil (`isMineOf`) — le
   * confondre avec un visiteur sans session lui ferait lire ses propres
   * messages comme ceux d'un autre.
   */
  test('source gateway + session guest ⇒ son participant et son pseudo, isAnonymous vrai', () => {
    const viewer = resolveViewer({
      source: 'gateway',
      session: {
        status: 'guest',
        sessionToken: 'anon_abc',
        expiresAt: 1,
        guest: { participantId: 'p-invitee', nickname: 'Awa', conversationId: 'c1', link: 'mshy_x', mayWrite: true },
      },
    });
    expect(viewer).toEqual({ id: 'p-invitee', handle: null, displayName: 'Awa', isAnonymous: true });
  });

  /** Un lien peut ne PAS exiger de pseudo : la passerelle en génère alors un
   * qu'elle ne remet pas à la jonction. On nomme le RÔLE plutôt que d'inventer
   * un nom ou d'en afficher un vide. */
  test('un invité SANS pseudo est nommé par son rôle, jamais par une chaîne vide', () => {
    const viewer = resolveViewer({
      source: 'gateway',
      session: {
        status: 'guest',
        sessionToken: 'anon_abc',
        expiresAt: 1,
        guest: { participantId: null, nickname: '  ', conversationId: 'c1', link: 'mshy_x', mayWrite: false },
      },
    });
    expect(viewer).toEqual({ id: null, handle: null, displayName: 'Invité', isAnonymous: true });
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
