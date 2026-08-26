/**
 * @jest-environment node
 *
 * L'enveloppe de chiffrement du chemin d'envoi SOCKET — le jumeau de celle que
 * `POST /messages` valide depuis toujours.
 *
 * **Ce que ces témoins gardent, et pourquoi ils sont nés rouges.**
 *
 * Le client web chiffre AVANT d'émettre et pose sur le fil deux champs plats —
 * `encryptedContent` (le chiffré) et `encryptionMetadata` — exactement ceux que
 * la route REST déclare, valide (plafond 8 Ko) et refuse de rétrograder. Sur le
 * transport SOCKET, qui est pourtant le chemin PRIMAIRE d'envoi, ni l'un ni
 * l'autre n'était déclaré : `SocketMessageSendSchema` est un `z.object`, qui
 * STRIPPE en silence tout champ non déclaré (le fichier le documente déjà trois
 * fois pour `copyAttachmentsFromMessageId`, `isViewOnce` et consorts).
 *
 * Le chiffré n'atteignait donc JAMAIS la base :
 *
 * - en mode `e2ee`, le client remplace `content` par le littéral `[Encrypted]`
 *   avant d'émettre. Chiffré strippé + contenu remplacé = le message est perdu,
 *   et chaque destinataire lit la chaîne `[Encrypted]` ;
 * - dans l'autre mode, `content` reste le texte CLAIR. Chiffré strippé = le
 *   message est persisté EN CLAIR dans une conversation que l'utilisateur croit
 *   chiffrée. C'est précisément la rétrogradation que le `.refine()` de la route
 *   REST a été écrit pour interdire — sur la surface qui porte le trafic.
 *
 * Le plafond de 8 Ko est le jumeau exact de celui de la route REST : sans lui,
 * `encryptionMetadata` est le SEUL champ de l'envoi sans borne de taille, et il
 * est écrit tel quel dans MongoDB.
 */

import { describe, it, expect } from '@jest/globals';

import {
  SocketMessageSendSchema,
  SocketMessageSendWithAttachmentsSchema,
} from '../../../validation/socket-event-schemas.js';

const VALID_MONGO_ID = '507f1f77bcf86cd799439011';
const VALID_CLIENT_ID = 'cid_550e8400-e29b-41d4-a716-446655440000';

const textBase = {
  conversationId: VALID_MONGO_ID,
  content: '[Encrypted]',
  clientMessageId: VALID_CLIENT_ID,
};

const attachmentsBase = {
  conversationId: VALID_MONGO_ID,
  content: '[Encrypted]',
  clientMessageId: VALID_CLIENT_ID,
  attachmentIds: [VALID_MONGO_ID],
};

describe.each([
  ['SocketMessageSendSchema', SocketMessageSendSchema, textBase],
  ['SocketMessageSendWithAttachmentsSchema', SocketMessageSendWithAttachmentsSchema, attachmentsBase],
])('%s — enveloppe de chiffrement', (_name, schema, base) => {
  it('conserve le chiffré que le client a posé sur le fil', () => {
    const result = schema.safeParse({
      ...base,
      encryptedContent: 'Y2lwaGVydGV4dA==',
      encryptionMode: 'e2ee',
      encryptionMetadata: { algorithm: 'aes-256-gcm', iv: 'aXY=' },
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.encryptedContent).toBe('Y2lwaGVydGV4dA==');
    expect(result.success && result.data.encryptionMode).toBe('e2ee');
    expect(result.success && result.data.encryptionMetadata).toEqual({
      algorithm: 'aes-256-gcm',
      iv: 'aXY=',
    });
  });

  it('refuse un message DÉCLARÉ chiffré qui n’apporte pas son chiffré', () => {
    const result = schema.safeParse({ ...base, isEncrypted: true });

    expect(result.success).toBe(false);
  });

  it('accepte un message chiffré qui apporte son chiffré ET le déclare', () => {
    const result = schema.safeParse({
      ...base,
      isEncrypted: true,
      encryptedContent: 'Y2lwaGVydGV4dA==',
    });

    expect(result.success).toBe(true);
  });

  it('refuse une métadonnée de chiffrement au-delà de 8 Ko', () => {
    const result = schema.safeParse({
      ...base,
      encryptedContent: 'Y2lwaGVydGV4dA==',
      encryptionMetadata: { blob: 'a'.repeat(9000) },
    });

    expect(result.success).toBe(false);
  });

  it('laisse passer un message non chiffré, qui n’apporte aucun de ces champs', () => {
    const result = schema.safeParse({ ...base, content: 'Bonjour' });

    expect(result.success).toBe(true);
    expect(result.success && result.data.encryptedContent).toBeUndefined();
  });
});
