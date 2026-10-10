/**
 * La date de naissance se déclare UNE fois (#9927) — et le consentement vocal,
 * qui acceptait un `birthDate`, était un second chemin d'écriture : un mineur
 * déclaré à l'onboarding s'y redéclarait majeur et rouvrait Meeshy Global.
 * Le consentement n'écrit plus la date que si aucune n'est posée, et jamais
 * une date que `PUT /me/birth-date` refuserait.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { VoiceProfileService } from '../../../services/VoiceProfileService';

function setup(existingBirthDate: Date | null) {
  const update = jest.fn(async () => ({}));
  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({
        dataProcessingConsentAt: null,
        voiceDataConsentAt: null,
        voiceProfileConsentAt: null,
        birthDate: existingBirthDate,
      })),
      update,
    },
  };
  const service = new VoiceProfileService(prisma as never, new EventEmitter() as never);
  return { service, update };
}

const writtenData = (update: jest.Mock) => (update.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data;

describe('VoiceProfileService.updateConsent — la date de naissance ne se redéclare pas (#9927)', () => {
  it('ne remplace pas une date déjà posée', async () => {
    const { service, update } = setup(new Date('2011-03-03T00:00:00.000Z'));
    const result = await service.updateConsent('u1', { voiceRecordingConsent: true, birthDate: '1990-01-01' });
    expect(result.success).toBe(true);
    expect(writtenData(update)).not.toHaveProperty('birthDate');
  });

  it('une date seule, déjà posée : réussite sans écriture de date', async () => {
    const { service, update } = setup(new Date('2011-03-03T00:00:00.000Z'));
    const result = await service.updateConsent('u1', { birthDate: '1990-01-01' });
    expect(result.success).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('n’écrit pas une date de moins de 13 ans', async () => {
    const { service, update } = setup(null);
    await service.updateConsent('u1', { voiceRecordingConsent: true, birthDate: '2020-01-01' });
    expect(writtenData(update)).not.toHaveProperty('birthDate');
  });

  it('écrit la première date admissible, à minuit UTC', async () => {
    const { service, update } = setup(null);
    await service.updateConsent('u1', { voiceRecordingConsent: true, birthDate: '1990-01-01' });
    expect((writtenData(update)?.birthDate as Date).toISOString()).toBe('1990-01-01T00:00:00.000Z');
  });
});
