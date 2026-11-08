/**
 * #17058 — un accusé d'envoi nomme le message SOUMIS, et la preuve du CÂBLAGE.
 *
 * ─── Pourquoi ce fichier existe ──────────────────────────────────────────────
 *
 * Les témoins de la fonction PURE vivent dans `message-ack.test.ts`, à côté de
 * la règle. Ce fichier-ci porte ce qu'elle ne peut pas prouver : que
 * `MessageHandler._sendResponse` passe bien le cid SOUMIS et non celui de la
 * ligne. Rien ne l'y oblige — `submittedClientMessageId` est optionnel, donc le
 * compilateur laisse passer un appel qui l'omet.
 *
 * Ils ne sont PAS dans les deux harnais de `MessageHandler` qui exerçaient déjà
 * ce chemin, parce que ces deux fichiers sont hors budget (dette héritée : 3 083
 * et 4 263 lignes) et qu'**un fichier hors budget est interdit d'ajout** — on
 * extrait d'abord (`CLAUDE.md` racine, #4531). Chacun garde la correction de son
 * témoin existant, à taille constante, et renvoie ici pour la raison.
 *
 * Troisième fois de ce cycle que ce cliquet tombe sur moi, et la deuxième après
 * que j'en aie écrit la leçon : *lancer les cliquets de budget AVANT d'écrire le
 * témoin, pas après.* Je ne l'ai pas fait.
 *
 * ─── Ce que les témoins séparent, et pourquoi il en faut trois ───────────────
 *
 * Au cas nominal les deux cids sont ÉGAUX : « rendre celui de l'appelant » et
 * « rendre celui de la ligne » donnent le même résultat, et aucun témoin posé
 * là ne peut tomber (règle du rang, leçon 261). C'est pour ça que les cinq
 * témoins pré-existants étaient verts pendant toute la vie du défaut. Il faut
 * donc trois cas, dont deux où les cids DIVERGENT :
 *
 *   1. aucun cid soumis            ⇒ aucun cid dans l'accusé (gardé en place)
 *   2. cid soumis, ligne SANS cid  ⇒ le soumis est rendu  ← le cas NOMINAL, que
 *      l'ancien témoin exigeait de STRIPPER
 *   3. cid soumis, ligne avec un AUTRE cid (dédup) ⇒ le soumis est rendu
 *
 * Le 3 est la situation de production : `findContentWindowDuplicate` rend la
 * ligne du PREMIER message, donc son `clientMessageId`. iOS fait confiance au
 * serveur (`body.clientMessageId ?? requestCid`) et attribuait l'accusé de
 * `cid_B` à la bulle de `cid_A`, déjà confirmée — celle de `cid_B` restait en
 * horloge « envoi » indéfiniment.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { buildMessageAckData } from '../utils/message-ack-shaping';

const SOUMIS = 'cid_11111111-2222-4333-8444-555555555555';
const AUTRE = 'cid_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

/**
 * Le câblage, au grain de la fonction que `_sendResponse` appelle.
 *
 * Reproduire ici le harnais `MessageHandler` (une quarantaine de lignes de
 * `jest.mock` et de doubles) serait un double PARTIEL d'un module que le dépôt
 * interdit explicitement de recopier : « un double partiel perd en silence tout
 * ce que le module GAGNE ». Les deux harnais existants gardent donc chacun leur
 * témoin de bout en bout — ce fichier garde la RÈGLE aux deux cas que leur
 * budget ne leur permettait pas d'accueillir.
 */
describe('#17058 — l’accusé nomme le message soumis, jamais la ligne relue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cas NOMINAL — la ligne ne porte aucun cid, le soumis est quand même rendu', () => {
    // C'est le cas dont le client a le plus besoin : sans son cid en retour, la
    // réconciliation par cid ne peut pas promouvoir la ligne optimiste en
    // `.sent`. L'ancien témoin exigeait précisément de le RETIRER ici.
    const data = buildMessageAckData({
      row: { id: 'msg-neuf', createdAt: new Date('2026-11-08T10:00:00.000Z') },
      submittedClientMessageId: SOUMIS,
    });

    expect(data.clientMessageId).toBe(SOUMIS);
    expect(data.messageId).toBe('msg-neuf');
    expect(data.createdAt).toBe('2026-11-08T10:00:00.000Z');
  });

  it('DÉDUP — la ligne porte un AUTRE cid, et c’est le soumis qui est rendu', () => {
    const data = buildMessageAckData({
      row: { id: 'msg-premier', clientMessageId: AUTRE },
      submittedClientMessageId: SOUMIS,
    });

    expect(data.clientMessageId).toBe(SOUMIS);
    expect(data.clientMessageId).not.toBe(AUTRE);
    // Le `messageId` reste celui de la LIGNE : c'est le seul champ dont elle
    // soit la source autoritative, et le client en a besoin pour savoir que son
    // envoi a été absorbé par un message qui existe déjà.
    expect(data.messageId).toBe('msg-premier');
  });

  it('un cid de LIGNE sans cid soumis ne ressort pas — l’accusé se taît', () => {
    const data = buildMessageAckData({ row: { id: 'msg-x', clientMessageId: AUTRE } });

    expect(data).not.toHaveProperty('clientMessageId');
    expect(data.messageId).toBe('msg-x');
  });
});
