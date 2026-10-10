/**
 * La date de naissance se déclare UNE fois (#9927) — et le consentement vocal,
 * qui acceptait un `birthDate`, était un second chemin d'écriture : un mineur
 * déclaré à l'onboarding s'y redéclarait majeur et rouvrait Meeshy Global.
 *
 * Le consentement n'écrit la date que si aucune n'est posée, jamais une date
 * que `PUT /me/birth-date` refuserait, et par la MÊME écriture conditionnée en
 * base (`writeBirthDateOnce`) : une lecture qui voit « aucune date » ne suffit
 * pas, une déclaration concurrente ne s'écrase pas. Et la date ne va jamais au
 * journal.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'events';

const logged: unknown[] = [];
jest.mock('../../../utils/logger-enhanced', () => {
  const capture = (...args: unknown[]) => { logged.push(args); };
  const child = () => ({ info: capture, warn: capture, error: capture, debug: capture });
  return { enhancedLogger: { child }, performanceLogger: { child } };
});

import { VoiceProfileService } from '../../../services/VoiceProfileService';

type Clause = { birthDate: null } | { birthDate: { isSet: false } };

function setup(existingBirthDate: Date | null, options: { readonly concurrentWrite?: Date } = {}) {
  const state: { birthDate: Date | null | undefined } = { birthDate: existingBirthDate };
  const update = jest.fn(async (_args: unknown) => ({}));
  const updateMany = jest.fn(async (args: { where: { OR: Clause[] }; data: { birthDate: Date } }) => {
    if (options.concurrentWrite) state.birthDate = options.concurrentWrite;
    const free = args.where.OR.some((clause) => (clause.birthDate === null ? state.birthDate === null : state.birthDate === undefined));
    if (!free) return { count: 0 };
    state.birthDate = args.data.birthDate;
    return { count: 1 };
  });
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
  return { service, update, updateMany, state };
}

const updateData = (update: jest.Mock) => (update.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined)?.data;

describe('VoiceProfileService.updateConsent — la date de naissance ne se redéclare pas (#9927)', () => {
  it('ne remplace pas une date déjà posée', async () => {
    const { service, update, updateMany, state } = setup(new Date('2011-03-03T00:00:00.000Z'));
    const result = await service.updateConsent('u1', { voiceRecordingConsent: true, birthDate: '1990-01-01' });
    expect(result.success).toBe(true);
    expect(updateData(update)).not.toHaveProperty('birthDate');
    expect(updateMany).not.toHaveBeenCalled();
    expect(state.birthDate?.toISOString()).toBe('2011-03-03T00:00:00.000Z');
  });

  it('une date seule, déjà posée : réussite sans écriture', async () => {
    const { service, update, updateMany } = setup(new Date('2011-03-03T00:00:00.000Z'));
    const result = await service.updateConsent('u1', { birthDate: '1990-01-01' });
    expect(result.success).toBe(true);
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('n’écrit pas une date de moins de 13 ans', async () => {
    const { service, updateMany, state } = setup(null);
    const now = new Date();
    const fiveYearsAgo = `${now.getUTCFullYear() - 5}-01-01`;
    await service.updateConsent('u1', { voiceRecordingConsent: true, birthDate: fiveYearsAgo });
    expect(updateMany).not.toHaveBeenCalled();
    expect(state.birthDate).toBeNull();
  });

  it('écrit la première date admissible, à minuit UTC, par l’écriture conditionnée', async () => {
    const { service, update, state } = setup(null);
    await service.updateConsent('u1', { voiceRecordingConsent: true, birthDate: '1990-01-01' });
    expect(state.birthDate?.toISOString()).toBe('1990-01-01T00:00:00.000Z');
    expect(updateData(update)).not.toHaveProperty('birthDate');
  });

  it('course : la lecture voit « aucune date », une déclaration passe entre-temps — elle n’est pas écrasée', async () => {
    const { service, state } = setup(null, { concurrentWrite: new Date('2011-03-03T00:00:00.000Z') });
    await service.updateConsent('u1', { voiceRecordingConsent: true, birthDate: '1990-01-01' });
    expect(state.birthDate?.toISOString()).toBe('2011-03-03T00:00:00.000Z');
  });

  it('la date ne paraît dans AUCUN journal — ni celle déclarée, ni celle déjà posée', async () => {
    logged.length = 0;
    const { service } = setup(new Date('2011-03-03T00:00:00.000Z'));
    await service.updateConsent('u1', { voiceRecordingConsent: true, birthDate: '1990-01-01' });
    const output = JSON.stringify(logged);
    expect(output).not.toContain('1990-01-01');
    expect(output).not.toContain('2011-03-03');
    expect(output).not.toContain('birthDate"');
  });
});
