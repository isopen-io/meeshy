/**
 * #10264 — la confirmation d'une suppression EFFECTIVE (`action: 'purge'`,
 * statut `COMPLETED`) nomme le compte supprimé, et ses sockets vivants
 * l'apprennent avec son identifiant : l'appareil purge les données de CE
 * compte, jamais d'un autre compte ouvert sur le même appareil. `confirm`
 * n'ouvre qu'une grâce (le compte peut revenir) et `cancel` le rend : ni l'un
 * ni l'autre ne nomme de compte supprimé.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import crypto from 'crypto';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

jest.mock('../../../socketio/disconnectRevokedSessions', () => ({
  disconnectRevokedSessions: jest.fn(async () => 0),
}));

jest.mock('../../../utils/password-hash', () => ({
  hashPassword: jest.fn(async () => '$2b$12$hash-de-test'),
}));

import { accountDeletionRoutes } from '../../../routes/account-deletion';
import { disconnectRevokedSessions } from '../../../socketio/disconnectRevokedSessions';

const PREFIXE = '/api/v1/account/deletion';
const JETON = 'un-jeton-de-courriel';
const HASH = crypto.createHash('sha256').update(JETON).digest('hex');

const prismaPour = (status: string) => {
  const ligne = {
    id: 'req-1',
    userId: 'u-supprime',
    status,
    resolveAttempts: 0,
    confirmTokenHash: HASH,
    cancelTokenHash: HASH,
    tokenExpiresAt: new Date(Date.now() + 3_600_000),
  };
  return {
    accountDeletionRequest: { findFirst: jest.fn(async () => ligne), update: jest.fn(async () => ligne) },
    user: {
      findUnique: jest.fn(async () => ({ isActive: true })),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    userSession: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    userVoiceModel: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    conversationShareLink: {
      findMany: jest.fn(async () => [] as Array<{ id: string }>),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
  };
};

async function resoudre(status: string, action: 'confirm' | 'cancel' | 'purge') {
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prismaPour(status) as never);
  app.decorate('redis', undefined as never);
  app.decorate('socketIOHandler', {} as never);
  await app.register(accountDeletionRoutes, { prefix: PREFIXE });
  await app.ready();
  const res = await app.inject({ method: 'POST', url: `${PREFIXE}/resolve`, payload: { token: JETON, action } });
  await app.close();
  return res;
}

describe('POST /account/deletion/resolve — le compte supprimé est NOMMÉ', () => {
  it('`purge` : la réponse sérialisée porte `deletedAccountId`', async () => {
    const res = await resoudre('GRACE_PERIOD_EXPIRED', 'purge');

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ status: 'COMPLETED', deletedAccountId: 'u-supprime' });
  });

  it('`purge` : les sockets du compte tombent en le nommant', async () => {
    (disconnectRevokedSessions as jest.Mock).mockClear();

    await resoudre('GRACE_PERIOD_EXPIRED', 'purge');

    expect(disconnectRevokedSessions).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-supprime', reason: 'logout_all_devices', accountDeleted: true }),
    );
  });

  it('`confirm` n’ouvre qu’une grâce : aucun compte supprimé nommé', async () => {
    const res = await resoudre('PENDING_EMAIL_CONFIRMATION', 'confirm');

    expect(res.json().data.status).toBe('CONFIRMED');
    expect(res.json().data).not.toHaveProperty('deletedAccountId');
  });

  it('`cancel` rend le compte : aucun compte supprimé nommé', async () => {
    const res = await resoudre('CONFIRMED', 'cancel');

    expect(res.json().data.status).toBe('CANCELLED');
    expect(res.json().data).not.toHaveProperty('deletedAccountId');
  });
});
