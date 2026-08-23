/**
 * @jest-environment node
 *
 * La liste EXPLICITE de mentionnés du chemin d'envoi SOCKET — le jumeau de celle
 * que `POST /messages` déclare et honore depuis toujours.
 *
 * **Ce que ces témoins gardent, et pourquoi ils sont nés rouges.**
 *
 * Le compositeur web retient qui l'utilisateur a nommé et pose la liste sur le
 * fil (`useMentions` → `getMentionedUserIds()` → `messageData.mentionedUserIds`).
 * `SocketMessageSendSchema` ne la déclarait pas, et `z.object` STRIPPE en
 * silence tout champ non déclaré.
 *
 * Le cycle 110 avait mesuré cet écart et l'avait classé « consistance, pas
 * perte » : quand la liste explicite est vide, `computeValidatedMentions`
 * retombe sur l'extraction des `@username` du CONTENU, que le web envoie aussi.
 * Le repli existe bien — et sa précondition tombe précisément sur le mode où il
 * serait le seul recours :
 *
 * - en clair, `server` ou `hybrid`, `content` porte le texte, `@alice` compris.
 *   L'extraction retrouve tout : rien n'est perdu ;
 * - en **`e2ee`**, le client remplace `content` par le littéral `[Encrypted]`
 *   AVANT d'émettre. Il n'y a plus aucun `@` à extraire, et la liste explicite —
 *   seul canal restant — était celle que le schéma retirait. Nommer quelqu'un
 *   dans une conversation chiffrée ne produisait ni ligne `Mention`, ni
 *   `validatedMentions`, ni notification.
 *
 * Le dernier témoin est le NÉGATIF de cette mesure : il fige le fait que le
 * contenu chiffré ne porte aucun `@`, c'est-à-dire la raison exacte pour
 * laquelle le repli ne peut rien y rattraper.
 */

import { describe, it, expect } from '@jest/globals';

import {
  SocketMessageSendSchema,
  SocketMessageSendWithAttachmentsSchema,
} from '../../../validation/socket-event-schemas.js';

const VALID_MONGO_ID = '507f1f77bcf86cd799439011';
const OTHER_MONGO_ID = '507f1f77bcf86cd799439012';
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
])('%s — liste explicite de mentionnés', (_name, schema, base) => {
  it('conserve la liste que le compositeur a posée sur le fil', () => {
    const result = schema.safeParse({
      ...base,
      mentionedUserIds: [VALID_MONGO_ID, OTHER_MONGO_ID],
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.mentionedUserIds).toEqual([VALID_MONGO_ID, OTHER_MONGO_ID]);
  });

  it('laisse passer un envoi qui ne nomme personne', () => {
    const result = schema.safeParse({ ...base, content: 'Bonjour' });

    expect(result.success).toBe(true);
    expect(result.success && result.data.mentionedUserIds).toBeUndefined();
  });

  it('refuse une liste qui n’est pas un tableau de chaînes', () => {
    const result = schema.safeParse({ ...base, mentionedUserIds: [42] });

    expect(result.success).toBe(false);
  });

  // Le négatif de la mesure : la raison pour laquelle l'extraction depuis le
  // contenu ne peut RIEN rattraper sur ce mode. Si un jour le client cessait de
  // remplacer `content`, ce témoin tomberait — et c'est ce qu'on veut : la
  // conclusion du lot dépend de ce littéral.
  it('la charge e2ee ne porte aucun `@` — le repli par extraction est vide', () => {
    const result = schema.safeParse({
      ...base,
      encryptedContent: 'Y2lwaGVydGV4dA==',
      encryptionMode: 'e2ee',
      mentionedUserIds: [OTHER_MONGO_ID],
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.content).not.toContain('@');
    expect(result.success && result.data.mentionedUserIds).toEqual([OTHER_MONGO_ID]);
  });
});
