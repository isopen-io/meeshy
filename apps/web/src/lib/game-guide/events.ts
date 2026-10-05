import type { GameBlock } from '@meeshy/shared/types/game';
import { GLORY_RANKS } from '@meeshy/shared/utils/game/glory';
import type { GuideEvent } from '@meeshy/shared/utils/game/guide';
import { LEVEL_TIER_KEYS } from '@meeshy/shared/utils/game/levels';
import { TREASURY_TIERS } from '@meeshy/shared/utils/game/treasury';

import type { EngagementWithGame } from '@/lib/api/engagement';

/**
 * LES ÉVÉNEMENTS DU GUIDE (#9379) — la loi partagée (`chooseGuideMoment`)
 * choisit LE moment parmi des événements ; ce fichier les relève dans l'état du
 * jeu, comme `detectMascotEvent` le fait pour l'ancienne mascotte.
 *
 * Deux sources, qui ne se confondent pas :
 *
 *  - `standingGuideEvents` lit l'ÉTAT à l'ouverture de l'écran. Une découverte
 *    (« tu es au palier Lueur ») ne se dit qu'UNE fois : tant que sa clé n'est
 *    pas vue. Trois états sont des URGENCES et se redisent à chaque ouverture
 *    — la Flamme en danger, la Flamme éteinte, le retour après une absence.
 *  - `transitionGuideEvents` compare deux lectures pendant que l'écran est
 *    ouvert : ce qui vient d'ARRIVER (un palier franchi, une frappe) se dit
 *    chaque fois, version complète la première fois, courte ensuite (c'est la
 *    loi qui en décide, par les clés vues).
 *
 * Ce que le bloc `game` ne sert pas n'est jamais inventé : une Flamme éteinte
 * ne dit pas combien de jours elle valait (`lostDays: 0`, que la copie sait
 * taire), et un badge éteint n'est annoncé que si le calcul AVANT la frappe
 * existait.
 */

const RANK_KEYS: readonly string[] = [...GLORY_RANKS.map((rank) => rank.key), 'mythe'];
const ABSENCE_DAYS = 7;

const tierIndex = (game: GameBlock): number => LEVEL_TIER_KEYS.indexOf(game.level.tier);
const treasuryIndex = (game: GameBlock): number => TREASURY_TIERS.findIndex((tier) => tier.key === game.treasury.tier);

/** Un ordre total des (rang, division) : une division gagnée est une marche, un rang aussi. */
const standing = (game: GameBlock): number =>
  RANK_KEYS.indexOf(game.glory.rank) * 4 + (game.glory.division === null ? 3 : 3 - game.glory.division);

const nextTierLevel = (game: GameBlock): number | null => {
  const next = tierIndex(game) + 1;
  return next >= LEVEL_TIER_KEYS.length ? null : next * 10;
};

const rankEvent = (game: GameBlock): GuideEvent => ({
  kind: 'new-rank',
  rank: game.glory.rank,
  division: game.glory.division,
  glory: game.glory.glory,
  gloryMissing: game.glory.gloryMissing,
});

const flameOutEvent = (game: GameBlock): GuideEvent => ({
  kind: 'flame-out',
  lostDays: 0,
  relightPrice: game.flame.relightPrice,
  canRelight: game.flame.canRelight,
});

const unseen = (seen: ReadonlySet<string>, event: GuideEvent): boolean => !seen.has(event.kind);

export function standingGuideEvents(
  game: GameBlock,
  seen: ReadonlySet<string>,
  options: { readonly daysAway?: number | null } = {},
): GuideEvent[] {
  const discoveries: GuideEvent[] = [
    ...(game.level.level >= 2 ? [{ kind: 'first-level', level: game.level.level, pointsToNext: game.level.pointsToNext } as const] : []),
    ...(tierIndex(game) >= 1 ? [{ kind: 'new-tier', tier: game.level.tier, nextTierLevel: nextTierLevel(game) } as const] : []),
    ...(game.missions.unlocked ? [{ kind: 'missions-unlocked' } as const] : []),
    ...(game.mint.canMint && game.mint.number === 1
      ? [{ kind: 'first-mint-possible', price: game.mint.price, levelsLost: game.mint.levelsLost, gloryGain: game.mint.gloryGained } as const]
      : []),
    ...(game.glory.rank !== 'murmure' ? [rankEvent(game)] : []),
    ...(game.treasury.tier !== null ? [{ kind: 'treasury-tier', tier: game.treasury.tier, nextTierMissing: game.treasury.next?.missing ?? null } as const] : []),
    ...(game.level.level === 100 ? [{ kind: 'level-100', canPrestige: game.level.canPrestige } as const] : []),
  ];

  const urgencies: GuideEvent[] = [
    ...(game.flame.status === 'at-risk' ? [{ kind: 'flame-at-risk', days: game.flame.days } as const] : []),
    ...(game.flame.status === 'out' ? [flameOutEvent(game)] : []),
    ...(options.daysAway !== undefined && options.daysAway !== null && options.daysAway >= ABSENCE_DAYS
      ? [{ kind: 'return-after-absence', daysAway: options.daysAway } as const]
      : []),
  ];

  return [...discoveries.filter((event) => unseen(seen, event)), ...urgencies];
}

export function transitionGuideEvents(previous: EngagementWithGame, next: EngagementWithGame): GuideEvent[] {
  const before = previous.game;
  const after = next.game;
  if (before === undefined || after === undefined) return [];

  const minted = after.mint.number > before.mint.number;
  const events: (GuideEvent | null)[] = [
    before.level.level < 2 && after.level.level >= 2
      ? { kind: 'first-level', level: after.level.level, pointsToNext: after.level.pointsToNext }
      : null,
    tierIndex(after) > tierIndex(before) ? { kind: 'new-tier', tier: after.level.tier, nextTierLevel: nextTierLevel(after) } : null,
    !before.missions.unlocked && after.missions.unlocked ? { kind: 'missions-unlocked' } : null,
    before.mint.number === 1 && after.mint.number === 2
      ? { kind: 'first-mint', levelBefore: before.level.level, levelAfter: after.level.level, tailwindUntilLevel: after.level.record }
      : null,
    after.mint.price > before.mint.price ? { kind: 'price-rises', nextPrice: after.mint.price } : null,
    minted && (previous.mintBadgeLoss ?? 0) > 0 && previous.mintBadgeRegain !== undefined
      ? { kind: 'badge-extinguished', missingActions: previous.mintBadgeRegain }
      : null,
    standing(after) > standing(before) ? rankEvent(after) : null,
    treasuryIndex(after) > treasuryIndex(before) && after.treasury.tier !== null
      ? { kind: 'treasury-tier', tier: after.treasury.tier, nextTierMissing: after.treasury.next?.missing ?? null }
      : null,
    before.flame.status !== 'out' && after.flame.status === 'out' ? flameOutEvent(after) : null,
    before.level.level < 100 && after.level.level === 100 ? { kind: 'level-100', canPrestige: after.level.canPrestige } : null,
  ];
  return events.filter((event): event is GuideEvent => event !== null);
}
