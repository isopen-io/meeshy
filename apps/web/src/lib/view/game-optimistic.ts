import type { GameBlock, GameChestReward, GameMission } from '@meeshy/shared/types/game';
import { flameBonusPercent, flameForm } from '@meeshy/shared/utils/game/flame';
import { gloryStanding, levelCapForRank } from '@meeshy/shared/utils/game/glory';
import { levelOnTheWire, mintOnTheWire } from '@meeshy/shared/utils/game/level-wire';
import type { LevelStepFacts } from '@meeshy/shared/utils/game/level-steps';
import { sparksTailwindFactor, tailwindFactor } from '@meeshy/shared/utils/game/boosts';
import { previewMint } from '@meeshy/shared/utils/game/mint';
import { previewSparksMint, sparksAfterCredit, sparksOf, type SparksFacts } from '@meeshy/shared/utils/game/sparks';
import { treasuryReserveAccess, treasuryTier } from '@meeshy/shared/utils/game/treasury';

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

/** Le niveau et le record ouverts par le rang (#9688), ou ceux d'hier devant un serveur antérieur. */
export const shownLevel = (level: GameBlock['level']): number => level.ladder?.level ?? level.level;
export const recordOf = (level: GameBlock['level']): number => level.ladder?.record ?? level.record;

/** Le record de chaque cycle clos (#10911) : un geste ne le change pas, l'optimiste le garde tel que servi. */
export const pastCyclesOf = (level: GameBlock['level']): { readonly pastCycleRecords?: readonly number[] } =>
  level.ladder?.pastCycleRecords === undefined ? {} : { pastCycleRecords: level.ladder.pastCycleRecords };

/**
 * Les faits des étapes que le serveur a servis (#9706) — les compteurs de `ladder.steps`, sous une Gloire et
 * un rang donnés (ceux du bloc, ou ceux d'après le geste) ; `null` devant un serveur d'avant les étapes.
 */
export const stepFactsOf = (
  level: GameBlock['level'],
  glory: Pick<GameBlock['glory'], 'glory' | 'rank'>,
  counts: Partial<NonNullable<NonNullable<GameBlock['level']['ladder']>['steps']>> = {},
): LevelStepFacts | null => {
  const served = level.ladder?.steps;
  return served == null ? null : { ...served, ...counts, glory: glory.glory, rank: glory.rank };
};

const onGame = (view: EngagementWithGame, update: (game: GameBlock) => GameBlock): EngagementWithGame =>
  view.game === undefined ? view : { ...view, game: update(view.game) };

/**
 * Le trésor à `held` Meeshes gardées. Les réserves (#10848) suivent la loi partagée sur la Gloire DU BLOC — celle d'après le
 * geste quand il l'a fait monter ; un serveur d'avant les réserves n'en sert pas, et l'optimiste n'en invente pas.
 */
export const treasuryAt = (game: GameBlock, held: number): GameBlock['treasury'] => {
  const tier = treasuryTier(Math.max(0, held));
  return {
    held: tier.held,
    tier: tier.tier,
    next: tier.next,
    ...(game.treasury.access === undefined ? {} : { access: [...treasuryReserveAccess({ glory: game.glory.glory, mythic: game.glory.rank === 'mythe' })] }),
  };
};

const withHeld = (view: EngagementWithGame, held: number): EngagementWithGame =>
  onGame(view, (game) => ({ ...game, treasury: treasuryAt(game, held) }));

/** Les étincelles SERVIES d'un niveau, lues par la loi partagée (`sparksOf`) — `undefined` devant un serveur d'avant elles. */
export const servedSparksOf = (level: GameBlock['level']): SparksFacts | undefined =>
  level.sparks === undefined
    ? undefined
    : sparksOf({ engagementScore: level.sparks, sparksSincePrestige: level.sparksCycle, sparksEarnedLifetime: level.sparksLifetime, sparksDebt: level.sparksDebt });

/**
 * Le compteur de Meeshes lit le MÊME prix suivant que le héro de frappe (#10898) : posé sur l'aperçu du bloc, jamais
 * recalculé à côté.
 */
export const withMintCounters = (view: EngagementWithGame, debitable: number, minted = 0): EngagementWithGame => {
  const following = view.game?.mint;
  return view.meesh === undefined || following === undefined
    ? view
    : {
        ...view,
        meesh: {
          ...view.meesh,
          mintedLifetime: view.meesh.mintedLifetime + minted,
          debitablePoints: debitable,
          mintCost: following.price,
          missingPoints: following.missingPoints,
          canMint: following.canMint,
          progress: following.price === 0 ? 0 : Math.min(1, debitable / following.price),
        },
      };
};

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

/**
 * Les étincelles d'après la frappe (#10892) : la poche paie, le cycle et le total à vie — indicatifs — ne bougent pas.
 * `undefined` devant un serveur d'avant les étincelles : le niveau garde alors la forme d'hier.
 */
const sparksAfterMint = (level: GameBlock['level'], pocket: number): SparksFacts | undefined => {
  if (level.sparks === undefined) return undefined;
  const cycle = Math.max(pocket, level.sparksCycle ?? level.sparks);
  return { pocket, cycle, lifetime: Math.max(cycle, level.sparksLifetime ?? cycle), debt: level.sparksDebt ?? 0 };
};

export function afterMint(view: EngagementWithGame): EngagementWithGame {
  const game = view.game;
  if (game === undefined || !game.mint.canMint) return view;
  const price = game.mint.price;
  const score = Math.max(0, game.level.score - price);
  const sparks = sparksAfterMint(game.level, score);
  const debitable = Math.max(0, (view.meesh?.debitablePoints ?? game.level.score) - price);
  const standing = gloryStanding({ glory: game.glory.glory + game.mint.gloryGained, mythic: game.glory.rank === 'mythe', mythicSeat: game.glory.mythic ?? null });
  // Les niveaux s'ouvrent selon le rang (#9688) : le plafond se relit sur le rang d'APRÈS la frappe.
  const levelCap = levelCapForRank(standing.rank);
  // La frappe compte pour les étapes (#9706) : une Meesh de plus, sous la Gloire d'après.
  const steps = stepFactsOf(game.level, standing, { minted: game.mint.number });
  const level = levelOnTheWire({
    score,
    levelCap,
    levelRecord: recordOf(game.level),
    prestige: game.level.prestige,
    steps,
    ...(sparks === undefined ? {} : { sparks, levelMaxLifetime: game.level.levelMaxLifetime ?? null }),
    ...pastCyclesOf(game.level),
  });
  const held = game.treasury.held + 1;
  const next = onGame(view, (current) => ({
    ...current,
    level,
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
    mint: mintOnTheWire(
      sparks === undefined
        ? previewMint({ score, mintedLifetime: current.mint.number, debitablePoints: debitable, levelCap, steps })
        : previewSparksMint({ sparks: sparks.pocket, mintedLifetime: current.mint.number, held, glory: standing.glory, mythic: standing.rank === 'mythe', levelCap, steps, debt: sparks.debt }),
    ),
    // Avec les étincelles, le Vent arrière souffle à 7 niveaux ou plus sous le record (#10896) ; sans, la loi d'hier.
    boosts: { ...current.boosts, tailwind: (sparks === undefined ? tailwindFactor : sparksTailwindFactor)({ level: shownLevel(level), levelRecord: recordOf(level) }) },
  }));
  // Le compteur de Meeshes lit le MÊME prix suivant que le héro de frappe (#10898) — jamais celui d'avant la frappe.
  return withMintCounters(shiftBalance(next, 1), debitable, 1);
}

/**
 * La frappe optimiste, posée UNE fois (#10898). Elle s'applique à l'ouverture de la porte de l'animation, sur ce que le
 * cache contient alors : si une relecture servie y a déjà posé la frappe — la prochaine pièce n'est plus celle d'avant
 * le geste —, la rejouer débiterait la poche deux fois et annoncerait le prix d'une pièce de plus.
 */
export function afterMintUnlessServed(view: EngagementWithGame, numberBefore: number): EngagementWithGame {
  return view.game?.mint.number === numberBefore ? afterMint(view) : view;
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

/**
 * Le contenu servi s'y pose, et le score en poche après le crédit (`score`, la poche servie). Les étincelles du coffre
 * suivent la loi du gain (`sparksAfterCredit`, #10902) : la dette se rembourse d'abord, le cycle et le total à vie montent du
 * gain entier ; la poche SERVIE fait foi. Le niveau, le Vent arrière et le prix suivant se relisent sur elle. La Gloire du
 * coffre et le gel offert restent ceux du bloc jusqu'à la relecture : rejouée, une réclamation déjà servie les compterait
 * deux fois.
 */
export function withChestReward(
  view: EngagementWithGame,
  reward: GameChestReward,
  score: number,
  starFragments?: { readonly collected: number },
): EngagementWithGame {
  const game = view.game;
  if (game === undefined) return view;
  const servedSparks = servedSparksOf(game.level);
  const credited = servedSparks === undefined ? undefined : sparksAfterCredit(servedSparks, reward.points);
  const sparks =
    credited === undefined
      ? undefined
      : sparksOf({ engagementScore: score, sparksSincePrestige: credited.cycle, sparksEarnedLifetime: credited.lifetime, sparksDebt: credited.debt });
  const levelCap = levelCapForRank(game.glory.rank);
  const steps = stepFactsOf(game.level, game.glory);
  const level = levelOnTheWire({
    score: sparks?.pocket ?? score,
    levelCap,
    levelRecord: recordOf(game.level),
    prestige: game.level.prestige,
    steps,
    ...(sparks === undefined ? {} : { sparks, levelMaxLifetime: game.level.levelMaxLifetime ?? null }),
    ...pastCyclesOf(game.level),
  });
  const claimed = onGame(view, (current) => ({
    ...current,
    chest: { ...current.chest, status: 'claimed', reward },
    // Le total collecté, tel que la passerelle le sert après l'ouverture (#10011) — le client ne le calcule pas.
    ...(starFragments === undefined ? {} : { starFragments: { collected: starFragments.collected } }),
    level,
    // Le coffre fait MONTER le niveau : l'écart au record se relit exactement, par la loi du bloc (#10896).
    boosts: { ...current.boosts, tailwind: (sparks === undefined ? tailwindFactor : sparksTailwindFactor)({ level: shownLevel(level), levelRecord: recordOf(level) }) },
    ...(sparks === undefined
      ? {}
      : {
          mint: mintOnTheWire(
            previewSparksMint({
              sparks: sparks.pocket,
              mintedLifetime: Math.max(0, current.mint.number - 1),
              held: current.treasury.held,
              glory: current.glory.glory,
              mythic: current.glory.rank === 'mythe',
              levelCap,
              steps,
              debt: sparks.debt,
            }),
          ),
        }),
  }));
  return sparks === undefined ? claimed : withMintCounters(claimed, sparks.pocket);
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
