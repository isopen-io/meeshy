/**
 * `ApiService` ne savait pas parler le protocole ANONYME.
 *
 * Un visiteur sans compte s'authentifie par `X-Session-Token` ; un inscrit par
 * `Authorization: Bearer <JWT>`. La règle est écrite une fois, dans
 * `token-utils.getAuthToken()` — et `ApiService.request` ne la consultait pas :
 * il lisait `authManager.getAuthToken()`, c'est-à-dire le SEUL emplacement du
 * jeton de compte, et posait toujours un `Bearer`.
 *
 * Conséquence pour quelqu'un qui vient de rejoindre par lien : chaque appel
 * passé par le client central part sans identifiant (401 `AUTH_REQUIRED`), ou
 * pire, avec le résidu d'un ancien `AUTH_TOKEN` que le serveur refuse
 * (401 `AUTH_FAILED`, « Invalid JWT token » — la ligne vue en production le
 * 2026-08-18). Le join réussissait côté serveur — le participant existe — mais
 * l'écran suivant ne pouvait plus rien charger.
 *
 * D'où le contournement observé : trois sites d'appel
 * (`use-conversation-messages`, `use-conversation-join`, `link-parser`) posent
 * l'en-tête À LA MAIN. Ce qui marche est exactement ce qui a pensé à le faire,
 * et les notifications, elles, n'y avaient pas pensé.
 *
 * @jest-environment jsdom
 */

import { resolveRequestCredential } from '@/services/api-credential';

const KEYS = {
  auth: 'meeshy_auth_token',
  anonymous: 'meeshy_anonymous_session',
};

function setAnonymousSession(token: string) {
  localStorage.setItem(
    KEYS.anonymous,
    JSON.stringify({ token, participantId: 'p1', expiresAt: Date.now() + 3_600_000 })
  );
}

beforeEach(() => localStorage.clear());

describe('un inscrit s’annonce par Bearer', () => {
  it('pose Authorization quand un jeton de compte existe', () => {
    localStorage.setItem(KEYS.auth, 'jwt.abc.def');

    expect(resolveRequestCredential()).toEqual({
      header: 'Authorization',
      value: 'Bearer jwt.abc.def',
    });
  });
});

describe('un visiteur SANS COMPTE s’annonce par X-Session-Token', () => {
  it('pose l’en-tête de session quand seule une session anonyme existe', () => {
    setAnonymousSession('anon_1787081726022_18456d20e');

    expect(resolveRequestCredential()).toEqual({
      header: 'X-Session-Token',
      value: 'anon_1787081726022_18456d20e',
    });
  });

  /**
   * Le cœur du défaut : envoyer un `anon_…` en Bearer fait répondre au gateway
   * « Invalid JWT token ». Ce n'est pas une absence d'identifiant, c'est un
   * identifiant présenté dans la mauvaise langue.
   */
  it('ne présente JAMAIS un jeton anonyme comme un JWT', () => {
    setAnonymousSession('anon_1787081726022_18456d20e');

    expect(resolveRequestCredential()?.header).not.toBe('Authorization');
  });
});

describe('priorité et absence', () => {
  /**
   * Le compte prime : quelqu'un de connecté qui a AUSSI une session invitée
   * dormante reste lui-même. C'est l'ordre que `token-utils` tient déjà.
   */
  it('le jeton de compte prime sur une session anonyme dormante', () => {
    localStorage.setItem(KEYS.auth, 'jwt.abc.def');
    setAnonymousSession('anon_dormant');

    expect(resolveRequestCredential()?.header).toBe('Authorization');
  });

  it('rend `null` quand il n’y a rien à présenter', () => {
    expect(resolveRequestCredential()).toBeNull();
  });

  /**
   * Une session anonyme EXPIRÉE ne vaut pas mieux que pas de session : la
   * présenter ferait répondre 401 au serveur, et masquerait la vraie cause
   * derrière un « refusé » plutôt qu'un « expiré ».
   */
  it('ignore une session anonyme expirée', () => {
    localStorage.setItem(
      KEYS.anonymous,
      JSON.stringify({ token: 'anon_old', participantId: 'p1', expiresAt: Date.now() - 1000 })
    );

    expect(resolveRequestCredential()).toBeNull();
  });

  it('tolère un stockage corrompu sans jeter', () => {
    localStorage.setItem(KEYS.anonymous, '{ pas du json');

    expect(resolveRequestCredential()).toBeNull();
  });
});
