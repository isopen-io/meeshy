/**
 * #16137 — un changement du rôle de PLATEFORME (`User.role`) change
 * `canMakeObsolete` dans les conversations du compte, sans toucher leur rang.
 * La cible reçoit, dans sa room personnelle, `participant:role-updated` — que
 * les trois clients écoutent déjà — portant son rang INCHANGÉ et la capacité
 * recalculée, pour chaque conversation où la capacité bascule, et seulement
 * celles-là.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { announcePlatformRoleCapabilities } from '../../../../services/conversations/obsoleteCapability';

const ALICE = '507f1f77bcf86cd799439c11';
const ADMIN = '507f1f77bcf86cd799439caa';
const GROUP = '507f1f77bcf86cd799439d01';
const OWNED = '507f1f77bcf86cd799439d02';
const GLOBAL = '507f1f77bcf86cd799439d03';
const DIRECT = '507f1f77bcf86cd799439d04';

const membership = (conversationId: string, type: string, role: string, identifier = `mshy_${conversationId.slice(-2)}`) => ({
  conversationId, userId: ALICE, role, type: 'user', leftAt: null, bannedAt: null,
  conversation: { type, identifier },
});

const prismaDouble = (rows = [
  membership(GROUP, 'group', 'member'),
  membership(OWNED, 'group', 'creator'),
  membership(GLOBAL, 'global', 'member', 'meeshy'),
  membership(DIRECT, 'direct', 'member'),
]) => ({
  participant: {
    findMany: jest.fn<any>(async (args: any) => (args.where.OR ? [] : rows)),
    groupBy: jest.fn<any>().mockResolvedValue([{ conversationId: DIRECT, _count: { _all: 2 } }]),
  },
});

const ioDouble = () => {
  const emitted: { room: string; event: string; payload: any }[] = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => { emitted.push({ room, event, payload }); return true; } }) };
  return { io, emitted };
};

describe('announcePlatformRoleCapabilities — le rôle de plateforme change', () => {
  it('promu ADMIN : la cible apprend canMakeObsolete=true là où il bascule, son rang de conversation inchangé', async () => {
    const prisma = prismaDouble();
    const { io, emitted } = ioDouble();
    await announcePlatformRoleCapabilities(prisma as never, {
      io: io as never, userId: ALICE, previousRole: 'USER', newRole: 'ADMIN', updatedBy: ADMIN, onError: jest.fn(),
    });
    expect(emitted).toEqual([{
      room: ROOMS.user(ALICE),
      event: SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED,
      payload: { conversationId: GROUP, userId: ALICE, newRole: 'member', updatedBy: ADMIN, viewerCapabilities: { canMakeObsolete: true } },
    }]);
  });

  it('rétrogradé USER : la capacité retombe à false dans le groupe où il n’est que membre', async () => {
    const prisma = prismaDouble();
    const { io, emitted } = ioDouble();
    await announcePlatformRoleCapabilities(prisma as never, {
      io: io as never, userId: ALICE, previousRole: 'BIGBOSS', newRole: 'USER', updatedBy: ADMIN, onError: jest.fn(),
    });
    expect(emitted.map((e) => [e.payload.conversationId, e.payload.viewerCapabilities])).toEqual([[GROUP, { canMakeObsolete: false }]]);
  });

  it('un changement qui ne change aucune capacité n’émet rien', async () => {
    const prisma = prismaDouble();
    const { io, emitted } = ioDouble();
    await announcePlatformRoleCapabilities(prisma as never, {
      io: io as never, userId: ALICE, previousRole: 'ADMIN', newRole: 'BIGBOSS', updatedBy: ADMIN, onError: jest.fn(),
    });
    expect(emitted).toEqual([]);
  });

  it('promu puis rétrogradé aussitôt : la dernière capacité remise est celle du dernier rôle, même si la première lecture traîne', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow = prismaDouble();
    const slowFindMany = slow.participant.findMany;
    slow.participant.findMany = jest.fn<any>(async (args: any) => { await gate; return slowFindMany(args); });
    const { io, emitted } = ioDouble();
    const promoted = announcePlatformRoleCapabilities(slow as never, {
      io: io as never, userId: ALICE, previousRole: 'USER', newRole: 'ADMIN', updatedBy: ADMIN, onError: jest.fn(),
    });
    const demoted = announcePlatformRoleCapabilities(prismaDouble() as never, {
      io: io as never, userId: ALICE, previousRole: 'ADMIN', newRole: 'USER', updatedBy: ADMIN, onError: jest.fn(),
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    await Promise.all([promoted, demoted]);
    expect(emitted.map((e) => e.payload.viewerCapabilities.canMakeObsolete)).toEqual([true, false]);
  });

  it('une lecture impossible ne rejette pas et n’émet rien', async () => {
    const prisma = { participant: { findMany: jest.fn<any>().mockRejectedValue(new Error('down')), groupBy: jest.fn<any>() } };
    const { io, emitted } = ioDouble();
    const onError = jest.fn();
    await announcePlatformRoleCapabilities(prisma as never, {
      io: io as never, userId: ALICE, previousRole: 'USER', newRole: 'ADMIN', updatedBy: ADMIN, onError,
    });
    expect(onError).toHaveBeenCalled();
    expect(emitted).toEqual([]);
  });
});
