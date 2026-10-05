import { buildGameBlock, type GameBlockFacts } from '@meeshy/shared/utils/game/game-block';
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

export const gameFactsFixture = (patch: Partial<GameBlockFacts> = {}): GameBlockFacts => ({
  userId: 'user-demo',
  today: GAME_FIXTURE_TODAY,
  score: 1244,
  levelRecord: null,
  prestige: 0,
  glory: 620,
  mythic: false,
  mintedLifetime: 3,
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
