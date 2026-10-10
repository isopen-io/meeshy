import type { EngagementProgressPayload } from '@meeshy/shared/types/engagement';
import { ENGAGEMENT_AXES } from '@meeshy/shared/types/engagement';
import { flameTrophy, leagueCupTrophy, trophyKey } from '@meeshy/shared/utils/game/trophies';
import type { GameBlock } from '@meeshy/shared/types/game';

import { ENGAGEMENT_PROGRESS_FIXTURE } from './engagement-fixture';
import { GAME_EXTRAS_TODAY, GAME_FIXTURE_TODAY, gameBlockWithExtrasFixture } from './game-fixture';

/**
 * LE JEU AUX VALEURS LONGUES (#9563) — la démonstration ordinaire est
 * CONFORTABLE : niveau 11, 1 244 points, « Jade · rang 8 ». Un écran qui tient
 * sur elle peut déborder sur un vrai compte : niveau 97 et record 100, des
 * millions de points par semaine, « Ambassadeur III », 999 jours de Flamme, des
 * missions aux titres les plus longs, un pseudonyme de vingt caractères.
 *
 * Bâti par la MÊME loi que la passerelle (`buildGameBlock`), comme la fixture
 * ordinaire : seuls les FAITS changent. Servi quand un gate pose le drapeau
 * `meeshy.fixtures.gameLong` (même mécanique que `meeshy.fixtures.callPeer`) :
 * c'est ce qui laisse `check-phone-frame.mjs` mesurer les pages de Progression
 * avec ce qu'elles ont de plus large.
 */
export const GAME_LONG_FLAG = 'meeshy.fixtures.gameLong';

export function gameLongArmed(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(GAME_LONG_FLAG) === '1';
  } catch {
    return false;
  }
}

const LONG_SCORE = 941_000;

const longMission = (id: string, difficulty: 'easy' | 'medium' | 'hard' | 'gold', templateKey: string, target: number, progress: number, prism: boolean) => ({
  id,
  templateKey,
  difficulty,
  signal: 'axis:content.text_message',
  prism,
  target,
  progress,
  reward: 12_345,
  glory: 1_250,
  completedAt: null,
});

const leagueMembers = [
  { userId: 'user-demo', weekPoints: 1_234_567 },
  ...Array.from({ length: 29 }, (_, i) => ({ userId: `player-${i + 1}`, weekPoints: 9_876_543 - i * 123_457 })),
];

const AWARDED = '2026-11-01T18:00:00.000Z';

export const gameBlockLongFixture = (): GameBlock =>
  gameBlockWithExtrasFixture(
    {
      today: GAME_FIXTURE_TODAY,
      score: LONG_SCORE,
      levelRecord: 100,
      prestige: 4,
      glory: 20_500,
      mintedLifetime: 1_234,
      // Les étapes faites jusqu'à 99 (#9706) : dix missions, la Flamme de 999 jours ; le rang Conteur retient sous 100.
      missionsDone: 10,
      flameRecord: 999,
      debitablePoints: 3_000,
      balance: 1_234,
      streak: 999,
      freezes: 2,
      missions: [
        longMission('m-long-easy', 'easy', 'prism-foreign-messages', 25, 24, true),
        longMission('m-long-medium', 'medium', 'gold-replies-received', 12, 3, false),
        longMission('m-long-hard', 'hard', 'reply-conversations-wide', 15, 0, false),
      ],
      personalMission: {
        record: longMission('m-long-personal', 'gold', 'prism-foreign-exchange', 30, 7, true),
        startsAt: `${GAME_FIXTURE_TODAY}T08:00:00.000Z`,
        endsAt: `${GAME_FIXTURE_TODAY}T20:00:00.000Z`,
        now: `${GAME_FIXTURE_TODAY}T09:00:00.000Z`,
      },
    },
    {
      today: GAME_EXTRAS_TODAY,
      league: {
        consented: true,
        pseudonym: 'Colibri.Majestueux_9',
        group: { league: 'amethyste', groupId: 'group-amethyste-1', members: leagueMembers },
        friendIds: Array.from({ length: 40 }, (_, i) => `friend-${i + 1}`),
        friendsWeekPoints: Object.fromEntries([['user-demo', 1_234_567], ...Array.from({ length: 40 }, (_, i) => [`friend-${i + 1}`, 2_000_000 - i * 10_000] as const)]),
      },
      season: { stars: 98_765, claimedSteps: Array.from({ length: 30 }, (_, i) => i + 1), sealOwned: true },
      trophies: [
        { key: trophyKey(leagueCupTrophy({ weekKey: '2026-10-26', league: 'amethyste', cup: 'gold' })), awardedAt: AWARDED },
        { key: trophyKey(leagueCupTrophy({ weekKey: '2026-10-19', league: 'amethyste', cup: 'silver' })), awardedAt: AWARDED },
        { key: trophyKey(leagueCupTrophy({ weekKey: '2026-10-12', league: 'diamant', cup: 'bronze' })), awardedAt: AWARDED },
        { key: trophyKey(flameTrophy(365)), awardedAt: AWARDED },
        { key: trophyKey(flameTrophy(100)), awardedAt: AWARDED },
      ],
      visibility: { showcase: 'everyone', rank: 'everyone', treasury: 'everyone', atlas: 'everyone' },
    },
  );

/** La progression d'avant le jeu, avec des compteurs à sept chiffres, les cinq familles en élan et un solde à quatre chiffres. */
export const ENGAGEMENT_LONG_FIXTURE: EngagementProgressPayload = {
  ...ENGAGEMENT_PROGRESS_FIXTURE,
  counters: ENGAGEMENT_AXES.map((axisKey) => ({ axisKey, count: 1_234_567 })),
  streak: { currentStreakDays: 999, longestStreakDays: 1_234 },
  level: { engagementScore: LONG_SCORE },
  elan: { factor: 3, activeFamilyCount: 5, hasStanding: true, windowDays: 7, activeFamilies: ['content', 'comment', 'conversation', 'tool', 'social'] },
  meesh: { ...ENGAGEMENT_PROGRESS_FIXTURE.meesh, balance: 1_234, mintedLifetime: 1_234, debitablePoints: 3_000, floorPoints: 91_100, missingPoints: 1_884, mintCost: 4_884 },
};
