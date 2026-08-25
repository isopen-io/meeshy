/**
 * DMA Double Ratchet — sauter des clés avance la CHAÎNE sans avancer le COMPTEUR
 *
 * `skipMessageThroughReceive` (le ratchet symétrique de réception) lit
 * `session.messageNumberReceive` pour ÉTIQUETER la clé qu'il rend et pour décider
 * si le message suivant est « attendu », « en avance » ou « en retard »
 * (`getMessageKeyReceive`). Or `skipMessageKeys` fait progresser la clé de chaîne
 * de `messageNumberReceive` jusqu'à `until` en n'incrémentant qu'une variable
 * LOCALE — il ne réécrit jamais le compteur de session. Après un seul message
 * reçu EN AVANCE, la position de la chaîne (`until + 1`) et le compteur
 * (`ancien + 1`) DIVERGENT.
 *
 * Conséquence en production (`SignalProtocolEngine.decryptMessage`, qui persiste
 * la session juste après) : le message reçu en avance est étiqueté du MAUVAIS
 * numéro, et le message suivant reçu DANS L'ORDRE retombe dans la branche « en
 * avance » — il re-saute depuis un compteur périmé, dérivant des clés à partir
 * d'une chaîne déjà avancée, et le déchiffrement GCM échoue. Un seul message
 * hors ordre corrompt donc tout le reste de la session de réception.
 *
 * Le point gardé : la CHAÎNE et le COMPTEUR de réception avancent ENSEMBLE. Un
 * seul `getMessageKeyReceive` en avance suffit à le mettre à l'épreuve — une
 * session seule, sans pair, comme le veut la nature du défaut (le compteur est
 * un état LOCAL, pas un accord de paire).
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

const freshSession = (dr: DoubleRatchet) =>
  dr.initializeSession(
    crypto.randomBytes(32),
    crypto.randomBytes(32),
    crypto.randomBytes(32),
    generateKeyPair()
  );

describe('DoubleRatchet — compteur de réception après saut', () => {
  it('étiquette le message reçu en avance de son PROPRE numéro', () => {
    const dr = new DoubleRatchet();
    const session = freshSession(dr);

    // Attendu 0, reçu 3 : trois clés sautées (0, 1, 2), la 3 rendue.
    const messageKey = dr.getMessageKeyReceive(session, 3);

    expect(messageKey).not.toBeNull();
    expect(messageKey?.messageNumber).toBe(3);
  });

  it('avance le compteur de session à la position de la chaîne', () => {
    const dr = new DoubleRatchet();
    const session = freshSession(dr);

    dr.getMessageKeyReceive(session, 3);

    // La chaîne est en position 4 (0..3 consommés) ; le compteur doit suivre.
    expect(session.messageNumberReceive).toBe(4);
  });

  it('déchiffre le message DANS L\'ORDRE qui suit un message reçu en avance', () => {
    const dr = new DoubleRatchet();
    const session = freshSession(dr);

    dr.getMessageKeyReceive(session, 3);

    // Le message #4 arrive maintenant dans l'ordre : il doit être ATTENDU
    // (branche `messageNumber === expected`), pas re-sauté.
    const next = dr.getMessageKeyReceive(session, 4);

    expect(next).not.toBeNull();
    expect(next?.messageNumber).toBe(4);
    expect(session.messageNumberReceive).toBe(5);
    // Aucune clé nouvelle sautée pour un message dans l'ordre.
    expect(session.skippedMessageKeys.length).toBe(3);
  });

  it('avance le compteur d\'ÉMISSION quand on saute côté envoi', () => {
    const dr = new DoubleRatchet();
    const session = freshSession(dr);

    dr.skipMessageKeys(session, 2, 'send');

    expect(session.messageNumberSend).toBe(2);
  });
});
