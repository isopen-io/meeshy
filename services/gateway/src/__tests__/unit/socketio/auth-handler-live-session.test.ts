/**
 * Une socket s'authentifie au JWT SEUL. Rien ne vérifiait que la `UserSession`
 * correspondante vivait encore : une appli installée avec un jeton mort rouvre
 * sa socket, et `updateUserOnlineStatus` écrit alors `User.lastActiveAt` — une
 * personne absente depuis des mois paraît présente (#5712).
 *
 * Deux volets, de risque très différent :
 *
 *  - `_attachSessionId` exige désormais une session NON EXPIRÉE. Sûr : cette
 *    méthode n'a jamais bloqué une connexion, elle ne fait qu'étiqueter le
 *    socket.
 *  - Le REFUS de connexion vit derrière `SOCKET_REQUIRES_LIVE_SESSION`, désarmé
 *    par défaut. Ce chemin porte TOUTES les connexions temps réel de la
 *    production ; il s'arme après mesure, et se désarme sans redéploiement.
 */
import { requiresLiveSession, liveSessionFilter } from '../../../socketio/handlers/live-session-gate';

describe('liveSessionFilter() — une session morte n\'étiquette plus un socket', () => {
  it('exige isValid ET une échéance non dépassée', () => {
    const avant = Date.now();
    const where = liveSessionFilter('u1', 'hash-du-jeton');

    expect(where.userId).toBe('u1');
    expect(where.sessionToken).toBe('hash-du-jeton');
    expect(where.isValid).toBe(true);
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
    expect(where.expiresAt.gt.getTime()).toBeGreaterThanOrEqual(avant - 5_000);
  });
});

describe('requiresLiveSession() — le refus est DÉSARMÉ par défaut', () => {
  const original = process.env.SOCKET_REQUIRES_LIVE_SESSION;
  afterEach(() => {
    if (original === undefined) delete process.env.SOCKET_REQUIRES_LIVE_SESSION;
    else process.env.SOCKET_REQUIRES_LIVE_SESSION = original;
  });

  it('rend false quand la variable est absente', () => {
    delete process.env.SOCKET_REQUIRES_LIVE_SESSION;
    expect(requiresLiveSession()).toBe(false);
  });

  it('rend false sur toute valeur autre que "true"', () => {
    for (const v of ['1', 'yes', 'TRUE', 'on', '']) {
      process.env.SOCKET_REQUIRES_LIVE_SESSION = v;
      expect(requiresLiveSession()).toBe(false);
    }
  });

  it('rend true UNIQUEMENT sur "true"', () => {
    process.env.SOCKET_REQUIRES_LIVE_SESSION = 'true';
    expect(requiresLiveSession()).toBe(true);
  });
});
