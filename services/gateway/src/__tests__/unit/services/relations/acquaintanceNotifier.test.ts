/**
 * LA NOTIFICATION DISCRÈTE DE LA CONNAISSANCE (#13932) : une ligne, dans la
 * langue de cadrage du destinataire, qui nomme l'autre et ne porte aucune mesure.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { createAcquaintanceNotifier } from '../../../../services/relations/acquaintanceNotifier';
import { setSharedNotificationService } from '../../../../services/notifications/notification-service-registry';

const ME = '5f0000000000000000000001';
const OTHER = '5f0000000000000000000002';

const users: Record<string, Record<string, unknown>> = {
  [ME]: { id: ME, isActive: true, deletedAt: null, systemLanguage: 'es', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
  [OTHER]: { id: OTHER, username: 'awa', displayName: 'Awa', firstName: null, lastName: null, avatar: 'a.png', isActive: true, deletedAt: null },
};

const prisma = (over: Record<string, Record<string, unknown> | null> = {}) =>
  ({ user: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (where.id in over ? over[where.id] : users[where.id] ?? null)) } }) as never;

const registered = () => {
  const createNotification = jest.fn(async (_params: Record<string, unknown>) => ({ id: 'n1' }));
  setSharedNotificationService({ createNotification } as never);
  return createNotification;
};

afterEach(() => setSharedNotificationService(undefined));

describe('createAcquaintanceNotifier', () => {
  it('crée une notification discrète, dans la langue du destinataire, qui nomme l’autre personne', async () => {
    const createNotification = registered();

    await createAcquaintanceNotifier(prisma())({ recipientId: ME, otherId: OTHER });

    expect(createNotification).toHaveBeenCalledTimes(1);
    const call = createNotification.mock.calls[0][0];
    expect(call).toMatchObject({
      userId: ME,
      type: 'relation_acquaintance',
      priority: 'low',
      lang: 'es',
      actor: { id: OTHER, displayName: 'Awa' },
      metadata: { action: 'view_profile', userId: OTHER, relationLevel: 'ACQUAINTANCE', origin: 'auto-acquaintance' },
    });
    expect(call.content).toBe('Habláis lo bastante como para conoceros: buen comienzo 👋');
  });

  it('ne porte aucune mesure : ni nombre d’interactions, ni nature manquante', async () => {
    const createNotification = registered();
    await createAcquaintanceNotifier(prisma())({ recipientId: ME, otherId: OTHER });

    expect(JSON.stringify(createNotification.mock.calls[0][0])).not.toMatch(/interaction|missing|audio|count/i);
  });

  it('ne notifie ni un compte supprimé ni une personne introuvable', async () => {
    const createNotification = registered();

    await createAcquaintanceNotifier(prisma({ [ME]: { ...users[ME], deletedAt: new Date() } }))({ recipientId: ME, otherId: OTHER });
    await createAcquaintanceNotifier(prisma({ [OTHER]: null }))({ recipientId: ME, otherId: OTHER });

    expect(createNotification).not.toHaveBeenCalled();
  });

  it('une passerelle sans service de notification ne fait rien et ne jette pas', async () => {
    setSharedNotificationService(undefined);

    await expect(createAcquaintanceNotifier(prisma())({ recipientId: ME, otherId: OTHER })).resolves.toBeUndefined();
  });
});
