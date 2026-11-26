/**
 * #19220 — A bloque B : côté BLOQUÉ, le contenu de A part aussi quand c'est un
 * TIERS qui l'a fait voyager.
 *
 * Le lot #18910 ne retirait que les lignes dont `actor.id` est A. Une réponse
 * de C sous la story de A (`story_thread_reply`), un commentaire de C relayé
 * (`friend_story_comment`) ou la republication par C d'une publication de A
 * (`friend_content_repost`, original en `metadata.originalPostId`) portent
 * pourtant la vignette, l'extrait et le nom de A : elles restaient lisibles chez
 * B. Ce qui relie la ligne au contenu est la PUBLICATION nommée, et l'auteur de
 * la publication se lit en base.
 *
 * Le retrait reste SILENCIEUX vers B, et ne touche ni le contenu de B lui-même,
 * ni la liste d'un autre que B.
 *
 * Le double Prisma est à ÉTAT : il filtre comme Mongo, si bien que le témoin
 * lit ce que la liste servirait après l'appel.
 *
 * @jest-environment node
 */

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (input: string) => input?.replace(/<[^>]*>/g, '') ?? '' },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

jest.mock('@meeshy/shared/prisma/client', () => {
  const mockPrisma = {
    notification: { deleteMany: jest.fn(), count: jest.fn() },
    post: { findMany: jest.fn() },
    $runCommandRaw: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../../services/notifications/NotificationService';

const A = '64a000000000000000000001';
const B = '64a000000000000000000002';
const C = '64a000000000000000000003';

const STORY_OF_A = '64b000000000000000000001';
const POST_OF_B = '64b000000000000000000002';
const REPOST_BY_C = '64b000000000000000000003';
const POST_OF_C = '64b000000000000000000004';

const AUTHORS: Record<string, string> = {
  [STORY_OF_A]: A,
  [POST_OF_B]: B,
  [REPOST_BY_C]: C,
  [POST_OF_C]: C,
};

type Row = {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly actorId: string;
  readonly paths: Readonly<Record<string, string>>;
};

const rowOf = (id: string, userId: string, type: string, actorId: string, paths: Record<string, string> = {}): Row => ({
  id: `64e0000000000000000000${id}`,
  userId,
  type,
  actorId,
  paths,
});

const valueAt = (row: Row, path: string): string | undefined => (path === 'actor.id' ? row.actorId : row.paths[path]);

const matches = (row: Row, clause: Record<string, unknown>): boolean =>
  Object.entries(clause).every(([key, condition]) => {
    if (key === 'userId') return row.userId === (condition as { $oid: string }).$oid;
    if (key === '$or') return (condition as Record<string, unknown>[]).some((branch) => matches(row, branch));
    const value = key === 'type' ? row.type : valueAt(row, key);
    if (typeof condition === 'string') return value === condition;
    const operators = condition as { $in?: string[]; $ne?: string; $exists?: boolean };
    if (operators.$in && !(value !== undefined && operators.$in.includes(value))) return false;
    if (operators.$ne !== undefined && value === operators.$ne) return false;
    if (operators.$exists === true && value === undefined) return false;
    return true;
  });

describe('NotificationService.retractNotificationsFromActor — le contenu du bloqueur relayé par un tiers (#19220)', () => {
  let service: NotificationService;
  let prisma: any;
  let io: { to: jest.Mock<any>; emit: jest.Mock<any> };
  let rows: Row[];

  const typesOf = (userId: string) => rows.filter((row) => row.userId === userId).map((row) => row.type).sort();

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = new PrismaClient();
    service = new NotificationService(prisma);
    io = { to: jest.fn<any>().mockReturnThis(), emit: jest.fn<any>() };
    service.setSocketIO(io as never, new Map());

    rows = [
      rowOf('01', B, 'story_thread_reply', C, { 'context.postId': STORY_OF_A }),
      rowOf('02', B, 'friend_story_comment', C, { 'context.postId': STORY_OF_A }),
      rowOf('03', B, 'friend_content_repost', C, { 'context.postId': REPOST_BY_C, 'metadata.originalPostId': STORY_OF_A }),
      rowOf('04', B, 'post_like', C, { 'context.postId': POST_OF_B }),
      rowOf('05', B, 'friend_new_post', C, { 'context.postId': POST_OF_C }),
      rowOf('06', B, 'friend_new_story', A, { 'context.postId': STORY_OF_A }),
      rowOf('07', B, 'friend_request', A),
      rowOf('08', C, 'story_thread_reply', B, { 'context.postId': STORY_OF_A }),
    ];

    prisma.$runCommandRaw.mockImplementation(async (command: any) => {
      if (command.distinct) {
        const values = rows.filter((row) => matches(row, command.query)).map((row) => valueAt(row, command.key));
        return { values: [...new Set(values.filter((value) => value !== undefined))], ok: 1 };
      }
      const found = rows.filter((row) => matches(row, command.filter));
      return {
        cursor: {
          firstBatch: found.slice(0, command.batchSize ?? found.length).map((row) => ({
            _id: { $oid: row.id },
            type: row.type,
            delivery: { pushSent: true },
          })),
        },
      };
    });
    prisma.post.findMany.mockImplementation(async ({ where }: any) =>
      where.id.in.filter((id: string) => AUTHORS[id] === where.authorId).map((id: string) => ({ id }))
    );
    prisma.notification.deleteMany.mockImplementation(async ({ where }: any) => {
      const before = rows.length;
      rows = rows.filter((row) => !where.id.in.includes(row.id));
      return { count: before - rows.length };
    });
    prisma.notification.count.mockImplementation(async () => 0);
  });

  it('côté bloqué : la réponse, le commentaire et la republication d’un tiers sur le contenu du bloqueur partent', async () => {
    const removed = await service.retractNotificationsFromActor(B, A, 'actor-content');

    expect(removed).toBe(4);
    expect(typesOf(B)).toEqual(['friend_new_post', 'friend_request', 'post_like']);
  });

  it('côté bloqué : le retrait reste silencieux', async () => {
    await service.retractNotificationsFromActor(B, A, 'actor-content');

    expect(io.emit).not.toHaveBeenCalled();
  });

  it('le contenu du bloqué lui-même et celui d’un tiers restent', async () => {
    await service.retractNotificationsFromActor(B, A, 'actor-content');

    expect(rows.map((row) => row.id)).toEqual(
      expect.arrayContaining(['64e000000000000000000004', '64e000000000000000000005'])
    );
  });

  it('la liste d’un autre que le bloqué n’est pas touchée', async () => {
    await service.retractNotificationsFromActor(B, A, 'actor-content');

    expect(typesOf(C)).toEqual(['story_thread_reply']);
  });

  it('la lecture des auteurs en panne : le contenu de l’acteur lui-même part quand même', async () => {
    prisma.post.findMany.mockRejectedValue(new Error('mongo down'));

    const removed = await service.retractNotificationsFromActor(B, A, 'actor-content');

    expect(removed).toBe(1);
    expect(rows.some((row) => row.id === '64e000000000000000000006')).toBe(false);
  });

  it('côté bloqueur, le retrait reste borné à l’acteur : aucune lecture d’auteur', async () => {
    await service.retractNotificationsFromActor(A, B);

    expect(prisma.post.findMany).not.toHaveBeenCalled();
  });
});
