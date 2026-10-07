import type { ForwardSource } from '@/lib/api/forward';
import { formatRemaining } from '@/lib/reading-mode/protection';

import { EPHEMERAL_DURATIONS, type EphemeralDisplayKey } from './compose-protection';

/**
 * LA DURÉE D'UNE COPIE TRANSFÉRÉE (#9573) — la loi de sortie borne la copie
 * d'une flamme à durée par la durée de sa source (`maxDurationSeconds`, posé
 * par `forwardRequestOf`). Ici : la borne d'une sélection, les choix que la
 * feuille d'envoi propose, et ce qui part pour chaque message. La passerelle
 * réapplique `min(demandée, source)` : ce module évite de proposer ce qu'elle
 * rabattrait.
 */

export type ForwardDurationOption = {
  readonly seconds: number;
  /** L'écriture courte, neutre — `5min`, `45s`. */
  readonly label: string;
  /** Le libellé long du catalogue, pour un palier du composeur. */
  readonly displayKey?: EphemeralDisplayKey;
};

const TIERS = EPHEMERAL_DURATIONS.filter((tier) => tier.afterRead !== true);

const optionOf = (seconds: number): ForwardDurationOption => {
  const tier = TIERS.find((candidate) => candidate.seconds === seconds);
  return tier === undefined ? { seconds, label: formatRemaining(seconds) } : { seconds, label: tier.label, displayKey: tier.displayKey };
};

type Bounded = Pick<ForwardSource, 'maxDurationSeconds'>;

/** La durée la plus courte parmi les flammes de la sélection — `null` : aucune flamme, aucune rangée. */
export function forwardDurationBound(messages: readonly Bounded[]): number | null {
  const bounds = messages.flatMap((message) => (message.maxDurationSeconds === undefined ? [] : [message.maxDurationSeconds]));
  return bounds.length === 0 ? null : Math.min(...bounds);
}

/** La durée de la source en tête (présélectionnée), puis les paliers plus courts, du plus long au plus court. */
export function forwardDurationOptions(bound: number): readonly ForwardDurationOption[] {
  const shorter = TIERS.map((tier) => tier.seconds)
    .filter((seconds) => seconds < bound)
    .sort((a, b) => b - a);
  return [bound, ...shorter].map(optionOf);
}

/** Ce qui part dans `ephemeralDuration` pour CE message — rien pour un message qui n'est pas une flamme à durée. */
export function forwardedDurationFor(message: Bounded, chosen: number | undefined): number | undefined {
  const bound = message.maxDurationSeconds;
  if (bound === undefined) return undefined;
  const valid = chosen !== undefined && Number.isFinite(chosen) && chosen > 0;
  return valid ? Math.min(Math.floor(chosen), bound) : bound;
}
