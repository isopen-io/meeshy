import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isAdult } from '@meeshy/shared/utils/age';
import {
  ONBOARDING_MAX_SUGGESTIONS,
  ONBOARDING_START_AT,
  ONBOARDING_STEP_IDS,
  ONBOARDING_WINDOW_DAYS,
  addOnboardingStep,
  isOnboardingStepId,
  type OnboardingPatchBody,
  type OnboardingState,
  type OnboardingStepId,
  type OnboardingSuggestion,
} from '@meeshy/shared/types/onboarding';

/**
 * L'état d'onboarding post-inscription (#7729) — le SEUL site qui le calcule,
 * servi par `GET`/`PATCH /api/v1/me/onboarding` à web-v2 et iOS.
 *
 * Source : docs/marketing/campagne-2026-09/onboarding-parcours.md § 2, § 3, § 5.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const START_AT_MS = Date.parse(ONBOARDING_START_AT);
const GLOBAL_CONVERSATION_IDENTIFIER = 'meeshy';
/** Combien de messages récents de Global lire pour trouver des auteurs. */
const GLOBAL_SENDERS_SCAN = 300;

export type OnboardingWindow = 'open' | 'completed' | 'not-concerned' | 'expired';

export function onboardingWindow(params: {
  createdAt: Date;
  completedAt: Date | null;
  now: Date;
}): OnboardingWindow {
  const { createdAt, completedAt, now } = params;
  if (completedAt) return 'completed';
  if (createdAt.getTime() < START_AT_MS) return 'not-concerned';
  if (now.getTime() - createdAt.getTime() > ONBOARDING_WINDOW_DAYS * DAY_MS) return 'expired';
  return 'open';
}

export type SuggestionViewer = {
  readonly id: string;
  readonly languages: readonly string[];
  readonly adult: boolean;
  readonly blockedUserIds: readonly string[];
};

export type SuggestionCandidate = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
  readonly languages: readonly string[];
  readonly adult: boolean;
  readonly blockedUserIds: readonly string[];
  readonly active: boolean;
};

/**
 * Les profils à suggérer, dans l'ordre de récence des candidats. JAMAIS de
 * suggestion croisée : un viewer protégé (mineur ou âge inconnu) ne voit que
 * des profils protégés, un adulte vérifié que des adultes vérifiés. Aucune
 * présence ne voyage : la sortie n'a pas de champ pour elle.
 */
export function selectOnboardingSuggestions(params: {
  viewer: SuggestionViewer;
  candidates: readonly SuggestionCandidate[];
  excludedIds: ReadonlySet<string>;
}): OnboardingSuggestion[] {
  const { viewer, candidates, excludedIds } = params;
  const viewerLanguages = new Set(viewer.languages);
  const viewerBlocks = new Set(viewer.blockedUserIds);
  return candidates
    .filter(
      (candidate) =>
        candidate.id !== viewer.id &&
        candidate.active &&
        candidate.adult === viewer.adult &&
        !excludedIds.has(candidate.id) &&
        !viewerBlocks.has(candidate.id) &&
        !candidate.blockedUserIds.includes(viewer.id) &&
        candidate.languages.some((language) => viewerLanguages.has(language)),
    )
    .slice(0, ONBOARDING_MAX_SUGGESTIONS)
    .map((candidate) => ({
      id: candidate.id,
      username: candidate.username,
      displayName: candidate.displayName || candidate.username,
      avatarUrl: candidate.avatar ?? null,
      languages: [...candidate.languages],
    }));
}

const USER_STATE_SELECT = {
  id: true,
  createdAt: true,
  birthDate: true,
  systemLanguage: true,
  regionalLanguage: true,
  blockedUserIds: true,
  onboardingCompletedAt: true,
  onboardingSteps: true,
} as const;

const CANDIDATE_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  birthDate: true,
  systemLanguage: true,
  regionalLanguage: true,
  blockedUserIds: true,
  isActive: true,
  deletedAt: true,
} as const;

type UserStateRow = {
  id: string;
  createdAt: Date;
  birthDate: Date | null;
  systemLanguage: string;
  regionalLanguage: string | null;
  blockedUserIds: string[] | null;
  onboardingCompletedAt: Date | null;
  onboardingSteps: string[] | null;
};

type OnboardingPrisma = Pick<
  PrismaClient,
  'user' | 'conversation' | 'message' | 'participant' | 'friendRequest' | 'engagementCounter' | 'engagementConversationCredit'
>;

const languagesOf = (row: { systemLanguage: string; regionalLanguage: string | null }): string[] =>
  [...new Set([row.systemLanguage, row.regionalLanguage].filter((l): l is string => Boolean(l)))];

const knownSteps = (steps: readonly string[] | null): OnboardingStepId[] =>
  ONBOARDING_STEP_IDS.filter((id) => (steps ?? []).includes(id));

export class OnboardingService {
  constructor(private readonly prisma: OnboardingPrisma) {}

  async getState(userId: string, now: Date = new Date()): Promise<OnboardingState | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: USER_STATE_SELECT });
    if (!user) return null;
    return this.stateOf(user, now);
  }

  async recordStep(userId: string, body: OnboardingPatchBody, now: Date = new Date()): Promise<OnboardingState | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: USER_STATE_SELECT });
    if (!user) return null;
    const data = nextOnboardingWrite(user, body, now);
    if (!data) return this.stateOf(user, now);
    await this.prisma.user.update({ where: { id: userId }, data });
    return this.stateOf({ ...user, ...data }, now);
  }

  private async stateOf(user: UserStateRow, now: Date): Promise<OnboardingState> {
    const window = onboardingWindow({ createdAt: user.createdAt, completedAt: user.onboardingCompletedAt, now });
    const completedAt = window === 'expired' ? await this.closeExpired(user.id, now) : user.onboardingCompletedAt;
    const protectedRegime = !isAdult(user.birthDate, now);
    const globalConversationId = await this.globalConversationId();
    const [prefilledSteps, suggestions] = await Promise.all([
      this.prefilledSteps(user.id, globalConversationId),
      window === 'open' && globalConversationId
        ? this.suggestions({ user, adult: !protectedRegime, globalConversationId, now })
        : Promise.resolve([]),
    ]);
    return {
      eligible: window === 'open',
      completedAt: completedAt ? completedAt.toISOString() : null,
      seenSteps: knownSteps(user.onboardingSteps),
      prefilledSteps,
      globalConversationId,
      protectedRegime,
      storyDefaultVisibility: protectedRegime ? 'friends' : 'public',
      suggestions,
    };
  }

  private async closeExpired(userId: string, now: Date): Promise<Date> {
    await this.prisma.user.update({ where: { id: userId }, data: { onboardingCompletedAt: now } });
    return now;
  }

  private async globalConversationId(): Promise<string | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { identifier: GLOBAL_CONVERSATION_IDENTIFIER },
      select: { id: true },
    });
    return conversation?.id ?? null;
  }

  /**
   * Les étapes que l'engagement a déjà faites : une story publiée, un message
   * déjà crédité dans Global (quel qu'en soit l'axe — avant #7739 il tombait
   * sur `conversation.private`), une amitié acceptée.
   */
  private async prefilledSteps(userId: string, globalConversationId: string | null): Promise<OnboardingStepId[]> {
    const [storyCounter, globalCredit, friendship] = await Promise.all([
      this.prisma.engagementCounter.findUnique({
        where: { userId_axisKey: { userId, axisKey: 'content.story' } },
        select: { count: true },
      }),
      globalConversationId
        ? this.prisma.engagementConversationCredit.findFirst({
            where: { userId, conversationId: globalConversationId },
            select: { id: true },
          })
        : Promise.resolve(null),
      this.prisma.friendRequest.findFirst({
        where: { status: 'accepted', OR: [{ senderId: userId }, { receiverId: userId }] },
        select: { id: true },
      }),
    ]);
    const done = new Set<OnboardingStepId>([
      ...(globalCredit ? (['global'] as const) : []),
      ...((storyCounter?.count ?? 0) > 0 ? (['story'] as const) : []),
      ...(friendship ? (['friends'] as const) : []),
    ]);
    return ONBOARDING_STEP_IDS.filter((id) => done.has(id));
  }

  private async suggestions(params: {
    user: UserStateRow;
    adult: boolean;
    globalConversationId: string;
    now: Date;
  }): Promise<OnboardingSuggestion[]> {
    const { user, adult, globalConversationId, now } = params;
    const recent = await this.prisma.message.findMany({
      where: {
        conversationId: globalConversationId,
        messageSource: 'user',
        deletedAt: null,
        createdAt: { gte: new Date(now.getTime() - ONBOARDING_WINDOW_DAYS * DAY_MS) },
      },
      orderBy: { createdAt: 'desc' },
      take: GLOBAL_SENDERS_SCAN,
      select: { senderId: true },
    });
    const participantIds = [...new Set(recent.map((row) => row.senderId))];
    if (participantIds.length === 0) return [];

    const participants = await this.prisma.participant.findMany({
      where: { id: { in: participantIds } },
      select: { id: true, userId: true },
    });
    const userIdByParticipant = new Map(participants.map((p) => [p.id, p.userId]));
    const candidateIds = [
      ...new Set(
        participantIds
          .map((id) => userIdByParticipant.get(id))
          .filter((id): id is string => Boolean(id) && id !== user.id),
      ),
    ];
    if (candidateIds.length === 0) return [];

    const [rows, requests] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: candidateIds } }, select: CANDIDATE_SELECT }),
      this.prisma.friendRequest.findMany({
        where: {
          OR: [
            { senderId: user.id, receiverId: { in: candidateIds } },
            { receiverId: user.id, senderId: { in: candidateIds } },
          ],
        },
        select: { senderId: true, receiverId: true },
      }),
    ]);
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const candidates = candidateIds.flatMap((id) => {
      const row = rowById.get(id);
      if (!row) return [];
      return [
        {
          id: row.id,
          username: row.username,
          displayName: row.displayName,
          avatar: row.avatar,
          languages: languagesOf(row),
          adult: isAdult(row.birthDate, now),
          blockedUserIds: row.blockedUserIds ?? [],
          active: row.isActive && !row.deletedAt,
        },
      ];
    });
    const excludedIds = new Set(
      requests.map((request) => (request.senderId === user.id ? request.receiverId : request.senderId)),
    );
    return selectOnboardingSuggestions({
      viewer: { id: user.id, languages: languagesOf(user), adult, blockedUserIds: user.blockedUserIds ?? [] },
      candidates,
      excludedIds,
    });
  }
}

/**
 * Ce qu'un PATCH écrit — `null` quand il n'y a rien à écrire (idempotence).
 * `finish` ou la cinquième étape vue posent `onboardingCompletedAt`, jamais
 * deux fois.
 */
export function nextOnboardingWrite(
  user: Pick<UserStateRow, 'onboardingCompletedAt' | 'onboardingSteps'>,
  body: OnboardingPatchBody,
  now: Date,
): { onboardingSteps?: OnboardingStepId[]; onboardingCompletedAt?: Date } | null {
  if ('finish' in body) {
    return user.onboardingCompletedAt ? null : { onboardingCompletedAt: now };
  }
  const current = (user.onboardingSteps ?? []).filter(isOnboardingStepId);
  const steps = addOnboardingStep(current, body.step);
  const stepsChanged = steps.length !== current.length || (user.onboardingSteps ?? []).length !== current.length;
  const completes = steps.length === ONBOARDING_STEP_IDS.length && !user.onboardingCompletedAt;
  if (!stepsChanged && !completes) return null;
  return {
    ...(stepsChanged ? { onboardingSteps: steps } : {}),
    ...(completes ? { onboardingCompletedAt: now } : {}),
  };
}
