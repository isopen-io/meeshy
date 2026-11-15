/**
 * #9600 — `GET /conversations/:id/messages` sert les adresses d'une pièce
 * protégée SIGNÉES pour le lecteur qui charge la page ; celles d'une pièce
 * ordinaire restent celles d'avant.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { mapMessageRowForList } from '../../../../routes/conversations/messages-list-query';
import { checkReaderFileToken, readSigningKeys, readerFileUrlSigner } from '../../../../services/attachments/readerFileSignature';

const KEYS = readSigningKeys({ ATTACHMENT_URL_SIGNING_KEY: Buffer.alloc(32, 4).toString('base64') });
const NOW = new Date();
const READER = 'cccccccccccccccccccccc01';
const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e.jpg';

const row = (protection: Record<string, unknown>) => ({
  id: 'bbbbbbbbbbbbbbbbbbbbbbb1',
  conversationId: 'dddddddddddddddddddddd01',
  senderId: 'cccccccccccccccccccccc02',
  content: '',
  messageType: 'image',
  createdAt: NOW,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ephemeralDuration: null,
  expiresAt: null,
  ...protection,
  sender: { id: 'cccccccccccccccccccccc02', userId: 'u-author', displayName: 'Ada' },
  attachments: [
    { id: PIECE, mimeType: 'image/jpeg', fileUrl: KEY, thumbnailUrl: null, isViewOnce: false, isBlurred: false, effectFlags: 0 },
  ],
});

const ctx = (signer: ReturnType<typeof readerFileUrlSigner>) =>
  ({
    includeTranslations: false,
    includeReplies: false,
    hasLanguageFilter: false,
    languageFilter: undefined,
    currentParticipantId: READER,
    readStatusMap: new Map(),
    senderPresenceVis: new Map(),
    listMissingEntry: 'hide',
    consumptionMap: new Map(),
    readerFileUrlSigner: signer,
  }) as never;

const servedFileUrl = (protection: Record<string, unknown>, signer = readerFileUrlSigner({ keys: KEYS, now: NOW })): string =>
  mapMessageRowForList(row(protection) as never, ctx(signer)).attachments[0].fileUrl;

describe('liste REST — l’adresse d’une pièce protégée est signée pour son lecteur (#9600)', () => {
  it('signe la pièce d’une flamme pour le lecteur de la page', () => {
    const url = servedFileUrl({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30, expiresAt: new Date(NOW.getTime() + 3600_000) });
    const match = /^\/api\/v1\/attachments\/signed\/([^/]+)\/([^/]+)$/.exec(url);
    expect(match).not.toBeNull();
    const [, token, encodedKey] = match as RegExpExecArray;
    expect(checkReaderFileToken({ token: token as string, storageKey: decodeURIComponent(encodedKey as string), keys: KEYS, now: NOW })).toEqual({
      kind: 'valid',
      attachmentId: PIECE,
      readerParticipantId: READER,
    });
  });

  it('signe la pièce d’une vue unique', () => {
    expect(servedFileUrl({ isViewOnce: true })).toMatch(/^\/api\/v1\/attachments\/signed\//);
  });

  it('sert la clé d’avant pour un message ordinaire', () => {
    expect(servedFileUrl({})).toBe(KEY);
  });

  it('sert la clé d’avant quand aucune clé de signature n’est posée', () => {
    expect(servedFileUrl({ isViewOnce: true }, null)).toBe(KEY);
  });
});
