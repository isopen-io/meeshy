/**
 * #10175 (L19, § 5.16.4) — la charge d'un push « moments à immortaliser » ne dit RIEN de l'étape. Le texte est
 * neutre (D13) ; l'ancre de l'étape (`metadata.focusStepId`, un rang, un palier, une Flamme) et le compte restent
 * dans la ligne `Notification`, lue par le seul destinataire : ni APNs, ni FCM, ni le service worker ne les
 * transportent. Le tap se route par le TYPE (le carnet) et, chez un ancien client, par l'indice `route`.
 *
 * @jest-environment node
 */
import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
}));

const PLAYER = 'player_id';
const STEP = 'rank:echo:3';

const makePrisma = () => ({
  notification: {
    create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => ({ id: 'notif_photo', ...args.data })),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  user: { findUnique: jest.fn().mockResolvedValue({ id: PLAYER, systemLanguage: 'fr' }), findMany: jest.fn().mockResolvedValue([]) },
  conversation: { findUnique: jest.fn().mockResolvedValue(null) },
  userPreferences: { findUnique: jest.fn().mockResolvedValue(null) },
});

const makeIO = () => ({ to: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(), fetchSockets: jest.fn().mockResolvedValue([]), emit: jest.fn() });

type SentPush = { readonly payload: { readonly title?: string; readonly body?: string; readonly data: Record<string, unknown> } };

const sentPush = async (): Promise<SentPush | undefined> => {
  const sendToUser = jest.fn().mockResolvedValue(undefined);
  const service = new NotificationService(makePrisma() as never);
  service.setSocketIO(makeIO() as never);
  service.setPushNotificationService({ sendToUser } as never);
  await service.createNotification({
    userId: PLAYER,
    type: 'game_photo_moment',
    priority: 'low',
    lang: 'fr',
    content: '2 moments à immortaliser dans ton carnet.',
    context: {},
    metadata: { action: 'view_details', route: 'progression', gameSection: 'carnet', count: 2, focusStepId: STEP } as never,
    collapseId: 'game-photo-moment',
  });
  return sendToUser.mock.calls[0]?.[0] as SentPush | undefined;
};

describe('la charge push de game_photo_moment', () => {
  it('route le tap par le type et l’indice `progression`, rien de plus', async () => {
    const push = await sentPush();
    expect(push?.payload.data).toMatchObject({ type: 'game_photo_moment', route: 'progression', notificationId: 'notif_photo' });
  });

  it('ne transporte ni l’étape, ni sa section, ni le rang — dans aucune clé, aucune valeur', async () => {
    const push = await sentPush();
    const wire = JSON.stringify(push?.payload ?? {});
    expect(push?.payload.data).not.toHaveProperty('focusStepId');
    expect(push?.payload.data).not.toHaveProperty('gameSection');
    expect(wire).not.toContain(STEP);
    expect(wire).not.toContain('echo');
  });
});
