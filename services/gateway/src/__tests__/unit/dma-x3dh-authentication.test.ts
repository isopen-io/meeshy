/**
 * DMA Signal Protocol — l'accord de clés est AUTHENTIFIÉ
 *
 * X3DH n'a qu'une seule ancre de confiance : la clé d'identité. Tout le reste du
 * paquet de pré-clés — la pré-clé signée, la pré-clé unique, l'identifiant
 * d'enregistrement — arrive par un canal que le protocole suppose HOSTILE (ici :
 * les colonnes `DMAEnrollment` d'un annuaire d'interopérabilité). Ce qui rattache
 * la pré-clé signée à la clé d'identité, et donc ce qui fait de l'accord de clés
 * un accord AUTHENTIFIÉ, est la signature `signedPreKey.signature` — et rien
 * d'autre. La spécification X3DH §3.3 en fait une étape obligatoire : « Alice
 * verifies the prekey signature and aborts the protocol if verification fails ».
 *
 * Le sous-arbre TRANSPORTAIT cette signature de bout en bout — `SignalKeyManager`
 * la produit, la colonne la persiste, `SignalProtocolEngine` la relit et la place
 * dans le paquet, `PreKeyBundle` la déclare OBLIGATOIRE — et
 * `initiatorKeyAgreement` ne la lisait jamais. La pré-clé signée était donc
 * acceptée sur la seule parole de l'annuaire.
 *
 * Le contraste interne est ce qui rend le défaut lisible : le moteur REJETTE
 * strictement un message dont la signature de contenu ne vérifie pas
 * (`decryptMessage` étape 2), pendant que la signature qui établit la session
 * elle-même n'était confrontée à rien.
 *
 * Ces témoins branchent le VÉRIFICATEUR sur son PRODUCTEUR réel : la signature
 * acceptée au premier témoin sort de `SignalKeyManager.generateAndStoreSignedPreKey`,
 * jamais d'un signeur recopié dans ce fichier — sans quoi un changement de ce qui
 * est signé laisserait les deux dériver en silence.
 *
 * @see services/gateway/src/dma-interoperability/signal-protocol/X3DHKeyAgreement.ts
 * @see services/gateway/src/dma-interoperability/signal-protocol/SignalKeyManager.ts — le producteur
 */

import * as crypto from 'crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  X3DHKeyAgreement,
  X3DHSignedPreKeyRejected,
  type PreKeyBundle,
} from '../../dma-interoperability/signal-protocol/X3DHKeyAgreement';
import { SignalKeyManager } from '../../dma-interoperability/signal-protocol/SignalKeyManager';
import { SignalProtocolAdapter } from '../../dma-interoperability/signal-protocol/adapters/SignalProtocolAdapter';
import { SignalProtocolEngine } from '../../dma-interoperability/signal-protocol/SignalProtocolEngine';
import { DoubleRatchet, type DoubleRatchetSession } from '../../dma-interoperability/signal-protocol/DoubleRatchet';

type KeyPair = { publicKey: Buffer; privateKey: Buffer };

const generateKeyPair = (): KeyPair => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return { publicKey: publicKey as Buffer, privateKey: privateKey as Buffer };
};

/**
 * Le paquet de pré-clés tel que le PRODUCTEUR le fabrique.
 *
 * `generateAndStoreSignedPreKey` est le seul site du dépôt qui signe une pré-clé,
 * et c'est sa sortie — pas une imitation — qui doit franchir le vérificateur.
 * `initialize()` exigeant un Mongo vivant, la clé d'identité est posée directement
 * sur le champ que le chargeur aurait rempli ; tout le reste de la méthode (ce qui
 * est signé, avec quel algorithme, avec quelle clé) reste la production.
 */
const producedSignedPreKey = async (
  identity: KeyPair
): Promise<{ id: number; publicKey: Buffer; signature: Buffer }> => {
  const prismaDouble = {
    signalPreKeyBundle: { update: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient;

  const keyManager = new SignalKeyManager(prismaDouble, crypto.randomBytes(32));
  keyManager.setUserId('507f1f77bcf86cd799439011');
  (keyManager as unknown as { identityKeyPair?: KeyPair }).identityKeyPair = identity;

  const signedPreKey = await keyManager.generateAndStoreSignedPreKey();
  return { id: signedPreKey.id, publicKey: signedPreKey.publicKey, signature: signedPreKey.signature };
};

/**
 * Sur le chemin initiateur, `initiatorKeyAgreement` ne lit du gestionnaire de
 * clés que ce que l'initiateur publie de LUI-MÊME — sa clé d'identité publique
 * et son identifiant d'enregistrement — et seulement APRÈS avoir statué sur
 * l'authenticité du paquet. Un paquet rejeté ne doit donc jamais l'atteindre.
 *
 * L'identifiant est lu ici depuis le gestionnaire, et non depuis le paquet,
 * parce que les deux bouts doivent lier le MÊME entier dans leur HKDF ; le
 * témoin de cette symétrie vit dans `dma-x3dh-derivation-symmetry.test.ts`.
 */
const initiatorKeyManager = (identityPublicKey: Buffer): SignalKeyManager =>
  ({
    getIdentityPublicKey: () => identityPublicKey,
    getRegistrationId: () => 12345,
  }) as unknown as SignalKeyManager;

const makeX3DH = (identityPublicKey: Buffer): X3DHKeyAgreement =>
  new X3DHKeyAgreement(initiatorKeyManager(identityPublicKey), {} as unknown as PrismaClient);

describe("X3DH — la pré-clé signée est confrontée à la clé d'identité", () => {
  it('ACCEPTE le paquet que le producteur réel fabrique', async () => {
    const responderIdentity = generateKeyPair();
    const initiator = generateKeyPair();
    const signedPreKey = await producedSignedPreKey(responderIdentity);

    const bundle: PreKeyBundle = {
      identityKey: responderIdentity.publicKey,
      signedPreKey,
      registrationId: 42,
    };

    const result = await makeX3DH(initiator.publicKey).initiatorKeyAgreement(
      bundle,
      initiator.privateKey
    );

    expect(result.rootKey).toHaveLength(32);
    expect(result.signedPreKeyId).toBe(signedPreKey.id);
  });

  it('REJETTE une pré-clé signée SUBSTITUÉE (la signature couvre une autre clé)', async () => {
    const responderIdentity = generateKeyPair();
    const initiator = generateKeyPair();
    const authentic = await producedSignedPreKey(responderIdentity);
    const attackerControlled = generateKeyPair();

    const bundle: PreKeyBundle = {
      identityKey: responderIdentity.publicKey,
      // La signature reste celle, valide, de la VRAIE pré-clé signée ; seule la
      // clé publique est remplacée par une dont l'attaquant tient la moitié privée.
      signedPreKey: { ...authentic, publicKey: attackerControlled.publicKey },
      registrationId: 42,
    };

    await expect(
      makeX3DH(initiator.publicKey).initiatorKeyAgreement(bundle, initiator.privateKey)
    ).rejects.toThrow(X3DHSignedPreKeyRejected);
  });

  it("REJETTE une signature produite par une AUTRE clé d'identité", async () => {
    const responderIdentity = generateKeyPair();
    const impostor = generateKeyPair();
    const initiator = generateKeyPair();

    const bundle: PreKeyBundle = {
      identityKey: responderIdentity.publicKey,
      signedPreKey: await producedSignedPreKey(impostor),
      registrationId: 42,
    };

    await expect(
      makeX3DH(initiator.publicKey).initiatorKeyAgreement(bundle, initiator.privateKey)
    ).rejects.toThrow(X3DHSignedPreKeyRejected);
  });

  it('REJETTE une signature RETIRÉE — le retrait est plus facile que la forgerie', async () => {
    const responderIdentity = generateKeyPair();
    const initiator = generateKeyPair();
    const authentic = await producedSignedPreKey(responderIdentity);

    const bundle: PreKeyBundle = {
      identityKey: responderIdentity.publicKey,
      signedPreKey: { ...authentic, signature: Buffer.alloc(0) },
      registrationId: 42,
    };

    await expect(
      makeX3DH(initiator.publicKey).initiatorKeyAgreement(bundle, initiator.privateKey)
    ).rejects.toThrow(X3DHSignedPreKeyRejected);
  });

  it("REJETTE un paquet dont la clé d'identité est ILLISIBLE, sans laisser fuir l'exception d'OpenSSL", async () => {
    const responderIdentity = generateKeyPair();
    const initiator = generateKeyPair();
    const authentic = await producedSignedPreKey(responderIdentity);

    const bundle: PreKeyBundle = {
      identityKey: Buffer.from('ceci n’est pas une clé'),
      signedPreKey: authentic,
      registrationId: 42,
    };

    await expect(
      makeX3DH(initiator.publicKey).initiatorKeyAgreement(bundle, initiator.privateKey)
    ).rejects.toThrow(X3DHSignedPreKeyRejected);
  });

  it("statue AVANT toute opération DH — un paquet rejeté ne dérive aucun secret", async () => {
    const responderIdentity = generateKeyPair();
    const impostor = generateKeyPair();
    const initiator = generateKeyPair();
    const x3dh = makeX3DH(initiator.publicKey);

    const bundle: PreKeyBundle = {
      identityKey: responderIdentity.publicKey,
      signedPreKey: await producedSignedPreKey(impostor),
      preKey: { id: 7, publicKey: generateKeyPair().publicKey },
      registrationId: 42,
    };

    await expect(
      x3dh.initiatorKeyAgreement(bundle, initiator.privateKey)
    ).rejects.toThrow(X3DHSignedPreKeyRejected);

    const stats = x3dh.getStatistics();
    expect(stats.dhOperationsPerformed).toBe(0);
    expect(stats.initiatorSessions).toBe(0);
    expect(stats.signedPreKeysRejected).toBe(1);
  });

  it('compte séparément les paquets VÉRIFIÉS et les paquets REJETÉS', async () => {
    const responderIdentity = generateKeyPair();
    const initiator = generateKeyPair();
    const x3dh = makeX3DH(initiator.publicKey);

    await x3dh.initiatorKeyAgreement(
      {
        identityKey: responderIdentity.publicKey,
        signedPreKey: await producedSignedPreKey(responderIdentity),
        registrationId: 1,
      },
      initiator.privateKey
    );

    expect(x3dh.getStatistics()).toMatchObject({
      signedPreKeysVerified: 1,
      signedPreKeysRejected: 0,
      initiatorSessions: 1,
    });
  });
});

describe("SignalProtocolAdapter — la signature voyage jusqu'au vérificateur", () => {
  const makeAdapter = (): SignalProtocolAdapter =>
    new SignalProtocolAdapter({} as unknown as PrismaClient, crypto.randomBytes(32));

  it("rend la clé éphémère PUBLIQUE — sans elle le pair ne peut rien dériver", async () => {
    const responderIdentity = generateKeyPair();
    const initiator = generateKeyPair();
    const signedPreKey = await producedSignedPreKey(responderIdentity);
    const adapter = makeAdapter();
    adapter.setUserId('507f1f77bcf86cd799439011');
    (
      adapter as unknown as { keyManager: { identityKeyPair?: KeyPair } }
    ).keyManager.identityKeyPair = initiator;

    const result = await adapter.performX3DH({
      ourIdentityPrivate: initiator.privateKey,
      theirIdentityPublic: responderIdentity.publicKey,
      theirSignedPreKeyPublic: signedPreKey.publicKey,
      theirSignedPreKeySignature: signedPreKey.signature,
    });

    expect(result.rootKey).toHaveLength(32);
    expect(crypto.createPublicKey({ key: result.ourEphemeralPublic, format: 'der', type: 'spki' })).
      toBeDefined();
  });

  it('REJETTE le paquet que sa signature ne rattache pas à la clé d’identité annoncée', async () => {
    const responderIdentity = generateKeyPair();
    const impostor = generateKeyPair();
    const initiator = generateKeyPair();
    const signedPreKey = await producedSignedPreKey(impostor);
    const adapter = makeAdapter();
    (
      adapter as unknown as { keyManager: { identityKeyPair?: KeyPair } }
    ).keyManager.identityKeyPair = initiator;

    await expect(
      adapter.performX3DH({
        ourIdentityPrivate: initiator.privateKey,
        theirIdentityPublic: responderIdentity.publicKey,
        theirSignedPreKeyPublic: signedPreKey.publicKey,
        theirSignedPreKeySignature: signedPreKey.signature,
      })
    ).rejects.toThrow(X3DHSignedPreKeyRejected);
  });
});

describe('SignalProtocolEngine — une signature RETIRÉE n’est pas une signature absente', () => {
  /**
   * `decryptMessage` étape 2 n'est atteignable qu'une fois la session de ratchet
   * établie, ce qui passe par un accord X3DH répondeur — donc par Mongo. La
   * session est donc posée directement ; ce qui est mesuré ensuite est bien la
   * décision de la production sur la signature.
   */
  const engineWithSession = (senderId: string): SignalProtocolEngine => {
    const engine = new SignalProtocolEngine({} as unknown as PrismaClient);
    const ratchet = new DoubleRatchet();
    const session = ratchet.initializeSession(
      crypto.randomBytes(32),
      crypto.randomBytes(32),
      crypto.randomBytes(32)
    );
    const internals = engine as unknown as {
      doubleRatchet?: DoubleRatchet;
      ratchetSessions: Map<string, DoubleRatchetSession>;
    };
    internals.doubleRatchet = ratchet;
    internals.ratchetSessions.set(senderId, session);
    return engine;
  };

  const strippedMessage = () => ({
    version: 3,
    ephemeralPublicKey: generateKeyPair().publicKey,
    iv: crypto.randomBytes(12),
    ciphertext: crypto.randomBytes(24),
    authenticationTag: crypto.randomBytes(16),
    signature: Buffer.alloc(0),
    messageNumber: 0,
    previousChainLength: 0,
  });

  it("REJETTE un message dont la signature a été retirée quand la clé d'identité de l'expéditeur est connue", async () => {
    const sender = generateKeyPair();

    await expect(
      engineWithSession('peer').decryptMessage(strippedMessage(), 'peer', sender.publicKey)
    ).rejects.toThrow(/signature/i);
  });

  it("laisse passer l'étape de signature quand aucune clé d'identité n'est fournie", async () => {
    // Sans clé d'identité, le moteur n'a RIEN à vérifier : le message poursuit
    // jusqu'au ratchet, où il échoue pour une raison qui n'est pas la signature.
    const raised = await engineWithSession('peer')
      .decryptMessage(strippedMessage(), 'peer')
      .then(() => null)
      .catch((error: unknown) => error);

    expect(raised).not.toBeNull();
    expect(String((raised as Error)?.message ?? raised)).not.toMatch(/signature/i);
  });
});
