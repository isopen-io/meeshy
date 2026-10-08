import { buildGameBlock, type GameBlockFacts } from '@meeshy/shared/utils/game/game-block';
import { buildGameBlockExtras, type GameBlockExtrasFacts } from '@meeshy/shared/utils/game/game-block-extras';
import { flameTrophy, leagueCupTrophy, trophyKey } from '@meeshy/shared/utils/game/trophies';
import type { GameBlock, GameMission } from '@meeshy/shared/types/game';

/**
 * LE BLOC `game` DE DÉMONSTRATION (#9383) — bâti par la MÊME loi que la
 * passerelle (`buildGameBlock`, `packages/shared`), jamais écrit champ par
 * champ : une fixture qui contredirait la loi ferait mentir l'écran sans
 * qu'aucun témoin ne rougisse (leçon de `engagement-fixture.ts`, #5762).
 *
 * Servi quand `apiConfig.source` vaut `'fixtures'` et par les témoins, qui
 * surchargent les FAITS (`facts`) — le bloc se recalcule, il ne se retouche pas.
 */

const mission = (patch: Partial<GameMission> & Pick<GameMission, 'id' | 'difficulty' | 'templateKey'>): GameMission => ({
  signal: 'axis:content.text_message',
  prism: false,
  target: 5,
  progress: 0,
  reward: 36,
  glory: 0,
  completedAt: null,
  ...patch,
});

export const GAME_FIXTURE_TODAY = '2026-10-05';

/** Un lundi de la quatrième semaine de la saison 1 : la ligue, le duo et la saison sont ouverts. */
export const GAME_EXTRAS_TODAY = '2026-11-02';

/**
 * Les dix étapes des niveaux faites (#9706) — cinq Meeshes, dix missions, une Flamme de 30 jours, le rang
 * Passeur — pour un témoin qui monte au-delà de 29 sans parler des étapes.
 */
export const ALL_LEVEL_STEPS = { mintedLifetime: 5, missionsDone: 10, flameRecord: 30, glory: 35_000 } as const;

export const gameFactsFixture = (patch: Partial<GameBlockFacts> = {}): GameBlockFacts => ({
  userId: 'user-demo',
  today: GAME_FIXTURE_TODAY,
  // Niveau 11 sur la courbe 100 × N² (#9706), étapes du 10 et du 20 faites, record gravé.
  score: 12_440,
  levelRecord: 11,
  prestige: 0,
  glory: 620,
  mythic: false,
  mintedLifetime: 3,
  missionsDone: 1,
  flameRecord: 4,
  debitablePoints: 1244,
  balance: 4,
  streak: 6,
  lastActiveDay: GAME_FIXTURE_TODAY,
  broken: null,
  freezes: 1,
  lastRelightDay: null,
  missions: [
    mission({ id: 'm-easy', difficulty: 'easy', templateKey: 'send-texts', target: 5, progress: 5, completedAt: '2026-10-05T08:00:00.000Z' }),
    mission({ id: 'm-medium', difficulty: 'medium', templateKey: 'reply-conversations', signal: 'reply-distinct-conversations', target: 3, progress: 1, reward: 72 }),
    mission({ id: 'm-hard', difficulty: 'hard', templateKey: 'publish-posts', signal: 'axis:content.post', target: 2, progress: 0, reward: 144 }),
  ],
  rerollsUsedToday: 0,
  chestClaimed: false,
  chestReward: null,
  guideSeen: [],
  ...patch,
});

export const gameBlockFixture = (patch: Partial<GameBlockFacts> = {}): GameBlock => buildGameBlock(gameFactsFixture(patch));

/**
 * LES EXTENSIONS DE LA VAGUE 2 DE DÉMONSTRATION (#9481) — bâties par la loi
 * partagée (`buildGameBlockExtras`), comme le bloc : ligue ouverte (Jade, rang 4
 * sur 30, dans la zone de montée), duo actif, saison 1 à mi-parcours, trois
 * trophées, l'Atlas à quatre tampons, le Prestige à zéro étoile.
 *
 * Le jour est FIXE (`GAME_EXTRAS_TODAY`, un lundi de la saison 1) : une semaine de ligue qui
 * suivrait l'horloge ferait changer les captures et les témoins d'un lundi à l'autre.
 */
const leagueMembers = [
  ['user-demo', 410],
  ...Array.from({ length: 29 }, (_, i) => [`player-${i + 1}`, 520 - i * 17] as const),
] as const;

export const gameExtrasFactsFixture = (patch: Partial<GameBlockExtrasFacts> = {}): GameBlockExtrasFacts => ({
  userId: 'user-demo',
  today: GAME_EXTRAS_TODAY,
  minuteOfDay: 14 * 60,
  score: 12_440,
  levelRecord: 11,
  prestige: 0,
  flameDays: 6,
  balance: 4,
  adultVerified: true,
  league: {
    consented: true,
    pseudonym: 'Colibri-4821',
    group: {
      league: 'jade',
      groupId: 'group-jade-1',
      members: leagueMembers.map(([userId, weekPoints]) => ({ userId, weekPoints })),
    },
    friendIds: ['friend-1', 'friend-2'],
    friendsWeekPoints: { 'user-demo': 410, 'friend-1': 530, 'friend-2': 120 },
  },
  duo: {
    duoId: 'duo-1',
    status: 'active',
    role: 'inviter',
    partner: { userId: 'friend-1', displayName: 'Amina' },
    mission: { weekKey: GAME_EXTRAS_TODAY, templateKey: 'duo-messages', signal: 'axis:content.text_message', prism: false, partTarget: 40, commonTarget: 80, basePoints: 300 },
    mine: 22,
    partnerProgress: 31,
  },
  season: { stars: 56, claimedSteps: [1, 2, 3], sealOwned: false },
  trophies: [
    { key: trophyKey(leagueCupTrophy({ weekKey: '2026-10-26', league: 'jade', cup: 'silver' })), awardedAt: '2026-11-01T18:00:00.000Z' },
    { key: trophyKey(flameTrophy(100)), awardedAt: '2026-09-12T08:00:00.000Z' },
    { key: trophyKey(leagueCupTrophy({ weekKey: '2026-10-19', league: 'ambre', cup: 'gold' })), awardedAt: '2026-10-25T18:00:00.000Z' },
  ],
  showcaseOrder: [],
  atlas: {
    fr: { sent: true, received: true, stampedOn: '2026-08-02' },
    es: { sent: true, received: true, stampedOn: '2026-08-19' },
    ar: { sent: true, received: true, stampedOn: '2026-09-03' },
    sw: { sent: true, received: true, stampedOn: '2026-09-30' },
    ja: { sent: true, received: false, stampedOn: null },
  },
  visibility: { showcase: 'friends', rank: 'friends', treasury: 'friends', atlas: 'me' },
  ...patch,
});

/**
 * Le bloc `game` ET ses sept extensions, tel qu'un serveur de la vague 2 le sert.
 * Le score, le record, le Prestige, le solde et la série des extensions SUIVENT
 * ceux du bloc (`facts`) : deux lectures du même compte ne se contredisent pas.
 */
export const gameBlockWithExtrasFixture = (
  patch: Partial<GameBlockFacts> = {},
  extras: Partial<GameBlockExtrasFacts> = {},
): GameBlock => {
  const facts = gameFactsFixture(patch);
  return {
    ...buildGameBlock(facts),
    ...buildGameBlockExtras(
      gameExtrasFactsFixture({ score: facts.score, levelRecord: facts.levelRecord, prestige: facts.prestige, balance: facts.balance, flameDays: facts.streak, ...extras }),
    ),
  };
};
