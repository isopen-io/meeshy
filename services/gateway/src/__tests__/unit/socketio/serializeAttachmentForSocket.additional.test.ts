/**
 * Additional coverage for socketio/serializeAttachmentForSocket.ts
 * Covers aggregateAttachmentReactions (lines 68-71) — the reaction aggregation
 * loop with actual data including currentParticipantId matching.
 */

import { describe, it, expect } from '@jest/globals';
import { aggregateAttachmentReactions } from '../../../socketio/serializeAttachmentForSocket';

describe('aggregateAttachmentReactions', () => {
  it('returns empty summaries for null rows', () => {
    const result = aggregateAttachmentReactions(null);
    expect(result.reactionSummary).toEqual({});
    expect(result.currentUserReactions).toEqual([]);
  });

  it('returns empty summaries for undefined rows', () => {
    const result = aggregateAttachmentReactions(undefined);
    expect(result.reactionSummary).toEqual({});
    expect(result.currentUserReactions).toEqual([]);
  });

  it('returns empty summaries for empty rows array', () => {
    const result = aggregateAttachmentReactions([]);
    expect(result.reactionSummary).toEqual({});
    expect(result.currentUserReactions).toEqual([]);
  });

  it('aggregates counts for each emoji', () => {
    const rows = [
      { emoji: '👍', participantId: 'p1' },
      { emoji: '👍', participantId: 'p2' },
      { emoji: '❤️', participantId: 'p1' },
    ];
    const result = aggregateAttachmentReactions(rows);
    expect(result.reactionSummary['👍']).toBe(2);
    expect(result.reactionSummary['❤️']).toBe(1);
  });

  it('populates currentUserReactions when currentParticipantId matches', () => {
    const rows = [
      { emoji: '👍', participantId: 'p1' },
      { emoji: '❤️', participantId: 'p1' },
      { emoji: '😂', participantId: 'p2' },
    ];
    const result = aggregateAttachmentReactions(rows, 'p1');
    expect(result.currentUserReactions).toEqual(['👍', '❤️']);
  });

  it('does not duplicate emojis in currentUserReactions when same emoji appears twice from same participant', () => {
    const rows = [
      { emoji: '👍', participantId: 'p1' },
      { emoji: '👍', participantId: 'p1' }, // duplicate
    ];
    const result = aggregateAttachmentReactions(rows, 'p1');
    expect(result.currentUserReactions).toEqual(['👍']);
    expect(result.reactionSummary['👍']).toBe(2);
  });

  it('leaves currentUserReactions empty when no rows match currentParticipantId', () => {
    const rows = [
      { emoji: '👍', participantId: 'p2' },
      { emoji: '❤️', participantId: 'p3' },
    ];
    const result = aggregateAttachmentReactions(rows, 'p1');
    expect(result.currentUserReactions).toEqual([]);
    expect(result.reactionSummary['👍']).toBe(1);
  });

  it('leaves currentUserReactions empty when no currentParticipantId is provided', () => {
    const rows = [
      { emoji: '👍', participantId: 'p1' },
    ];
    const result = aggregateAttachmentReactions(rows);
    expect(result.currentUserReactions).toEqual([]);
    expect(result.reactionSummary['👍']).toBe(1);
  });
});
