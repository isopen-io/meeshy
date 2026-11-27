/**
 * Les jours d'activité des trente premiers jours (#20620, #17363) : un entier par jour actif depuis l'inscription,
 * écrit une fois par jour et par compte, borné au trentième jour, effacé quand le compte sort de la fenêtre de mesure.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SIGNUP_ACTIVE_DAYS_LAST_OFFSET, SIGNUP_ACTIVE_DAYS_RETENTION_DAYS } from '@meeshy/shared/types/game-baseline';
import { SignupActiveDaysRecorder, signupDayOffset } from '../SignupActiveDays';

const DAY = 24 * 60 * 60 * 1000;
const signedUp = new Date('2026-11-01T10:00:00Z');
const later = (days: number, hours = 0): Date => new Date(signedUp.getTime() + days * DAY + hours * 60 * 60 * 1000);

const recorderWith = () => {
  const updateMany = jest.fn<any>().mockResolvedValue({ count: 1 });
  const prisma = { user: { updateMany } } as unknown as PrismaClient;
  return { recorder: new SignupActiveDaysRecorder(prisma), updateMany };
};

describe('signupDayOffset', () => {
  it('compte les jours pleins écoulés depuis l’inscription, le jour de l’inscription valant zéro', () => {
    expect(signupDayOffset(signedUp, later(0, 3))).toBe(0);
    expect(signupDayOffset(signedUp, later(1))).toBe(1);
    expect(signupDayOffset(signedUp, later(7, 23))).toBe(7);
    expect(signupDayOffset(signedUp, later(SIGNUP_ACTIVE_DAYS_LAST_OFFSET, 23))).toBe(SIGNUP_ACTIVE_DAYS_LAST_OFFSET);
  });

  it('ne rend rien au-delà du trentième jour, avant l’inscription ou sur une date illisible', () => {
    expect(signupDayOffset(signedUp, later(SIGNUP_ACTIVE_DAYS_LAST_OFFSET + 1))).toBeNull();
    expect(signupDayOffset(signedUp, later(0, -1))).toBeNull();
    expect(signupDayOffset(new Date(Number.NaN), later(1))).toBeNull();
  });
});

describe('SignupActiveDaysRecorder.observe', () => {
  it('garde le jour d’activité au premier passage du jour', async () => {
    const { recorder, updateMany } = recorderWith();

    await recorder.observe('user-1', { createdAt: signedUp, signupActiveDays: [0] }, later(7, 2));

    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { signupActiveDays: { push: 7 } } });
  });

  it('n’écrit rien quand le jour est déjà gardé', async () => {
    const { recorder, updateMany } = recorderWith();

    await recorder.observe('user-1', { createdAt: signedUp, signupActiveDays: [0, 1] }, later(1, 5));

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('garde le jour de l’inscription d’un compte qui n’a encore rien', async () => {
    const { recorder, updateMany } = recorderWith();

    await recorder.observe('user-1', { createdAt: signedUp, signupActiveDays: null }, later(0, 1));

    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { signupActiveDays: { push: 0 } } });
  });

  it('n’écrit plus rien passé le trentième jour, ni sans date d’inscription', async () => {
    const { recorder, updateMany } = recorderWith();

    await recorder.observe('user-1', { createdAt: signedUp, signupActiveDays: [] }, later(SIGNUP_ACTIVE_DAYS_LAST_OFFSET + 1));
    await recorder.observe('user-1', {}, later(1));
    await recorder.observe('user-1', undefined, later(1));

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('ne lève jamais : un échec d’écriture ne gêne pas la présence', async () => {
    const { recorder, updateMany } = recorderWith();
    updateMany.mockRejectedValueOnce(new Error('mongo down'));

    await expect(recorder.observe('user-1', { createdAt: signedUp, signupActiveDays: [] }, later(2))).resolves.toBeUndefined();
  });
});

describe('SignupActiveDaysRecorder.purgeExpired', () => {
  it('efface les jours des comptes sortis de la fenêtre de mesure, et d’eux seuls', async () => {
    const { recorder, updateMany } = recorderWith();
    const now = new Date('2026-11-27T02:00:00Z');

    await recorder.purgeExpired(now);

    expect(updateMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(now.getTime() - SIGNUP_ACTIVE_DAYS_RETENTION_DAYS * DAY) }, signupActiveDays: { isEmpty: false } },
      data: { signupActiveDays: { set: [] } },
    });
  });

  it('garde les jours tant que la plus ancienne semaine mesurée peut encore les lire', () => {
    expect(SIGNUP_ACTIVE_DAYS_RETENTION_DAYS).toBeGreaterThanOrEqual(13 * 7 + 7);
  });
});
