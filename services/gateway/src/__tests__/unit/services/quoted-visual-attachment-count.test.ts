/**
 * #9915 — LA CITATION DU MESSAGE ENTIER DIT COMBIEN DE TUILES IL PORTE.
 *
 * La passerelle sert au plus quatre pièces du message cité (`take: 4`) : un
 * client qui comptait `replyTo.attachments` affichait « +3 » sur un lot de six
 * photos, là où la bannière du composeur (citation optimiste) disait « +5 ».
 * La citation porte donc, à côté des quatre pièces, le nombre TOTAL de tuiles
 * (photos et vidéos) du message cité : `visualAttachmentCount`, champ
 * OPTIONNEL — un ancien client l'ignore, un nouveau retombe sur le compte des
 * pièces servies quand il manque. Jamais pour un contenu protégé.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import fastJson from 'fast-json-stringify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';
import { servedQuotedMessage } from '../../../services/messaging/servedQuotedMessage';
import { QUOTED_VISUAL_ATTACHMENT_COUNT } from '../../../services/attachments/attachmentIncludes';
import { buildMessageNewPayload } from '../../../socketio/messageNewPayload';
import { withSealedQuote } from '../../../services/messaging/servedQuotedMessage';

const piece = (rang: number) => ({
  id: `507f1f77bcf86cd79943900${rang}`,
  messageId: '507f1f77bcf86cd799439000',
  mimeType: 'image/jpeg',
  fileName: `piece-${rang}.jpg`,
  originalName: `piece-${rang}.jpg`,
  fileSize: 1000,
  fileUrl: `https://cdn/piece-${rang}.jpg`,
});

/** Six tuiles en base, quatre servies : la fenêtre `take: 4`. */
const quotedLot = (extra: Record<string, unknown> = {}) => ({
  id: '507f1f77bcf86cd799439000',
  content: 'six photos',
  messageType: 'image',
  attachments: [piece(1), piece(2), piece(3), piece(4)],
  _count: { attachments: 6 },
  ...extra,
});

describe('servedQuotedMessage — le nombre total de tuiles du message cité (#9915)', () => {
  it('sert le compte de la base, pas celui de la fenêtre servie', () => {
    const served = servedQuotedMessage(quotedLot());
    expect(served['visualAttachmentCount']).toBe(6);
    expect((served['attachments'] as unknown[]).length).toBe(4);
  });

  it('ne le sert jamais pour un message protégé', () => {
    const served = servedQuotedMessage(quotedLot({ isViewOnce: true }));
    expect(served).toHaveProperty('visualAttachmentCount', undefined);
  });

  it('ne l’invente pas quand la lecture ne l’a pas compté', () => {
    const { _count: _omitted, ...withoutCount } = quotedLot();
    expect(servedQuotedMessage(withoutCount)['visualAttachmentCount']).toBeUndefined();
  });

  it('le scellement d’une suppression ne le porte pas', () => {
    const served = servedQuotedMessage(quotedLot({ deletedAt: new Date('2026-10-10T08:00:00Z') }));
    expect(served['visualAttachmentCount']).toBeUndefined();
  });
});

describe('le compte voyage sur le fil REST (#9915)', () => {
  const serialize = fastJson({
    type: 'object',
    properties: { success: { type: 'boolean' }, data: messageSchema as Record<string, unknown> },
  } as never);

  it('fast-json-stringify ne le strippe pas', () => {
    const body = JSON.parse(serialize({
      success: true,
      data: {
        id: '507f1f77bcf86cd799439011',
        conversationId: '507f1f77bcf86cd799439012',
        content: 'je réponds',
        replyTo: { id: '507f1f77bcf86cd799439000', content: 'six photos', visualAttachmentCount: 6 },
      },
    }));
    expect(body.data.replyTo.visualAttachmentCount).toBe(6);
  });
});

describe('les lectures de la citation comptent les tuiles (#9915)', () => {
  it('le compte ne retient que les photos et les vidéos', () => {
    expect(JSON.stringify(QUOTED_VISUAL_ATTACHMENT_COUNT)).toContain('image/');
    expect(JSON.stringify(QUOTED_VISUAL_ATTACHMENT_COUNT)).toContain('video/');
  });

  const root = join(__dirname, '../../..');
  it.each([
    'routes/conversations/messages-list-query.ts',
    'services/messaging/MessageProcessor.ts',
    'services/messaging/messageDedupProjection.ts',
  ])('%s demande le compte à côté des quatre pièces', (relative) => {
    const source = readFileSync(join(root, relative), 'utf8');
    expect(source).toContain('...QUOTED_VISUAL_ATTACHMENT_COUNT');
  });
});

/**
 * Le chemin SOCKET répand la ligne Prisma BRUTE du message cité
 * (`MessageHandler` : `inputs.replyTo` = `message.replyTo` hissé) avant la
 * projection protégée : le `_count` de Prisma voyagerait tel quel si
 * `servedQuotedMessage` ne l'écrasait pas. Citation de six photos protégée :
 * ni compte servi, ni compte brut, ni pièce en clair.
 */
describe('message:new — le compte ne fuit jamais d’une citation protégée (#9915)', () => {
  const payloadQuoting = (quoted: Record<string, unknown>) =>
    buildMessageNewPayload(
      {
        id: '507f1f77bcf86cd799439011',
        conversationId: '507f1f77bcf86cd799439012',
        senderId: '507f1f77bcf86cd799439013',
        content: 'je réponds',
        originalLanguage: 'fr',
        messageType: 'text',
        createdAt: new Date('2026-10-10T08:00:00Z'),
        replyTo: quoted,
      } as never,
      { conversationId: '507f1f77bcf86cd799439012', translations: [], attachments: [], replyTo: quoted },
    ).replyTo as Record<string, unknown>;

  it.each([
    ['à vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['chiffré', { isEncrypted: true }],
    ['supprimé', { deletedAt: new Date('2026-10-10T07:00:00Z') }],
  ])('message cité %s : ni visualAttachmentCount, ni _count, ni URL de pièce', (_label, protection) => {
    const wire = JSON.parse(JSON.stringify(payloadQuoting(quotedLot(protection))));
    expect(wire).not.toHaveProperty('visualAttachmentCount');
    expect(wire).not.toHaveProperty('_count');
    expect(JSON.stringify(wire)).not.toContain('https://cdn/piece-');
  });

  it('citation scellée a posteriori (withSealedQuote) : rien de compté', () => {
    const sealed = withSealedQuote({ replyTo: { ...quotedLot(), visualAttachmentCount: 6 } }, new Date('2026-10-10T09:00:00Z'));
    const wire = JSON.parse(JSON.stringify(sealed.replyTo));
    expect(wire).not.toHaveProperty('visualAttachmentCount');
    expect(wire).not.toHaveProperty('_count');
  });

  it('message cité en clair : le compte servi part, le compte brut non', () => {
    const wire = JSON.parse(JSON.stringify(payloadQuoting(quotedLot())));
    expect(wire.visualAttachmentCount).toBe(6);
    expect(wire).not.toHaveProperty('_count');
  });
});
