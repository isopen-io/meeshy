/**
 * CE QUI RESTE À DÉBLOQUER D'UN PACK, ET COMMENT (#11276) — servi par la
 * boutique pour chaque pack NON possédé qui se gagne ou qui a une fenêtre : la
 * règle de la récompense (rang, trophée, saison) avec où en est le lecteur, et
 * la fenêtre d'offre. Le serveur reste juge à l'écriture (`PackGrants`) ; ceci
 * ne fait que MONTRER, avant le geste (#9705).
 */
import { GLORY_RANKS, type GloryRankKey, type GloryRankOrMythic } from '../utils/game/glory.js';
import { requirementPreview, type RequirementPreview } from '../utils/game/spend.js';
import { packWindowState, type PackAvailability, type PackWindowState } from './pack-availability.js';
import { isPackEligible, type PackEligibilityFacts, type PackEligibilityRule } from './pack-ownership.js';

/** Les faits d'éligibilité, plus la Gloire actuelle — ce qu'un rang demande pour dire « encore 3 500 ». */
export type PackUnlockFacts = PackEligibilityFacts & { readonly glory: number };

export type PackRewardPreview =
  | { readonly kind: 'rank'; readonly rank: GloryRankKey; readonly currentRank: GloryRankOrMythic; readonly requirement: RequirementPreview }
  | { readonly kind: 'trophy'; readonly key: string; readonly met: boolean }
  | { readonly kind: 'season'; readonly number: number; readonly met: boolean };

export type PackWindowPreview = { readonly state: PackWindowState; readonly startsAt?: string; readonly endsAt?: string };

export type PackRequirementPreview = {
  /** La récompense est remplie ET la fenêtre ouverte : le pack se débloque maintenant. */
  readonly met: boolean;
  readonly reward: PackRewardPreview | null;
  readonly window: PackWindowPreview | null;
};

export type PackUnlockable = { readonly reward?: PackEligibilityRule; readonly availability?: PackAvailability };

const minGloryOf = (rank: GloryRankKey): number => GLORY_RANKS.find((candidate) => candidate.key === rank)?.minGlory ?? 0;

function rewardPreview(rule: PackEligibilityRule, facts: PackUnlockFacts): PackRewardPreview {
  switch (rule.kind) {
    case 'rank': {
      const required = minGloryOf(rule.rank);
      const met = isPackEligible(rule, facts);
      const requirement = requirementPreview({ current: met ? Math.max(facts.glory, required) : facts.glory, required });
      return { kind: 'rank', rank: rule.rank, currentRank: facts.rank, requirement };
    }
    case 'trophy':
      return { kind: 'trophy', key: rule.key, met: isPackEligible(rule, facts) };
    case 'season':
      return { kind: 'season', number: rule.number, met: isPackEligible(rule, facts) };
  }
}

const rewardMet = (preview: PackRewardPreview): boolean => (preview.kind === 'rank' ? preview.requirement.met : preview.met);

/** `null` : rien à débloquer (ni récompense ni fenêtre). */
export function packRequirementPreview(pack: PackUnlockable, context: { readonly facts: PackUnlockFacts; readonly now: Date }): PackRequirementPreview | null {
  if (pack.reward === undefined && pack.availability === undefined) return null;
  const reward = pack.reward === undefined ? null : rewardPreview(pack.reward, context.facts);
  const window = pack.availability === undefined ? null : { state: packWindowState(pack.availability, context.now), ...pack.availability };
  return { met: (reward === null || rewardMet(reward)) && (window === null || window.state === 'open'), reward, window };
}

/** Le lecteur dont on ne sait rien : aucun rang au-delà du premier, aucun trophée, aucune saison. */
export const NO_PACK_UNLOCK_FACTS: PackUnlockFacts = { rank: 'murmure', glory: 0, trophyKeys: new Set(), seasonNumbers: new Set() };
