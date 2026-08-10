/**
 * Une notification ne survit pas au message qu'elle annonce.
 *
 * `createMessageNotification` REFUSE déjà de créer une notification pour un
 * message déjà expiré (garde d'admission, cycle 47). Rien ne disait ce qu'il
 * advient d'une notification créée AVANT l'expiration : le message éphémère
 * disparaît quelques minutes plus tard, la ligne reste — un badge non lu que
 * plus aucune lecture ne peut décrémenter, et un `action: view_message` qui
 * ouvre un message absent.
 *
 * Ce fichier tient les deux moitiés de la règle :
 *  - le PRODUCTEUR reporte l'expiration du message sur la notification ;
 *  - les LECTURES l'honorent, toutes, avec le même prédicat.
 *
 * Le double Prisma n'enregistre pas les `where` : il les ÉVALUE contre des
 * lignes. Un test qui compare la clause à celle attendue passerait aussi bien
 * avec une clause juste qu'avec une clause fausse mais conforme à ce que le
 * test croit — ici, une clause qui ne filtre rien compte la ligne expirée, et
 * le test le voit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
}));

import { NotificationService } from '../../../../services/notifications/NotificationService';
import { matchesNotificationWhere } from '../../../helpers/notification-where';

const USER_ID = '507f1f77bcf86cd799439011';
const SENDER_ID = '507f1f77bcf86cd799439012';
const CONV_ID = '507f1f77bcf86cd799439013';
const MSG_ID = '507f1f77bcf86cd799439014';

const NOW = new Date('2026-08-10T12:00:00.000Z');
const PAST = new Date('2026-08-10T11:59:00.000Z');
const FUTURE = new Date('2026-08-10T12:01:00.000Z');

interface Row {
  id: string;
  userId: string;
  isRead: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  actor?: unknown;
}

const matches = matchesNotificationWhere;

function makePrisma(rows: Row[]) {
  const notification = {
    count: jest.fn<any>(({ where }: any) => Promise.resolve(rows.filter((r) => matches(r, where)).length)),
    findMany: jest.fn<any>(({ where, take, skip }: any) => {
      const hits = rows
        .filter((r) => matches(r, where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const from = skip ?? 0;
      return Promise.resolve(hits.slice(from, from + (take ?? hits.length)));
    }),
    create: jest.fn<any>(({ data }: any) => Promise.resolve({ id: 'created', ...data })),
    update: jest.fn<any>(({ where, data }: any) => {
      const row = rows.find((r) => r.id === where.id);
      if (row) Object.assign(row, data);
      return Promise.resolve(row);
    }),
    findUnique: jest.fn<any>().mockResolvedValue(null),
    deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
  };

  return {
    notification,
    message: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        username: 'alice',
        displayName: 'Alice',
        avatar: null,
      }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ title: 'Salon', type: 'group', avatar: null }),
    },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userConversationPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

function makeIO() {
  const emit = jest.fn();
  return {
    io: { to: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(), emit } as any,
    emit,
  };
}

function row(overrides: Partial<Row> & Pick<Row, 'id'>): Row {
  return {
    userId: USER_ID,
    isRead: false,
    expiresAt: null,
    createdAt: new Date('2026-08-10T11:00:00.000Z'),
    ...overrides,
  };
}

describe('Lectures — une notification expirée n’est plus servie', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('le compte non-lus laisse tomber la ligne dont le message a expiré', async () => {
    const prisma = makePrisma([
      row({ id: 'vivante' }),
      row({ id: 'expiree', expiresAt: PAST }),
    ]);

    await expect(new NotificationService(prisma).getUnreadCount(USER_ID)).resolves.toBe(1);
  });

  it('témoin — une ligne SANS expiration est toujours comptée', async () => {
    const prisma = makePrisma([row({ id: 'a' }), row({ id: 'b' })]);

    await expect(new NotificationService(prisma).getUnreadCount(USER_ID)).resolves.toBe(2);
  });

  it('témoin — une expiration à VENIR ne retire rien (garde contre l’inversion du sens)', async () => {
    const prisma = makePrisma([row({ id: 'ephemere-encore-vivant', expiresAt: FUTURE })]);

    await expect(new NotificationService(prisma).getUnreadCount(USER_ID)).resolves.toBe(1);
  });

  it('la liste ET son total excluent la ligne expirée — sinon la pagination promet une page vide', async () => {
    const prisma = makePrisma([
      row({ id: 'vivante' }),
      row({ id: 'expiree', expiresAt: PAST }),
    ]);

    const { notifications, total } = await new NotificationService(prisma).getUserNotifications({
      userId: USER_ID,
    });

    expect(notifications.map((n) => n.id)).toEqual(['vivante']);
    expect(total).toBe(1);
  });

  it('les compteurs poussés par socket disent la même chose que la liste', async () => {
    const prisma = makePrisma([
      row({ id: 'a-lire' }),
      row({ id: 'deja-lue', isRead: true }),
      row({ id: 'expiree', expiresAt: PAST }),
    ]);
    const { io, emit } = makeIO();

    await new NotificationService(prisma, io).markAsRead('a-lire');
    // `emitCountsUpdate` part en fire-and-forget derrière la lecture : laisser
    // les microtâches se vider, sinon on interroge l'émetteur avant qu'il parle.
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();

    const counts = emit.mock.calls.find(([event]) => event === 'notification:counts');
    expect(counts?.[1]).toEqual({ unread: 0, total: 2 });
  });
});

describe('Producteur — la notification hérite de l’expiration de son message', () => {
  const baseParams = {
    recipientUserId: USER_ID,
    senderId: SENDER_ID,
    messageId: MSG_ID,
    conversationId: CONV_ID,
    messagePreview: 'Message éphémère',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('un message éphémère écrit son échéance sur la ligne créée', async () => {
    const prisma = makePrisma([]);
    prisma.message.findUnique.mockResolvedValue({
      deletedAt: null,
      expiresAt: FUTURE,
      isViewOnce: false,
      viewOnceCount: 0,
      createdAt: NOW,
      messageType: 'text',
      translations: null,
    });

    await new NotificationService(prisma).createMessageNotification(baseParams);

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ expiresAt: FUTURE }) })
    );
  });

  it('témoin — un message ordinaire ne fabrique aucune échéance', async () => {
    const prisma = makePrisma([]);
    prisma.message.findUnique.mockResolvedValue({
      deletedAt: null,
      expiresAt: null,
      isViewOnce: false,
      viewOnceCount: 0,
      createdAt: NOW,
      messageType: 'text',
      translations: null,
    });

    await new NotificationService(prisma).createMessageNotification(baseParams);

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ expiresAt: null }) })
    );
  });

  it('une mention sur un message éphémère hérite de la même échéance', async () => {
    const prisma = makePrisma([]);

    await new NotificationService(prisma).createMentionNotificationsBatch(
      [USER_ID],
      {
        senderId: SENDER_ID,
        messageContent: 'coucou @toi',
        conversationId: CONV_ID,
        messageId: MSG_ID,
        messageExpiresAt: FUTURE,
      },
      [USER_ID]
    );

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ expiresAt: FUTURE }) })
    );
  });
});
