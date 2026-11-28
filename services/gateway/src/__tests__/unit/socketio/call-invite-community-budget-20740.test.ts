/**
 * #20740 — faire sonner quelqu'un dans un appel du salon d'une communauté
 * PRIVÉE l'y fait entrer, sans son accord : c'est un ajout au sens de #19812.
 * L'invitation passait `communityBudget: null` (ses seaux vivaient sur le
 * serveur Fastify, que le transport socket ne tient pas) : un modérateur du
 * salon y faisait entrer n'importe qui, sans débit, avec sonnerie.
 *
 * Témoins : le serveur posé au montage de Socket.IO paie les MÊMES seaux que
 * les routes (passer de l'appel à la route ne rouvre aucun quota) ; un débit
 * accepté se rend ; l'invitation reçoit ce budget par défaut.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';

const mockAdmit = jest.fn<any>();
jest.mock('../../../services/conversations/memberAdmission', () => ({
  ...jest.requireActual<object>('../../../services/conversations/memberAdmission'),
  admitConversationMember: (...args: unknown[]) => mockAdmit(...args),
}));
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import Fastify from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  givenBackOnFailure,
  hostedCommunityAdmissionBudget,
  setCommunityAdmissionBudgetHost,
  spendCommunitySalonAdmissionUndoable,
} from '../../../services/conversations/communitySalonAdmissionBudget';
import type { CommunityAdmission } from '../../../services/conversations/communityMembershipSync';
import { COMMUNITY_ADDITION_BUDGET, spendCommunityAdditionByActor } from '../../../utils/community-addition-budget';
import { callInviteDependencies } from '../../../socketio/call-invite-events';
import type { CallInvitationLifecycle } from '../../../socketio/call-invite-lifecycle';

const ACTEUR = '507f1f77bcf86cd7994390a1';
const CIBLE = '507f1f77bcf86cd7994390b1';
const CONV = '507f1f77bcf86cd799439011';
const COMMUNITY = '507f1f77bcf86cd799439044';

const entre = (userId: string): CommunityAdmission => ({ kind: 'admitted', reactivations: [], creations: [{ userId, via: 'invited' } as never] });

afterEach(() => {
  setCommunityAdmissionBudgetHost(null);
  mockAdmit.mockReset();
});

describe('#20740 — le budget des ajouts, atteint hors d’une route', () => {
  it('sans serveur posé, aucun budget (un transport monté sans Fastify)', () => {
    expect(hostedCommunityAdmissionBudget()).toBeNull();
  });

  it('le serveur posé au montage paie les MÊMES seaux que les routes : l’appel ne rouvre aucun quota', async () => {
    const app = Fastify({ logger: false });
    setCommunityAdmissionBudgetHost(app);
    const budget = hostedCommunityAdmissionBudget();
    for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.actorPerHour; i += 1) {
      const spend = await budget!(ACTEUR, entre(`a1${i.toString(16).padStart(22, '0')}`));
      expect(spend.verdict.allowed).toBe(true);
    }
    expect((await spendCommunityAdditionByActor(app, ACTEUR)).allowed).toBe(false);
    await app.close();
  });

  it('un débit accepté se rend : la paire et l’acteur retrouvent ce qu’ils avaient payé', async () => {
    const app = Fastify({ logger: false });
    for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.actorPerHour + COMMUNITY_ADDITION_BUDGET.pairPerDay; i += 1) {
      const spend = await spendCommunitySalonAdmissionUndoable(app, ACTEUR, entre(CIBLE));
      expect(spend.verdict.allowed).toBe(true);
      await spend.rendre();
    }
    await app.close();
  });

  it('un débit ne se rend qu’UNE fois : un second rendu ne prend pas sur les gestes des autres', async () => {
    const app = Fastify({ logger: false });
    const autre = '507f1f77bcf86cd7994390a2';
    const spend = await spendCommunitySalonAdmissionUndoable(app, autre, entre(CIBLE));
    for (let i = 1; i < COMMUNITY_ADDITION_BUDGET.pairPerDay; i += 1) {
      expect((await spendCommunitySalonAdmissionUndoable(app, autre, entre(CIBLE))).verdict.allowed).toBe(true);
    }
    await spend.rendre();
    await spend.rendre();
    expect((await spendCommunitySalonAdmissionUndoable(app, autre, entre(CIBLE))).verdict.allowed).toBe(true);
    expect((await spendCommunitySalonAdmissionUndoable(app, autre, entre(CIBLE))).verdict.allowed).toBe(false);
    await app.close();
  });

  it('le montage de Socket.IO pose le serveur dont l’appel paie les seaux', () => {
    const source = readFileSync(join(__dirname, '../../../socketio/MeeshySocketIOHandler.ts'), 'utf8');
    expect(source).toMatch(/setCommunityAdmissionBudgetHost\(fastify\)/);
  });

  it('une tentative vers un compte non ajoutable ne se rend pas : elle reste comptée', async () => {
    const app = Fastify({ logger: false });
    for (let i = 0; i < COMMUNITY_ADDITION_BUDGET.actorPerHour; i += 1) {
      const spend = await spendCommunitySalonAdmissionUndoable(app, ACTEUR, { kind: 'refused', reason: 'not-addable', attempted: 1 });
      await spend.rendre();
    }
    expect((await spendCommunityAdditionByActor(app, ACTEUR)).allowed).toBe(false);
    await app.close();
  });

  it('une écriture qui lève rend son débit et laisse remonter SON erreur', async () => {
    const rendre = jest.fn(async () => { throw new Error('redis tombé'); });
    const echec = new Error('base indisponible');
    await expect(givenBackOnFailure({ verdict: { allowed: true, retryAfter: 0 }, rendre }, Promise.reject(echec))).rejects.toBe(echec);
    expect(rendre).toHaveBeenCalledTimes(1);
    const intact = jest.fn(async () => undefined);
    await expect(givenBackOnFailure({ verdict: { allowed: true, retryAfter: 0 }, rendre: intact }, Promise.resolve('écrit'))).resolves.toBe('écrit');
    expect(intact).not.toHaveBeenCalled();
  });
});

describe('#20740 — l’invitation dans un appel paie le budget', () => {
  const deps = (input: { communityBudget?: () => null } = {}) => {
    const prisma = {
      conversation: { findUnique: jest.fn<any>().mockResolvedValue({ isActive: true, closedAt: null, type: 'group', encryptionMode: 'server', communityId: COMMUNITY }) },
      participant: {
        findFirst: jest.fn<any>(async (a: any) => (a.where.userId === ACTEUR ? { id: 'p-inviter', displayName: 'Hôte', role: 'admin' } : null)),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
    } as unknown as PrismaClient;
    return callInviteDependencies({
      io: {} as never,
      prisma,
      callService: { getCallSession: jest.fn<any>(), generateIceServers: jest.fn<any>(), activeCallClaim: {} as never, createLiveCallMessage: jest.fn<any>() },
      rateLimiter: { checkLimit: jest.fn<any>() },
      pushService: () => null,
      invitations: { arm: jest.fn() } as unknown as CallInvitationLifecycle,
      ...input,
    });
  };
  const community = { communityId: COMMUNITY, isPrivate: true } as never;

  it('fait entrer par la porte d’admission AVEC le budget du serveur posé, et rend son verdict `throttled`', async () => {
    const app = Fastify({ logger: false });
    setCommunityAdmissionBudgetHost(app);
    mockAdmit.mockResolvedValue({ userId: CIBLE, outcome: 'throttled', retryAfter: 60 });
    const outcome = await deps().admit({ conversationId: CONV, inviterUserId: ACTEUR, inviteeUserId: CIBLE, community });
    expect(outcome).toBe('throttled');
    const [ports] = mockAdmit.mock.calls[0] as [{ communityBudget: unknown }];
    expect(typeof ports.communityBudget).toBe('function');
    const spend = await (ports.communityBudget as (a: string, b: CommunityAdmission) => Promise<{ verdict: { allowed: boolean } }>)(ACTEUR, entre(CIBLE));
    expect(spend.verdict.allowed).toBe(true);
    await app.close();
  });

  it('un budget injecté l’emporte sur celui du serveur posé', async () => {
    setCommunityAdmissionBudgetHost(Fastify({ logger: false }));
    mockAdmit.mockResolvedValue({ userId: CIBLE, outcome: 'new' });
    await deps({ communityBudget: () => null }).admit({ conversationId: CONV, inviterUserId: ACTEUR, inviteeUserId: CIBLE, community });
    const [ports] = mockAdmit.mock.calls[0] as [{ communityBudget: unknown }];
    expect(ports.communityBudget).toBeNull();
  });
});
