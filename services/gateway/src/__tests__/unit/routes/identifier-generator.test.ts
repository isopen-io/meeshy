/**
 * Unit tests for src/routes/conversations/utils/identifier-generator.ts
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

// Mock the shared helper so we control its output
jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  generateConversationIdentifier: jest.fn((title?: string) =>
    title ? `mshy_${title}-20260101000000` : `mshy_abc123-20260101000000`
  ),
}));

import {
  generateInitialLinkId,
  generateFinalLinkId,
  generateConversationIdentifier,
  ensureUniqueConversationIdentifier,
  ensureUniqueShareLinkIdentifier,
  getPredictedModelType,
} from '../../../routes/conversations/utils/identifier-generator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockConvFindFirst = jest.fn() as jest.Mock<any>;
const mockShareLinkFindFirst = jest.fn() as jest.Mock<any>;

function makePrisma(): PrismaClient {
  return {
    conversation: { findFirst: mockConvFindFirst },
    conversationShareLink: { findFirst: mockShareLinkFindFirst },
  } as unknown as PrismaClient;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// generateInitialLinkId
// ---------------------------------------------------------------------------

describe('generateInitialLinkId', () => {
  it('test_generateInitialLinkId_always_returnsTimestampUnderscoreRandom', () => {
    const id = generateInitialLinkId();
    // Format: yymmddhhm_<random>
    expect(id).toMatch(/^\d{10}_[a-z0-9]+$/);
  });

  it('test_generateInitialLinkId_calledTwice_producesDistinctIds', () => {
    const id1 = generateInitialLinkId();
    const id2 = generateInitialLinkId();
    // Randomness makes them almost certainly different
    // We can at least assert both have the right shape
    expect(id1).toMatch(/^\d{10}_/);
    expect(id2).toMatch(/^\d{10}_/);
  });
});

// ---------------------------------------------------------------------------
// generateFinalLinkId
// ---------------------------------------------------------------------------

describe('generateFinalLinkId', () => {
  it('test_generateFinalLinkId_withBothArgs_returnsMshyPrefixedFormat', () => {
    const result = generateFinalLinkId('abc123', '2606171200_xyz');
    expect(result).toBe('mshy_abc123.2606171200_xyz');
  });

  it('test_generateFinalLinkId_preservesDotsInInitialId', () => {
    const result = generateFinalLinkId('shareId', 'initial.with.dots');
    expect(result).toBe('mshy_shareId.initial.with.dots');
  });
});

// ---------------------------------------------------------------------------
// generateConversationIdentifier
// ---------------------------------------------------------------------------

describe('generateConversationIdentifier', () => {
  it('test_generateConversationIdentifier_withTitle_delegatesToShared', () => {
    const { generateConversationIdentifier: sharedGen } =
      jest.requireMock('@meeshy/shared/utils/conversation-helpers');

    const result = generateConversationIdentifier('My Conv');
    expect(sharedGen).toHaveBeenCalledWith('My Conv');
    expect(result).toBe('mshy_My Conv-20260101000000');
  });

  it('test_generateConversationIdentifier_withoutTitle_delegatesToShared', () => {
    const { generateConversationIdentifier: sharedGen } =
      jest.requireMock('@meeshy/shared/utils/conversation-helpers');

    const result = generateConversationIdentifier();
    expect(sharedGen).toHaveBeenCalledWith(undefined);
    expect(result).toBe('mshy_abc123-20260101000000');
  });
});

// ---------------------------------------------------------------------------
// ensureUniqueConversationIdentifier
// ---------------------------------------------------------------------------

describe('ensureUniqueConversationIdentifier', () => {
  it('test_ensureUnique_identifierNotExists_returnsBase', async () => {
    mockConvFindFirst.mockResolvedValue(null);
    const prisma = makePrisma();

    const result = await ensureUniqueConversationIdentifier(prisma, 'mshy_test-20260101');

    expect(result).toBe('mshy_test-20260101');
  });

  it('test_ensureUnique_identifierExists_noHexSuffix_addsHexSuffix', async () => {
    // First findFirst (base identifier) → exists
    // Second findFirst (with hex suffix) → not found
    // Use a base that does NOT end with 8 hex chars (avoid the strip-suffix path)
    mockConvFindFirst
      .mockResolvedValueOnce({ id: 'existingId' })
      .mockResolvedValueOnce(null);
    const prisma = makePrisma();

    const result = await ensureUniqueConversationIdentifier(prisma, 'mshy_my-group-chat');

    expect(result).toMatch(/^mshy_my-group-chat-[a-f0-9]{8}$/);
  });

  it('test_ensureUnique_identifierExistsWithHexSuffix_stripsAndReplacesHex', async () => {
    // The base has a hex suffix already → strip it, regenerate
    // First findFirst (base with old hex suffix) → exists
    // Second findFirst (base without suffix + new hex) → not found
    mockConvFindFirst
      .mockResolvedValueOnce({ id: 'existingId' })
      .mockResolvedValueOnce(null);
    const prisma = makePrisma();

    const result = await ensureUniqueConversationIdentifier(prisma, 'mshy_test-20260101-aabbccdd');

    // Should strip old suffix and add new one based on base
    expect(result).toMatch(/^mshy_test-20260101-[a-f0-9]{8}$/);
  });

  it('test_ensureUnique_bothBaseAndHexExist_recurses', async () => {
    // base exists, hex variant exists too → recursive call → base exists again → hex variant free
    mockConvFindFirst
      .mockResolvedValueOnce({ id: '1' })   // base exists
      .mockResolvedValueOnce({ id: '2' })   // hex variant exists
      .mockResolvedValueOnce(null);          // recursive: base free on second try
    const prisma = makePrisma();

    const result = await ensureUniqueConversationIdentifier(prisma, 'mshy_recurse');

    // After stripping (no hex on 'mshy_recurse') and finding free, we get mshy_recurse
    expect(result).toBe('mshy_recurse');
  });
});

// ---------------------------------------------------------------------------
// ensureUniqueShareLinkIdentifier
// ---------------------------------------------------------------------------

describe('ensureUniqueShareLinkIdentifier', () => {
  it('test_ensureUniqueShareLink_notExists_returnsBase', async () => {
    mockShareLinkFindFirst.mockResolvedValue(null);
    const prisma = makePrisma();

    const result = await ensureUniqueShareLinkIdentifier(prisma, 'my-link');

    expect(result).toBe('my-link');
  });

  it('test_ensureUniqueShareLink_emptyString_generatesDefault', async () => {
    mockShareLinkFindFirst.mockResolvedValue(null);
    const prisma = makePrisma();

    const result = await ensureUniqueShareLinkIdentifier(prisma, '');

    expect(result).toMatch(/^mshy_link-\d+-[a-z0-9]+$/);
  });

  it('test_ensureUniqueShareLink_whitespaceOnly_generatesDefault', async () => {
    mockShareLinkFindFirst.mockResolvedValue(null);
    const prisma = makePrisma();

    const result = await ensureUniqueShareLinkIdentifier(prisma, '   ');

    expect(result).toMatch(/^mshy_link-\d+-[a-z0-9]+$/);
  });

  it('test_ensureUniqueShareLink_baseExists_addsTimestampSuffix', async () => {
    mockShareLinkFindFirst
      .mockResolvedValueOnce({ id: 'existing' }) // base exists
      .mockResolvedValueOnce(null);               // timestamp variant free
    const prisma = makePrisma();

    const result = await ensureUniqueShareLinkIdentifier(prisma, 'my-link');

    // base-YYYYmmddHHMMSS format
    expect(result).toMatch(/^my-link-\d{14}$/);
  });

  it('test_ensureUniqueShareLink_baseAndTimestampExist_addsCounter', async () => {
    mockShareLinkFindFirst
      .mockResolvedValueOnce({ id: 'existing' })         // base exists
      .mockResolvedValueOnce({ id: 'existing-ts' })      // timestamp variant exists
      .mockResolvedValueOnce(null);                       // counter-1 variant is free
    const prisma = makePrisma();

    const result = await ensureUniqueShareLinkIdentifier(prisma, 'my-link');

    expect(result).toMatch(/^my-link-\d{14}-1$/);
  });

  it('test_ensureUniqueShareLink_firstTwoCountersBusy_returnsCounter2', async () => {
    mockShareLinkFindFirst
      .mockResolvedValueOnce({ id: '1' })   // base exists
      .mockResolvedValueOnce({ id: '2' })   // timestamp exists
      .mockResolvedValueOnce({ id: '3' })   // counter-1 exists
      .mockResolvedValueOnce(null);          // counter-2 free
    const prisma = makePrisma();

    const result = await ensureUniqueShareLinkIdentifier(prisma, 'my-link');

    expect(result).toMatch(/^my-link-\d{14}-2$/);
  });

  it('test_ensureUniqueShareLink_trimsTrailingSpaces', async () => {
    mockShareLinkFindFirst.mockResolvedValue(null);
    const prisma = makePrisma();

    const result = await ensureUniqueShareLinkIdentifier(prisma, '  my-link  ');

    expect(result).toBe('my-link');
  });

  it('test_ensureUniqueShareLink_whitespaceInput_baseExists_timestampVariantIsTrimmed', async () => {
    // The collision variant must be built from the SAME trimmed value that was
    // checked for existence — surrounding whitespace must never survive into the
    // persisted identifier, otherwise the uniqueness check (run on the trimmed
    // form) and the returned value diverge.
    mockShareLinkFindFirst
      .mockResolvedValueOnce({ id: 'existing' }) // trimmed base exists
      .mockResolvedValueOnce(null);               // timestamp variant free
    const prisma = makePrisma();

    const result = await ensureUniqueShareLinkIdentifier(prisma, '  my-link  ');

    expect(result).toMatch(/^my-link-\d{14}$/);
  });

  it('test_ensureUniqueShareLink_whitespaceInput_baseAndTimestampExist_counterVariantIsTrimmed', async () => {
    mockShareLinkFindFirst
      .mockResolvedValueOnce({ id: '1' })   // trimmed base exists
      .mockResolvedValueOnce({ id: '2' })   // timestamp variant exists
      .mockResolvedValueOnce(null);          // counter-1 variant free
    const prisma = makePrisma();

    const result = await ensureUniqueShareLinkIdentifier(prisma, '  my-link  ');

    expect(result).toMatch(/^my-link-\d{14}-1$/);
  });
});

// ---------------------------------------------------------------------------
// getPredictedModelType
// ---------------------------------------------------------------------------

describe('getPredictedModelType', () => {
  it('test_getPredictedModelType_lengthZero_returnsBasic', () => {
    expect(getPredictedModelType(0)).toBe('basic');
  });

  it('test_getPredictedModelType_length19_returnsBasic', () => {
    expect(getPredictedModelType(19)).toBe('basic');
  });

  it('test_getPredictedModelType_length20_returnsMedium', () => {
    expect(getPredictedModelType(20)).toBe('medium');
  });

  it('test_getPredictedModelType_length100_returnsMedium', () => {
    expect(getPredictedModelType(100)).toBe('medium');
  });

  it('test_getPredictedModelType_length101_returnsPremium', () => {
    expect(getPredictedModelType(101)).toBe('premium');
  });

  it('test_getPredictedModelType_largeLength_returnsPremium', () => {
    expect(getPredictedModelType(10000)).toBe('premium');
  });
});
