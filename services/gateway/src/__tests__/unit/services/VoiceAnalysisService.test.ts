/**
 * Unit tests for VoiceAnalysisService
 *
 * Covers:
 * - analyzeAttachment (persist=true/false, errors)
 * - analyzeAttachmentsBatch (all success, mixed, empty, failure reason)
 * - analyzeVoiceProfile (persist=true/false, errors)
 * - analyzeVoiceProfilesBatch (all success, failures)
 * - calculateQualityMetrics (via analyzeAttachment): all trainingQuality buckets,
 *   suitableForCloning edge cases
 * - persistAttachmentAnalysis (via analyzeAttachment persist=true):
 *   no attachment, no transcription, transcription present
 * - persistVoiceProfileAnalysis (via analyzeVoiceProfile persist=true):
 *   no voice model, voice model present
 * - getAttachmentAnalysis: all null branches + data present
 * - getVoiceProfileAnalysis: all null branches + data present
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Mocks must be hoisted before any imports ────────────────────────────────

jest.mock('@meeshy/shared/prisma/client', () => ({ PrismaClient: jest.fn() }));

jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

// Auto-mock AudioTranslateService — jest replaces every method with jest.fn()
jest.mock('../../../services/AudioTranslateService');

// ── Imports after mocks ─────────────────────────────────────────────────────

import { VoiceAnalysisService } from '../../../services/VoiceAnalysisService';
import { AudioTranslateService } from '../../../services/AudioTranslateService';
import { normalizeVoiceAnalysis } from '../../../services/voice-analysis-normalize';

// ── Helpers / Factories ─────────────────────────────────────────────────────

/**
 * Build a minimal VoiceAnalysisResult returned by audioTranslateService.analyzeVoice.
 * Callers can override individual fields to drive calculateQualityMetrics into
 * specific branches without touching unrelated fields.
 */
const makeAnalysisResult = (overrides: {
  dynamicRange?: number;
  pitchMean?: number;
  pitchStd?: number;
  confidence?: number;
} = {}) => ({
  pitch: {
    mean: overrides.pitchMean ?? 150,
    std: overrides.pitchStd ?? 20,
    min: 80,
    max: 300,
    contour: []
  },
  energy: {
    rms: 0.5,
    peak: 0.8,
    dynamicRange: overrides.dynamicRange ?? 48
  },
  timbre: {
    spectralCentroid: 2000,
    spectralBandwidth: 1500,
    spectralRolloff: 4000,
    spectralFlatness: 0.3
  },
  mfcc: { coefficients: [], mean: [], std: [] },
  classification: {
    voiceType: 'neutral',
    gender: 'unknown',
    ageRange: 'adult',
    confidence: overrides.confidence ?? 0.7
  }
});

/** Attachment with a full transcription that has voiceQualityAnalysis. */
const makeAttachmentWithAnalysis = (voiceQualityAnalysis: Record<string, unknown> | undefined) => ({
  transcription: {
    type: 'audio',
    text: 'hello',
    language: 'en',
    confidence: 0.9,
    source: 'server',
    voiceQualityAnalysis
  }
});

/** Mock prisma instance reused in each test. */
const buildMockPrisma = () => ({
  messageAttachment: {
    findUnique: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>
  },
  userVoiceModel: {
    findUnique: jest.fn() as jest.Mock<any>,
    update: jest.fn() as jest.Mock<any>
  }
});

/** Stub ZmqTranslationClient — VoiceAnalysisService passes it to AudioTranslateService. */
const MOCK_ZMQ = {} as any;

// ── Setup ───────────────────────────────────────────────────────────────────

describe('VoiceAnalysisService', () => {
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockAnalyzeVoice: jest.Mock<any>;
  let service: VoiceAnalysisService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma = buildMockPrisma();
    mockAnalyzeVoice = jest.fn();

    // Wire the auto-mocked class so that its constructor returns an object
    // with our controlled mockAnalyzeVoice function.
    (AudioTranslateService as unknown as jest.Mock).mockImplementation(() => ({
      analyzeVoice: mockAnalyzeVoice
    }));

    service = new VoiceAnalysisService(mockPrisma as any, MOCK_ZMQ);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // analyzeAttachment
  // ═════════════════════════════════════════════════════════════════════════

  describe('analyzeAttachment', () => {
    it('returns correct shape when persist=false', async () => {
      const raw = makeAnalysisResult();
      mockAnalyzeVoice.mockResolvedValue(raw);

      const result = await service.analyzeAttachment({
        attachmentId: 'att-1',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: false
      });

      expect(result.attachmentId).toBe('att-1');
      expect(result.messageId).toBe('msg-1');
      expect(result.persisted).toBe(false);
      expect(result.analysis).toBeDefined();
      expect(result.analysis.qualityMetrics).toBeDefined();
    });

    it('does not call prisma when persist=false', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());

      await service.analyzeAttachment({
        attachmentId: 'att-1',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: false
      });

      expect(mockPrisma.messageAttachment.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.messageAttachment.update).not.toHaveBeenCalled();
    });

    it('defaults persist to true when omitted', async () => {
      const raw = makeAnalysisResult();
      mockAnalyzeVoice.mockResolvedValue(raw);

      // Attachment + transcription found → update will be called
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(
        makeAttachmentWithAnalysis(undefined)
      );
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      const result = await service.analyzeAttachment({
        attachmentId: 'att-default',
        messageId: 'msg-1',
        userId: 'user-1'
      });

      expect(result.persisted).toBe(true);
    });

    it('calls audioTranslateService.analyzeVoice with correct arguments', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(
        makeAttachmentWithAnalysis(undefined)
      );
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.analyzeAttachment({
        attachmentId: 'att-1',
        messageId: 'msg-1',
        userId: 'user-42',
        audioBase64: 'base64data',
        analysisTypes: ['pitch'],
        persist: true
      });

      expect(mockAnalyzeVoice).toHaveBeenCalledWith('user-42', {
        audioBase64: 'base64data',
        audioPath: undefined,
        analysisTypes: ['pitch']
      });
    });

    it('embeds qualityMetrics into the returned analysis object', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult({ dynamicRange: 48 }));
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      const result = await service.analyzeAttachment({
        attachmentId: 'att-1',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: true
      });

      expect(result.analysis.qualityMetrics).toMatchObject({
        overallScore: expect.any(Number),
        clarity: expect.any(Number),
        consistency: expect.any(Number),
        suitableForCloning: expect.any(Boolean),
        trainingQuality: expect.stringMatching(/poor|fair|good|excellent/)
      });
    });

    it('re-throws errors from audioTranslateService', async () => {
      const boom = new Error('ZMQ timeout');
      mockAnalyzeVoice.mockRejectedValue(boom);

      await expect(
        service.analyzeAttachment({
          attachmentId: 'att-err',
          messageId: 'msg-1',
          userId: 'user-1',
          persist: false
        })
      ).rejects.toThrow('ZMQ timeout');
    });

    it('persisted=true when attachment and transcription exist', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(
        makeAttachmentWithAnalysis(undefined)
      );
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      const result = await service.analyzeAttachment({
        attachmentId: 'att-1',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: true
      });

      expect(result.persisted).toBe(true);
      expect(mockPrisma.messageAttachment.update).toHaveBeenCalledTimes(1);
    });

    it('still returns persisted=true even when attachment not found (silent skip)', async () => {
      // The service sets persisted=true after calling persistAttachmentAnalysis
      // regardless of whether the DB record existed — the private method silently
      // returns when attachment is missing.
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      const result = await service.analyzeAttachment({
        attachmentId: 'att-missing',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: true
      });

      expect(result.persisted).toBe(true);
      expect(mockPrisma.messageAttachment.update).not.toHaveBeenCalled();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // persistAttachmentAnalysis (exercised via analyzeAttachment persist=true)
  // ═════════════════════════════════════════════════════════════════════════

  describe('persistAttachmentAnalysis (via analyzeAttachment)', () => {
    it('skips update when attachment is not found', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await service.analyzeAttachment({
        attachmentId: 'att-none',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: true
      });

      expect(mockPrisma.messageAttachment.update).not.toHaveBeenCalled();
    });

    it('skips update when attachment has no transcription', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({ transcription: null });

      await service.analyzeAttachment({
        attachmentId: 'att-no-tx',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: true
      });

      expect(mockPrisma.messageAttachment.update).not.toHaveBeenCalled();
    });

    it('calls update with merged transcription when transcription exists', async () => {
      const raw = makeAnalysisResult();
      mockAnalyzeVoice.mockResolvedValue(raw);
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(
        makeAttachmentWithAnalysis(undefined)
      );
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.analyzeAttachment({
        attachmentId: 'att-tx',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: true
      });

      expect(mockPrisma.messageAttachment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'att-tx' },
          data: expect.objectContaining({
            transcription: expect.objectContaining({
              voiceQualityAnalysis: expect.objectContaining({
                qualityMetrics: expect.any(Object)
              })
            })
          })
        })
      );
    });

    it('preserves existing transcription fields in the update payload', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        transcription: {
          type: 'audio',
          text: 'bonjour',
          language: 'fr',
          confidence: 0.95,
          source: 'server'
        }
      });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.analyzeAttachment({
        attachmentId: 'att-preserve',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: true
      });

      const updateArgs = (mockPrisma.messageAttachment.update as jest.Mock).mock
        .calls[0][0] as any;
      expect(updateArgs.data.transcription.text).toBe('bonjour');
      expect(updateArgs.data.transcription.language).toBe('fr');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // calculateQualityMetrics (via analyzeAttachment)
  // ═════════════════════════════════════════════════════════════════════════

  describe('calculateQualityMetrics (via analyzeAttachment)', () => {
    const runMetrics = async (overrides: Parameters<typeof makeAnalysisResult>[0]) => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult(overrides));
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      const result = await service.analyzeAttachment({
        attachmentId: 'att-metrics',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: true
      });
      return result.analysis.qualityMetrics!;
    };

    // clarity = min(1, dynamicRange / 60)
    it('computes clarity as dynamicRange / 60 capped at 1', async () => {
      const metrics = await runMetrics({ dynamicRange: 30 });
      expect(metrics.clarity).toBeCloseTo(0.5, 5);
    });

    it('caps clarity at 1 when dynamicRange >= 60', async () => {
      const metrics = await runMetrics({ dynamicRange: 90 });
      expect(metrics.clarity).toBe(1.0);
    });

    it('sets clarity to 0 when dynamicRange is 0', async () => {
      const metrics = await runMetrics({ dynamicRange: 0 });
      expect(metrics.clarity).toBe(0);
    });

    // consistency = max(0, 1 - std/mean)
    it('computes consistency from pitchVariance', async () => {
      // pitchVariance = 20/150 ≈ 0.1333 → consistency ≈ 0.8667
      const metrics = await runMetrics({ pitchMean: 150, pitchStd: 20 });
      expect(metrics.consistency).toBeCloseTo(1 - 20 / 150, 5);
    });

    it('floors consistency at 0 when std > mean', async () => {
      const metrics = await runMetrics({ pitchMean: 10, pitchStd: 50 });
      expect(metrics.consistency).toBe(0);
    });

    // trainingQuality buckets
    it('assigns trainingQuality=excellent when overallScore >= 0.8', async () => {
      // clarity=1 (60/60), consistency=1-0/150=1, confidence=0.9
      // overall = 1*0.4 + 1*0.3 + 0.9*0.3 = 0.97
      const metrics = await runMetrics({ dynamicRange: 60, pitchMean: 150, pitchStd: 0, confidence: 0.9 });
      expect(metrics.trainingQuality).toBe('excellent');
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0.8);
    });

    it('assigns trainingQuality=good when overallScore in [0.6, 0.8)', async () => {
      // clarity=0.5 (30/60), consistency=1-20/150≈0.867, confidence=0.5
      // overall = 0.5*0.4 + 0.867*0.3 + 0.5*0.3 = 0.2 + 0.26 + 0.15 = 0.610
      const metrics = await runMetrics({ dynamicRange: 30, pitchMean: 150, pitchStd: 20, confidence: 0.5 });
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0.6);
      expect(metrics.overallScore).toBeLessThan(0.8);
      expect(metrics.trainingQuality).toBe('good');
    });

    it('assigns trainingQuality=fair when overallScore in [0.4, 0.6)', async () => {
      // clarity=0.2 (12/60), consistency=1-50/150≈0.667, confidence=0.4
      // overall = 0.2*0.4 + 0.667*0.3 + 0.4*0.3 = 0.08 + 0.2 + 0.12 = 0.400
      const metrics = await runMetrics({ dynamicRange: 12, pitchMean: 150, pitchStd: 50, confidence: 0.4 });
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0.4);
      expect(metrics.overallScore).toBeLessThan(0.6);
      expect(metrics.trainingQuality).toBe('fair');
    });

    it('assigns trainingQuality=poor when overallScore < 0.4', async () => {
      // clarity=0 (0/60), consistency=max(0,1-200/10)=0, confidence=0
      // overall = 0*0.4 + 0*0.3 + 0*0.3 = 0
      const metrics = await runMetrics({ dynamicRange: 0, pitchMean: 10, pitchStd: 200, confidence: 0 });
      expect(metrics.overallScore).toBeLessThan(0.4);
      expect(metrics.trainingQuality).toBe('poor');
    });

    // suitableForCloning = overallScore >= 0.5 && clarity >= 0.4
    it('marks suitableForCloning=true when overallScore >= 0.5 and clarity >= 0.4', async () => {
      // clarity=1, consistency=1, confidence=0.9 → overallScore=0.97
      const metrics = await runMetrics({ dynamicRange: 60, pitchMean: 150, pitchStd: 0, confidence: 0.9 });
      expect(metrics.suitableForCloning).toBe(true);
    });

    it('marks suitableForCloning=false when overallScore < 0.5', async () => {
      // clarity=0, consistency=0, confidence=0 → overallScore=0
      const metrics = await runMetrics({ dynamicRange: 0, pitchMean: 10, pitchStd: 200, confidence: 0 });
      expect(metrics.suitableForCloning).toBe(false);
    });

    it('marks suitableForCloning=false when clarity < 0.4 even if overallScore >= 0.5', async () => {
      // clarity = 18/60 = 0.3 (< 0.4)
      // consistency = 1 - 0/150 = 1.0
      // confidence = 0.9
      // overallScore = 0.3*0.4 + 1.0*0.3 + 0.9*0.3 = 0.12 + 0.30 + 0.27 = 0.69 >= 0.5
      const metrics = await runMetrics({ dynamicRange: 18, pitchMean: 150, pitchStd: 0, confidence: 0.9 });
      expect(metrics.clarity).toBeCloseTo(0.3, 5);
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0.5);
      expect(metrics.suitableForCloning).toBe(false);
    });

    it('handles missing energy by treating dynamicRange as 0', async () => {
      // Force a raw result with no energy field
      mockAnalyzeVoice.mockResolvedValue({
        pitch: { mean: 150, std: 20, min: 80, max: 300, contour: [] },
        energy: undefined,
        timbre: { spectralCentroid: 2000, spectralBandwidth: 1500, spectralRolloff: 4000, spectralFlatness: 0.3 },
        mfcc: { coefficients: [], mean: [], std: [] },
        classification: { voiceType: 'neutral', gender: 'unknown', ageRange: 'adult', confidence: 0.5 }
      });
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      const result = await service.analyzeAttachment({
        attachmentId: 'att-no-energy',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: true
      });

      expect(result.analysis.qualityMetrics!.clarity).toBe(0);
    });

    it('handles missing classification by defaulting confidence to 0.5', async () => {
      mockAnalyzeVoice.mockResolvedValue({
        pitch: { mean: 150, std: 0, min: 80, max: 300, contour: [] },
        energy: { rms: 0.5, peak: 0.8, dynamicRange: 60 },
        timbre: { spectralCentroid: 2000, spectralBandwidth: 1500, spectralRolloff: 4000, spectralFlatness: 0.3 },
        mfcc: { coefficients: [], mean: [], std: [] },
        classification: undefined
      });
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      const result = await service.analyzeAttachment({
        attachmentId: 'att-no-class',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: false
      });

      // clarity=1.0, consistency=1.0, confidence(default)=0.5
      // overallScore = 1.0*0.4 + 1.0*0.3 + 0.5*0.3 = 0.85
      expect(result.analysis.qualityMetrics!.overallScore).toBeCloseTo(0.85, 5);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // analyzeAttachmentsBatch
  // ═════════════════════════════════════════════════════════════════════════

  describe('analyzeAttachmentsBatch', () => {
    it('returns empty success and failures for empty input', async () => {
      const result = await service.analyzeAttachmentsBatch([]);
      expect(result.success).toHaveLength(0);
      expect(result.failures).toHaveLength(0);
    });

    it('all items succeed when analyzeVoice always resolves', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      const result = await service.analyzeAttachmentsBatch([
        { attachmentId: 'att-1', messageId: 'msg-1', userId: 'u1', persist: true },
        { attachmentId: 'att-2', messageId: 'msg-2', userId: 'u2', persist: true }
      ]);

      expect(result.success).toHaveLength(2);
      expect(result.failures).toHaveLength(0);
      expect(result.success[0].attachmentId).toBe('att-1');
      expect(result.success[1].attachmentId).toBe('att-2');
    });

    it('routes failed items to the failures array with the attachment id', async () => {
      const boom = new Error('analysis failed');
      mockAnalyzeVoice
        .mockResolvedValueOnce(makeAnalysisResult()) // att-ok succeeds
        .mockRejectedValueOnce(boom);                // att-fail fails

      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      const result = await service.analyzeAttachmentsBatch([
        { attachmentId: 'att-ok', messageId: 'msg-1', userId: 'u1', persist: true },
        { attachmentId: 'att-fail', messageId: 'msg-2', userId: 'u2', persist: true }
      ]);

      expect(result.success).toHaveLength(1);
      expect(result.success[0].attachmentId).toBe('att-ok');

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].id).toBe('att-fail');
      expect(result.failures[0].error).toBe('analysis failed');
    });

    it('uses "Unknown error" when the thrown reason has no message', async () => {
      mockAnalyzeVoice.mockRejectedValue(null);

      const result = await service.analyzeAttachmentsBatch([
        { attachmentId: 'att-null', messageId: 'msg-1', userId: 'u1', persist: false }
      ]);

      expect(result.failures[0].error).toBe('Unknown error');
    });

    it('all items fail when analyzeVoice always rejects', async () => {
      mockAnalyzeVoice.mockRejectedValue(new Error('total failure'));

      const result = await service.analyzeAttachmentsBatch([
        { attachmentId: 'att-a', messageId: 'msg-1', userId: 'u1', persist: false },
        { attachmentId: 'att-b', messageId: 'msg-2', userId: 'u2', persist: false }
      ]);

      expect(result.success).toHaveLength(0);
      expect(result.failures).toHaveLength(2);
      expect(result.failures.map(f => f.id)).toEqual(['att-a', 'att-b']);
    });

    it('runs items in parallel (all analyzeVoice calls happen)', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await service.analyzeAttachmentsBatch([
        { attachmentId: 'att-1', messageId: 'msg-1', userId: 'u1', persist: true },
        { attachmentId: 'att-2', messageId: 'msg-2', userId: 'u2', persist: true },
        { attachmentId: 'att-3', messageId: 'msg-3', userId: 'u3', persist: true }
      ]);

      expect(mockAnalyzeVoice).toHaveBeenCalledTimes(3);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // analyzeVoiceProfile
  // ═════════════════════════════════════════════════════════════════════════

  describe('analyzeVoiceProfile', () => {
    it('returns correct shape when persist=false', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());

      const result = await service.analyzeVoiceProfile({
        userId: 'user-1',
        persist: false
      });

      expect(result.userId).toBe('user-1');
      expect(result.persisted).toBe(false);
      expect(result.analysis.qualityMetrics).toBeDefined();
    });

    it('does not call prisma when persist=false', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());

      await service.analyzeVoiceProfile({ userId: 'user-1', persist: false });

      expect(mockPrisma.userVoiceModel.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.userVoiceModel.update).not.toHaveBeenCalled();
    });

    it('defaults persist to true and attempts DB persistence when omitted', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue({
        userId: 'user-1',
        voiceCharacteristics: null
      });
      mockPrisma.userVoiceModel.update.mockResolvedValue({});

      const result = await service.analyzeVoiceProfile({ userId: 'user-1' });

      expect(result.persisted).toBe(true);
    });

    it('calls analyzeVoice with correct arguments', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(null);

      await service.analyzeVoiceProfile({
        userId: 'user-42',
        audioPath: '/tmp/audio.wav',
        analysisTypes: ['mfcc'],
        persist: true
      });

      expect(mockAnalyzeVoice).toHaveBeenCalledWith('user-42', {
        audioBase64: undefined,
        audioPath: '/tmp/audio.wav',
        analysisTypes: ['mfcc']
      });
    });

    it('re-throws errors from audioTranslateService', async () => {
      mockAnalyzeVoice.mockRejectedValue(new Error('voice analysis error'));

      await expect(
        service.analyzeVoiceProfile({ userId: 'user-err', persist: false })
      ).rejects.toThrow('voice analysis error');
    });

    it('includes qualityMetrics in returned analysis', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult({ dynamicRange: 60, pitchStd: 0, confidence: 0.9 }));
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(null);

      const result = await service.analyzeVoiceProfile({ userId: 'user-1', persist: true });

      expect(result.analysis.qualityMetrics!.trainingQuality).toBe('excellent');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // persistVoiceProfileAnalysis (via analyzeVoiceProfile persist=true)
  // ═════════════════════════════════════════════════════════════════════════

  describe('persistVoiceProfileAnalysis (via analyzeVoiceProfile)', () => {
    it('skips update when voice model not found', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(null);

      await service.analyzeVoiceProfile({ userId: 'user-1', persist: true });

      expect(mockPrisma.userVoiceModel.update).not.toHaveBeenCalled();
    });

    it('calls update when voice model exists', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue({
        userId: 'user-1',
        voiceCharacteristics: null
      });
      mockPrisma.userVoiceModel.update.mockResolvedValue({});

      await service.analyzeVoiceProfile({ userId: 'user-1', persist: true });

      expect(mockPrisma.userVoiceModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          data: expect.objectContaining({
            voiceCharacteristics: expect.objectContaining({
              qualityMetrics: expect.any(Object)
            }),
            voiceAnalysisAt: expect.any(Date),
            voiceAnalysisModel: 'voice_quality_analyzer_v1'
          })
        })
      );
    });

    it('persisted remains true even when voice model not found (silent skip)', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(null);

      const result = await service.analyzeVoiceProfile({ userId: 'user-1', persist: true });

      expect(result.persisted).toBe(true);
    });

    it('sets voiceAnalysisModel to the expected constant string', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue({ userId: 'user-1' });
      mockPrisma.userVoiceModel.update.mockResolvedValue({});

      await service.analyzeVoiceProfile({ userId: 'user-1', persist: true });

      const updateArgs = (mockPrisma.userVoiceModel.update as jest.Mock).mock.calls[0][0] as any;
      expect(updateArgs.data.voiceAnalysisModel).toBe('voice_quality_analyzer_v1');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // analyzeVoiceProfilesBatch
  // ═════════════════════════════════════════════════════════════════════════

  describe('analyzeVoiceProfilesBatch', () => {
    it('returns empty arrays for empty input', async () => {
      const result = await service.analyzeVoiceProfilesBatch([]);
      expect(result.success).toHaveLength(0);
      expect(result.failures).toHaveLength(0);
    });

    it('all succeed when analyzeVoice always resolves', async () => {
      mockAnalyzeVoice.mockResolvedValue(makeAnalysisResult());
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(null);

      const result = await service.analyzeVoiceProfilesBatch([
        { userId: 'user-1', persist: true },
        { userId: 'user-2', persist: true }
      ]);

      expect(result.success).toHaveLength(2);
      expect(result.failures).toHaveLength(0);
      expect(result.success.map(r => r.userId)).toEqual(['user-1', 'user-2']);
    });

    it('routes failures using userId as the failure id', async () => {
      mockAnalyzeVoice
        .mockResolvedValueOnce(makeAnalysisResult())
        .mockRejectedValueOnce(new Error('profile error'));

      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(null);

      const result = await service.analyzeVoiceProfilesBatch([
        { userId: 'user-ok', persist: false },
        { userId: 'user-fail', persist: false }
      ]);

      expect(result.success).toHaveLength(1);
      expect(result.success[0].userId).toBe('user-ok');

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].id).toBe('user-fail');
      expect(result.failures[0].error).toBe('profile error');
    });

    it('all items fail when analyzeVoice always rejects', async () => {
      mockAnalyzeVoice.mockRejectedValue(new Error('total failure'));

      const result = await service.analyzeVoiceProfilesBatch([
        { userId: 'u1', persist: false },
        { userId: 'u2', persist: false },
        { userId: 'u3', persist: false }
      ]);

      expect(result.success).toHaveLength(0);
      expect(result.failures).toHaveLength(3);
    });

    it('uses "Unknown error" for failures with no message', async () => {
      mockAnalyzeVoice.mockRejectedValue(undefined);

      const result = await service.analyzeVoiceProfilesBatch([
        { userId: 'user-null-err', persist: false }
      ]);

      expect(result.failures[0].error).toBe('Unknown error');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // getAttachmentAnalysis
  // ═════════════════════════════════════════════════════════════════════════

  describe('getAttachmentAnalysis', () => {
    it('returns null when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      const result = await service.getAttachmentAnalysis('att-1');
      expect(result).toBeNull();
    });

    it('returns null when attachment exists but has no transcription', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({ transcription: null });

      const result = await service.getAttachmentAnalysis('att-1');
      expect(result).toBeNull();
    });

    it('returns null when transcription exists but has no voiceQualityAnalysis', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        transcription: { text: 'hello', language: 'en', confidence: 0.9, source: 'server' }
      });

      const result = await service.getAttachmentAnalysis('att-1');
      expect(result).toBeNull();
    });

    it('returns voiceQualityAnalysis when all layers are present', async () => {
      const vqa = { pitch: { mean: 150 }, qualityMetrics: { overallScore: 0.9 } };
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(
        makeAttachmentWithAnalysis(vqa as any)
      );

      const result = await service.getAttachmentAnalysis('att-1');
      expect(result).toEqual(vqa);
    });

    it('queries with the correct attachmentId', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await service.getAttachmentAnalysis('att-xyz');

      expect(mockPrisma.messageAttachment.findUnique).toHaveBeenCalledWith({
        where: { id: 'att-xyz' },
        select: { transcription: true }
      });
    });

    it('returns null when findUnique returns an object without transcription key', async () => {
      // Simulate Prisma returning { transcription: undefined }
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({ transcription: undefined });

      const result = await service.getAttachmentAnalysis('att-1');
      expect(result).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // getVoiceProfileAnalysis
  // ═════════════════════════════════════════════════════════════════════════

  describe('getVoiceProfileAnalysis', () => {
    it('returns null when voice model not found', async () => {
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(null);

      const result = await service.getVoiceProfileAnalysis('user-1');
      expect(result).toBeNull();
    });

    it('returns null when voice model exists but voiceCharacteristics is null', async () => {
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue({ voiceCharacteristics: null });

      const result = await service.getVoiceProfileAnalysis('user-1');
      expect(result).toBeNull();
    });

    it('returns voiceCharacteristics when present', async () => {
      const characteristics = { pitch: { mean: 200 }, qualityMetrics: { overallScore: 0.75 } };
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue({
        voiceCharacteristics: characteristics
      });

      const result = await service.getVoiceProfileAnalysis('user-1');
      expect(result).toEqual(characteristics);
    });

    it('queries with the correct userId', async () => {
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue(null);

      await service.getVoiceProfileAnalysis('user-99');

      expect(mockPrisma.userVoiceModel.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-99' },
        select: { voiceCharacteristics: true }
      });
    });

    it('returns null when findUnique returns an object without voiceCharacteristics key', async () => {
      mockPrisma.userVoiceModel.findUnique.mockResolvedValue({ voiceCharacteristics: undefined });

      const result = await service.getVoiceProfileAnalysis('user-1');
      expect(result).toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Les métriques de qualité, confrontées à ce que l'émetteur ÉMET (cycle 90)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * `makeAnalysisResult` ci-dessus FABRIQUE la forme déclarée. C'est légitime
   * pour parcourir les seuils de `trainingQuality`, et c'est aussi ce qui a
   * laissé le défaut vivre : la production ne recevait PAS cette forme.
   *
   * Ces témoins partent de la charge utile réelle du traducteur et la font
   * passer par le VRAI normaliseur — le chemin de production exact.
   */
  describe('qualityMetrics — depuis la charge utile réelle du traducteur', () => {
    const RAW_FROM_TRANSLATOR = {
      pitch: { mean_hz: 150, std_hz: 30, min_hz: 90, max_hz: 240, range_hz: 150 },
      classification: {
        voice_type: 'medium_male',
        estimated_gender: 'male',
        estimated_age_range: 'adult'
      },
      spectral: { centroid_hz: 1800, bandwidth_hz: 1600, rolloff_hz: 3400, flatness: 0.04 },
      energy: { mean: 0.08, std: 0.02, dynamic_range_db: 48, silence_ratio: 0.2 },
      quality: { harmonics_to_noise: 14, jitter: 0.01, shimmer: 0.03 },
      prosody: { speech_rate_wpm: 140 },
      mfcc: { mean: [-280], std: [40] },
      metadata: {
        sample_rate: 22050,
        bit_depth: 16,
        channels: 1,
        codec: 'wav',
        duration_seconds: 8,
        analysis_time_ms: 300,
        confidence: 0.9
      }
    };

    it('dérive clarity, consistency et le score de l’audio une fois la charge utile normalisée', async () => {
      mockAnalyzeVoice.mockResolvedValue(normalizeVoiceAnalysis(RAW_FROM_TRANSLATOR));

      const { analysis } = await service.analyzeAttachment({
        attachmentId: 'att-1',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: false
      });

      // clarity = dynamicRange / 60 = 48 / 60
      expect(analysis.qualityMetrics?.clarity).toBeCloseTo(0.8, 5);
      // consistency = 1 - (std / mean) = 1 - 30 / 150
      expect(analysis.qualityMetrics?.consistency).toBeCloseTo(0.8, 5);
      // overall = 0.8*0.4 + 0.8*0.3 + confidence(0.9)*0.3
      expect(analysis.qualityMetrics?.overallScore).toBeCloseTo(0.83, 5);
      expect(analysis.qualityMetrics?.trainingQuality).toBe('excellent');
      expect(analysis.qualityMetrics?.suitableForCloning).toBe(true);
    });

    it('varie avec l’audio — une prise pauvre ne rend pas le même score qu’une bonne', async () => {
      const poor = {
        ...RAW_FROM_TRANSLATOR,
        energy: { ...RAW_FROM_TRANSLATOR.energy, dynamic_range_db: 6 },
        pitch: { ...RAW_FROM_TRANSLATOR.pitch, std_hz: 120 },
        metadata: { ...RAW_FROM_TRANSLATOR.metadata, confidence: 0.2 }
      };
      mockAnalyzeVoice.mockResolvedValue(normalizeVoiceAnalysis(poor));

      const { analysis } = await service.analyzeAttachment({
        attachmentId: 'att-1',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: false
      });

      expect(analysis.qualityMetrics?.clarity).toBeCloseTo(0.1, 5);
      expect(analysis.qualityMetrics?.suitableForCloning).toBe(false);
      expect(analysis.qualityMetrics?.trainingQuality).toBe('poor');
    });

    /**
     * CONSTAT, pas correction — et il ne tombera pas tout seul.
     *
     * Il fige la signature du défaut : servie SANS normalisation, la charge
     * utile du traducteur donne `clarity = 0` (`energy.dynamicRange` absent),
     * `consistency = 1` (`pitch.std / pitch.mean` → `0 / 1`) et le défaut
     * `confidence = 0.5` — soit `0.45`, « fair », « pas bon pour le clonage »,
     * **pour toute voix, toujours**. Le témoin existe pour que quiconque
     * réintroduirait un chemin brut voie tout de suite la constante qu'il
     * rallume.
     */
    it('CONSTAT : sans normalisation, le score est la constante 0,45 quelle que soit la voix', async () => {
      mockAnalyzeVoice.mockResolvedValue(RAW_FROM_TRANSLATOR as never);

      const { analysis } = await service.analyzeAttachment({
        attachmentId: 'att-1',
        messageId: 'msg-1',
        userId: 'user-1',
        persist: false
      });

      expect(analysis.qualityMetrics?.clarity).toBe(0);
      expect(analysis.qualityMetrics?.consistency).toBe(1);
      expect(analysis.qualityMetrics?.overallScore).toBeCloseTo(0.45, 5);
      expect(analysis.qualityMetrics?.trainingQuality).toBe('fair');
      expect(analysis.qualityMetrics?.suitableForCloning).toBe(false);
    });
  });
});
