import type { GameBlock, GameChestReward, GameMission } from '@meeshy/shared/types/game';
import { flameBonusPercent, flameForm } from '@meeshy/shared/utils/game/flame';
import { gloryStanding } from '@meeshy/shared/utils/game/glory';
import { levelProgress } from '@meeshy/shared/utils/game/levels';
import { tailwindFactor } from '@meeshy/shared/utils/game/boosts';
import { previewMint } from '@meeshy/shared/utils/game/mint';
import { treasuryTier } from '@meeshy/shared/utils/game/treasury';

import type { EngagementWithGame } from '@/lib/api/engagement';

/**
 * LES MISES À JOUR OPTIMISTES DU JEU (#9383) — « capturer l'instantané,
 * appliquer en local, envoyer, restaurer en cas d'échec » (§ Instant App
 * Principles). Chaque geste du jeu change l'écran tout de suite ; la
 * relecture qui suit rend la vérité.
 *
 * Elles recalculent par la MÊME loi que la passerelle (`@meeshy/shared/utils/
 * game`) : niveau, rang, trésor, prix suivant. Aucun nombre n'est inventé ici,
 * et ce que le serveur seul connaît (la mission tirée, le contenu du coffre, la
 * série rallumée) reste ABSENT jusqu'à sa réponse — jamais deviné.
 *
 * Pures : elles rendent une NOUVELLE valeur, ou la MÊME référence quand le
 * geste est impossible (un témoin d'identité le prouve : rien n'a bougé, donc
 * rien à restaurer ni à repeindre).
 */

const onGame = (view: EngagementWithGame, update: (game: GameBlock) => GameBlock): EngagementWithGame =>
  view.game === undefined ? view : { ...view, game: update(view.game) };

const withHeld = (view: EngagementWithGame, held: number): EngagementWithGame =>
  onGame(view, (game) => {
    const tier = treasuryTier(Math.max(0, held));
    return { ...game, treasury: { held: tier.held, tier: tier.tier, next: tier.next } };
  });

/** Le solde SERVI fait foi, posé aux DEUX endroits où l'écran le lit. */
const withBalance = (view: EngagementWithGame, balance: number): EngagementWithGame => {
  const next = withHeld(view, balance);
  return next.meesh === undefined ? next : { ...next, meesh: { ...next.meesh, balance: Math.max(0, balance) } };
};

/** Un mouvement de solde, appliqué à chacune des deux lectures sur SA valeur. */
const shiftBalance = (view: EngagementWithGame, delta: number): EngagementWithGame => {
  const next = withHeld(view, (view.game?.treasury.held ?? 0) + delta);
  return next.meesh === undefined
    ? next
    : { ...next, meesh: { ...next.meesh, balance: Math.max(0, next.meesh.balance + delta) } };
};

export function afterMint(view: EngagementWithGame): EngagementWithGame {
  const game = view.game;
  if (game === undefined || !game.mint.canMint) return view;
  const price = game.mint.price;
  const score = Math.max(0, game.level.score - price);
  const debitable = Math.max(0, (view.meesh?.debitablePoints ?? game.level.score) - price);
  const progress = levelProgress(score);
  const standing = gloryStanding({ glory: game.glory.glory + game.mint.gloryGained, mythic: game.glory.rank === 'mythe', mythicSeat: game.glory.mythic ?? null });
  const next = onGame(view, (current) => ({
    ...current,
    level: {
      ...current.level,
      level: progress.level,
      tier: progress.tier,
      score: progress.score,
      floorScore: progress.floorScore,
      nextThreshold: progress.nextThreshold,
      pointsToNext: progress.pointsToNext,
      progress: progress.progress,
      canPrestige: false,
    },
    glory: {
      glory: standing.glory,
      rank: standing.rank,
      division: standing.division,
      division5: standing.division5,
      next: standing.next,
      gloryMissing: standing.gloryMissing,
      progress: standing.progress,
      mythic: standing.mythic,
    },
    mint: previewMint({ score, mintedLifetime: current.mint.number, debitablePoints: debitable }),
    boosts: { ...current.boosts, tailwind: tailwindFactor({ level: progress.level, levelRecord: current.level.record }) },
  }));
  const withMeesh = shiftBalance(next, 1);
  return withMeesh.meesh === undefined
    ? withMeesh
    : {
        ...withMeesh,
        meesh: { ...withMeesh.meesh, mintedLifetime: withMeesh.meesh.mintedLifetime + 1, debitablePoints: debitable },
      };
}

export function afterFreeze(view: EngagementWithGame): EngagementWithGame {
  const game = view.game;
  if (game === undefined || game.flame.freezes >= game.flame.maxFreezes || game.treasury.held < game.flame.freezePrice) {
    return view;
  }
  const bought = onGame(view, (current) => ({ ...current, flame: { ...current.flame, freezes: current.flame.freezes + 1 } }));
  return shiftBalance(bought, -game.flame.freezePrice);
}

const REROLL_PRICE = 1;

export function afterReroll(view: EngagementWithGame): EngagementWithGame {
  const game = view.game;
  if (game === undefined || !game.missions.rerollAvailable) return view;
  const spent = onGame(view, (current) => ({ ...current, missions: { ...current.missions, rerollAvailable: false } }));
  return shiftBalance(spent, -REROLL_PRICE);
}

/** La mission servie prend la place de l'ancienne, au même rang ; le solde servi fait foi. */
export function withRerolled(
  view: EngagementWithGame,
  missionId: string,
  mission: GameMission,
  balance: number,
): EngagementWithGame {
  const swapped = onGame(view, (game) => ({
    ...game,
    missions: { ...game.missions, items: game.missions.items.map((item) => (item.id === missionId ? mission : item)) },
  }));
  return withBalance(swapped, balance);
}

export function afterChestOpening(view: EngagementWithGame): EngagementWithGame {
  const game = view.game;
  if (game === undefined || game.chest.status !== 'ready') return view;
  return onGame(view, (current) => ({ ...current, chest: { ...current.chest, status: 'claimed', reward: null } }));
}

/** Le contenu servi s'y pose, et le score en poche après le crédit. */
export function withChestReward(view: EngagementWithGame, reward: GameChestReward, score: number): EngagementWithGame {
  return onGame(view, (game) => {
    const progress = levelProgress(score);
    return {
      ...game,
      chest: { ...game.chest, status: 'claimed', reward },
      level: {
        ...game.level,
        level: progress.level,
        tier: progress.tier,
        score: progress.score,
        floorScore: progress.floorScore,
        nextThreshold: progress.nextThreshold,
        pointsToNext: progress.pointsToNext,
        progress: progress.progress,
        record: Math.max(game.level.record, progress.level),
      },
    };
  });
}

export function afterRelight(view: EngagementWithGame): EngagementWithGame {
  const game = view.game;
  if (game === undefined || !game.flame.canRelight) return view;
  const lit = onGame(view, (current) => ({
    ...current,
    flame: { ...current.flame, status: 'lit', canRelight: false },
  }));
  return shiftBalance(lit, -game.flame.relightPrice);
}

/** La série servie fixe les jours, la forme et le bonus ; le solde servi fait foi. */
export function withRelit(view: EngagementWithGame, streak: number, balance: number): EngagementWithGame {
  const relit = onGame(view, (game) => ({
    ...game,
    flame: {
      ...game.flame,
      days: streak,
      form: flameForm(streak),
      bonusPercent: flameBonusPercent(streak),
      status: 'lit',
      canRelight: false,
    },
  }));
  return withBalance(relit, balance);
}
