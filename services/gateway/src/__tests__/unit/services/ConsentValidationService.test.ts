/**
 * ConsentValidationService.getConsentStatus — dérivation des feature gates
 * audio depuis les BOOLÉENS du AudioPreferenceSchema réellement écrits par
 * les clients (transcriptionEnabled, audioTranslationEnabled, ttsEnabled),
 * les timestamps `…EnabledAt` legacy restant prioritaires. Sans cette
 * dérivation, canTranscribeAudio était toujours faux hors dev et le pipeline
 * audio restait bloqué même consentement accordé (popup iOS 2026-07-08).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConsentValidationService } from '../../../services/ConsentValidationService';

const NOW = new Date('2026-07-08T00:00:00Z');

function makePrisma(options: {
  user?: Record<string, unknown> | null;
  audio?: Record<string, unknown>;
  application?: Record<string, unknown>;
}) {
  const { user = {}, audio = {}, application = {} } = options;
  return {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(
        user === null
          ? null
          : {
              dataProcessingConsentAt: null,
              voiceDataConsentAt: null,
              voiceProfileConsentAt: null,
              voiceCloningEnabledAt: null,
              ...user,
            }
      ),
    },
    userPreferences: {
      findUnique: jest.fn<any>().mockResolvedValue({ audio, application }),
    },
  } as any;
}

const fullVoiceConsent = {
  dataProcessingConsentAt: NOW,
  voiceDataConsentAt: NOW,
  voiceProfileConsentAt: NOW,
};

describe('ConsentValidationService.getConsentStatus', () => {
  beforeEach(() => {
    (process.env as any).NODE_ENV = 'test';
  });

  it('derives canTranscribeAudio from schema default (transcriptionEnabled=true) when audio prefs are empty', async () => {
    const service = new ConsentValidationService(makePrisma({ user: fullVoiceConsent }));

    const status = await service.getConsentStatus('u1');

    expect(status.canTranscribeAudio).toBe(true);
    expect(status.canTranslateText).toBe(true);
    // audioTranslationEnabled / ttsEnabled default to false
    expect(status.canTranslateAudio).toBe(false);
    expect(status.canGenerateTranslatedAudio).toBe(false);
  });

  it('respects an explicit transcriptionEnabled=false boolean', async () => {
    const service = new ConsentValidationService(
      makePrisma({ user: fullVoiceConsent, audio: { transcriptionEnabled: false } })
    );

    const status = await service.getConsentStatus('u1');

    expect(status.canTranscribeAudio).toBe(false);
    expect(status.canTranslateAudio).toBe(false);
  });

  it('unlocks the full audio pipeline from the booleans the iOS consent popup writes', async () => {
    const service = new ConsentValidationService(
      makePrisma({
        user: { ...fullVoiceConsent, voiceCloningEnabledAt: NOW },
        audio: {
          transcriptionEnabled: true,
          audioTranslationEnabled: true,
          ttsEnabled: true,
          voiceProfileEnabled: true,
        },
      })
    );

    const status = await service.getConsentStatus('u1');

    expect(status.canTranscribeAudio).toBe(true);
    expect(status.canTranslateAudio).toBe(true);
    expect(status.canGenerateTranslatedAudio).toBe(true);
    // User.voiceCloningEnabledAt (écrit par POST /voice-profile/consent
    // { voiceCloningConsent: true }) vaut consentement clonage.
    expect(status.hasVoiceCloningConsent).toBe(true);
    expect(status.canUseVoiceCloning).toBe(true);
  });

  it('keeps legacy …EnabledAt timestamps as an override', async () => {
    const service = new ConsentValidationService(
      makePrisma({
        user: fullVoiceConsent,
        audio: {
          transcriptionEnabled: false,
          audioTranscriptionEnabledAt: NOW.toISOString(),
        },
      })
    );

    const status = await service.getConsentStatus('u1');

    expect(status.canTranscribeAudio).toBe(true);
  });

  it('never unlocks audio features without the voice data consent chain', async () => {
    const service = new ConsentValidationService(
      makePrisma({
        user: { dataProcessingConsentAt: NOW },
        audio: { transcriptionEnabled: true, audioTranslationEnabled: true, ttsEnabled: true },
      })
    );

    const status = await service.getConsentStatus('u1');

    expect(status.hasVoiceDataConsent).toBe(false);
    expect(status.canTranscribeAudio).toBe(false);
    expect(status.canTranslateAudio).toBe(false);
    expect(status.canGenerateTranslatedAudio).toBe(false);
  });

  it('throws when the user does not exist', async () => {
    const service = new ConsentValidationService(makePrisma({ user: null }));

    await expect(service.getConsentStatus('missing')).rejects.toThrow('User not found');
  });
});
