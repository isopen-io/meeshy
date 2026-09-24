/**
 * L'état d'onboarding (#7729) — éligibilité, fenêtre de 7 jours, pré-cochage
 * depuis l'engagement, régime protégé, suggestions sans croisement
 * protégé/adulte et sans présence.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  OnboardingService,
  onboardingWindow,
  selectOnboardingSuggestions,
} from '../../../../services/onboarding/OnboardingService';
import { OnboardingStateSchema } from '@meeshy/shared/types/onboarding';

const NOW = new Date('2026-09-26T12:00:00.000Z');
const VIEWER = '68a000000000000000000001';
const GLOBAL_ID = '68a0000000000000000000aa';
const ADULT_BIRTH = new Date('1998-01-01T00:00:00.000Z');
const MINOR_BIRTH = new Date('2010-01-01T00:00:00.000Z');

type UserRow = {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  birthDate: Date | null;
  systemLanguage: string;
  regionalLanguage: string | null;
  blockedUserIds: string[];
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  onboardingCompletedAt: Date | null;
  onboardingSteps: string[];
};

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: VIEWER,
    username: 'nouvelle',
    displayName: 'Nouvelle',
    avatar: null,
    birthDate: ADULT_BIRTH,
    systemLanguage: 'fr',
    regionalLanguage: null,
    blockedUserIds: [],
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-09-25T09:00:00.000Z'),
    onboardingCompletedAt: null,
    onboardingSteps: [],
    ...overrides,
  };
}

function makeCandidate(n: number, overrides: Partial<UserRow> = {}): UserRow {
  const id = `68a0000000000000000001${String(n).padStart(2, '0')}`;
  return makeUser({ id, username: `nova${n}`, displayName: `Nova ${n}`, ...overrides });
}

type World = {
  viewer?: UserRow | null;
  candidates?: UserRow[];
  /** Expéditeurs de Global, du plus récent au plus ancien (userId). */
  globalSenders?: string[];
  friendRequests?: Array<{ senderId: string; receiverId: string; status: string }>;
  storyCount?: number;
  globalCredit?: boolean;
  globalConversation?: boolean;
};

function makePrisma(world: World = {}) {
  const viewer = world.viewer === undefined ? makeUser() : world.viewer;
  const candidates = world.candidates ?? [];
  const senders = world.globalSenders ?? [];
  const friendRequests = world.friendRequests ?? [];
  const users = [...(viewer ? [viewer] : []), ...candidates];
  return {
    user: {
      findUnique: jest.fn<any>(async (args: any) => users.find((u) => u.id === args.where.id) ?? null),
      findMany: jest.fn<any>(async (args: any) => users.filter((u) => args.where.id.in.includes(u.id))),
      update: jest.fn<any>(async (args: any) => ({ ...viewer, ...args.data })),
    },
    conversation: {
      findUnique: jest.fn<any>(async () => (world.globalConversation === false ? null : { id: GLOBAL_ID })),
    },
    message: {
      findMany: jest.fn<any>(async () => senders.map((userId) => ({ senderId: `p-${userId}` }))),
    },
    participant: {
      findMany: jest.fn<any>(async (args: any) =>
        (args.where.id.in as string[]).map((id) => ({ id, userId: id.slice(2) })),
      ),
    },
    friendRequest: {
      findFirst: jest.fn<any>(async (args: any) =>
        friendRequests.find(
          (fr) => fr.status === args.where.status && (fr.senderId === VIEWER || fr.receiverId === VIEWER),
        ) ?? null,
      ),
      findMany: jest.fn<any>(async () => friendRequests),
    },
    engagementCounter: {
      findUnique: jest.fn<any>(async () => (world.storyCount ? { count: world.storyCount } : null)),
    },
    engagementConversationCredit: {
      findFirst: jest.fn<any>(async () => (world.globalCredit ? { id: 'c1' } : null)),
    },
  } as any;
}

describe('onboardingWindow — éligibilité et fenêtre de 7 jours', () => {
  it('ouvre le parcours pour un compte créé depuis le lancement, non fini, de moins de 7 jours', () => {
    expect(onboardingWindow({ createdAt: new Date('2026-09-24T00:00:00.000Z'), completedAt: null, now: NOW })).toBe('open');
  });

  it('ne concerne pas un compte créé avant le 2026-09-24', () => {
    expect(onboardingWindow({ createdAt: new Date('2026-09-23T23:59:59.000Z'), completedAt: null, now: NOW })).toBe(
      'not-concerned',
    );
  });

  it('un parcours fini reste fini', () => {
    expect(onboardingWindow({ createdAt: NOW, completedAt: NOW, now: NOW })).toBe('completed');
  });

  it('au-delà de 7 jours sans finir, le parcours expire', () => {
    const createdAt = new Date('2026-09-24T10:00:00.000Z');
    expect(onboardingWindow({ createdAt, completedAt: null, now: new Date('2026-10-01T10:00:00.000Z') })).toBe('open');
    expect(onboardingWindow({ createdAt, completedAt: null, now: new Date('2026-10-01T10:00:01.000Z') })).toBe(
      'expired',
    );
  });
});

describe('OnboardingService.getState', () => {
  it('sert un état conforme au contrat partagé', async () => {
    const state = await new OnboardingService(makePrisma()).getState(VIEWER, NOW);
    expect(OnboardingStateSchema.safeParse(state).success).toBe(true);
    expect(state).toMatchObject({
      eligible: true,
      completedAt: null,
      seenSteps: [],
      globalConversationId: GLOBAL_ID,
    });
  });

  it('rend null pour un compte inconnu', async () => {
    expect(await new OnboardingService(makePrisma({ viewer: null })).getState(VIEWER, NOW)).toBeNull();
  });

  it('pose completedAt paresseusement au-delà de 7 jours et rend eligible=false', async () => {
    const prisma = makePrisma({ viewer: makeUser({ createdAt: new Date('2026-09-24T01:00:00.000Z') }) });
    const later = new Date('2026-10-02T00:00:00.000Z');

    const state = await new OnboardingService(prisma).getState(VIEWER, later);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: VIEWER },
      data: { onboardingCompletedAt: later },
    });
    expect(state?.eligible).toBe(false);
    expect(state?.completedAt).toBe(later.toISOString());
  });

  it('n\'écrit rien pour un compte antérieur au lancement', async () => {
    const prisma = makePrisma({ viewer: makeUser({ createdAt: new Date('2026-01-01T00:00:00.000Z') }) });

    const state = await new OnboardingService(prisma).getState(VIEWER, NOW);

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(state?.eligible).toBe(false);
    expect(state?.completedAt).toBeNull();
  });

  it('ne sert que les étapes connues, dans l\'ordre du parcours', async () => {
    const prisma = makePrisma({ viewer: makeUser({ onboardingSteps: ['story', 'legacy', 'languages'] }) });
    const state = await new OnboardingService(prisma).getState(VIEWER, NOW);
    expect(state?.seenSteps).toEqual(['languages', 'story']);
  });

  it('pré-coche story, global et friends depuis l\'engagement déjà produit', async () => {
    const prisma = makePrisma({
      storyCount: 1,
      globalCredit: true,
      friendRequests: [{ senderId: 'x', receiverId: VIEWER, status: 'accepted' }],
    });
    const state = await new OnboardingService(prisma).getState(VIEWER, NOW);
    expect(state?.prefilledSteps).toEqual(['global', 'story', 'friends']);
    expect(prisma.engagementCounter.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_axisKey: { userId: VIEWER, axisKey: 'content.story' } } }),
    );
    expect(prisma.engagementConversationCredit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: VIEWER, conversationId: GLOBAL_ID } }),
    );
  });

  it('ne pré-coche rien sans engagement, ni friends sur une demande seulement en attente', async () => {
    const prisma = makePrisma({ friendRequests: [{ senderId: VIEWER, receiverId: 'x', status: 'pending' }] });
    const state = await new OnboardingService(prisma).getState(VIEWER, NOW);
    expect(state?.prefilledSteps).toEqual([]);
  });

  it('sans Meeshy Global, globalConversationId est null et l\'étape n\'est pas pré-cochée', async () => {
    const state = await new OnboardingService(makePrisma({ globalConversation: false, globalCredit: true })).getState(
      VIEWER,
      NOW,
    );
    expect(state?.globalConversationId).toBeNull();
    expect(state?.prefilledSteps).not.toContain('global');
    expect(state?.suggestions).toEqual([]);
  });

  describe('régime protégé (fail-closed)', () => {
    it('un adulte vérifié : régime ouvert, story publique par défaut', async () => {
      const state = await new OnboardingService(makePrisma()).getState(VIEWER, NOW);
      expect(state?.protectedRegime).toBe(false);
      expect(state?.storyDefaultVisibility).toBe('public');
    });

    it('un mineur : régime protégé, story aux amis par défaut', async () => {
      const state = await new OnboardingService(makePrisma({ viewer: makeUser({ birthDate: MINOR_BIRTH }) })).getState(
        VIEWER,
        NOW,
      );
      expect(state?.protectedRegime).toBe(true);
      expect(state?.storyDefaultVisibility).toBe('friends');
    });

    it('une date de naissance inconnue : régime protégé', async () => {
      const state = await new OnboardingService(makePrisma({ viewer: makeUser({ birthDate: null }) })).getState(
        VIEWER,
        NOW,
      );
      expect(state?.protectedRegime).toBe(true);
      expect(state?.storyDefaultVisibility).toBe('friends');
    });
  });

  describe('suggestions', () => {
    it('sert les auteurs récents de Global partageant une langue, au plus 6, sans présence ni date de naissance', async () => {
      const candidates = Array.from({ length: 8 }, (_, i) => makeCandidate(i, { avatar: i === 0 ? 'https://a/0.png' : null }));
      const prisma = makePrisma({ candidates, globalSenders: candidates.map((c) => c.id) });

      const state = await new OnboardingService(prisma).getState(VIEWER, NOW);

      expect(state?.suggestions).toHaveLength(6);
      expect(state?.suggestions[0]).toEqual({
        id: candidates[0].id,
        username: 'nova0',
        displayName: 'Nova 0',
        avatarUrl: 'https://a/0.png',
        languages: ['fr'],
      });
      const findArgs = prisma.message.findMany.mock.calls[0][0];
      expect(findArgs.where.conversationId).toBe(GLOBAL_ID);
      expect(NOW.getTime() - (findArgs.where.createdAt.gte as Date).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
      const selected = prisma.user.findMany.mock.calls[0][0].select;
      expect(selected.isOnline).toBeUndefined();
      expect(selected.lastActiveAt).toBeUndefined();
    });

    it('n\'est calculé que pour un parcours ouvert', async () => {
      const prisma = makePrisma({
        viewer: makeUser({ onboardingCompletedAt: NOW }),
        candidates: [makeCandidate(1)],
        globalSenders: [makeCandidate(1).id],
      });
      const state = await new OnboardingService(prisma).getState(VIEWER, NOW);
      expect(state?.suggestions).toEqual([]);
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });
  });
});

describe('selectOnboardingSuggestions — la loi pure', () => {
  const viewer = { id: VIEWER, languages: ['fr', 'es'], adult: true, blockedUserIds: [] as string[] };
  const candidate = (n: number, overrides: Record<string, unknown> = {}) => ({
    id: `c${n}`,
    username: `u${n}`,
    displayName: null as string | null,
    avatar: null as string | null,
    languages: ['fr'],
    adult: true,
    blockedUserIds: [] as string[],
    active: true,
    ...overrides,
  });

  it('jamais de suggestion croisée : un adulte ne voit que des adultes, un protégé que des protégés', () => {
    const pool = [candidate(1, { adult: true }), candidate(2, { adult: false })];
    expect(selectOnboardingSuggestions({ viewer, candidates: pool, excludedIds: new Set() }).map((s) => s.id)).toEqual([
      'c1',
    ]);
    expect(
      selectOnboardingSuggestions({ viewer: { ...viewer, adult: false }, candidates: pool, excludedIds: new Set() }).map(
        (s) => s.id,
      ),
    ).toEqual(['c2']);
  });

  it('écarte soi, les exclus, les comptes inactifs, les blocages dans les deux sens et les langues sans partage', () => {
    const pool = [
      candidate(0, { id: VIEWER }),
      candidate(1),
      candidate(2, { active: false }),
      candidate(3, { blockedUserIds: [VIEWER] }),
      candidate(4),
      candidate(5, { languages: ['de'] }),
      candidate(6, { languages: ['es', 'de'] }),
    ];
    const result = selectOnboardingSuggestions({
      viewer: { ...viewer, blockedUserIds: ['c4'] },
      candidates: pool,
      excludedIds: new Set(['c1']),
    });
    expect(result.map((s) => s.id)).toEqual(['c6']);
  });

  it('retombe sur le pseudo quand le nom affiché est absent, et garde l\'ordre de récence', () => {
    const result = selectOnboardingSuggestions({
      viewer,
      candidates: [candidate(2), candidate(1, { displayName: 'Un' })],
      excludedIds: new Set(),
    });
    expect(result).toEqual([
      { id: 'c2', username: 'u2', displayName: 'u2', avatarUrl: null, languages: ['fr'] },
      { id: 'c1', username: 'u1', displayName: 'Un', avatarUrl: null, languages: ['fr'] },
    ]);
  });
});

describe('OnboardingService.recordStep', () => {
  it('ajoute l\'étape vue, sans doublon, et rend le nouvel état', async () => {
    const prisma = makePrisma({ viewer: makeUser({ onboardingSteps: ['languages'] }) });

    await new OnboardingService(prisma).recordStep(VIEWER, { step: 'global', outcome: 'done' }, NOW);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: VIEWER },
      data: { onboardingSteps: ['languages', 'global'] },
    });
  });

  it('est idempotent : une étape déjà vue n\'écrit rien', async () => {
    const prisma = makePrisma({ viewer: makeUser({ onboardingSteps: ['languages', 'global'] }) });

    await new OnboardingService(prisma).recordStep(VIEWER, { step: 'global', outcome: 'skipped' }, NOW);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('la cinquième étape vue pose completedAt', async () => {
    const prisma = makePrisma({ viewer: makeUser({ onboardingSteps: ['languages', 'global', 'story', 'friends'] }) });

    await new OnboardingService(prisma).recordStep(VIEWER, { step: 'notifications', outcome: 'skipped' }, NOW);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: VIEWER },
      data: {
        onboardingSteps: ['languages', 'global', 'story', 'friends', 'notifications'],
        onboardingCompletedAt: NOW,
      },
    });
  });

  it('finish pose completedAt une seule fois', async () => {
    const prisma = makePrisma();
    await new OnboardingService(prisma).recordStep(VIEWER, { finish: true }, NOW);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: VIEWER }, data: { onboardingCompletedAt: NOW } });

    const done = makePrisma({ viewer: makeUser({ onboardingCompletedAt: new Date('2026-09-25T10:00:00.000Z') }) });
    const state = await new OnboardingService(done).recordStep(VIEWER, { finish: true }, NOW);
    expect(done.user.update).not.toHaveBeenCalled();
    expect(state?.completedAt).toBe('2026-09-25T10:00:00.000Z');
    expect(state?.eligible).toBe(false);
  });

  it('rend null pour un compte inconnu', async () => {
    expect(
      await new OnboardingService(makePrisma({ viewer: null })).recordStep(VIEWER, { finish: true }, NOW),
    ).toBeNull();
  });
});
