/**
 * `POST /voice/profile/consent { voiceCloningConsent: true }` n'accorde le
 * clonage vocal qu'à 18 ans révolus, date limite calculée au jour près
 * (#17309). La date retenue est celle déjà posée, ou celle que la même requête
 * déclare et que la passerelle écrit. Sans date : refus, et rien n'est écrit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

jest.mock('../../../utils/logger-enhanced', () => {
  const silent = () => undefined;
  const child = () => ({ info: silent, warn: silent, error: silent, debug: silent });
  return { enhancedLogger: { child }, performanceLogger: { child } };
});

import { VoiceProfileService } from '../../../services/VoiceProfileService';

// Horloge GELÉE un 29 février (#17309) : 18 n'étant pas multiple de 4, la date
// limite tombe le 28 février 2010 — le cas que l'horloge réelle n'atteint qu'une
// fois tous les quatre ans. Seule la date est gelée ; les minuteries restent vraies.
const FROZEN_NOW = new Date('2028-02-29T12:00:00.000Z');
const EIGHTEENTH_BIRTHDAY = new Date('2010-02-28T00:00:00.000Z');
const DAY_BEFORE_EIGHTEEN = new Date('2010-03-01T00:00:00.000Z');
const FIFTEEN_YEARS_OLD = new Date('2013-02-28T00:00:00.000Z');
const freezeClock = () =>
  jest.useFakeTimers({
    now: FROZEN_NOW,
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'],
  });

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
  beforeEach(freezeClock);
  afterEach(() => jest.useRealTimers());

  it('accorde à une date déjà posée le jour exact des 18 ans', async () => {
    const { service, update } = setup(EIGHTEENTH_BIRTHDAY);
    const result = await service.updateConsent('u1', { voiceRecordingConsent: true, voiceCloningConsent: true });

    expect(result.success).toBe(true);
    expect(written(update)?.voiceCloningEnabledAt).toBeInstanceOf(Date);
  });

  it('refuse une date déjà posée la veille des 18 ans, sans rien écrire', async () => {
    const { service, update, updateMany } = setup(DAY_BEFORE_EIGHTEEN);
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
      birthDate: wire(EIGHTEENTH_BIRTHDAY),
    });

    expect(result.success).toBe(true);
    expect(written(update)?.voiceCloningEnabledAt).toBeInstanceOf(Date);
  });

  it('refuse quand la même requête déclare une date de 17 ans', async () => {
    const { service, update } = setup(null);
    const result = await service.updateConsent('u1', {
      voiceRecordingConsent: true,
      voiceCloningConsent: true,
      birthDate: wire(DAY_BEFORE_EIGHTEEN),
    });

    expect(result).toMatchObject({ success: false, errorCode: 'VOICE_CLONING_AGE_REQUIRED' });
    expect(update).not.toHaveBeenCalled();
  });

  it('une date posée prime sur une date redéclarée majeure (#9927)', async () => {
    const { service, update } = setup(FIFTEEN_YEARS_OLD);
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

    const withdrawal = setup(FIFTEEN_YEARS_OLD);
    expect((await withdrawal.service.updateConsent('u1', { voiceCloningConsent: false })).success).toBe(true);
    expect(written(withdrawal.update)?.voiceCloningEnabledAt).toBeNull();
  });
});
