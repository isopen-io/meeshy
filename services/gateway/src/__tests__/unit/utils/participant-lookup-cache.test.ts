/**
 * Unit tests for src/utils/participant-lookup-cache.ts
 *
 * The module uses a module-level Map as cache.
 * We use jest.isolateModules to get a fresh module per test to avoid
 * cross-test cache pollution.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

type ParticipantLookupCacheModule = typeof import('../../../utils/participant-lookup-cache');

function loadFreshModule(): ParticipantLookupCacheModule {
  let mod: ParticipantLookupCacheModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('../../../utils/participant-lookup-cache');
  });
  return mod!;
}

const PARTICIPANT_ID = '507f1f77bcf86cd799439014';
const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const PARTICIPANT = { id: PARTICIPANT_ID, conversationId: CONVERSATION_ID, isActive: true };

describe('participant-lookup-cache', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getCachedParticipant', () => {
    it('test_getCachedParticipant_neverCached_returnsUndefined', () => {
      const { getCachedParticipant } = loadFreshModule();

      const result = getCachedParticipant(PARTICIPANT_ID, CONVERSATION_ID);

      expect(result).toBeUndefined();
    });

    it('test_getCachedParticipant_afterCaching_returnsCachedValue', () => {
      const { getCachedParticipant, cacheParticipant } = loadFreshModule();

      cacheParticipant(PARTICIPANT_ID, CONVERSATION_ID, PARTICIPANT);
      const result = getCachedParticipant(PARTICIPANT_ID, CONVERSATION_ID);

      expect(result).toEqual(PARTICIPANT);
    });

    it('test_getCachedParticipant_differentConversationId_returnsUndefined', () => {
      const { getCachedParticipant, cacheParticipant } = loadFreshModule();

      cacheParticipant(PARTICIPANT_ID, CONVERSATION_ID, PARTICIPANT);
      const result = getCachedParticipant(PARTICIPANT_ID, 'other-conversation-id');

      expect(result).toBeUndefined();
    });

    it('test_getCachedParticipant_afterTtlExpires_returnsUndefined', () => {
      jest.useFakeTimers();
      const { getCachedParticipant, cacheParticipant } = loadFreshModule();

      cacheParticipant(PARTICIPANT_ID, CONVERSATION_ID, PARTICIPANT);
      jest.advanceTimersByTime(30_001);
      const result = getCachedParticipant(PARTICIPANT_ID, CONVERSATION_ID);

      expect(result).toBeUndefined();
    });

    it('test_getCachedParticipant_justBeforeTtlExpires_returnsCachedValue', () => {
      jest.useFakeTimers();
      const { getCachedParticipant, cacheParticipant } = loadFreshModule();

      cacheParticipant(PARTICIPANT_ID, CONVERSATION_ID, PARTICIPANT);
      jest.advanceTimersByTime(29_000);
      const result = getCachedParticipant(PARTICIPANT_ID, CONVERSATION_ID);

      expect(result).toEqual(PARTICIPANT);
    });
  });

  describe('invalidateParticipantLookup', () => {
    it('test_invalidateParticipantLookup_removesEntry', () => {
      const { getCachedParticipant, cacheParticipant, invalidateParticipantLookup } = loadFreshModule();

      cacheParticipant(PARTICIPANT_ID, CONVERSATION_ID, PARTICIPANT);
      invalidateParticipantLookup(PARTICIPANT_ID, CONVERSATION_ID);
      const result = getCachedParticipant(PARTICIPANT_ID, CONVERSATION_ID);

      expect(result).toBeUndefined();
    });

    it('test_invalidateParticipantLookup_unknownKey_doesNotThrow', () => {
      const { invalidateParticipantLookup } = loadFreshModule();

      expect(() => invalidateParticipantLookup('unknown', 'unknown')).not.toThrow();
    });

    it('test_invalidateParticipantLookup_otherConversationEntriesUnaffected', () => {
      const { getCachedParticipant, cacheParticipant, invalidateParticipantLookup } = loadFreshModule();
      const otherParticipant = { id: PARTICIPANT_ID, conversationId: 'other-conv', isActive: true };

      cacheParticipant(PARTICIPANT_ID, CONVERSATION_ID, PARTICIPANT);
      cacheParticipant(PARTICIPANT_ID, 'other-conv', otherParticipant);
      invalidateParticipantLookup(PARTICIPANT_ID, CONVERSATION_ID);

      expect(getCachedParticipant(PARTICIPANT_ID, CONVERSATION_ID)).toBeUndefined();
      expect(getCachedParticipant(PARTICIPANT_ID, 'other-conv')).toEqual(otherParticipant);
    });
  });

  describe('resetParticipantLookupCache', () => {
    it('test_resetParticipantLookupCache_clearsAllEntries', () => {
      const { getCachedParticipant, cacheParticipant, resetParticipantLookupCache } = loadFreshModule();

      cacheParticipant(PARTICIPANT_ID, CONVERSATION_ID, PARTICIPANT);
      resetParticipantLookupCache();

      expect(getCachedParticipant(PARTICIPANT_ID, CONVERSATION_ID)).toBeUndefined();
    });
  });
});
