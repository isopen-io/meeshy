import { describe, expect, test } from 'bun:test';

import { createSocketIOClient } from './socket-io-factory';

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
