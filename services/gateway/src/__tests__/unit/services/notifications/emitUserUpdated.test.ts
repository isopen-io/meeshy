/**
 * Unit tests for `NotificationService.emitUserUpdated` — realtime-only
 * fan-out of a profile change to every conversation partner's user-room
 * (not a full broadcast, not a persisted Notification row).
 *
 * @jest-environment node
 */
import { NotificationService } from '../../../../services/notifications/NotificationService';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
}));

const makePrismaMock = (partnerRows: { userId: string | null }[] = []) => ({
  participant: {
    findMany: jest.fn()
      .mockResolvedValueOnce([{ conversationId: 'conv-1' }])
      .mockResolvedValueOnce(partnerRows),
  },
}) as any;

const makeIO = () => ({
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
}) as any;

describe('NotificationService.emitUserUpdated', () => {
  let mockIO: ReturnType<typeof makeIO>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIO = makeIO();
  });

  it('emits USER_UPDATED to every distinct conversation partner user-room', async () => {
    const mockPrisma = makePrismaMock([{ userId: 'partner-B' }, { userId: 'partner-C' }]);
    const service = new NotificationService(mockPrisma);
    service.setSocketIO(mockIO);

    await service.emitUserUpdated({ userId: 'user-A', changes: { displayName: 'New Name' } });

    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.user('partner-B'));
    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.user('partner-C'));
    expect(mockIO.emit).toHaveBeenCalledWith(
      SERVER_EVENTS.USER_UPDATED,
      { userId: 'user-A', changes: { displayName: 'New Name' } }
    );
    expect(mockIO.emit).toHaveBeenCalledTimes(2);
  });

  it('does not emit when the user has no conversation partners', async () => {
    const mockPrisma = makePrismaMock([]);
    const service = new NotificationService(mockPrisma);
    service.setSocketIO(mockIO);

    await service.emitUserUpdated({ userId: 'user-A', changes: { avatar: 'new.png' } });

    expect(mockIO.emit).not.toHaveBeenCalled();
  });

  it('is a no-op when socket.io is not yet configured', async () => {
    const mockPrisma = makePrismaMock([{ userId: 'partner-B' }]);
    const service = new NotificationService(mockPrisma);
    // setSocketIO() intentionally not called.

    await expect(
      service.emitUserUpdated({ userId: 'user-A', changes: { avatar: 'new.png' } })
    ).resolves.toBeUndefined();
    expect(mockPrisma.participant.findMany).not.toHaveBeenCalled();
  });

  it('never persists a Notification row for this realtime-only signal', async () => {
    const mockPrisma = makePrismaMock([{ userId: 'partner-B' }]);
    mockPrisma.notification = { create: jest.fn() };
    const service = new NotificationService(mockPrisma);
    service.setSocketIO(mockIO);

    await service.emitUserUpdated({ userId: 'user-A', changes: { username: 'newname' } });

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });
});
