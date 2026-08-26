/**
 * DMA Signal Protocol — les deux bouts de X3DH dérivent les MÊMES clés
 *
 * X3DH ne vaut que par sa SYMÉTRIE : les quatre Diffie-Hellman sont disposés de
 * façon que l'initiateur et le répondeur, partant de moitiés différentes,
 * arrivent au même secret. Ce secret n'est jamais utilisé tel quel — il traverse
 * un HKDF qui en tire la clé racine et les deux clés de chaîne. La symétrie doit
 * donc tenir SUR TOUTE LA LONGUEUR : un secret partagé identique suivi d'un HKDF
 * divergent ne produit pas une session dégradée, il produit deux sessions
 * étrangères l'une à l'autre.
 *
 * Ce que ce fichier garde est précisément la jointure que les témoins d'à côté
 * ne pouvaient pas voir : `X3DHKeyAgreement.test.ts` exerce chaque côté SEUL, et
 * un côté seul est toujours cohérent avec lui-même. Il faut confronter les deux
 * PRODUCTIONS réelles pour qu'un désaccord apparaisse.
 *
 * Le premier témoin sépare volontairement les deux affirmations — « le secret
 * partagé coïncide » puis « les clés dérivées coïncident ». Cette séparation est
 * le diagnostic : elle localise une panne dans le HKDF plutôt que dans les DH,
 * là où un unique `expect` sur la clé racine laisserait chercher partout.
 *
 * @see services/gateway/src/dma-interoperability/signal-protocol/X3DHKeyAgreement.ts
 */

import * as crypto from 'crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  X3DHKeyAgreement,
  type PreKeyBundle,
} from '../../dma-interoperability/signal-protocol/X3DHKeyAgreement';
import {
  SignalKeyManager,
  type SignedPreKey,
} from '../../dma-interoperability/signal-protocol/SignalKeyManager';

type KeyPair = { publicKey: Buffer; privateKey: Buffer };

/**
 * Les deux identifiants d'enregistrement sont DIFFÉRENTS, comme ils le sont en
 * production : `SignalKeyManager` en tire un par identité (`randomInt(1, 16383)`).
 * Les faire coïncider dans un témoin masquerait exactement ce qu'il garde.
 */
const ALICE_REGISTRATION_ID = 12345;
const BOB_REGISTRATION_ID = 777;

const generateKeyPair = (): KeyPair => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return { publicKey: publicKey as Buffer, privateKey: privateKey as Buffer };
};

/**
 * La pré-clé signée sort du PRODUCTEUR réel, avec sa moitié privée : le
 * répondeur en a besoin pour ses propres DH, et la signature doit franchir la
 * vérification d'authenticité de l'initiateur (cycle 96) sans être recopiée ici.
 */
const producedSignedPreKey = async (identity: KeyPair): Promise<SignedPreKey> => {
  const prismaDouble = {
    signalPreKeyBundle: { update: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient;

  const keyManager = new SignalKeyManager(prismaDouble, crypto.randomBytes(32));
  keyManager.setUserId('507f1f77bcf86cd799439011');
  (keyManager as unknown as { identityKeyPair?: KeyPair }).identityKeyPair = identity;

  return keyManager.generateAndStoreSignedPreKey();
};

/**
 * Côté initiateur, l'accord ne lit du gestionnaire que sa propre clé d'identité
 * publique et son propre identifiant d'enregistrement — les deux moitiés de ce
 * qu'Alice publie d'elle-même.
 */
const aliceX3DH = (alice: KeyPair): X3DHKeyAgreement =>
  new X3DHKeyAgreement(
    {
      getIdentityPublicKey: () => alice.publicKey,
      getRegistrationId: () => ALICE_REGISTRATION_ID,
    } as unknown as SignalKeyManager,
    {} as unknown as PrismaClient
  );

/**
 * Côté répondeur, l'accord lit les moitiés PRIVÉES de Bob.
 */
const bobX3DH = (
  bob: KeyPair,
  signedPreKey: SignedPreKey,
  oneTimePreKey?: KeyPair
): X3DHKeyAgreement =>
  new X3DHKeyAgreement(
    {
      getIdentityKeyPair: async () => bob,
      getSignedPreKey: async () => signedPreKey,
      getPreKey: async () => oneTimePreKey ?? null,
      getRegistrationId: () => BOB_REGISTRATION_ID,
    } as unknown as SignalKeyManager,
    {} as unknown as PrismaClient
  );

const bundleOf = (
  bob: KeyPair,
  signedPreKey: SignedPreKey,
  oneTimePreKey?: KeyPair
): PreKeyBundle => ({
  identityKey: bob.publicKey,
  signedPreKey: {
    id: signedPreKey.id,
    publicKey: signedPreKey.publicKey,
    signature: signedPreKey.signature,
  },
  preKey: oneTimePreKey ? { id: 99, publicKey: oneTimePreKey.publicKey } : undefined,
  registrationId: BOB_REGISTRATION_ID,
});

describe('X3DH — la dérivation est symétrique de bout en bout', () => {
  it('le secret partagé coïncide (les quatre DH sont bien disposés)', async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const signedPreKey = await producedSignedPreKey(bob);

    const initiator = await aliceX3DH(alice).initiatorKeyAgreement(
      bundleOf(bob, signedPreKey),
      alice.privateKey
    );

    const responder = await bobX3DH(bob, signedPreKey).responderKeyAgreement(
      initiator.ephemeralKeyPair.publicKey,
      alice.publicKey,
      signedPreKey.id,
      undefined,
      ALICE_REGISTRATION_ID
    );

    expect(responder.sharedSecret.equals(initiator.sharedSecret)).toBe(true);
  });

  it('les clés DÉRIVÉES coïncident — clé racine et les deux chaînes croisées', async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const signedPreKey = await producedSignedPreKey(bob);

    const initiator = await aliceX3DH(alice).initiatorKeyAgreement(
      bundleOf(bob, signedPreKey),
      alice.privateKey
    );

    const responder = await bobX3DH(bob, signedPreKey).responderKeyAgreement(
      initiator.ephemeralKeyPair.publicKey,
      alice.publicKey,
      signedPreKey.id,
      undefined,
      ALICE_REGISTRATION_ID
    );

    expect(responder.rootKey.equals(initiator.rootKey)).toBe(true);
    // Ce qu'Alice envoie, Bob doit le recevoir — et réciproquement.
    expect(responder.chainKeyReceive.equals(initiator.chainKeySend)).toBe(true);
    expect(responder.chainKeySend.equals(initiator.chainKeyReceive)).toBe(true);
  });

  it('la symétrie tient aussi quand la pré-clé unique est consommée (DH4)', async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const signedPreKey = await producedSignedPreKey(bob);
    const oneTimePreKey = generateKeyPair();

    const initiator = await aliceX3DH(alice).initiatorKeyAgreement(
      bundleOf(bob, signedPreKey, oneTimePreKey),
      alice.privateKey
    );

    const responder = await bobX3DH(bob, signedPreKey, oneTimePreKey).responderKeyAgreement(
      initiator.ephemeralKeyPair.publicKey,
      alice.publicKey,
      signedPreKey.id,
      99,
      ALICE_REGISTRATION_ID
    );

    expect(initiator.preKeyUsed).toBe(99);
    expect(responder.sharedSecret.equals(initiator.sharedSecret)).toBe(true);
    expect(responder.rootKey.equals(initiator.rootKey)).toBe(true);
  });

  /**
   * L'identifiant lié au HKDF doit être celui de l'INITIATEUR. C'est le seul des
   * deux que les deux bouts peuvent connaître sans le tenir d'un canal hostile :
   * Alice le lit chez elle, Bob le lit dans l'inscription de l'expéditeur. Celui
   * de Bob, lui, ne voyage QUE dans le paquet de pré-clés — un champ que la
   * signature ne couvre PAS.
   *
   * D'où ce témoin : altérer `registrationId` dans le paquet ne doit rien
   * changer aux clés. Sinon l'annuaire tient un levier pour désaccorder deux
   * pairs sans jamais toucher à une signature.
   */
  it("un `registrationId` altéré dans le paquet ne déplace pas les clés dérivées", async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const signedPreKey = await producedSignedPreKey(bob);
    const ephemeralOverride = generateKeyPair();

    const agreeWith = async (registrationId: number) => {
      const x3dh = aliceX3DH(alice);
      // L'éphémère est fixé pour que la SEULE variable entre les deux accords
      // soit le champ altéré — sans quoi tout diffèrerait, et le témoin ne
      // prouverait rien.
      (x3dh as unknown as { generateEphemeralKeyPair: () => KeyPair }).generateEphemeralKeyPair =
        () => ephemeralOverride;

      return x3dh.initiatorKeyAgreement(
        { ...bundleOf(bob, signedPreKey), registrationId },
        alice.privateKey
      );
    };

    const honest = await agreeWith(BOB_REGISTRATION_ID);
    const tampered = await agreeWith(BOB_REGISTRATION_ID + 1);

    expect(tampered.rootKey.equals(honest.rootKey)).toBe(true);
  });

  /**
   * Fail-closed, dans la lignée du cycle 96 : quand le répondeur ignore
   * l'identifiant de l'initiateur, il ne peut PAS dériver les clés du pair. Les
   * dériver quand même contre un `0` de repli fabrique une session que rien ne
   * pourra jamais lire, et qui échouera bien plus tard sous les traits d'une
   * authentification GCM rompue — c'est-à-dire sous les traits d'une ATTAQUE.
   * Refuser tout de suite nomme la vraie cause.
   */
  it("REFUSE de dériver quand l'identifiant de l'initiateur manque", async () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const signedPreKey = await producedSignedPreKey(bob);

    const initiator = await aliceX3DH(alice).initiatorKeyAgreement(
      bundleOf(bob, signedPreKey),
      alice.privateKey
    );

    await expect(
      bobX3DH(bob, signedPreKey).responderKeyAgreement(
        initiator.ephemeralKeyPair.publicKey,
        alice.publicKey,
        signedPreKey.id,
        undefined,
        // Le paramètre est REQUIS au typage — c'est la première garde. Le cast
        // franchit délibérément cette garde-là pour exercer la seconde, celle qui
        // tient à l'exécution : la valeur vient d'une colonne
        // (`DMAEnrollment.registrationId`), et une colonne ne se type pas.
        undefined as unknown as number
      )
    ).rejects.toThrow(/identifiant d'enregistrement/i);
  });
});
