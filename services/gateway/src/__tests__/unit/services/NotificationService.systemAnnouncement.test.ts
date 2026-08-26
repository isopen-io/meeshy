/**
 * `createSystemNotification` — le canal in-app des diffusions admin s'appuie
 * dessus : le SUJET de l'annonce doit survivre comme `title` persisté (le
 * builder localisé n'a pas de titre pour `system`) et voyager dans le payload
 * `notification:new` ; la langue fournie épargne une lecture en base ;
 * `expiresAt` borne la durée de vie de l'annonce.
 */

import { NotificationService } from '../../../services/notifications/NotificationService';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

function makeHarness() {
  const prisma: any = {
    notification: {
      create: jest.fn(async ({ data }: any) => ({ id: 'notif_sys', ...data })),
      count: jest.fn(async () => 0),
    },
    user: {
      findUnique: jest.fn(async () => ({ id: 'user_recipient', systemLanguage: 'de' })),
      findMany: jest.fn(async () => []),
    },
    userPreferences: { findUnique: jest.fn(async () => null) },
    userConversationPreferences: { findMany: jest.fn(async () => []) },
  };
  const io: any = { to: jest.fn().mockReturnThis(), emit: jest.fn(), in: jest.fn().mockReturnThis(), fetchSockets: jest.fn(async () => []) };
  const service = new NotificationService(prisma);
  service.setSocketIO(io);
  return { prisma, io, service };
}

describe('createSystemNotification — annonce admin in-app', () => {
  it("persiste le sujet comme titre (rogné) et l'expiration, sans lecture de langue en base", async () => {
    const { prisma, service } = makeHarness();
    const expiresAt = new Date('2026-09-01T00:00:00Z');

    const result = await service.createSystemNotification({
      recipientUserId: 'user_recipient',
      title: '  Maintenance ce soir  ',
      content: 'Meeshy sera indisponible de 22h à 23h.',
      systemType: 'announcement',
      lang: 'fr',
      expiresAt,
    });

    expect(result).not.toBeNull();
    const data = prisma.notification.create.mock.calls[0][0].data;
    expect(data.type).toBe('system');
    expect(data.title).toBe('Maintenance ce soir');
    expect(data.content).toBe('Meeshy sera indisponible de 22h à 23h.');
    expect(data.expiresAt).toEqual(expiresAt);
    expect(data.metadata).toEqual(expect.objectContaining({ systemType: 'announcement' }));
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('laisse le titre nul quand aucun sujet n’est fourni (comportement historique des appelants existants)', async () => {
    const { prisma, service } = makeHarness();

    await service.createSystemNotification({ recipientUserId: 'user_recipient', content: 'Appareil ajouté.' });

    expect(prisma.notification.create.mock.calls[0][0].data.title).toBeNull();
  });

  it('pousse le sujet en titre du payload `notification:new`', async () => {
    const { io, service } = makeHarness();

    await service.createSystemNotification({
      recipientUserId: 'user_recipient',
      title: 'Nouveauté',
      content: 'Les stories canvas arrivent.',
      systemType: 'feature',
      lang: 'fr',
    });

    expect(io.to).toHaveBeenCalledWith(ROOMS.user('user_recipient'));
    const emitted = io.emit.mock.calls.find((c: any[]) => c[0] === SERVER_EVENTS.NOTIFICATION_NEW);
    expect(emitted).toBeDefined();
    expect(emitted![1]).toEqual(expect.objectContaining({ title: 'Nouveauté', content: 'Les stories canvas arrivent.' }));
  });
});
