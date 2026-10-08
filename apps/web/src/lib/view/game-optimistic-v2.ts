import type { GameBlock, GameDuoBlock, GameLeagueBlock, GameSeasonBlock, GameVisibility } from '@meeshy/shared/types/game';
import { tailwindFactor } from '@meeshy/shared/utils/game/boosts';
import { gloryStanding } from '@meeshy/shared/utils/game/glory';
import { levelProgress } from '@meeshy/shared/utils/game/levels';
import { previewMint } from '@meeshy/shared/utils/game/mint';
import { prestigeTransition } from '@meeshy/shared/utils/game/prestige';
import { seasonStepReward } from '@meeshy/shared/utils/game/season';
import { treasuryTier } from '@meeshy/shared/utils/game/treasury';

import type { EngagementWithGame } from '@/lib/api/engagement';

/**
 * LES MISES À JOUR OPTIMISTES DE LA VAGUE 2 (#9481, #9384 à #9389) — la même
 * discipline que `game-optimistic.ts` : capturer, appliquer en local, envoyer,
 * restaurer en cas d'échec. Pures : une NOUVELLE valeur, ou la MÊME référence
 * quand le geste n'a pas de sens (rien n'a bougé, donc rien à restaurer).
 *
 * Ce que le serveur seul connaît n'est jamais deviné : le pseudonyme tiré au
 * sort, l'identifiant du duo, la mission du duo, le score après une étape. Il se
 * pose à la RÉPONSE (`withConsentResult`, `withDuoId`) ou à la relecture qui suit.
 */

const onGame = (view: EngagementWithGame, update: (game: GameBlock) => GameBlock): EngagementWithGame =>
  view.game === undefined ? view : { ...view, game: update(view.game) };

const onLeague = (view: EngagementWithGame, update: (league: GameLeagueBlock) => GameLeagueBlock | null): EngagementWithGame => {
  const league = view.game?.league;
  if (league === undefined) return view;
  const next = update(league);
  return next === null ? view : onGame(view, (game) => ({ ...game, league: next }));
};

const onDuo = (view: EngagementWithGame, update: (duo: GameDuoBlock) => GameDuoBlock | null): EngagementWithGame => {
  const duo = view.game?.duo;
  if (duo === undefined) return view;
  const next = update(duo);
  return next === null ? view : onGame(view, (game) => ({ ...game, duo: next }));
};

const onSeason = (view: EngagementWithGame, update: (season: GameSeasonBlock) => GameSeasonBlock | null): EngagementWithGame => {
  const season = view.game?.season;
  if (season === undefined || season === null) return view;
  const next = update(season);
  return next === null ? view : onGame(view, (game) => ({ ...game, season: next }));
};

// --- La ligue ---

/**
 * Consentir ouvre la ligue (le pseudonyme tiré par le serveur reste `null` jusqu'à
 * sa réponse) ; retirer son consentement la ferme et efface le groupe et le
 * pseudonyme — la passerelle supprime ces données (conformité A-9). Une ligue
 * verrouillée ou fermée aux mineurs ne s'ouvre pas en local.
 */
export const afterConsent = (view: EngagementWithGame, params: { readonly consent: boolean; readonly pseudonym?: string }): EngagementWithGame =>
  onLeague(view, (league) => {
    if (params.consent) {
      if (league.access !== 'consent-required') return null;
      return { ...league, access: 'open', pseudonym: params.pseudonym ?? null };
    }
    if (league.access !== 'open') return null;
    return { ...league, access: 'consent-required', pseudonym: null, current: null };
  });

export const withConsentResult = (view: EngagementWithGame, result: { readonly consent: boolean; readonly pseudonym: string | null }): EngagementWithGame =>
  onLeague(view, (league) => (result.consent ? { ...league, pseudonym: result.pseudonym } : league));

export const withPseudonym = (view: EngagementWithGame, pseudonym: string): EngagementWithGame =>
  onLeague(view, (league) => (league.access === 'open' ? { ...league, pseudonym } : null));

// --- Le duo ---

export const afterInvite = (view: EngagementWithGame, friend: { readonly id: string; readonly displayName: string }): EngagementWithGame =>
  onDuo(view, (duo) =>
    duo.unlocked && duo.status === 'none'
      ? { ...duo, status: 'invited', role: 'inviter', duoId: null, partner: { userId: friend.id, displayName: friend.displayName }, mission: null, progress: null, reward: null }
      : null,
  );

export const withDuoId = (view: EngagementWithGame, duoId: string): EngagementWithGame => onDuo(view, (duo) => ({ ...duo, duoId }));

export const afterAccept = (view: EngagementWithGame): EngagementWithGame =>
  onDuo(view, (duo) => (duo.status === 'invited' && duo.role === 'invitee' ? { ...duo, status: 'active' } : null));

export const afterAbandon = (view: EngagementWithGame): EngagementWithGame =>
  onDuo(view, (duo) => (duo.status === 'invited' || duo.status === 'active' ? { ...duo, status: 'abandoned' } : null));

// --- La saison ---

/** Réclamer une étape atteinte et pas encore réclamée ; la prochaine récompense avance. */
export const afterSeasonClaim = (view: EngagementWithGame, step: number): EngagementWithGame =>
  onSeason(view, (season) => {
    if (!Number.isInteger(step) || step < 1 || step > season.steps || season.claimedSteps.includes(step)) return null;
    const claimedSteps = [...season.claimedSteps, step].sort((a, b) => a - b);
    const nextStep = Array.from({ length: season.steps }, (_, i) => i + 1).find((s) => !claimedSteps.includes(s));
    const reward = nextStep === undefined ? null : seasonStepReward(nextStep);
    return { ...season, claimedSteps, nextReward: nextStep === undefined || reward === null ? null : { step: nextStep, reward } };
  });

export const afterSealBought = (view: EngagementWithGame): EngagementWithGame => {
  const season = view.game?.season;
  const held = view.game?.treasury.held ?? 0;
  if (season === undefined || season === null || season.sealOwned || held < season.sealPrice) return view;
  const bought = onSeason(view, (current) => ({ ...current, sealOwned: true }));
  return onGame(bought, (game) => {
    const tier = treasuryTier(Math.max(0, held - season.sealPrice));
    return { ...game, treasury: { held: tier.held, tier: tier.tier, next: tier.next } };
  });
};

// --- La vitrine, la visibilité, le Prestige ---

export const withShowcaseOrder = (view: EngagementWithGame, order: readonly string[]): EngagementWithGame => {
  const trophies = view.game?.trophies;
  return trophies === undefined ? view : onGame(view, (game) => ({ ...game, trophies: { ...trophies, order: [...order] } }));
};

export const withVisibility = (view: EngagementWithGame, patch: Partial<GameVisibility>): EngagementWithGame => {
  const visibility = view.game?.visibility;
  return visibility === undefined ? view : onGame(view, (game) => ({ ...game, visibility: { ...visibility, ...patch } }));
};

/**
 * Le passage en Prestige, par la MÊME loi que la passerelle (`prestigeTransition`) :
 * le niveau et le score repartent à 1 et à 0, l'étoile se pose, la Gloire monte,
 * le trophée numéroté entre dans la vitrine. Le niveau RECORD retombe à 1 avec le
 * niveau : la ligue (10) et le duo (20) se referment tant qu'il n'y est pas revenu —
 * le texte de confirmation l'annonce avant le geste (conformité G-5).
 *
 * Refusé (même référence) sans proposition ouverte, ou au maximum.
 */
export const afterPrestige = (view: EngagementWithGame): EngagementWithGame => {
  const game = view.game;
  const prestige = game?.prestige;
  if (game === undefined || prestige === undefined || !prestige.canPrestige) return view;
  const transition = prestigeTransition({ score: game.level.score, prestige: game.level.prestige });
  if (!transition.allowed) return view;

  const progress = levelProgress(transition.scoreAfter);
  const standing = gloryStanding({ glory: game.glory.glory + transition.gloryGained, mythic: game.glory.rank === 'mythe', mythicSeat: game.glory.mythic ?? null });
  const trophies = game.trophies;
  return onGame(view, (current) => ({
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
      record: transition.levelRecordAfter,
      prestige: transition.prestigeAfter,
      canPrestige: false,
    },
    glory: { glory: standing.glory, rank: standing.rank, division: standing.division, division5: standing.division5, next: standing.next, gloryMissing: standing.gloryMissing, progress: standing.progress, mythic: standing.mythic },
    mint: previewMint({ score: transition.scoreAfter, mintedLifetime: current.mint.number, debitablePoints: 0 }),
    boosts: { ...current.boosts, tailwind: tailwindFactor({ level: progress.level, levelRecord: transition.levelRecordAfter }) },
    prestige: { ...prestige, stars: transition.prestigeAfter, canPrestige: false },
    ...(current.league === undefined ? {} : { league: { ...current.league, unlocked: false, access: 'locked' as const, current: null } }),
    ...(current.duo === undefined ? {} : { duo: { ...current.duo, unlocked: false } }),
    ...(trophies === undefined
      ? {}
      : { trophies: { items: [...trophies.items, { key: transition.trophyKey, awardedAt: new Date().toISOString() }], order: [transition.trophyKey, ...trophies.order] } }),
  }));
};
