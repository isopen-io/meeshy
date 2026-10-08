/**
 * #9646 — les routes qui servent des pièces HORS d'une page de messages (la
 * galerie d'une conversation, le détail d'une pièce) signent, pour leur lecteur,
 * celles dont le message porteur disparaît. La protection du porteur est relue
 * en UNE lecture pour la page.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { readSigningKeys, readerFileUrlSigner } from '../readerFileSignature';
import { signAttachmentsForReader } from '../signServedAttachments';

const SIGNER = readerFileUrlSigner({ keys: readSigningKeys({ ATTACHMENT_URL_SIGNING_KEY: Buffer.alloc(32, 6).toString('base64') }), now: new Date() });
const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/photo.jpg';
const READER = 'cccccccccccccccccccccc01';

const piece = (id: string, messageId: string | null) => ({ id, messageId, fileUrl: KEY, thumbnailUrl: null, isViewOnce: false, isBlurred: false, effectFlags: 0 });
const ordinary = { isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null };

function prismaWith(rows: Array<Record<string, unknown>>, pieces: Array<Record<string, unknown>> = [
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa1', isViewOnce: false, isBlurred: false, effectFlags: 0 },
  { id: 'aaaaaaaaaaaaaaaaaaaaaaa2', isViewOnce: false, isBlurred: false, effectFlags: 0 },
]) {
  return { message: { findMany: jest.fn(async () => rows) }, messageAttachment: { findMany: jest.fn(async () => pieces) } };
}

describe('signAttachmentsForReader', () => {
  it('signe la pièce d’une flamme, laisse celle d’un message ordinaire, en une lecture', async () => {
    const prisma = prismaWith([
      { id: 'm-flame', ...ordinary, effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30, expiresAt: new Date(Date.now() + 60_000) },
      { id: 'm-plain', ...ordinary },
    ]);
    const out = await signAttachmentsForReader(prisma as never, {
      attachments: [piece('aaaaaaaaaaaaaaaaaaaaaaa1', 'm-flame'), piece('aaaaaaaaaaaaaaaaaaaaaaa2', 'm-plain')],
      readerParticipantId: READER,
      signer: SIGNER,
    });
    expect(out[0]?.fileUrl).toMatch(/^\/api\/v1\/attachments\/signed\//);
    expect(out[1]?.fileUrl).toBe(KEY);
    expect(prisma.message.findMany).toHaveBeenCalledTimes(1);
  });

  it('relit la protection PROPRE de la pièce : une pièce à vue unique sous un message ordinaire est signée, même si le select de l’appelant ne la portait pas', async () => {
    const prisma = prismaWith([{ id: 'm-plain', ...ordinary }], [{ id: 'aaaaaaaaaaaaaaaaaaaaaaa1', isViewOnce: true, isBlurred: false, effectFlags: 0 }]);
    const { isViewOnce: _a, isBlurred: _b, effectFlags: _c, ...bare } = piece('aaaaaaaaaaaaaaaaaaaaaaa1', 'm-plain');
    const out = await signAttachmentsForReader(prisma as never, { attachments: [bare], readerParticipantId: READER, signer: SIGNER });
    expect(out[0]?.fileUrl).toMatch(/^\/api\/v1\/attachments\/signed\//);
    expect(out[0]).not.toHaveProperty('isViewOnce');
  });

  it('signe quand la ligne du porteur est introuvable — l’absence ne prouve pas l’ordinaire', async () => {
    const out = await signAttachmentsForReader(prismaWith([]) as never, {
      attachments: [piece('aaaaaaaaaaaaaaaaaaaaaaa1', 'm-x')],
      readerParticipantId: READER,
      signer: SIGNER,
    });
    expect(out[0]?.fileUrl).toMatch(/^\/api\/v1\/attachments\/signed\//);
  });

  it('ne lit rien sans clé ni lecteur', async () => {
    const prisma = prismaWith([]);
    const attachments = [piece('aaaaaaaaaaaaaaaaaaaaaaa1', 'm-x')];
    expect(await signAttachmentsForReader(prisma as never, { attachments, readerParticipantId: READER, signer: null })).toBe(attachments);
    expect(await signAttachmentsForReader(prisma as never, { attachments, readerParticipantId: null, signer: SIGNER })).toBe(attachments);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
});
