/**
 * `social.conversation_link_joined` (#8959) — une ARRIVÉE par un lien
 * d'invitation paie l'auteur du lien, une fois par personne : la cible est le
 * compte de l'arrivant, ou sa ligne de participant quand il entre en invité.
 * Rien pour un « déjà membre », rien quand l'auteur emprunte son propre lien.
 *
 * Le cœur `performLinkJoin` est exercé tel quel, pour les deux identités.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

import { performLinkJoin } from '../../../routes/conversations/link-admission';
import type { EngagementService } from '../../../services/engagement/EngagementService';
import { executeurImmediat } from '../../helpers/after-response';

type RecordActivity = EngagementService['recordActivity'];

const LINK_ID = 'mshy_link_abc123';
const CONV_ID = '507f1f77bcf86cd799439022';
const CREATOR_ID = '507f1f77bcf86cd799439033';
const USER_ID = '507f1f77bcf86cd799439044';

const shareLinkRow = () => ({
  id: '507f1f77bcf86cd799439011', linkId: LINK_ID, identifier: 'invitation',
  conversationId: CONV_ID, createdBy: CREATOR_ID, isActive: true, expiresAt: null, maxUses: null,
  currentUses: 0, maxConcurrentUsers: null, currentConcurrentUsers: 0,
  maxUniqueSessions: null, currentUniqueSessions: 0,
  requireAccount: false, requireNickname: false, requireEmail: false, requireBirthday: false,
  allowedCountries: [], allowedLanguages: [], allowedIpRanges: [],
  allowAnonymousMessages: true, allowAnonymousFiles: false, allowAnonymousImages: true,
  allowViewHistory: true,
  conversation: { id: CONV_ID, title: 'Équipe', type: 'group', isActive: true, closedAt: null },
});

function fakePrisma(activeMemberId: string | null) {
  return {
    conversationShareLink: {
      findFirst: jest.fn(async () => shareLinkRow()),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: { findUnique: jest.fn(async () => ({ displayName: 'Ana', username: 'ana' })) },
    participant: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => (activeMemberId ? { id: activeMemberId, avatar: null, permissions: {} } : null)),
      findMany: jest.fn(async () => (activeMemberId
        ? [{ id: activeMemberId, isActive: true, bannedAt: null, leftAt: null, userId: USER_ID }]
        : [])),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'participant-1', avatar: null, ...data })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'participant-1', avatar: null, ...data })),
    },
    message: { create: jest.fn(async () => ({ id: 'msg-1' })) },
    conversation: { update: jest.fn(async () => ({})) },
  };
}

async function join(params: { readonly asUserId?: string; readonly activeMemberId?: string }) {
  const executeur = executeurImmediat();
  const recordActivity = jest.fn<RecordActivity>(async () => undefined);
  const outcome = await performLinkJoin({
    prisma: fakePrisma(params.activeMemberId ?? null) as never,
    key: LINK_ID,
    authContext: params.asUserId
      ? ({ type: 'user', isAuthenticated: true, isAnonymous: false, userId: params.asUserId } as never)
      : undefined,
    requestIp: '203.0.113.7',
    profile: { firstName: 'Nova', lastName: '', requestedUsername: 'nova', language: 'fr' },
    afterResponse: executeur.afterResponse,
    lookupCountry: async () => null,
    engagement: { recordActivity },
  });
  await executeur.settle();
  return { outcome, recordActivity };
}

describe('arrivée par un lien d’invitation — crédit de l’auteur', () => {
  it('un compte qui arrive crédite l’auteur, avec l’arrivant pour cible et pour acteur', async () => {
    const { outcome, recordActivity } = await join({ asUserId: USER_ID });

    expect(outcome.kind).toBe('joined');
    expect(recordActivity).toHaveBeenCalledWith(CREATOR_ID, 'social.conversation_link_joined', {
      targetId: USER_ID,
      actorId: USER_ID,
    });
  });

  it('un invité qui arrive crédite l’auteur, avec sa ligne de participant pour cible', async () => {
    const { outcome, recordActivity } = await join({});

    expect(outcome.kind).toBe('joined');
    expect(recordActivity).toHaveBeenCalledWith(CREATOR_ID, 'social.conversation_link_joined', {
      targetId: 'participant-1',
    });
  });

  it('un déjà-membre ne crédite rien', async () => {
    const { outcome, recordActivity } = await join({ asUserId: USER_ID, activeMemberId: 'participant-9' });

    expect(outcome).toMatchObject({ kind: 'joined', outcome: 'already-member' });
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it('l’auteur qui emprunte son propre lien ne se crédite pas', async () => {
    const { recordActivity } = await join({ asUserId: CREATOR_ID });

    expect(recordActivity).not.toHaveBeenCalled();
  });
});
