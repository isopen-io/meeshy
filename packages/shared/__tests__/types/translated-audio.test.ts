import { describe, it, expect } from 'vitest';
import { toTranslatedAudioData } from '../../types/translated-audio';
import type { MessageTranslatedAudio } from '../../types/translated-audio';

function makeMessageTranslatedAudio(overrides: Partial<MessageTranslatedAudio> = {}): MessageTranslatedAudio {
  return {
    id: 'ta-001',
    attachmentId: 'att-001',
    messageId: 'msg-001',
    targetLanguage: 'fr',
    translatedText: 'Bonjour monde',
    audioPath: '/storage/audio.mp3',
    audioUrl: 'https://cdn.example.com/audio.mp3',
    durationMs: 3500,
    format: 'mp3',
    voiceCloned: true,
    voiceQuality: 0.85,
    voiceModelId: 'vm-001',
    ttsModel: 'xtts_v2',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('toTranslatedAudioData', () => {
  it('maps core fields correctly', () => {
    const audio = makeMessageTranslatedAudio();
    const result = toTranslatedAudioData(audio);
    expect(result.id).toBe('ta-001');
    expect(result.targetLanguage).toBe('fr');
    expect(result.translatedText).toBe('Bonjour monde');
    expect(result.audioUrl).toBe('https://cdn.example.com/audio.mp3');
    expect(result.durationMs).toBe(3500);
    expect(result.voiceCloned).toBe(true);
    expect(result.voiceQuality).toBe(0.85);
  });

  it('maps optional fields to TranslatedAudioData', () => {
    const audio = makeMessageTranslatedAudio();
    const result = toTranslatedAudioData(audio);
    expect(result.audioPath).toBe('/storage/audio.mp3');
    expect(result.format).toBe('mp3');
    expect(result.ttsModel).toBe('xtts_v2');
    expect(result.voiceModelId).toBe('vm-001');
  });

  it('omits redundant fields from Prisma model (attachmentId, messageId, createdAt)', () => {
    const audio = makeMessageTranslatedAudio();
    const result = toTranslatedAudioData(audio) as Record<string, unknown>;
    expect(result['attachmentId']).toBeUndefined();
    expect(result['messageId']).toBeUndefined();
    expect(result['createdAt']).toBeUndefined();
  });

  it('converts null voiceModelId to undefined', () => {
    const audio = makeMessageTranslatedAudio({ voiceModelId: null });
    const result = toTranslatedAudioData(audio);
    expect(result.voiceModelId).toBeUndefined();
  });

  it('preserves defined voiceModelId', () => {
    const audio = makeMessageTranslatedAudio({ voiceModelId: 'vm-999' });
    const result = toTranslatedAudioData(audio);
    expect(result.voiceModelId).toBe('vm-999');
  });
});
