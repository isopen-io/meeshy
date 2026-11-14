/**
 * #18470 — `GET /conversations/:id/messages` sert la CITATION d'une pièce
 * scellée au repos (#13100) sous les adresses signées du lecteur de la page :
 * l'adresse nue d'un fichier scellé rend 404.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { mapMessageRowForList } from '../../../../routes/conversations/messages-list-query';
import { checkReaderFileToken, readSigningKeys, readerFileUrlSigner } from '../../../../services/attachments/readerFileSignature';

const KEYS = readSigningKeys({ ATTACHMENT_URL_SIGNING_KEY: Buffer.alloc(32, 9).toString('base64') });
const NOW = new Date();
const READER = 'cccccccccccccccccccccc01';
const QUOTED_PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa7';
const SEALED_FILE = '2026/11/6987351d1bfc89fdaac7aa3a/49a295770bef21e4920ffe72eb50da35.webp';
const SEALED_THUMB = '2026/11/6987351d1bfc89fdaac7aa3a/49a295770bef21e4920ffe72eb50da35_thumb.webp';
const PLAIN_FILE = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e.jpg';
const ORDINARY = { isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null };

const CONVERSATION = 'dddddddddddddddddddddd01';
const QUOTED_ID = 'bbbbbbbbbbbbbbbbbbbbbbb7';

type QuoteOverrides = { readonly quote?: Record<string, unknown>; readonly piece?: Record<string, unknown> };

const row = (fileUrl: string, thumbnailUrl: string | null, over: QuoteOverrides = {}) => ({
  id: 'bbbbbbbbbbbbbbbbbbbbbbb8',
  conversationId: CONVERSATION,
  senderId: 'cccccccccccccccccccccc02',
  content: 'joli',
  messageType: 'text',
  createdAt: NOW,
  ...ORDINARY,
  sender: { id: 'cccccccccccccccccccccc02', userId: 'u-author', displayName: 'Ada' },
  attachments: [],
  replyTo: {
    id: QUOTED_ID,
    conversationId: CONVERSATION,
    content: '',
    messageType: 'image',
    originalLanguage: 'fr',
    createdAt: NOW,
    ...ORDINARY,
    sender: { id: 'cccccccccccccccccccccc03', userId: 'u-quoted', displayName: 'Bea' },
    attachments: [{ id: QUOTED_PIECE, mimeType: 'image/webp', fileUrl, thumbnailUrl, isViewOnce: false, isBlurred: false, effectFlags: 0, ...over.piece }],
    ...over.quote,
  },
});

type Signer = ReturnType<typeof readerFileUrlSigner> | null;
type CtxOverrides = { readonly participantId?: string | undefined; readonly ephemeralDeadlines?: Map<string, unknown> };

const ctx = (signer: Signer, over: CtxOverrides = {}) =>
  ({
    includeTranslations: false,
    includeReplies: true,
    hasLanguageFilter: false,
    languageFilter: undefined,
    currentParticipantId: 'participantId' in over ? over.participantId : READER,
    readStatusMap: new Map(),
    senderPresenceVis: new Map(),
    listMissingEntry: 'hide',
    consumptionMap: new Map(),
    readerFileUrlSigner: signer,
    ephemeralDeadlines: over.ephemeralDeadlines,
  }) as never;

const signerNow = (): Signer => readerFileUrlSigner({ keys: KEYS, now: NOW });

const servedReplyTo = (input: { readonly quote?: QuoteOverrides; readonly ctx?: CtxOverrides } = {}): unknown =>
  (mapMessageRowForList(row(SEALED_FILE, SEALED_THUMB, input.quote) as never, ctx(signerNow(), input.ctx)) as unknown as { replyTo: unknown }).replyTo;

const carriesSignedAddress = (value: unknown): boolean => JSON.stringify(value ?? null).includes('/attachments/signed/');

const servedQuote = (fileUrl: string, thumbnailUrl: string | null, signer: ReturnType<typeof readerFileUrlSigner> | null = readerFileUrlSigner({ keys: KEYS, now: NOW })) =>
  (mapMessageRowForList(row(fileUrl, thumbnailUrl) as never, ctx(signer)) as unknown as {
    replyTo: { attachments: Array<{ fileUrl: string; thumbnailUrl: string | null }> };
  }).replyTo.attachments[0];

const readerOf = (url: unknown): string | null => {
  const match = typeof url === 'string' ? /^\/api\/v1\/attachments\/signed\/([^/]+)\/([^/]+)$/.exec(url) : null;
  if (!match) return null;
  const check = checkReaderFileToken({ token: match[1] as string, storageKey: decodeURIComponent(match[2] as string), keys: KEYS, now: NOW });
  return check.kind === 'valid' ? check.readerParticipantId : null;
};

describe('liste REST — la citation d’une pièce scellée est signée pour son lecteur (#18470)', () => {
  it('signe la vignette et le fichier de la pièce citée scellée', () => {
    const quoted = servedQuote(SEALED_FILE, SEALED_THUMB);
    expect(readerOf(quoted?.thumbnailUrl)).toBe(READER);
    expect(readerOf(quoted?.fileUrl)).toBe(READER);
  });

  it('sert la clé d’avant pour une pièce citée ordinaire', () => {
    expect(servedQuote(PLAIN_FILE, null)?.fileUrl).toBe(PLAIN_FILE);
  });

  it('sert la clé d’avant quand aucune clé de signature n’est posée', () => {
    expect(servedQuote(SEALED_FILE, SEALED_THUMB, null)?.thumbnailUrl).toBe(SEALED_THUMB);
  });
});

describe('liste REST — ce que la citation ne sert pas, elle ne le signe pas (#18470)', () => {
  it('signe bien la citation nominale (témoin de la suite)', () => {
    expect(carriesSignedAddress(servedReplyTo())).toBe(true);
  });

  it('ne signe rien pour une citation SUPPRIMÉE', () => {
    expect(carriesSignedAddress(servedReplyTo({ quote: { quote: { deletedAt: NOW } } }))).toBe(false);
  });

  it('ne signe rien pour une pièce citée FLOUTÉE ou à VUE UNIQUE', () => {
    expect(carriesSignedAddress(servedReplyTo({ quote: { piece: { isBlurred: true } } }))).toBe(false);
    expect(carriesSignedAddress(servedReplyTo({ quote: { piece: { isViewOnce: true } } }))).toBe(false);
    expect(carriesSignedAddress(servedReplyTo({ quote: { quote: { effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE } } }))).toBe(false);
  });

  it('ne signe rien pour un éphémère cité ÉCHU pour ce lecteur', () => {
    const past = new Date(NOW.getTime() - 60_000);
    const quote = { quote: { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30 } };
    const ephemeralDeadlines = new Map([[QUOTED_ID, { isSender: false, readerDeadline: past, latestRecipientDeadline: past }]]);
    expect(carriesSignedAddress(servedReplyTo({ quote, ctx: { ephemeralDeadlines } }))).toBe(false);
  });

  it('ne signe rien sans lecteur identifié', () => {
    expect(carriesSignedAddress(servedReplyTo({ ctx: { participantId: undefined } }))).toBe(false);
  });

  it('ne signe pas une citation d’une AUTRE conversation que la ligne porteuse', () => {
    const elsewhere = servedReplyTo({ quote: { quote: { conversationId: 'dddddddddddddddddddddd02' } } });
    expect(carriesSignedAddress(elsewhere)).toBe(false);
    expect(JSON.stringify(elsewhere)).toContain(SEALED_THUMB);
  });
});
