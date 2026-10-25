/**
 * #10789 — les DEUX transports socket d'un envoi déclarent la session de
 * l'appelant à `toEncryptedPayload`. Le relais libsignal n'admet une enveloppe
 * que de l'appareil lié à CETTE session (`E2EE_DEVICE_NOT_BOUND` sinon) : sans
 * elle, tout envoi chiffré AVEC pièce jointe par `message:send-with-attachments`
 * était refusé 403, alors que `message:send` passait.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';

describe('MessageHandler — la session voyage avec chaque enveloppe chiffrée', () => {
  it('chaque appel à toEncryptedPayload porte la session de la socket', () => {
    const source = readFileSync(path.join(__dirname, '..', 'MessageHandler.ts'), 'utf8');
    const calls = source.match(/toEncryptedPayload\(validated[^\n]*/g) ?? [];

    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) expect(call).toMatch(/sessionId/);
  });
});
