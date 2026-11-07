/**
 * #16655 — LE DRAIN SIGNE LES ADRESSES DE PIÈCE POUR LE LECTEUR QU'IL SERT.
 *
 * `emitAttachmentUpdated` et ses quatre jumeaux signent les copies VIVANTES par
 * destinataire, puis enfilent la charge NUE pour les absents. Au reconnect, le
 * rejeu écrase les URLs signées que le client détient par des adresses mortes —
 * et sa fusion fait de la morte la valeur EN CACHE.
 *
 * Signer à l'ENFILAGE serait faux (6–7 h de signature contre 48 h de file) ;
 * c'est donc au DRAIN, qui connaît le lecteur au moment où il émet.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import {
  ATTACHMENT_SLOT,
  attachmentSlotOf,
  carriesSignableAddress,
  prepareDrainSigning,
  signedQueuedPayloadForReader,
} from '../drainReaderSignedPayload';
import { DRAINED_EVENT } from '../queuedEventContract';
import { checkReaderFileToken, readSigningKeys } from '../../services/attachments/readerFileSignature';

const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/voice_8b1f0c1e.m4a';
const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const TRACK = `/api/v1/attachments/file/translated/${PIECE}_en.mp3`;
const CONV = 'conv-1';
const MSG = 'msg-1';
const READER_PARTICIPANT = 'cccccccccccccccccccccc01';

const FLAME = {
  isViewOnce: false,
  isBlurred: false,
  effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL,
  ephemeralDuration: 30,
  expiresAt: new Date(Date.now() + 3_600_000),
};
const ORDINARY = { isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null };

const piece = (over: Record<string, unknown> = {}) => ({
  id: PIECE,
  messageId: MSG,
  fileUrl: KEY,
  mimeType: 'audio/mp4',
  translations: { en: { url: TRACK } },
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ...over,
});

/** Une entrée de file telle que `RedisDeliveryQueue` la rend. */
const entryOf = (eventType: string, payload: Record<string, unknown>, messageId = MSG) =>
  ({ eventType, conversationId: CONV, messageId, payload } as never);

const attachmentUpdated = (over: Record<string, unknown> = {}) =>
  entryOf('attachment-updated', { conversationId: CONV, messageId: MSG, attachment: piece(over) });

const textEntry = () => entryOf('new', { id: MSG, conversationId: CONV, content: 'Salut', attachments: [] });

function prismaWith(message: Record<string, unknown> | null, over: Record<string, unknown> = {}) {
  return {
    message: { findMany: jest.fn(async () => (message === null ? [] : [{ id: MSG, ...message }])) },
    conversationShareLink: { findMany: jest.fn(async () => []) },
    ...over,
  } as never;
}

const rows = [{ conversationId: CONV, bannedAt: null, id: READER_PARTICIPANT, shareLinkId: null }];

const readerOf = (url: unknown): string | null => {
  if (typeof url !== 'string') return null;
  const match = /^\/api\/v1\/attachments\/signed\/([^/]+)\/([^/]+)$/.exec(url);
  if (!match) return null;
  const check = checkReaderFileToken({
    token: match[1] as string,
    storageKey: decodeURIComponent(match[2] as string),
    keys: readSigningKeys(),
    now: new Date(),
  });
  return check.kind === 'valid' ? check.readerParticipantId : null;
};

const signedPayload = (result: ReturnType<typeof signedQueuedPayloadForReader>) =>
  result.kind === 'signed' ? (result.payload as { attachment: { fileUrl: unknown; translations: { en: { url: unknown } } } }) : null;

beforeEach(() => {
  process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 1).toString('base64');
});
afterEach(() => {
  delete process.env.ATTACHMENT_URL_SIGNING_KEY;
});

describe('la table des emplacements de pièce — une famille NEUVE doit décider de son cas', () => {
  it('couvre EXACTEMENT les `eventType` du contrat de file, sans en inventer', () => {
    expect(Object.keys(ATTACHMENT_SLOT).sort()).toEqual(Object.keys(DRAINED_EVENT).sort());
  });

  it('nomme l’emplacement de chaque famille qui porte des pièces', () => {
    expect(attachmentSlotOf('attachment-updated')).toBe('attachment');
    expect(attachmentSlotOf('new')).toBe('attachments');
    expect(attachmentSlotOf('edited')).toBe('attachments');
    expect(attachmentSlotOf('link-message')).toBe('message.attachments');
  });

  it('les familles sans pièce n’en portent AUCUNE — elles traversent telles quelles', () => {
    for (const t of ['deleted', 'expired', 'reaction-added', 'reaction-removed', 'pinned', 'unpinned', 'translation'] as const) {
      expect(attachmentSlotOf(t)).toBe('none');
    }
  });
});

describe('le filtre à coût NUL — ce qui ne porte aucune clé signable ne coûte rien', () => {
  it('une entrée de texte ne porte aucune adresse signable', () => {
    expect(carriesSignableAddress(textEntry())).toBe(false);
  });

  it('une pièce à clé scellée en porte une', () => {
    expect(carriesSignableAddress(attachmentUpdated())).toBe(true);
  });

  it('une piste traduite SEULE suffit — la carte compte autant que `fileUrl`', () => {
    expect(carriesSignableAddress(attachmentUpdated({ fileUrl: 'https://cdn.example.test/public.png' }))).toBe(true);
  });
});

describe('signer pour le lecteur servi', () => {
  it('signe `fileUrl` ET chaque piste traduite, résolues vers le participant du lecteur', async () => {
    const prisma = prismaWith(FLAME);
    const ctx = await prepareDrainSigning({ prisma, now: new Date(), readerRows: rows, entries: [attachmentUpdated()] });

    const out = signedPayload(signedQueuedPayloadForReader(attachmentUpdated(), ctx));

    expect(readerOf(out?.attachment.fileUrl)).toBe(READER_PARTICIPANT);
    expect(readerOf(out?.attachment.translations.en.url)).toBe(READER_PARTICIPANT);
  });

  /** LE SEUL témoin qui distingue « signe juste » de « signe tout ». */
  it('laisse INTACTE une pièce ordinaire à clé non signable', async () => {
    const prisma = prismaWith(ORDINARY);
    const plain = attachmentUpdated({ fileUrl: 'https://cdn.example.test/public.png', translations: {} });
    const ctx = await prepareDrainSigning({ prisma, now: new Date(), readerRows: rows, entries: [plain] });

    expect(signedQueuedPayloadForReader(plain, ctx).kind).toBe('as-is');
  });

  it('une ligne `Message` ABSENTE fait signer — l’absence ne prouve pas l’ordinaire', async () => {
    const prisma = prismaWith(null);
    const ctx = await prepareDrainSigning({ prisma, now: new Date(), readerRows: rows, entries: [attachmentUpdated()] });

    const out = signedPayload(signedQueuedPayloadForReader(attachmentUpdated(), ctx));
    expect(readerOf(out?.attachment.fileUrl)).toBe(READER_PARTICIPANT);
  });

  it('sans clé de signature, la charge traverse par IDENTITÉ — rien n’est signé nulle part', async () => {
    delete process.env.ATTACHMENT_URL_SIGNING_KEY;
    const prisma = prismaWith(FLAME);
    const entry = attachmentUpdated();
    const ctx = await prepareDrainSigning({ prisma, now: new Date(), readerRows: rows, entries: [entry] });

    expect(signedQueuedPayloadForReader(entry, ctx).kind).toBe('as-is');
  });

  /**
   * L'IDEMPOTENCE, ET CE QU'ELLE SIGNIFIE ICI.
   *
   * Elle ne dit pas « signer deux fois rend la même URL » : une charge DÉJÀ
   * signée ne porte plus AUCUNE adresse signable — `storageKeyFromMediaUrl`
   * rend `null` sur `/api/v1/attachments/signed/…` (pas de segment
   * `/attachments/file/`, et le repli « clé nue » refuse ce qui commence par
   * `/`). Le second passage la reconnaît donc comme n'ayant rien à réécrire.
   *
   * C'est exactement la propriété dont le drain a besoin : il peut signer
   * **sans tenir d'état** sur ce qui l'aurait déjà été, et sans qu'une charge
   * ressignée soit abîmée. La première version de ce témoin attendait l'égalité
   * des URLs et tombait — le code avait raison, l'attente était fausse.
   */
  it('une charge DÉJÀ signée n’a plus rien à signer — rien n’est abîmé au second passage', async () => {
    const prisma = prismaWith(FLAME);
    const ctx = await prepareDrainSigning({ prisma, now: new Date(), readerRows: rows, entries: [attachmentUpdated()] });

    const once = signedPayload(signedQueuedPayloadForReader(attachmentUpdated(), ctx));
    expect(readerOf(once?.attachment.fileUrl)).toBe(READER_PARTICIPANT);

    const again = signedQueuedPayloadForReader(
      entryOf('attachment-updated', { conversationId: CONV, messageId: MSG, attachment: once?.attachment as never }),
      ctx
    );

    expect(again.kind).toBe('as-is');
  });
});

describe('les refus — chacun sa `reason`, et aucun n’emporte ses voisins', () => {
  it('une lecture de protection qui LÈVE refuse la porteuse, et laisse passer le texte', async () => {
    const prisma = prismaWith(FLAME, { message: { findMany: jest.fn(async () => { throw new Error('replica set unreachable'); }) } });
    const ctx = await prepareDrainSigning({ prisma, now: new Date(), readerRows: rows, entries: [attachmentUpdated(), textEntry()] });

    const refused = signedQueuedPayloadForReader(attachmentUpdated(), ctx);
    expect(refused.kind).toBe('refuse');
    expect(refused.kind === 'refuse' && refused.reason).toBe('attachment-protection-unresolved');
    expect(signedQueuedPayloadForReader(textEntry(), ctx).kind).toBe('as-is');
  });

  it('une appartenance INCONNUE refuse la porteuse, et laisse passer le texte', async () => {
    const prisma = prismaWith(FLAME);
    const ctx = await prepareDrainSigning({ prisma, now: new Date(), readerRows: 'unavailable', entries: [attachmentUpdated()] });

    const refused = signedQueuedPayloadForReader(attachmentUpdated(), ctx);
    expect(refused.kind === 'refuse' && refused.reason).toBe('reader-participant-unresolved');
    expect(signedQueuedPayloadForReader(textEntry(), ctx).kind).toBe('as-is');
  });

  it('un lien de partage EXPIRÉ n’est pas un lecteur admis — on refuse plutôt que de servir une adresse nue', async () => {
    const prisma = prismaWith(FLAME, {
      conversationShareLink: { findMany: jest.fn(async () => [{ id: 'link-1', expiresAt: new Date(Date.now() - 1000) }]) },
    });
    const guest = [{ conversationId: CONV, bannedAt: null, id: READER_PARTICIPANT, shareLinkId: 'link-1' }];
    const ctx = await prepareDrainSigning({ prisma, now: new Date(), readerRows: guest, entries: [attachmentUpdated()] });

    const refused = signedQueuedPayloadForReader(attachmentUpdated(), ctx);
    expect(refused.kind === 'refuse' && refused.reason).toBe('file-reader-not-admitted');
  });
});

describe('le coût — un drain de 500 entrées ne fait pas 500 requêtes', () => {
  it('UNE lecture de protection pour tout le lot, et AUCUNE requête de lien sans invité', async () => {
    const prisma = prismaWith(FLAME);
    const many = Array.from({ length: 500 }, (_, i) => attachmentUpdated({ id: `piece-${i}` }));

    await prepareDrainSigning({ prisma, now: new Date(), readerRows: rows, entries: many });

    const p = prisma as unknown as { message: { findMany: { mock: { calls: unknown[] } } }; conversationShareLink: { findMany: { mock: { calls: unknown[] } } } };
    expect(p.message.findMany.mock.calls).toHaveLength(1);
    expect(p.conversationShareLink.findMany.mock.calls).toHaveLength(0);
  });

  it('aucune lecture du tout quand RIEN ne porte d’adresse signable', async () => {
    const prisma = prismaWith(FLAME);
    await prepareDrainSigning({ prisma, now: new Date(), readerRows: rows, entries: [textEntry(), textEntry()] });

    const p = prisma as unknown as { message: { findMany: { mock: { calls: unknown[] } } } };
    expect(p.message.findMany.mock.calls).toHaveLength(0);
  });
});
