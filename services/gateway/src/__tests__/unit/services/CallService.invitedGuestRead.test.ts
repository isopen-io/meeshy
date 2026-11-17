/**
 * Une personne invitée dans un appel en cours lit la session qu'on l'invite à
 * rejoindre (`GET /calls/:id`) avant d'en être participante ou membre
 * (#19238). Un non-invité reste refusé.
 */

import { describe, it, expect, jest } from '@jest/globals';

import { CallService } from '../../../services/CallService';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../services/TURNCredentialService', () => ({
  TURNCredentialService: jest.fn().mockImplementation(() => ({
    generateCredentials: jest.fn().mockReturnValue([]),
    isConfigured: jest.fn().mockReturnValue(true),
    getStatus: jest.fn().mockReturnValue({}),
  })),
}));

const INVITEE = '507f1f77bcf86cd799439401';
const STRANGER = '507f1f77bcf86cd799439402';

const serviceFor = (session: object) => {
  const prisma = {
    callSession: { findUnique: jest.fn<any>().mockResolvedValue(session) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  };
  return new CallService(prisma as never);
};

const session = () => ({
  id: 'call-1',
  conversationId: 'conv-1',
  status: 'active',
  invitedUserIds: [INVITEE],
  participants: [{ participant: { userId: '507f1f77bcf86cd799439400' } }],
});

describe('CallService.getCallSession — invité en attente', () => {
  it("admet la personne invitée qui n'est encore ni participante ni membre", async () => {
    await expect(serviceFor(session()).getCallSession('call-1', INVITEE)).resolves.toMatchObject({ id: 'call-1' });
  });

  it('refuse toujours un non-invité', async () => {
    await expect(serviceFor(session()).getCallSession('call-1', STRANGER)).rejects.toThrow('NOT_A_PARTICIPANT');
  });

  it("refuse l'invité d'un appel terminé", async () => {
    await expect(serviceFor({ ...session(), status: 'ended' }).getCallSession('call-1', INVITEE)).rejects.toThrow(
      'NOT_A_PARTICIPANT'
    );
  });
});
