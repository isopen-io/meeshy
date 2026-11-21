/**
 * LES SURFACES QUI DISENT « LA PLUS RÉCEMMENT ACTIVE » SERVENT LE RANG (#19835).
 *
 * Trois surfaces, trois produits différents, UNE phrase dans leurs
 * doc-comments — et la même requête `orderBy: { lastMessageAt: 'desc' }`
 * dessous :
 *
 * | surface | ce que son commentaire promet |
 * |---|---|
 * | `mostRecentSharedConversation` | « la conversation la PLUS RÉCENTE que l'émetteur partage avec le destinataire » (#17141) |
 * | `findExactCallGroups` | « les groupes candidats, du plus récemment ACTIF au plus ancien » (#19650) |
 * | la destination d'un appel manqué | « menée à sa conversation directe avec l'inviteur […] la plus récemment ACTIVE » (#9115) |
 *
 * Depuis #9026 « actif » est le RANG — max(`lastMessageAt`, `lastActivityAt`).
 * La divergence était INERTE jusqu'à #19800 (la colonne n'était écrite par
 * aucun chemin) : AUCUN de ces témoins ne pouvait tomber avant lui.
 *
 * Les doubles honorent l'ORDRE demandé et la BORNE : une lecture d'un seul flux,
 * ou dont la fenêtre est trop étroite, les fait tomber. Un double qui rend la
 * même ligne quel que soit l'`orderBy` les rendrait tous verts.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { findConversationsIn, type DirectDoc } from '../../../helpers/direct-pair-world';

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const ME = '507f1f77bcf86cd799439001';
const PEER = '507f1f77bcf86cd799439002';
const THIRD = '507f1f77bcf86cd799439003';
const LIFTED = '507f1f77bcf86cd7994390a1';
const SPOKEN = '507f1f77bcf86cd7994390b2';
const CALL = '507f1f77bcf86cd7994390c3';

const EARLY = new Date('2026-11-01T10:00:00Z');
const MIDDLE = new Date('2026-11-10T10:00:00Z');
const LATE = new Date('2026-11-18T10:00:00Z');

/** `deletedAt` et `encryptionMode` sont POSÉS à `null` : sur MongoDB, `{ champ: null }` est une ÉGALITÉ, et une clé absente n'y entre jamais. */
const shared = (id: string, fields: Record<string, unknown>, userIds: readonly string[] = [ME, PEER]): DirectDoc => ({
  id,
  type: 'direct',
  isActive: true,
  deletedAt: null,
  encryptionMode: null,
  // #19910 — les TROIS colonnes REQUISES du schéma (`Boolean @default(false)`,
  // `String @default("everyone")`, `Int @default(0)`). Prisma les écrit à
  // CHAQUE création, donc toute ligne de production les porte ; les omettre
  // faisait de la fixture une ligne qui n'existe pas, et le `where` du repli —
  // qui les filtre sur un `group` depuis #19910 — l'écartait à juste titre.
  isAnnouncementChannel: false,
  defaultWriteRole: 'everyone',
  slowModeSeconds: 0,
  participants: userIds.map((userId) => ({ userId, isActive: true })),
  ...fields,
});

describe('la copie vocale d’un talkie va dans la conversation de plus haut RANG (#19834)', () => {
  const world = (docs: readonly DirectDoc[]) => {
    const conversations = findConversationsIn(docs);
    const findFirst = jest.fn(async (args: any) => conversations.findFirst(args));
    return {
      findFirst,
      prisma: {
        participant: {
          findMany: jest.fn(async (args: any) =>
            docs
              .filter((doc) => doc.participants.some((p) => p.userId === args.where.userId && p.isActive))
              .map((doc) => ({ conversationId: doc.id }))
          ),
        },
        conversation: { findFirst },
      },
    };
  };

  const destination = async (docs: readonly DirectDoc[]): Promise<string | null> => {
    const { mostRecentSharedConversation } = await import('../../../../services/talkie/talkieFallback');
    return mostRecentSharedConversation(world(docs).prisma as never, ME, PEER);
  };

  it('une conversation REMONTÉE par une réaction reçoit la copie, pas celle au dernier message plus récent', async () => {
    const chosen = await destination([
      shared(LIFTED, { type: 'group', lastMessageAt: EARLY, lastActivityAt: LATE }),
      shared(SPOKEN, { lastMessageAt: MIDDLE }),
    ]);
    expect(chosen).toBe(LIFTED);
  });

  it('sans activité, la plus récemment parlée reçoit la copie — le comportement d’avant #19800', async () => {
    const chosen = await destination([shared(LIFTED, { lastMessageAt: EARLY }), shared(SPOKEN, { lastMessageAt: MIDDLE })]);
    expect(chosen).toBe(SPOKEN);
  });

  it('une conversation que le destinataire ne partage pas ne reçoit rien, quel que soit son rang', async () => {
    const chosen = await destination([shared(LIFTED, { lastMessageAt: EARLY, lastActivityAt: LATE }, [ME, THIRD])]);
    expect(chosen).toBeNull();
  });

  it('les deux colonnes du rang sont demandées, et les deux ordres lus', async () => {
    const { mostRecentSharedConversation } = await import('../../../../services/talkie/talkieFallback');
    const { prisma, findFirst } = world([shared(SPOKEN, { lastMessageAt: MIDDLE })]);
    await mostRecentSharedConversation(prisma as never, ME, PEER);
    expect(findFirst.mock.calls.map((call) => (call[0] as { orderBy?: unknown }).orderBy)).toEqual([
      [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      [{ lastActivityAt: 'desc' }, { id: 'desc' }],
    ]);
    expect((findFirst.mock.calls[0][0] as { select: Record<string, unknown> }).select).toMatchObject({
      id: true,
      lastMessageAt: true,
      lastActivityAt: true,
    });
  });
});

describe('le groupe exact d’un appel est choisi par son RANG (#19650)', () => {
  const group = (id: string, fields: Record<string, unknown>, userIds: readonly string[]): DirectDoc => ({
    id,
    title: null,
    type: 'group',
    isActive: true,
    participants: userIds.map((userId) => ({ userId, isActive: true })),
    ...fields,
  });

  const candidates = async (docs: readonly DirectDoc[], memberUserIds: readonly string[]) => {
    const conversations = findConversationsIn(docs);
    const findMany = jest.fn(async (args: any) => conversations.findMany(args));
    const prisma = { conversation: { findMany }, callSession: { findMany: jest.fn(async () => []) } };
    const { findExactCallGroups } = await import('../../../../services/calls/callGroupConversation');
    const found = await findExactCallGroups(prisma as never, { callId: CALL, memberUserIds: [...memberUserIds] });
    return { ids: found.map((row) => row.id), findMany };
  };

  it('le groupe REMONTÉ par un appel passe devant celui dont le dernier message est plus récent', async () => {
    const { ids } = await candidates(
      [
        group(LIFTED, { lastMessageAt: EARLY, lastActivityAt: LATE }, [ME, PEER, THIRD]),
        group(SPOKEN, { lastMessageAt: MIDDLE }, [ME, PEER, THIRD]),
      ],
      [ME, PEER, THIRD],
    );
    expect(ids).toEqual([LIFTED, SPOKEN]);
  });

  it('sans activité, l’ordre reste celui du dernier message', async () => {
    const { ids } = await candidates(
      [group(LIFTED, { lastMessageAt: EARLY }, [ME, PEER, THIRD]), group(SPOKEN, { lastMessageAt: MIDDLE }, [ME, PEER, THIRD])],
      [ME, PEER, THIRD],
    );
    expect(ids).toEqual([SPOKEN, LIFTED]);
  });

  it('un groupe dont les membres ne correspondent pas EXACTEMENT reste écarté, quel que soit son rang', async () => {
    const { ids } = await candidates(
      [
        group(LIFTED, { lastMessageAt: LATE, lastActivityAt: LATE }, [ME, PEER, THIRD, '507f1f77bcf86cd799439004']),
        group(SPOKEN, { lastMessageAt: EARLY }, [ME, PEER, THIRD]),
      ],
      [ME, PEER, THIRD],
    );
    expect(ids).toEqual([SPOKEN]);
  });

  it('les deux colonnes du rang sont demandées, et les deux flux lisent la MÊME fenêtre', async () => {
    const { findMany } = await candidates([group(SPOKEN, { lastMessageAt: MIDDLE }, [ME, PEER])], [ME, PEER]);
    const reads = findMany.mock.calls.map((call) => call[0] as { orderBy?: unknown; take?: number; select: Record<string, unknown> });
    expect(reads.map((read) => read.orderBy)).toEqual([
      [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      [{ lastActivityAt: 'desc' }, { id: 'desc' }],
    ]);
    expect(new Set(reads.map((read) => read.take))).toEqual(new Set([20]));
    expect(reads[0].select).toMatchObject({ lastMessageAt: true, lastActivityAt: true });
  });
});

describe('l’appel manqué d’une invitée non membre mène au tête-à-tête de plus haut rang (#9115)', () => {
  const missedDestination = async (docs: readonly DirectDoc[]) => {
    const conversations = findConversationsIn(docs);
    // Le double DÉCLARE le paramètre qu'il reçoit : sans cela `mock.calls[0]` est
    // un tuple VIDE au typage, et lire son premier élément n'est plus vérifiable.
    const createMissedCallNotification = jest.fn(async (_params: { readonly conversationId: string | null }) => undefined);
    const prisma = {
      callSession: {
        findUnique: jest.fn(async () => ({ status: 'missed', invitedUserIds: [PEER], participants: [] })),
      },
      participant: { findFirst: jest.fn(async () => null) },
      conversation: { findFirst: jest.fn(async (args: any) => conversations.findFirst(args)) },
    };
    const { createCallInvitationLifecycle } = await import('../../../../socketio/call-invite-lifecycle');
    const lifecycle = createCallInvitationLifecycle({
      prisma: prisma as never,
      pushService: () => ({ sendToUser: jest.fn(async () => undefined) }) as never,
      notificationService: () => ({ createMissedCallNotification }) as never,
      schedule: () => 'handle',
      cancel: () => undefined,
    });
    const io = { to: jest.fn(() => ({ emit: jest.fn() })) };
    lifecycle.arm(io as never, { callId: CALL, conversationId: 'other', inviterUserId: ME, inviteeUserId: PEER, callType: 'audio' });
    await lifecycle.callEnded(io as never, CALL);
    return createMissedCallNotification.mock.calls[0]?.[0]?.conversationId;
  };

  it('le tête-à-tête REMONTÉ par une réaction est nommé, pas celui au dernier message plus récent', async () => {
    const chosen = await missedDestination([
      shared(LIFTED, { lastMessageAt: EARLY, lastActivityAt: LATE }),
      shared(SPOKEN, { lastMessageAt: MIDDLE }),
    ]);
    expect(chosen).toBe(LIFTED);
  });

  it('sans activité, le plus récemment parlé est nommé — le comportement d’avant #19800', async () => {
    const chosen = await missedDestination([shared(LIFTED, { lastMessageAt: EARLY }), shared(SPOKEN, { lastMessageAt: MIDDLE })]);
    expect(chosen).toBe(SPOKEN);
  });

  it('sans aucun tête-à-tête, la notification ne nomme aucune conversation', async () => {
    expect(await missedDestination([])).toBeNull();
  });
});
