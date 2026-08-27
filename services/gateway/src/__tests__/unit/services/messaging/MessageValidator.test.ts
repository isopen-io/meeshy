/**
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MessageRequest } from '@meeshy/shared/types';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

const mockResolveConvId = jest.fn() as jest.Mock<any>;
jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConvId(...args),
}));

import { MessageValidator } from '../../../../services/messaging/MessageValidator';
import { MAX_ATTACHMENTS_PER_MESSAGE } from '@meeshy/shared/types/attachment';

const CONV_ID = '507f1f77bcf86cd799439011';

function makeMocks() {
  return {
    conversationFindUnique: jest.fn() as jest.Mock<any>,
    conversationFindFirst: jest.fn() as jest.Mock<any>,
  };
}

function makePrisma(mocks: ReturnType<typeof makeMocks>): PrismaClient {
  return {
    conversation: {
      findUnique: mocks.conversationFindUnique,
      findFirst: mocks.conversationFindFirst,
    },
  } as unknown as PrismaClient;
}

function makeRequest(overrides: Partial<MessageRequest> = {}): MessageRequest {
  return {
    conversationId: CONV_ID,
    content: 'Hello world',
    ...overrides,
  } as MessageRequest;
}

// ── validateRequest ────────────────────────────────────────────────────────

describe('MessageValidator.validateRequest', () => {
  let validator: MessageValidator;

  beforeEach(() => {
    mockResolveConvId.mockResolvedValue(CONV_ID);
    const m = makeMocks();
    validator = new MessageValidator(makePrisma(m));
  });

  it('returns valid for a normal message', async () => {
    const result = await validator.validateRequest(makeRequest());
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toBeUndefined();
  });

  it('errors when content is empty and no attachments or payload', async () => {
    const result = await validator.validateRequest(makeRequest({ content: '' }));
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.code === 'CONTENT_EMPTY')).toBe(true);
  });

  it('errors when content is whitespace only', async () => {
    const result = await validator.validateRequest(makeRequest({ content: '   ' }));
    expect(result.errors[0]?.code).toBe('CONTENT_EMPTY');
  });

  it('allows empty content when attachments array is non-empty', async () => {
    const result = await validator.validateRequest(makeRequest({
      content: '',
      attachments: [{ id: 'att-1' }] as unknown as MessageRequest['attachments'],
    }));
    expect(result.errors.find(e => e.code === 'CONTENT_EMPTY')).toBeUndefined();
  });

  it('allows empty content when attachmentIds is non-empty', async () => {
    const result = await validator.validateRequest(makeRequest({ content: '', attachmentIds: ['att-1'] }));
    expect(result.errors.find(e => e.code === 'CONTENT_EMPTY')).toBeUndefined();
  });

  it('allows empty content when encryptedPayload is present', async () => {
    const result = await validator.validateRequest(makeRequest({
      content: '',
      encryptedPayload: { data: 'abc' } as unknown as MessageRequest['encryptedPayload'],
    }));
    expect(result.errors.find(e => e.code === 'CONTENT_EMPTY')).toBeUndefined();
  });

  // Un transfert copie ses attachments CÔTÉ SERVEUR (copyForwardedAttachments) :
  // le corps d'un forward de MÉDIA n'a ni content ni attachmentIds — seul
  // `forwardedFromId` le rend non-vide, exactement comme au refine Zod de la
  // route REST. Vécu prod 2026-08-19 : ce validateur, ignorant le champ,
  // rejetait tout transfert de média en CONTENT_EMPTY après que la route
  // l'avait accepté.
  it('allows empty content when forwardedFromId is present (media forward)', async () => {
    const result = await validator.validateRequest(makeRequest({
      content: '',
      forwardedFromId: '507f1f77bcf86cd799439012',
    }));
    expect(result.errors.find(e => e.code === 'CONTENT_EMPTY')).toBeUndefined();
    expect(result.isValid).toBe(true);
  });

  // Un lieu partagé rend aussi le corps non-vide — même famille que
  // forwardedFromId/copyAttachmentsFromMessageId/attachmentIds ci-dessus.
  // Repro prod : une géolocalisation SEULE (pas de texte, pas d'attachment)
  // meurt ici en CONTENT_EMPTY, à coup sûr, sur CHAQUE tentative — le message
  // ne part jamais et l'entrée reste bloquée dans le SyncPill pour toujours
  // (#4039).
  it('allows empty content when location is present (location-only share)', async () => {
    const result = await validator.validateRequest(makeRequest({
      content: '',
      location: { latitude: 48.8566, longitude: 2.3522, name: 'Paris' },
    }));
    expect(result.errors.find(e => e.code === 'CONTENT_EMPTY')).toBeUndefined();
    expect(result.isValid).toBe(true);
  });

  it('errors when content exceeds MAX_MESSAGE_LENGTH (4000)', async () => {
    const result = await validator.validateRequest(makeRequest({ content: 'x'.repeat(4001) }));
    expect(result.errors.some(e => e.code === 'CONTENT_TOO_LONG')).toBe(true);
    expect(result.isValid).toBe(false);
  });

  it('errors when conversationId is missing', async () => {
    const result = await validator.validateRequest(makeRequest({ conversationId: '' }));
    expect(result.errors.some(e => e.code === 'CONVERSATION_ID_REQUIRED')).toBe(true);
  });

  it('errors when isAnonymous without anonymousDisplayName', async () => {
    const result = await validator.validateRequest(makeRequest({ isAnonymous: true, anonymousDisplayName: '' }));
    expect(result.errors.some(e => e.code === 'ANONYMOUS_NAME_REQUIRED')).toBe(true);
  });

  it('allows missing anonymousDisplayName when isAnonymous is false', async () => {
    const result = await validator.validateRequest(makeRequest({ isAnonymous: false }));
    expect(result.errors.find(e => e.code === 'ANONYMOUS_NAME_REQUIRED')).toBeUndefined();
  });

  it(`errors when total attachments exceed ${MAX_ATTACHMENTS_PER_MESSAGE}`, async () => {
    const result = await validator.validateRequest(makeRequest({
      attachmentIds: new Array(MAX_ATTACHMENTS_PER_MESSAGE - 4).fill('att'),
      attachments: new Array(5).fill({ id: 'att' }) as unknown as MessageRequest['attachments'],
    }));
    expect(result.errors.some(e => e.code === 'TOO_MANY_ATTACHMENTS')).toBe(true);
  });

  it(`accepts exactly ${MAX_ATTACHMENTS_PER_MESSAGE} attachments`, async () => {
    const result = await validator.validateRequest(makeRequest({
      content: '',
      attachmentIds: new Array(MAX_ATTACHMENTS_PER_MESSAGE).fill('att'),
    }));
    expect(result.errors.find(e => e.code === 'TOO_MANY_ATTACHMENTS')).toBeUndefined();
    expect(result.isValid).toBe(true);
  });

  // Régression : ce cap est le seul appliqué aux deux transports. Figé à 10, il
  // rejetait tout envoi du composer iOS (plafonné à 199 depuis le 2026-08-14).
  it('accepts a full iOS composer selection (199 pieces) with a group caption', async () => {
    const result = await validator.validateRequest(makeRequest({
      content: 'Notre voyage',
      attachmentIds: new Array(199).fill('att'),
    }));
    expect(result.isValid).toBe(true);
  });

  it('produces long-content warning when content > 1000 chars', async () => {
    const result = await validator.validateRequest(makeRequest({ content: 'y'.repeat(1001) }));
    expect(result.warnings).toBeDefined();
    expect(result.warnings![0].code).toBe('LONG_CONTENT_WARNING');
  });

  it('accumulates multiple errors', async () => {
    const result = await validator.validateRequest(makeRequest({ conversationId: '', content: '' }));
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.isValid).toBe(false);
  });
});

// ── resolveConversationId ─────────────────────────────────────────────────

describe('MessageValidator.resolveConversationId', () => {
  it('delegates to conversation-id-cache utility', async () => {
    mockResolveConvId.mockResolvedValue('resolved-id');
    const m = makeMocks();
    const validator = new MessageValidator(makePrisma(m));
    const id = await validator.resolveConversationId('some-identifier');
    expect(id).toBe('resolved-id');
    expect(mockResolveConvId).toHaveBeenCalled();
  });

  it('returns null when identifier cannot be resolved', async () => {
    mockResolveConvId.mockResolvedValue(null);
    const m = makeMocks();
    const validator = new MessageValidator(makePrisma(m));
    const id = await validator.resolveConversationId('unknown-id');
    expect(id).toBeNull();
  });
});

// ── detectLanguage ────────────────────────────────────────────────────────

describe('MessageValidator.detectLanguage', () => {
  let validator: MessageValidator;
  let mockFetch: jest.Mock<any>;

  beforeEach(() => {
    mockFetch = jest.fn() as jest.Mock<any>;
    (global as unknown as { fetch: unknown }).fetch = mockFetch;
    const m = makeMocks();
    validator = new MessageValidator(makePrisma(m));
  });

  afterEach(() => {
    delete (global as unknown as Record<string, unknown>).fetch;
  });

  it('returns detected language on success', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ language: 'es' }) });
    const lang = await validator.detectLanguage('Hola mundo');
    expect(lang).toBe('es');
  });

  it('returns fr when response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const lang = await validator.detectLanguage('some text');
    expect(lang).toBe('fr');
  });

  it('returns fr when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    const lang = await validator.detectLanguage('some text');
    expect(lang).toBe('fr');
  });

  it('returns fr when language field is empty string', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ language: '' }) });
    const lang = await validator.detectLanguage('some text');
    expect(lang).toBe('fr');
  });

  it('truncates content to 5000 chars before sending', async () => {
    const longText = 'a'.repeat(10000);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ language: 'en' }) });
    await validator.detectLanguage(longText);
    const callOpts = mockFetch.mock.calls[0][1] as { body: string };
    const body = JSON.parse(callOpts.body) as { text: string };
    expect(body.text.length).toBe(5000);
  });
});
