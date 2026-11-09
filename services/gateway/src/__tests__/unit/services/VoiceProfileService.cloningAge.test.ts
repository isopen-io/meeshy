/**
 * `POST /voice/profile/consent { voiceCloningConsent: true }` n'accorde le
 * clonage vocal qu'à 18 ans révolus, date limite calculée au jour près
 * (#17309). La date retenue est celle déjà posée, ou celle que la même requête
 * déclare et que la passerelle écrit. Sans date : refus, et rien n'est écrit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'events';

jest.mock('../../../utils/logger-enhanced', () => {
  const silent = () => undefined;
  const child = () => ({ info: silent, warn: silent, error: silent, debug: silent });
  return { enhancedLogger: { child }, performanceLogger: { child } };
});

import { VoiceProfileService } from '../../../services/VoiceProfileService';

function utcDayYearsAgo(years: number, dayOffset = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate() + dayOffset));
}

const wire = (date: Date): string => date.toISOString().slice(0, 10);

function setup(existingBirthDate: Date | null) {
  const update = jest.fn(async (_args: unknown) => ({}));
  const updateMany = jest.fn(async (_args: unknown) => ({ count: 1 }));
  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({
        dataProcessingConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null,
        birthDate: existingBirthDate,
      })),
      update,
      updateMany,
    },
  };
  const service = new VoiceProfileService(prisma as never, new EventEmitter() as never);
  return { service, update, updateMany };
}

const written = (update: jest.Mock) => (update.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data;

describe('VoiceProfileService.updateConsent — clonage vocal à 18 ans révolus (#17309)', () => {
  it('accorde à une date déjà posée le jour exact des 18 ans', async () => {
    const { service, update } = setup(utcDayYearsAgo(18));
    const result = await service.updateConsent('u1', { voiceRecordingConsent: true, voiceCloningConsent: true });

    expect(result.success).toBe(true);
    expect(written(update)?.voiceCloningEnabledAt).toBeInstanceOf(Date);
  });

  it('refuse une date déjà posée la veille des 18 ans, sans rien écrire', async () => {
    const { service, update, updateMany } = setup(utcDayYearsAgo(18, 1));
    const result = await service.updateConsent('u1', { voiceRecordingConsent: true, voiceCloningConsent: true });

    expect(result).toMatchObject({ success: false, errorCode: 'VOICE_CLONING_AGE_REQUIRED' });
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('refuse sans aucune date de naissance (fail-closed)', async () => {
    const { service, update } = setup(null);
    const result = await service.updateConsent('u1', { voiceRecordingConsent: true, voiceCloningConsent: true });

    expect(result).toMatchObject({ success: false, errorCode: 'VOICE_CLONING_AGE_REQUIRED' });
    expect(update).not.toHaveBeenCalled();
  });

  it('accorde quand la même requête déclare une date admise', async () => {
    const { service, update } = setup(null);
    const result = await service.updateConsent('u1', {
      voiceRecordingConsent: true,
      voiceCloningConsent: true,
      birthDate: wire(utcDayYearsAgo(18)),
    });

    expect(result.success).toBe(true);
    expect(written(update)?.voiceCloningEnabledAt).toBeInstanceOf(Date);
  });

  it('refuse quand la même requête déclare une date de 17 ans', async () => {
    const { service, update } = setup(null);
    const result = await service.updateConsent('u1', {
      voiceRecordingConsent: true,
      voiceCloningConsent: true,
      birthDate: wire(utcDayYearsAgo(18, 1)),
    });

    expect(result).toMatchObject({ success: false, errorCode: 'VOICE_CLONING_AGE_REQUIRED' });
    expect(update).not.toHaveBeenCalled();
  });

  it('une date posée prime sur une date redéclarée majeure (#9927)', async () => {
    const { service, update } = setup(utcDayYearsAgo(15));
    const result = await service.updateConsent('u1', {
      voiceRecordingConsent: true,
      voiceCloningConsent: true,
      birthDate: '1990-01-01',
    });

    expect(result).toMatchObject({ success: false, errorCode: 'VOICE_CLONING_AGE_REQUIRED' });
    expect(update).not.toHaveBeenCalled();
  });

  it('n’exige rien pour l’enregistrement seul, ni pour retirer le clonage', async () => {
    const recording = setup(null);
    expect((await recording.service.updateConsent('u1', { voiceRecordingConsent: true })).success).toBe(true);

    const withdrawal = setup(utcDayYearsAgo(15));
    expect((await withdrawal.service.updateConsent('u1', { voiceCloningConsent: false })).success).toBe(true);
    expect(written(withdrawal.update)?.voiceCloningEnabledAt).toBeNull();
  });
});
