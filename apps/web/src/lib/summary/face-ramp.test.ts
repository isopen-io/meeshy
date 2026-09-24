import { describe, expect, test } from 'bun:test';

import { FACE_RAMP_WEIGHTS, RECENCY_HALF_LIFE_MS, makeFaceRampInputs, rankFaceRamp } from './face-ramp';
import type { AwaitingItem, DigestParticipant, FaceRampRankingInput } from './types';

/**
 * `rankFaceRamp` / `makeFaceRampInputs` — miroir de
 * `FaceRampRankingTests.swift` (#5695, étape 6). Douze cas.
 */

const NOW = Date.UTC(2026, 0, 10, 9, 0, 0);

const entry = (partial: Partial<FaceRampRankingInput> & { readonly id: string; readonly displayName: string }): FaceRampRankingInput => ({
  avatarUrl: null,
  colorHex: '#000000',
  presence: 'offline',
  mentionEvidence: [],
  directReplyEvidence: [],
  unansweredQuestionEvidence: [],
  mostRecentEvidenceAt: null,
  ...partial,
});

const participant = (id: string, displayName: string): DigestParticipant => ({
  id,
  displayName,
  avatarUrl: null,
  colorHex: '#000000',
  presence: 'offline',
});

describe('rankFaceRamp — les douze cas', () => {
  test('weights_matchContract', () => {
    expect(FACE_RAMP_WEIGHTS).toEqual({ mention: 5, directReply: 3, unansweredQuestion: 2, recency: 1 });
    expect(RECENCY_HALF_LIFE_MS).toBe(7 * 24 * 3600 * 1000);
  });

  test('karimWithThreeUnansweredQuestions_ranksFirst', () => {
    const ranked = rankFaceRamp(
      [
        entry({ id: 'u-adam', displayName: 'Adam', unansweredQuestionEvidence: ['q1'] }),
        entry({ id: 'u-karim', displayName: 'Karim', unansweredQuestionEvidence: ['q2', 'q3', 'q4'] }),
      ],
      NOW,
    );
    expect(ranked.map((e) => e.id)).toEqual(['u-karim', 'u-adam']);
  });

  test('awaitingCount_isEvidenceCount_notScore (score 10, badge 3)', () => {
    const [ranked] = rankFaceRamp(
      [entry({ id: 'u1', displayName: 'A', unansweredQuestionEvidence: ['q1', 'q2', 'q3'] })],
      NOW,
    );
    expect(ranked?.needScore).toBe(6);
    expect(ranked?.awaitingCount).toBe(3);
  });

  test('awaitingCount_dedupsSharedEvidenceAcrossKinds', () => {
    // Le MÊME message est à la fois une mention et une question sans
    // réponse — le score compte les DEUX poids, le badge ne compte le
    // message qu'UNE fois.
    const [ranked] = rankFaceRamp(
      [entry({ id: 'u1', displayName: 'A', mentionEvidence: ['m1'], unansweredQuestionEvidence: ['m1'] })],
      NOW,
    );
    expect(ranked?.needScore).toBe(FACE_RAMP_WEIGHTS.mention + FACE_RAMP_WEIGHTS.unansweredQuestion);
    expect(ranked?.awaitingCount).toBe(1);
    expect(ranked?.evidenceMessageIds).toEqual(['m1']);
  });

  test('tieBrokenAlphabeticallyByDisplayName', () => {
    const ranked = rankFaceRamp(
      [
        entry({ id: 'u-b', displayName: 'Bruno', mentionEvidence: ['m1'] }),
        entry({ id: 'u-a', displayName: 'Amina', mentionEvidence: ['m2'] }),
      ],
      NOW,
    );
    expect(ranked.map((e) => e.displayName)).toEqual(['Amina', 'Bruno']);
  });

  test('zeroSignalEntries_rankLast_sortedAlphabetically', () => {
    const ranked = rankFaceRamp(
      [
        entry({ id: 'u-z', displayName: 'Zoé' }),
        entry({ id: 'u-a', displayName: 'Amina', mentionEvidence: ['m1'] }),
        entry({ id: 'u-b', displayName: 'Bruno' }),
      ],
      NOW,
    );
    expect(ranked.map((e) => e.displayName)).toEqual(['Amina', 'Bruno', 'Zoé']);
  });

  test('recency_atHalfLife_contributesHalfWeight', () => {
    const [ranked] = rankFaceRamp(
      [entry({ id: 'u1', displayName: 'A', mostRecentEvidenceAt: NOW - RECENCY_HALF_LIFE_MS })],
      NOW,
    );
    expect(ranked?.needScore).toBeCloseTo(0.5, 4);
  });

  test('recency_rightNow_contributesFullWeight', () => {
    const [ranked] = rankFaceRamp([entry({ id: 'u1', displayName: 'A', mostRecentEvidenceAt: NOW })], NOW);
    expect(ranked?.needScore).toBeCloseTo(1, 4);
  });

  test('recency_nullEvidence_contributesZero', () => {
    const [ranked] = rankFaceRamp([entry({ id: 'u1', displayName: 'A', mostRecentEvidenceAt: null })], NOW);
    expect(ranked?.needScore).toBe(0);
  });

  test('makeInputs_groupsByFromUserId_resolvesKnownParticipant', () => {
    const awaitingYou: readonly AwaitingItem[] = [
      { id: 'mention_m1', kind: 'mention', fromUserId: 'u-amina', evidenceMessageIds: ['m1'], at: NOW },
      { id: 'question_m2', kind: 'unansweredQuestion', fromUserId: 'u-amina', evidenceMessageIds: ['m2'], at: NOW + 1 },
    ];
    const inputs = makeFaceRampInputs({ awaitingYou, participants: [participant('u-amina', 'Amina')] });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.id).toBe('u-amina');
    expect(inputs[0]?.displayName).toBe('Amina');
    expect(inputs[0]?.mentionEvidence).toEqual(['m1']);
    expect(inputs[0]?.unansweredQuestionEvidence).toEqual(['m2']);
    expect(inputs[0]?.mostRecentEvidenceAt).toBe(NOW + 1);
  });

  test('makeInputs_skipsUnknownParticipant_zeroFabricatedIdentity', () => {
    const awaitingYou: readonly AwaitingItem[] = [
      { id: 'mention_m1', kind: 'mention', fromUserId: 'u-ghost', evidenceMessageIds: ['m1'], at: NOW },
    ];
    const inputs = makeFaceRampInputs({ awaitingYou, participants: [] });
    expect(inputs).toEqual([]);
  });

  test('makeInputs_thenRank_endToEnd (Karim d’abord, badge 3)', () => {
    const awaitingYou: readonly AwaitingItem[] = [
      { id: 'question_q1', kind: 'unansweredQuestion', fromUserId: 'u-karim', evidenceMessageIds: ['q1'], at: NOW },
      { id: 'question_q2', kind: 'unansweredQuestion', fromUserId: 'u-karim', evidenceMessageIds: ['q2'], at: NOW + 1 },
      { id: 'question_q3', kind: 'unansweredQuestion', fromUserId: 'u-karim', evidenceMessageIds: ['q3'], at: NOW + 2 },
      { id: 'mention_m1', kind: 'mention', fromUserId: 'u-adam', evidenceMessageIds: ['m1'], at: NOW },
    ];
    const inputs = makeFaceRampInputs({
      awaitingYou,
      participants: [participant('u-karim', 'Karim'), participant('u-adam', 'Adam')],
    });
    const ranked = rankFaceRamp(inputs, NOW + 2);
    expect(ranked[0]?.id).toBe('u-karim');
    expect(ranked[0]?.awaitingCount).toBe(3);
  });
});
