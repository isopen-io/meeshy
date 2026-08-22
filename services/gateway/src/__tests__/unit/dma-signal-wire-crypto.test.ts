/**
 * DMA Signal Protocol — contrat de chiffrement du FIL
 *
 * Le dépôt DÉCLARE trois fois la largeur du nonce AES-GCM de l'interopérabilité
 * DMA, et les trois déclarations vivent dans `@meeshy/shared` :
 *
 * - `SignalProtocolLimits.AES_GCM_IV_SIZE` — 12 octets (96 bits, la taille
 *   standard de GCM, celle qu'emploient libsignal et tous les autres sites
 *   AES-GCM du dépôt : pièces jointes web et passerelle, `encryption-utils`,
 *   `node-crypto-adapter`) ;
 * - `SignalValidation.validateEncryptedPayload` — REJETTE tout IV d'une autre
 *   largeur ;
 * - `SignalSchemas.encryptedMessage.iv` — exige 16 caractères base64, soit
 *   exactement ces 12 octets.
 *
 * Ces témoins branchent le producteur sur ses propres déclarations : ce que
 * `SignalProtocolAdapter` met sur le fil doit passer le validateur et le schéma
 * partagés. Sans eux, la largeur du nonce était un littéral local (`16`) que
 * rien ne confrontait aux déclarations — le sous-arbre `dma-interoperability`
 * étant par ailleurs exclu du compilateur ET du banc de test (cycle 94).
 *
 * @see packages/shared/utils/validation.ts — les trois déclarations
 * @see services/gateway/src/dma-interoperability/signal-protocol/adapters/SignalProtocolAdapter.ts
 */

import * as crypto from 'crypto';
import {
  SignalProtocolLimits,
  SignalValidation,
  SignalSchemas,
} from '@meeshy/shared/utils/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SignalProtocolAdapter } from '../../dma-interoperability/signal-protocol/adapters/SignalProtocolAdapter';

const makeAdapter = (): SignalProtocolAdapter =>
  new SignalProtocolAdapter({} as unknown as PrismaClient, crypto.randomBytes(32));

const makeSessionKey = (): Buffer => crypto.randomBytes(SignalProtocolLimits.AES_256_KEY_SIZE);

describe('DMA Signal Protocol — chiffrement du fil (AES-256-GCM)', () => {
  it('produit un nonce de la largeur DÉCLARÉE par SignalProtocolLimits', async () => {
    const { iv } = await makeAdapter().encryptMessage(makeSessionKey(), Buffer.from('bonjour'), 0);

    expect(iv.length).toBe(SignalProtocolLimits.AES_GCM_IV_SIZE);
  });

  it('produit une charge utile que le validateur partagé ACCEPTE', async () => {
    const { ciphertext, iv, authTag } = await makeAdapter().encryptMessage(
      makeSessionKey(),
      Buffer.from('bonjour'),
      0
    );

    expect(SignalValidation.validateEncryptedPayload({ ciphertext, iv, authTag })).toEqual({
      valid: true,
    });
  });

  it('produit une charge utile que SignalSchemas.encryptedMessage PARSE', async () => {
    const { ciphertext, iv, authTag } = await makeAdapter().encryptMessage(
      makeSessionKey(),
      Buffer.from('bonjour'),
      7
    );

    const parsed = SignalSchemas.encryptedMessage.safeParse({
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      messageNumber: 7,
    });

    expect(parsed.success).toBe(true);
  });

  it('déchiffre ce qu’il a chiffré', async () => {
    const adapter = makeAdapter();
    const sessionKey = makeSessionKey();
    const plaintext = Buffer.from('Le prisme linguistique traverse le fil');

    const { ciphertext, iv, authTag } = await adapter.encryptMessage(sessionKey, plaintext, 0);
    const roundTripped = await adapter.decryptMessage(sessionKey, ciphertext, iv, authTag);

    expect(roundTripped.toString('utf-8')).toBe(plaintext.toString('utf-8'));
  });

  it('ne réemploie jamais un nonce sous la même clé de session', async () => {
    const adapter = makeAdapter();
    const sessionKey = makeSessionKey();

    const nonces = await Promise.all(
      Array.from({ length: 32 }, (_unused, index) =>
        adapter
          .encryptMessage(sessionKey, Buffer.from(`message ${index}`), index)
          .then(({ iv }) => iv.toString('base64'))
      )
    );

    expect(new Set(nonces).size).toBe(nonces.length);
  });

  it('refuse un chiffré altéré (l’authentification GCM tient)', async () => {
    const adapter = makeAdapter();
    const sessionKey = makeSessionKey();

    const { ciphertext, iv, authTag } = await adapter.encryptMessage(
      sessionKey,
      Buffer.from('bonjour'),
      0
    );
    const tampered = Buffer.from(ciphertext);
    tampered[0] = tampered[0] ^ 0xff;

    await expect(adapter.decryptMessage(sessionKey, tampered, iv, authTag)).rejects.toThrow();
  });
});
