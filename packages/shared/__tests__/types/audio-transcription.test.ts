import { describe, it, expect } from 'vitest';
import {
  getQualityLevel,
  isVoiceModelUsable,
  getRecommendedMinDuration,
  needsMoreSamples,
  getVoiceModelStatus,
} from '../../types/audio-transcription';
import type { UserVoiceModel } from '../../types/audio-transcription';

// ── factory ────────────────────────────────────────────────────────────────

function makeVoiceModel(overrides: Partial<UserVoiceModel> = {}): UserVoiceModel {
  return {
    id: 'vm-001',
    userId: 'user-001',
    embeddingModel: 'xtts_v2',
    embeddingDimension: 256,
    audioCount: 5,
    totalDurationMs: 45000,
    qualityScore: 0.8,
    version: 1,
    isActive: true,
    embedding: new Uint8Array([1, 2, 3]),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides,
  };
}

// ── getQualityLevel ────────────────────────────────────────────────────────

describe('getQualityLevel', () => {
  it('returns "low" for score < 0.3', () => {
    expect(getQualityLevel(0)).toBe('low');
    expect(getQualityLevel(0.1)).toBe('low');
    expect(getQualityLevel(0.299)).toBe('low');
  });

  it('returns "medium" for score in [0.3, 0.5)', () => {
    expect(getQualityLevel(0.3)).toBe('medium');
    expect(getQualityLevel(0.4)).toBe('medium');
    expect(getQualityLevel(0.499)).toBe('medium');
  });

  it('returns "good" for score in [0.5, 0.7)', () => {
    expect(getQualityLevel(0.5)).toBe('good');
    expect(getQualityLevel(0.6)).toBe('good');
    expect(getQualityLevel(0.699)).toBe('good');
  });

  it('returns "excellent" for score >= 0.7', () => {
    expect(getQualityLevel(0.7)).toBe('excellent');
    expect(getQualityLevel(0.9)).toBe('excellent');
    expect(getQualityLevel(1.0)).toBe('excellent');
  });
});

// ── isVoiceModelUsable ─────────────────────────────────────────────────────

describe('isVoiceModelUsable', () => {
  it('returns true when active, qualityScore >= 0.3, and has embedding', () => {
    expect(isVoiceModelUsable(makeVoiceModel())).toBe(true);
  });

  it('returns false when model is inactive', () => {
    expect(isVoiceModelUsable(makeVoiceModel({ isActive: false }))).toBe(false);
  });

  it('returns false when qualityScore is below 0.3', () => {
    expect(isVoiceModelUsable(makeVoiceModel({ qualityScore: 0.29 }))).toBe(false);
  });

  it('returns true at qualityScore boundary 0.3', () => {
    expect(isVoiceModelUsable(makeVoiceModel({ qualityScore: 0.3 }))).toBe(true);
  });

  it('returns false when embedding is absent', () => {
    expect(isVoiceModelUsable(makeVoiceModel({ embedding: undefined }))).toBe(false);
  });

  it('returns false when all conditions fail', () => {
    expect(
      isVoiceModelUsable(makeVoiceModel({ isActive: false, qualityScore: 0.1, embedding: undefined }))
    ).toBe(false);
  });
});

// ── getRecommendedMinDuration ──────────────────────────────────────────────

describe('getRecommendedMinDuration', () => {
  it('returns 30 seconds in milliseconds', () => {
    expect(getRecommendedMinDuration()).toBe(30000);
  });
});

// ── needsMoreSamples ───────────────────────────────────────────────────────

describe('needsMoreSamples', () => {
  it('returns false when duration >= 30s and quality >= 0.5', () => {
    expect(needsMoreSamples(makeVoiceModel({ totalDurationMs: 30000, qualityScore: 0.5 }))).toBe(false);
  });

  it('returns true when duration is below 30s', () => {
    expect(needsMoreSamples(makeVoiceModel({ totalDurationMs: 29999, qualityScore: 0.8 }))).toBe(true);
  });

  it('returns true when qualityScore is below 0.5', () => {
    expect(needsMoreSamples(makeVoiceModel({ totalDurationMs: 60000, qualityScore: 0.4 }))).toBe(true);
  });

  it('returns true when both conditions fail', () => {
    expect(needsMoreSamples(makeVoiceModel({ totalDurationMs: 5000, qualityScore: 0.2 }))).toBe(true);
  });

  it('returns false at exact boundary: 30000ms and 0.5', () => {
    expect(needsMoreSamples(makeVoiceModel({ totalDurationMs: 30000, qualityScore: 0.5 }))).toBe(false);
  });
});

// ── getVoiceModelStatus ────────────────────────────────────────────────────

describe('getVoiceModelStatus', () => {
  it('returns no-model status when model is null', () => {
    const status = getVoiceModelStatus(null);
    expect(status.hasModel).toBe(false);
    expect(status.qualityLevel).toBe('none');
    expect(status.needsMoreSamples).toBe(true);
    expect(status.recommendedMinDurationMs).toBe(30000);
    expect(status.qualityScore).toBeUndefined();
    expect(status.audioCount).toBeUndefined();
    expect(status.totalDurationMs).toBeUndefined();
  });

  it('includes model data when model is provided', () => {
    const model = makeVoiceModel({ qualityScore: 0.8, audioCount: 3, totalDurationMs: 45000 });
    const status = getVoiceModelStatus(model);
    expect(status.hasModel).toBe(true);
    expect(status.qualityLevel).toBe('excellent');
    expect(status.qualityScore).toBe(0.8);
    expect(status.audioCount).toBe(3);
    expect(status.totalDurationMs).toBe(45000);
  });

  it('correctly computes needsMoreSamples in status', () => {
    const needsMore = getVoiceModelStatus(makeVoiceModel({ totalDurationMs: 1000, qualityScore: 0.1 }));
    expect(needsMore.needsMoreSamples).toBe(true);

    const hasEnough = getVoiceModelStatus(makeVoiceModel({ totalDurationMs: 30000, qualityScore: 0.6 }));
    expect(hasEnough.needsMoreSamples).toBe(false);
  });

  it('maps all four quality levels correctly', () => {
    expect(getVoiceModelStatus(makeVoiceModel({ qualityScore: 0.1 })).qualityLevel).toBe('low');
    expect(getVoiceModelStatus(makeVoiceModel({ qualityScore: 0.4 })).qualityLevel).toBe('medium');
    expect(getVoiceModelStatus(makeVoiceModel({ qualityScore: 0.6 })).qualityLevel).toBe('good');
    expect(getVoiceModelStatus(makeVoiceModel({ qualityScore: 0.9 })).qualityLevel).toBe('excellent');
  });
});
