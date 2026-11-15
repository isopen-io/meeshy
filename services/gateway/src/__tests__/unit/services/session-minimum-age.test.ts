/**
 * `createSession` est la porte que toutes les connexions empruntent — mot de
 * passe, lien magique, second facteur, vérification d'adresse. Un compte de
 * moins de 13 ans déclarés n'y ouvre aucune session (#9927).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { createSession, initSessionService } from '../../../services/SessionService';
import { AgeBelowMinimumError } from '../../../errors/custom-errors';

const yearsAgo = (years: number): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()));
};

function setup(birthDate: Date | null) {
  const create = jest.fn(async () => ({
    id: 'sess-1', userId: 'u1', expiresAt: new Date(), createdAt: new Date(), lastActivityAt: new Date(),
    isValid: true, isTrusted: false, isCurrentSession: true,
  }));
  const prisma = {
    user: { findUnique: jest.fn(async () => ({ birthDate })) },
    userSession: {
      create,
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 0 })),
      count: jest.fn(async () => 0),
    },
  };
  initSessionService(prisma as never);
  return { create };
}

const requestContext = { ip: '127.0.0.1', geoData: null, deviceInfo: null } as never;

describe('createSession — la porte de l’âge minimal (#9927)', () => {
  it('refuse un compte de 12 ans : AgeBelowMinimumError, aucune ligne de session', async () => {
    const { create } = setup(yearsAgo(12));
    await expect(createSession({ userId: 'u1', token: 'a'.repeat(64), requestContext })).rejects.toBeInstanceOf(AgeBelowMinimumError);
    expect(create).not.toHaveBeenCalled();
  });

  it('ouvre la session d’un compte de 13 ans ou d’âge inconnu', async () => {
    for (const birthDate of [yearsAgo(13), null]) {
      const { create } = setup(birthDate);
      await createSession({ userId: 'u1', token: 'a'.repeat(64), requestContext });
      expect(create).toHaveBeenCalledTimes(1);
    }
  });
});
