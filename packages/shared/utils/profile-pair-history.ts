/**
 * « NOTRE HISTOIRE » — la frise d'une paire sur la fiche d'un autre (#19378,
 * chantier #18857, vue `Autre-Commun` de la planche du profil) : premier message,
 * entrée à chaque niveau EFFECTIF, jalons de messages.
 *
 * Fonction PURE. La partie qui la porte est gardée par la loi d'accès
 * (`resolveInCommonParts`, partie `history`) : rien ici ne décide QUI lit.
 *
 * ## Ce qui ne se raconte JAMAIS (RG-07, gestes silencieux)
 *
 * - Un accord UNILATÉRAL : un niveau au-dessus du cercle commun (le plus bas des
 *   deux accords) n'est pas servi, et un niveau que seul l'un des deux a daté non
 *   plus — sa date serait celle d'un geste de l'un seul.
 * - Une BAISSE : les dates se lisent dans les seules montées visibles
 *   (`relationPairLevelEntries`), une remontée sous le plafond déjà atteint ne
 *   date rien, et un niveau perdu n'est plus servi.
 */
import {
  relationPairLevelEntries,
  type RelationLevel,
  type RelationPairLevelEntry,
  type RelationRequestLevel,
  type RelationTransition,
} from '../types/relation.js';

/** Les jalons de messages de la planche (« 1 000 messages »). */
export const PAIR_HISTORY_MESSAGE_MILESTONES = [1000, 10000] as const;

export type PairHistoryItem =
  | { readonly kind: 'first-message'; readonly at: Date }
  | { readonly kind: 'level'; readonly level: RelationRequestLevel; readonly at: Date }
  | { readonly kind: 'messages-milestone'; readonly count: number; readonly at: Date };

export type PairHistoryLevelEntry = RelationPairLevelEntry;

type LevelInput = {
  readonly transitions: ReadonlyArray<RelationTransition>;
  readonly effectiveLevel: RelationLevel;
  readonly actorIds: readonly [string, string];
};

/** Le site de la comparaison de niveaux est `types/relation.ts` (garde du site unique). */
export const pairHistoryLevelEntries = (input: LevelInput): PairHistoryLevelEntry[] => relationPairLevelEntries(input);

export type PairHistoryInput = LevelInput & {
  readonly firstMessageAt: Date | null;
  readonly milestones: ReadonlyArray<{ readonly count: number; readonly at: Date }>;
};

export const resolvePairHistory = (input: PairHistoryInput): PairHistoryItem[] => {
  const first: PairHistoryItem[] = input.firstMessageAt ? [{ kind: 'first-message', at: input.firstMessageAt }] : [];
  const levels: PairHistoryItem[] = pairHistoryLevelEntries(input).map((entry) => ({ kind: 'level', ...entry }));
  const milestones: PairHistoryItem[] = input.milestones.map((m) => ({ kind: 'messages-milestone', count: m.count, at: m.at }));
  return [...first, ...levels, ...milestones].sort((a, b) => a.at.getTime() - b.at.getTime());
};

/** La forme d'un pas sur le fil : `{ kind, level?, count?, at }`, `at` en ISO-8601. */
export type PairHistoryItemWire = {
  readonly kind: PairHistoryItem['kind'];
  readonly level?: RelationRequestLevel;
  readonly count?: number;
  readonly at: string;
};

export const pairHistoryItemWire = (item: PairHistoryItem): PairHistoryItemWire => ({ ...item, at: item.at.toISOString() });

/** La projection d'un mot par étape, que lit le client iOS (`data.history`, #19377). */
export type PairHistoryStepWire = { readonly kind: string; readonly at: string };

const stepKind = (item: PairHistoryItem): string => {
  if (item.kind === 'first-message') return 'firstMessage';
  if (item.kind === 'level') return item.level.toLowerCase();
  return `messages${item.count}`;
};

export const pairHistoryWire = (items: readonly PairHistoryItem[]): PairHistoryStepWire[] =>
  items.map((item) => ({ kind: stepKind(item), at: item.at.toISOString() }));
