/**
 * DMA Double Ratchet — le ratchet asymétrique CROISE les chaînes
 *
 * Même famille que `dma-x3dh-derivation-symmetry.test.ts` (cycle 97) et
 * `dma-session-roundtrip.test.ts` (cycle 98) : deux moitiés d'un protocole
 * peuvent être cohérentes séparément et fausses l'une contre l'autre.
 * `DoubleRatchet.test.ts` exerce le ratchet sur UNE session — et une session
 * seule est toujours cohérente avec elle-même. Il faut deux sessions qui se
 * répondent pour qu'un désaccord d'orientation apparaisse.
 *
 * Le point gardé ici : les deux bouts tirent le MÊME bloc de 96 octets du même
 * Diffie-Hellman, donc la seule chose qui puisse rendre l'émission de l'un égale
 * à la réception de l'autre est le CROISEMENT. Sans lui, les deux prennent la
 * même moitié dans le même rôle.
 *
 * Les affirmations sont séparées : la clé racine d'abord (elle atteste que le DH
 * et le KDF s'accordent), l'orientation ensuite (elle atteste du croisement).
 * Un seul `expect` sur la chaîne laisserait confondre les deux causes.
 *
 * @see services/gateway/src/dma-interoperability/signal-protocol/DoubleRatchet.ts
 */

import * as crypto from 'crypto';
import { DoubleRatchet } from '../../dma-interoperability/signal-protocol/DoubleRatchet';

const generateKeyPair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return { publicKey: publicKey as Buffer, privateKey: privateKey as Buffer };
};

/**
 * Deux sessions issues du MÊME accord initial, disposées comme X3DH les livre :
 * la chaîne d'émission de l'un est la chaîne de réception de l'autre.
 */
const pairedSessions = (ratchet: DoubleRatchet) => {
  const rootKey = crypto.randomBytes(32);
  const chainA = crypto.randomBytes(32);
  const chainB = crypto.randomBytes(32);
  const responderPair = generateKeyPair();

  const initiator = ratchet.initializeSession(
    Buffer.from(rootKey),
    Buffer.from(chainA),
    Buffer.from(chainB)
  );
  initiator.dhRatchetKeyRemote = responderPair.publicKey;

  const responder = ratchet.initializeSession(
    Buffer.from(rootKey),
    Buffer.from(chainB),
    Buffer.from(chainA),
    responderPair
  );

  return { initiator, responder };
};

describe('DMA Double Ratchet — symétrie du ratchet asymétrique', () => {
  it('fait converger la clé racine des deux côtés', () => {
    const ratchet = new DoubleRatchet();
    const { initiator, responder } = pairedSessions(ratchet);

    ratchet.asymmetricRatchet(initiator);
    ratchet.asymmetricRatchet(responder, initiator.dhRatchetKeyPair!.publicKey);

    // Le Diffie-Hellman est bien disposé : les deux bouts partent de moitiés
    // différentes et arrivent au même secret, donc à la même clé racine.
    expect(responder.rootKey.equals(initiator.rootKey)).toBe(true);
  });

  it('CROISE les chaînes : l\'émission de l\'un est la réception de l\'autre', () => {
    const ratchet = new DoubleRatchet();
    const { initiator, responder } = pairedSessions(ratchet);

    ratchet.asymmetricRatchet(initiator);
    ratchet.asymmetricRatchet(responder, initiator.dhRatchetKeyPair!.publicKey);

    expect(responder.chainKeyReceive.equals(initiator.chainKeySend)).toBe(true);
    expect(responder.chainKeySend.equals(initiator.chainKeyReceive)).toBe(true);
  });

  it('ne laisse JAMAIS les deux bouts sur la même moitié du bloc dérivé', () => {
    const ratchet = new DoubleRatchet();
    const { initiator, responder } = pairedSessions(ratchet);

    ratchet.asymmetricRatchet(initiator);
    ratchet.asymmetricRatchet(responder, initiator.dhRatchetKeyPair!.publicKey);

    // C'est la forme EXACTE du défaut : sans croisement les deux sessions
    // prennent `okm[32:64]` en émission, et se ressemblent au lieu de se
    // répondre. L'affirmation est écrite en négatif parce que c'est ainsi que le
    // défaut se présentait — vert sur chaque session prise seule.
    expect(responder.chainKeySend.equals(initiator.chainKeySend)).toBe(false);
  });

  it('dérive la MÊME clé de message de part et d\'autre après un ratchet', () => {
    const ratchet = new DoubleRatchet();
    const { initiator, responder } = pairedSessions(ratchet);

    ratchet.asymmetricRatchet(initiator);
    ratchet.asymmetricRatchet(responder, initiator.dhRatchetKeyPair!.publicKey);

    // La conséquence utile du croisement : ce que l'émetteur chiffre, le
    // récepteur peut le déchiffrer.
    const sent = ratchet.getMessageKeySend(initiator);
    const received = ratchet.getMessageKeyReceive(responder, sent.messageNumber);

    expect(received).not.toBeNull();
    expect(received!.key.equals(sent.key)).toBe(true);
  });
});
