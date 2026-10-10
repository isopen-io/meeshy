/**
 * #8959 — enregistrer son profil vocal, consentement donné, crédite
 * `profile.voice_profile` ; sans consentement ou sur un échec d'analyse,
 * rien n'est crédité.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'events';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn() })),
  },
}));

import { VoiceProfileService } from '../../../services/VoiceProfileService';

class ZmqDouble extends EventEmitter {
  sendVoiceProfileRequest = jest.fn<any>();
}

async function enregistrer(options: { readonly consenti: boolean; readonly analyseReussie: boolean }) {
  const zmq = new ZmqDouble();
  zmq.sendVoiceProfileRequest.mockImplementation(async (req: { request_id: string }) => {
    setTimeout(() => {
      zmq.emit('voiceProfileAnalyzeResult', {
        type: 'voice_profile_analyze_result',
        request_id: req.request_id,
        success: options.analyseReussie,
        user_id: 'user-1',
        profile_id: 'vp_user1',
        audio_duration_ms: 15000,
        quality_score: 0.8,
        embedding_dimension: 256,
      });
    }, 5);
  });
  const prisma = {
    user: {
      findUnique: jest.fn<any>(async () => ({
        id: 'user-1',
        birthDate: new Date('1990-01-01'),
        voiceProfileConsentAt: options.consenti ? new Date() : null,
        voiceCloningEnabledAt: null,
        voiceModel: null,
      })),
    },
    userVoiceModel: {
      create: jest.fn<any>(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'vm-1',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    },
  };
  const engagement = { recordActivity: jest.fn<any>(async () => undefined) };
  const service = new VoiceProfileService(prisma as never, zmq as never, undefined, engagement);
  const resultat = await service.registerProfile('user-1', { audioData: 'YXVkaW8=', audioFormat: 'wav' });
  service.removeAllListeners();
  zmq.removeAllListeners();
  return { resultat, engagement, prisma };
}

describe('#8959 — `profile.voice_profile`', () => {
  it('crédite le compte quand le profil est enregistré', async () => {
    const { resultat, engagement, prisma } = await enregistrer({ consenti: true, analyseReussie: true });

    expect(resultat.success).toBe(true);
    expect(prisma.userVoiceModel.create).toHaveBeenCalledTimes(1);
    expect(engagement.recordActivity).toHaveBeenCalledWith('user-1', 'profile.voice_profile');
  });

  it('ne crédite rien sans consentement', async () => {
    const { resultat, engagement } = await enregistrer({ consenti: false, analyseReussie: true });

    expect(resultat.errorCode).toBe('CONSENT_REQUIRED');
    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });

  it("ne crédite rien quand l'analyse échoue", async () => {
    const { resultat, engagement } = await enregistrer({ consenti: true, analyseReussie: false });

    expect(resultat.success).toBe(false);
    expect(engagement.recordActivity).not.toHaveBeenCalled();
  });
});
