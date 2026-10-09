import { describe, expect, test } from 'bun:test';

import { readClientSessionAuth } from '@meeshy/shared/utils/client-session';

import { createSocketIOClient, handshakeAuth } from './socket-io-factory';

describe('la poignée de main déclare le client (#9611)', () => {
  test('`auth.client` porte la déclaration courante, que la passerelle relit sous les mêmes noms', () => {
    const declared = { appVersion: '2.13.0', platform: 'pwa', timezone: 'Europe/Paris', deviceLocale: 'fr-FR' };
    const auth = handshakeAuth({ token: 'jwt', sessionToken: 'st' }, declared);
    expect(auth.token).toBe('jwt');
    expect(auth.sessionToken).toBe('st');
    expect(readClientSessionAuth(auth)).toMatchObject(declared);
  });

  test('une déclaration encore vide n’ajoute pas de clé', () => {
    expect(handshakeAuth({ token: 'jwt', sessionToken: '' }, {})).toEqual({ token: 'jwt', sessionToken: '' });
  });
});

/**
 * `connect()` PENDANT LE BACKOFF TENTE TOUT DE SUITE (#8839) — le vrai
 * `socket.io-client` ignore `connect()` tant qu'il attend sa prochaine
 * tentative (`Socket.connect` : `if (!this.io._reconnecting) this.io.open()`),
 * donc le retour au premier plan ou au réseau attendait jusqu'à 16 s. Le
 * témoin vise un port fermé : chaque tentative échoue aussitôt, et seule la
 * relance MANUELLE peut produire une erreur avant la fin du premier backoff
 * (≥ 800 ms).
 */

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('la fabrique socket.io', () => {
  test('connect() pendant l’attente du backoff tente sans attendre', async () => {
    const client = createSocketIOClient({ base: 'http://127.0.0.1:1', auth: { token: 't', sessionToken: '' } });
    const failures: number[] = [];
    client.on('connect_error', () => failures.push(Date.now()));
    try {
      client.connect();
      await wait(150);
      expect(failures).toHaveLength(1);
      client.connect();
      await wait(250);
      expect(failures).toHaveLength(2);
    } finally {
      client.disconnect();
    }
  });
});
