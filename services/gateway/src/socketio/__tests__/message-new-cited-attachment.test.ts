/**
 * #6164 — LA PIÈCE NOMMÉE VOYAGE AUSSI SUR LE FIL TEMPS RÉEL.
 *
 * La route REST d'envoi ACCEPTE et GRAVE `attachmentReplyTo`, la liste REST le
 * SERT, iOS le LIT — et le producteur `message:new` appelait
 * `servedQuotedMessage(message.replyTo)` sans options, dix lignes au-dessus du
 * hoist de `metadata.sticker` qui prouve qu'il tient `message.metadata` sous la
 * main. La bulle temps réel désignait donc le média REPRÉSENTATIF pendant que
 * le même fil rechargé par REST désignait la pièce NOMMÉE : la citation SAUTE
 * de la vignette 3 à la vignette 1 au premier rafraîchissement — exactement le
 * saut que le lot disait vouloir éviter.
 *
 * **Le RANG est load-bearing** (leçon 261) : la citation vise la TROISIÈME
 * pièce d'un message qui en porte cinq. Écrit sur la première, le témoin ne
 * pourrait pas tomber — le court-circuit « la première » et la règle juste
 * « celle qu'on a nommée » y rendent le même verdict.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { buildMessageNewPayload } from '../messageNewPayload';

const MESSAGE_CITE = '507f1f77bcf86cd799439000';
const piece = (rang: number) => ({
  id: `507f1f77bcf86cd79943900${rang}`,
  messageId: MESSAGE_CITE,
  mimeType: 'image/jpeg',
  fileUrl: `https://cdn/piece-${rang}.jpg`,
  thumbnailUrl: `https://cdn/piece-${rang}-thumb.jpg`,
});

const CINQ_PIECES = [piece(1), piece(2), piece(3), piece(4), piece(5)];
const TROISIEME = CINQ_PIECES[2].id;

const messageCite = {
  id: MESSAGE_CITE,
  content: 'regarde ces cinq photos',
  messageType: 'image',
  attachments: CINQ_PIECES,
};

/** Le message QUI CITE : c'est son `metadata` qui porte l'instantané figé. */
const messageCitant = (metadata: unknown) => ({
  id: '507f1f77bcf86cd799439100',
  conversationId: '507f1f77bcf86cd799439200',
  senderId: '507f1f77bcf86cd799439300',
  content: 'oui, celle-là',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: new Date('2026-09-15T10:00:00.000Z'),
  updatedAt: new Date('2026-09-15T10:00:00.000Z'),
  replyToId: MESSAGE_CITE,
  replyTo: messageCite,
  metadata,
});

const servedReplyTo = (metadata: unknown): Record<string, unknown> => {
  const message = messageCitant(metadata);
  const payload = buildMessageNewPayload(message as never, {
    conversationId: message.conversationId,
    translations: [],
    attachments: [],
    replyTo: messageCite,
  });
  return payload.replyTo as Record<string, unknown>;
};

describe('message:new — la citation nomme sa pièce (#6164)', () => {
  it('porte l’instantané de la TROISIÈME pièce, jamais celui de la première', () => {
    const replyTo = servedReplyTo({
      attachmentReplyTo: { attachmentId: TROISIEME, kind: 'image' },
    });

    expect(replyTo['attachmentReplyTo']).toEqual({ attachmentId: TROISIEME, kind: 'image' });
    expect((replyTo['attachmentReplyTo'] as Record<string, unknown>)['attachmentId'])
      .not.toBe(CINQ_PIECES[0].id);
  });

  it('lit l’instantané sur le message QUI CITE, jamais sur le message CITÉ', () => {
    const citeVisantAutreChose = {
      ...messageCite,
      metadata: { attachmentReplyTo: { attachmentId: CINQ_PIECES[0].id, kind: 'image' } },
    };
    const message = { ...messageCitant({ attachmentReplyTo: { attachmentId: TROISIEME, kind: 'image' } }), replyTo: citeVisantAutreChose };
    const payload = buildMessageNewPayload(message as never, {
      conversationId: message.conversationId,
      translations: [],
      attachments: [],
      replyTo: citeVisantAutreChose,
    });

    expect((payload.replyTo as Record<string, unknown>)['attachmentReplyTo'])
      .toEqual({ attachmentId: TROISIEME, kind: 'image' });
  });

  it('sert la vignette de la pièce nommée à côté de son ancre — l’icône et l’ouverture désignent la même', () => {
    const replyTo = servedReplyTo({
      attachmentReplyTo: { attachmentId: TROISIEME, kind: 'image' },
    });
    const pieces = replyTo['attachments'] as Record<string, unknown>[];

    expect(pieces.find((p) => p['id'] === TROISIEME)?.['thumbnailUrl'])
      .toBe('https://cdn/piece-3-thumb.jpg');
  });

  it('sans instantané, la citation retombe sur le représentatif — aucune bulle existante ne change', () => {
    expect(servedReplyTo({ sticker: { id: 's1' } })['attachmentReplyTo']).toBeUndefined();
    expect(servedReplyTo(null)['attachmentReplyTo']).toBeUndefined();
  });

  it('refuse un instantané malformé plutôt que de le répandre tel quel', () => {
    expect(servedReplyTo({ attachmentReplyTo: { attachmentId: '  ' } })['attachmentReplyTo'])
      .toBeUndefined();
    expect(servedReplyTo({ attachmentReplyTo: { attachmentId: TROISIEME, kind: 'hologramme' } })['attachmentReplyTo'])
      .toBeUndefined();
  });
});
