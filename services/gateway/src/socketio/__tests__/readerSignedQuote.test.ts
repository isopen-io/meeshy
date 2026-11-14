/**
 * #18470 — la citation d'une image scellée au repos (#13100) voyage sous les
 * adresses signées de CHAQUE lecteur : l'adresse nue d'un fichier scellé rend
 * 404, et la bulle-citation restait sur son flou ThumbHash.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { checkReaderFileToken, readSigningKeys, readerFileUrlSigner } from '../../services/attachments/readerFileSignature';
import { readerSignedPlan, readerSignedTargets, signedForReader, signedQuotedReply } from '../readerSignedDelivery';

const SIGNING_KEY = Buffer.alloc(32, 7).toString('base64');
const KEYS = readSigningKeys({ ATTACHMENT_URL_SIGNING_KEY: SIGNING_KEY });
const NOW = new Date();
const SIGNER = readerFileUrlSigner({ keys: KEYS, now: NOW });
const CONVERSATION = 'dddddddddddddddddddddd01';
const READER = 'cccccccccccccccccccccc01';
const QUOTED_PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa7';
const SEALED_FILE = '2026/11/6987351d1bfc89fdaac7aa3a/49a295770bef21e4920ffe72eb50da35.webp';
const SEALED_THUMB = '2026/11/6987351d1bfc89fdaac7aa3a/49a295770bef21e4920ffe72eb50da35_thumb.webp';
const PLAIN_FILE = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e.jpg';

const ORDINARY_COLUMNS = { isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null };
const piece = (fileUrl: string, thumbnailUrl: string | null) => ({
  id: QUOTED_PIECE, mimeType: 'image/webp', fileUrl, thumbnailUrl, isViewOnce: false, isBlurred: false, effectFlags: 0,
});
const quotedRow = (attachments: ReadonlyArray<ReturnType<typeof piece>>, over: Record<string, unknown> = {}) => ({
  id: 'bbbbbbbbbbbbbbbbbbbbbbb7', conversationId: CONVERSATION, content: '', messageType: 'image', ...ORDINARY_COLUMNS, attachments, ...over,
});
const replyRow = (quoted: object) => ({
  id: 'bbbbbbbbbbbbbbbbbbbbbbb8', conversationId: CONVERSATION, content: 'joli', ...ORDINARY_COLUMNS, attachments: [], replyTo: quoted,
});

const readerOf = (url: unknown): string | null => {
  const match = typeof url === 'string' ? /^\/api\/v1\/attachments\/signed\/([^/]+)\/([^/]+)$/.exec(url) : null;
  if (!match) return null;
  const check = checkReaderFileToken({ token: match[1] as string, storageKey: decodeURIComponent(match[2] as string), keys: KEYS, now: NOW });
  return check.kind === 'valid' ? check.readerParticipantId : null;
};

const prismaWith = (ids: readonly string[]) => ({
  participant: {
    findMany: jest.fn(async () => ids.map((id, i) => ({ id, userId: `bbbbbbbbbbbbbbbbbbbbbb${String(i).padStart(2, '0')}`, shareLinkId: null }))),
  },
  conversationShareLink: { findMany: jest.fn(async () => []) },
});

type Served = { readonly replyTo: { readonly attachments: ReadonlyArray<{ readonly fileUrl: unknown; readonly thumbnailUrl: unknown }> } };

describe('signedQuotedReply', () => {
  it('signe la vignette ET le fichier d’une pièce citée scellée, pour CE lecteur', () => {
    const quoted = quotedRow([piece(SEALED_FILE, SEALED_THUMB)]);
    const served = signedQuotedReply({ ...quoted }, { quoted, participantId: READER, signer: SIGNER });
    expect(readerOf(served.attachments[0]?.thumbnailUrl)).toBe(READER);
    expect(readerOf(served.attachments[0]?.fileUrl)).toBe(READER);
  });

  it('laisse intacte la pièce citée ordinaire, et tout quand aucune clé n’est posée', () => {
    const ordinary = quotedRow([piece(PLAIN_FILE, null)]);
    expect(signedQuotedReply({ ...ordinary }, { quoted: ordinary, participantId: READER, signer: SIGNER }).attachments[0]?.fileUrl).toBe(PLAIN_FILE);
    const sealed = quotedRow([piece(SEALED_FILE, SEALED_THUMB)]);
    expect(signedQuotedReply({ ...sealed }, { quoted: sealed, participantId: READER, signer: null }).attachments[0]?.thumbnailUrl).toBe(SEALED_THUMB);
  });
});

describe('signedForReader — la citation suit la racine', () => {
  it('signe les pièces de replyTo pour le lecteur de la charge', () => {
    const quoted = quotedRow([piece(SEALED_FILE, SEALED_THUMB)]);
    const payload = { id: 'm', attachments: [], replyTo: { ...quoted } };
    const served = signedForReader(payload, {
      message: ORDINARY_COLUMNS, participantId: READER, signer: SIGNER, quoted,
    }) as unknown as Served;
    expect(readerOf(served.replyTo.attachments[0]?.thumbnailUrl)).toBe(READER);
  });
});

describe('readerSignedTargets — une réponse TEXTE qui cite une pièce scellée part par lecteur', () => {
  it('rend les destinataires admis quand seule la citation porte un fichier scellé', async () => {
    const prisma = prismaWith([READER]);
    const targets = await readerSignedTargets(prisma as never, {
      conversationId: CONVERSATION, message: ORDINARY_COLUMNS, attachments: [], signer: SIGNER, now: NOW,
      quoted: quotedRow([piece(SEALED_FILE, SEALED_THUMB)]),
    });
    expect(targets?.map((t) => t.participantId)).toEqual([READER]);
  });

  it('garde la diffusion de room, sans requête, pour une citation ordinaire, supprimée ou masquée', async () => {
    const prisma = prismaWith([READER]);
    const cases = [
      quotedRow([piece(PLAIN_FILE, null)]),
      quotedRow([piece(SEALED_FILE, SEALED_THUMB)], { deletedAt: NOW }),
      quotedRow([piece(SEALED_FILE, SEALED_THUMB)], { isViewOnce: true, effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }),
    ];
    for (const quoted of cases) {
      expect(await readerSignedTargets(prisma as never, {
        conversationId: CONVERSATION, message: ORDINARY_COLUMNS, attachments: [], signer: SIGNER, now: NOW, quoted,
      })).toBeNull();
    }
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });
});

describe('readerSignedPlan — lit la citation sur la ligne émise, sans rien demander aux appelants', () => {
  const previous = process.env.ATTACHMENT_URL_SIGNING_KEY;
  afterEach(() => {
    if (previous === undefined) delete process.env.ATTACHMENT_URL_SIGNING_KEY;
    else process.env.ATTACHMENT_URL_SIGNING_KEY = previous;
  });

  it('signe la citation scellée de la charge de chaque lecteur', async () => {
    process.env.ATTACHMENT_URL_SIGNING_KEY = SIGNING_KEY;
    const quoted = quotedRow([piece(SEALED_FILE, SEALED_THUMB)]);
    const plan = await readerSignedPlan(prismaWith([READER]) as never, {
      conversationId: CONVERSATION, message: replyRow(quoted), attachments: [],
    });
    expect(plan?.targets.map((t) => t.participantId)).toEqual([READER]);
    const served = plan?.signFor({ id: 'm', attachments: [], replyTo: { ...quoted } }, READER) as unknown as Served;
    expect(readerOf(served.replyTo.attachments[0]?.fileUrl)).toBe(READER);
  });

  it('ne signe pas, et garde la diffusion de room, pour une citation d’une AUTRE conversation', async () => {
    process.env.ATTACHMENT_URL_SIGNING_KEY = SIGNING_KEY;
    const prisma = prismaWith([READER]);
    const elsewhere = quotedRow([piece(SEALED_FILE, SEALED_THUMB)], { conversationId: 'dddddddddddddddddddddd02' });
    expect(await readerSignedPlan(prisma as never, { conversationId: CONVERSATION, message: replyRow(elsewhere), attachments: [] })).toBeNull();
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });
});
