/**
 * #8959 — une invitation par e-mail RÉELLEMENT envoyée à quelqu'un qui n'est
 * pas sur Meeshy crédite `social.email_invite` à l'expéditeur, et rien d'autre.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../utils/logger', () => ({
  ...(jest.requireActual('../../../utils/logger') as object),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

const recordActivity = jest.fn<any>(async () => undefined);
jest.mock('../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn<any>().mockImplementation(() => ({ recordActivity })),
}));

import { invitationRoutes } from '../../../routes/invitations';

const USER_ID = '507f1f77bcf86cd799439011';

type Scenario = { readonly existingUser?: { id: string } | null; readonly withEmailService?: boolean; readonly emailRejects?: boolean };

async function inviter({ existingUser = null, withEmailService = true, emailRejects = false }: Scenario = {}) {
  recordActivity.mockClear();
  const app = Fastify({ logger: false });
  app.decorate('prisma', {
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ displayName: 'Alice', username: 'alice', avatar: null, systemLanguage: 'fr' }),
      findFirst: jest.fn<any>().mockResolvedValue(existingUser),
    },
    affiliateToken: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>().mockResolvedValue({ id: 'affiliate-token-id', token: 'aff_test1234' }),
    },
    emailInvitation: { create: jest.fn<any>().mockResolvedValue({ id: 'email-invitation-id' }) },
  } as never);
  app.decorate('authenticate', async (req: any) => {
    req.user = { userId: USER_ID };
    req.authContext = { isAuthenticated: true, registeredUser: { id: USER_ID, emailVerifiedAt: new Date() } };
  });
  if (withEmailService) {
    (app as unknown as Record<string, unknown>).emailService = {
      sendInvitationEmail: emailRejects
        ? jest.fn<any>().mockRejectedValue(new Error('smtp'))
        : jest.fn<any>().mockResolvedValue(undefined),
    };
  }
  await app.register(invitationRoutes);
  await app.ready();
  const res = await app.inject({ method: 'POST', url: '/invitations/email', payload: { email: 'friend@example.com' } });
  await app.close();
  return res.statusCode;
}

describe('#8959 — `social.email_invite`', () => {
  it("crédite l'expéditeur quand l'invitation part", async () => {
    expect(await inviter()).toBe(201);

    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity).toHaveBeenCalledWith(USER_ID, 'social.email_invite');
  });

  it("ne crédite rien quand l'adresse appartient déjà à un utilisateur", async () => {
    expect(await inviter({ existingUser: { id: 'x' } })).toBe(409);

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("ne crédite rien quand aucun e-mail n'est parti", async () => {
    await inviter({ withEmailService: false });
    expect(recordActivity).not.toHaveBeenCalled();

    expect(await inviter({ emailRejects: true })).toBe(500);
    expect(recordActivity).not.toHaveBeenCalled();
  });
});
