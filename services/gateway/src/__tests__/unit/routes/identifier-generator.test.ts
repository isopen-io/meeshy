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
  generateShareLinkId,
  generateUniqueShareLinkId,
  generateConversationIdentifier,
  ensureUniqueConversationIdentifier,
  ensureUniqueShareLinkIdentifier,
  getPredictedModelType,
} from '../../../routes/conversations/utils/identifier-generator';
import * as linkHelpers from '../../../routes/links/utils/link-helpers';

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
// Identifiants de LIEN DE PARTAGE — ré-exportés, jamais recopiés
//
// SUPERSÈDE `generateInitialLinkId` / `generateFinalLinkId`, dont ce fichier
// portait une COPIE mot pour mot de l'implémentation de `link-helpers.ts` —
// deux exemplaires d'une même loi, dont l'un pouvait dériver sans que rien ne
// rougisse. `sharing.ts` importait la copie, `creation.ts` l'original : le
// raccourcissement du linkId (2026-08-23) n'aurait touché qu'un des deux
// chemins de création.
//
// La loi elle-même est testée UNE fois, dans `links/link-helpers.test.ts`.
// Ici on n'atteste que l'IDENTITÉ — c'est ce qui interdit qu'une copie
// revienne.
// ---------------------------------------------------------------------------

describe('share link identifiers are re-exported, never re-implemented', () => {
  it('test_shareLinkGenerators_areTheSameFunctionObjects_asLinkHelpers', () => {
    expect(generateShareLinkId).toBe(linkHelpers.generateShareLinkId);
    expect(generateUniqueShareLinkId).toBe(linkHelpers.generateUniqueShareLinkId);
    expect(ensureUniqueShareLinkIdentifier).toBe(linkHelpers.ensureUniqueShareLinkIdentifier);
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

  it('test_ensureUniqueShareLink_trimsTrailingSpaces', async () => {
    mockShareLinkFindFirst.mockResolvedValue(null);
    const prisma = makePrisma();

    const result = await ensureUniqueShareLinkIdentifier(prisma, '  my-link  ');

    expect(result).toBe('my-link');
  });

  // Les autres branches — repli compact sur chaîne vide, suffixe ALÉATOIRE au
  // lieu d'un horodatage, escalade bornée au lieu d'un `while (true)` — sont
  // attestées UNE fois, dans `links/link-helpers.test.ts`, sur la fonction que
  // ce module ré-exporte (identité vérifiée plus haut).
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
