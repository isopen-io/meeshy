/**
 * #11158 — le push d'un retrait (`content_removed`) porte de quoi router le tap
 * et dire le motif sans relire la notification : `contentType`, `contentId` et
 * `reason` dans `data`. Le motif est du CONTENU : il suit `showPreview`, comme
 * tout ce qui compose un aperçu ; les deux clés de routage voyagent toujours.
 *
 * @jest-environment node
 */
import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
}));

const AUTHOR = 'author_id';

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
  user: { findUnique: jest.fn().mockResolvedValue({ id: AUTHOR, systemLanguage: 'fr' }), findMany: jest.fn().mockResolvedValue([]) },
  conversation: { findUnique: jest.fn().mockResolvedValue(null) },
  userPreferences: { findUnique: jest.fn().mockResolvedValue(notificationPrefs === null ? null : { notification: notificationPrefs }) },
}) as any;

const makeIO = () => ({ to: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(), fetchSockets: jest.fn().mockResolvedValue([]), emit: jest.fn() }) as any;

const pushData = async (params: { readonly type: string; readonly metadata: Record<string, unknown>; readonly prefs?: Record<string, unknown> | null }) => {
  const sendToUser = jest.fn().mockResolvedValue(undefined);
  const service = new NotificationService(makePrisma(params.prefs ?? null));
  service.setSocketIO(makeIO());
  service.setPushNotificationService({ sendToUser } as any);
  await service.createNotification({
    userId: AUTHOR,
    type: params.type,
    priority: 'normal',
    title: 'Votre réel a été retiré par la modération',
    content: 'Motif : Nudité',
    context: { postId: 'post_1' },
    metadata: params.metadata,
  } as any);
  return sendToUser.mock.calls[0]?.[0]?.payload?.data as Record<string, unknown> | undefined;
};

const removed = { contentType: 'reel', contentId: 'post_1', postId: 'post_1', reason: 'Nudité' };

describe('push data de content_removed', () => {
  it('porte contentType, contentId et le motif', async () => {
    const data = await pushData({ type: 'content_removed', metadata: removed });
    expect(data).toMatchObject({ type: 'content_removed', contentType: 'reel', contentId: 'post_1', reason: 'Nudité', postId: 'post_1' });
  });

  it('sans motif (rang souverain), aucune clé reason', async () => {
    const { reason: _omitted, ...withoutReason } = removed;
    const data = await pushData({ type: 'content_removed', metadata: withoutReason });
    expect(data).toMatchObject({ contentType: 'reel', contentId: 'post_1' });
    expect(data).not.toHaveProperty('reason');
  });

  it('showPreview:false retient le motif, garde les clés de routage', async () => {
    const data = await pushData({ type: 'content_removed', metadata: removed, prefs: { showPreview: false } });
    expect(data).toMatchObject({ contentType: 'reel', contentId: 'post_1' });
    expect(data).not.toHaveProperty('reason');
  });

  it('un autre type ne reçoit aucune de ces clés, même si sa metadata les porte', async () => {
    const data = await pushData({ type: 'system', metadata: removed });
    expect(data).toBeDefined();
    expect(data).not.toHaveProperty('contentId');
    expect(data).not.toHaveProperty('reason');
  });
});
