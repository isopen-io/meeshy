/**
 * #20540 — ce qui PART vraiment d'une notification `blood_proximity`, à travers le vrai
 * `NotificationService` : titre, corps et `data` du push, ligne persistée. La distance est le PALIER
 * de l'alerte socket, jamais plus précise ; elle vit dans le CORPS, que `showPreview:false` remplace,
 * et le titre ne la porte jamais. `showSenderName:false` retire aussi le nom. L'absence de coordonnée
 * se garde là où une coordonnée EXISTE : `bloodProximityNotification.test.ts`, depuis un vrai point.
 *
 * @jest-environment node
 */
import { NotificationService } from '../../../../services/notifications/NotificationService';
import { bloodProximityNotifierOf } from '../../../../services/bloodLocation/bloodProximityNotice';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
}));

const MOI = '6400000000000000000000a1';
const LINA = '6400000000000000000000b1';

const USERS: Record<string, Record<string, unknown>> = {
  [MOI]: { id: MOI, username: 'moi', displayName: 'Moi', avatar: null, systemLanguage: 'fr', isActive: true, deletedAt: null, blockedUserIds: [] },
  [LINA]: { id: LINA, username: 'lina', displayName: 'Lina', avatar: null, systemLanguage: 'en', isActive: true, deletedAt: null, blockedUserIds: [] },
};

const makePrisma = (notificationPrefs: Record<string, unknown> | null) => ({
  notification: {
    create: jest.fn().mockImplementation((args: any) => ({ id: 'notif_created', ...args.data })),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  user: {
    findUnique: jest.fn().mockImplementation(async (args: any) => USERS[args.where.id] ?? null),
    findMany: jest.fn().mockImplementation(async (args: any) => (args.where?.id?.in ?? []).map((id: string) => USERS[id]).filter(Boolean)),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  conversation: { findUnique: jest.fn().mockResolvedValue(null) },
  participant: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  userConversationPreferences: { findMany: jest.fn().mockResolvedValue([]) },
  userPreferences: { findUnique: jest.fn().mockResolvedValue(notificationPrefs === null ? null : { notification: notificationPrefs }) },
}) as any;

const makeIO = () => ({ to: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(), fetchSockets: jest.fn().mockResolvedValue([]), emit: jest.fn() }) as any;

async function envoi(prefs: Record<string, unknown> | null, distanceMeters = 500) {
  const prisma = makePrisma(prefs);
  const sendToUser = jest.fn().mockResolvedValue(undefined);
  const service = new NotificationService(prisma);
  service.setSocketIO(makeIO());
  service.setPushNotificationService({ sendToUser } as any);
  const notify = bloodProximityNotifierOf({ prisma, notifications: service, now: () => Date.parse('2026-11-24T12:00:00.000Z') });
  await notify!({ recipientId: MOI, otherId: LINA, distanceMeters });
  const payload = sendToUser.mock.calls[0]?.[0]?.payload as { title: string; body: string; subtitle?: string; data: Record<string, unknown> } | undefined;
  const row = prisma.notification.create.mock.calls[0]?.[0]?.data as Record<string, unknown> | undefined;
  return { payload, row };
}

describe('la charge poussée de blood_proximity', () => {
  it('aperçu permis : le nom au titre, le palier dans le corps, l\'autre Sang dans data', async () => {
    const { payload, row } = await envoi({ showPreview: true, showSenderName: true });
    expect(payload?.title).toBe('Lina est tout près');
    expect(payload?.body).toMatch(/^À 500\sm — touche pour vous voir tous les deux sur la carte$/u);
    expect(payload?.data).toMatchObject({ type: 'blood_proximity', userId: LINA });
    expect(row?.metadata).toEqual({ action: 'view_profile', userId: LINA, distanceMeters: 500 });
  });

  it('la distance servie est le palier reçu, jamais affinée', async () => {
    const { payload, row } = await envoi({ showPreview: true }, 250);
    expect(payload?.body).toMatch(/250\sm/u);
    expect((row?.metadata as Record<string, unknown>).distanceMeters).toBe(250);
  });

  it('aperçu coupé : ni distance dans le titre, le corps ni data', async () => {
    const { payload } = await envoi({ showPreview: false, showSenderName: true });
    const sortant = JSON.stringify({ title: payload?.title, subtitle: payload?.subtitle, body: payload?.body, data: payload?.data });
    expect(sortant).not.toMatch(/500|\bm\b|carte/u);
    expect(payload?.title).not.toMatch(/\d/);
  });

  it('nom coupé et aperçu coupé : ni nom ni distance dans ce qui s\'affiche', async () => {
    const { payload } = await envoi({ showPreview: false, showSenderName: false });
    expect(payload?.title).toBe('Meeshy');
    expect(`${payload?.title} ${payload?.subtitle ?? ''} ${payload?.body}`).not.toMatch(/Lina|500/u);
  });
});
