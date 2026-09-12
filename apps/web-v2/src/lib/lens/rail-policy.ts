import lentilleTokens from '@meeshy/shared/design/lentille-tokens.json';

import type { StoryGroup } from '@/lib/api/stories';
import { isGroupFullyExpired } from '@/lib/api/stories';

/**
 * LA LOI DU RAIL DE LA LENTILLE (#5652) — miroir VECTEUR À VECTEUR de
 * `LentilleRailPolicy` (`apps/ios/Meeshy/Features/Main/Lentille/Chrome/StoriesVivantsRail.swift:121-152`) :
 * troncature à `≤ 6`, masquage si vide, anneau accentué ssi `isLive ||
 * hasUnviewed`. AUCUNE cote n'est écrite en littéral (D-4) — `maxEntries`
 * vient de `packages/shared/design/lentille-tokens.json` (`list.rail`), la
 * MÊME table que `LentilleMetrics.Rail.maxEntries` dérive côté iOS.
 *
 * Ce fichier porte AUSSI le filtre `railStoryGroups` (miroir
 * `ConversationListView.swift:1426-1429` : « storyGroups,
 * excludingUserId: moi ») — ni moi, ni un groupe entièrement expiré — parce
 * que c'est la MÊME loi produit que la politique du rail : ce qui entre dans
 * `visibleEntries` doit déjà avoir traversé ce filtre.
 */

export const MAX_RAIL_ENTRIES: number = lentilleTokens.list.rail.maxEntries;

/** Miroir `LentilleRailEntry` (StoriesVivantsRail.swift:16-65). */
export type RailEntry = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly previewUrl?: string;
  readonly moodEmoji?: string;
  readonly hasUnviewed: boolean;
  readonly accentColor: string;
  /** Toujours `false` aujourd'hui, comme iOS (`ConversationListView.swift:1405-1410`). */
  readonly isLive: boolean;
};

/** Miroir `LentilleRailSelfEntry` (StoriesVivantsRail.swift:77-117). */
export type RailSelfEntry = {
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly previewUrl?: string;
  readonly accentColor: string;
  readonly moodEmoji?: string;
  readonly hasActiveStory: boolean;
  readonly actionLabel?: string;
};

/**
 * `≤ 6` entrées — troncature simple, jamais un filtrage arbitraire : l'ordre
 * et la sélection des entrées visibles restent la responsabilité de
 * l'appelant (miroir `LentilleRailPolicy.visibleEntries`).
 */
export function visibleEntries(entries: readonly RailEntry[]): readonly RailEntry[] {
  return entries.slice(0, MAX_RAIL_ENTRIES);
}

/** Masqué si vide — la peau rend `null` plutôt qu'un rail vide avec un fond visible. */
export function shouldRenderEntries(entries: readonly RailEntry[]): boolean {
  return visibleEntries(entries).length > 0;
}

/**
 * « Vide » veut dire : NI moi, NI personne. Tant qu'il y a une entrée « moi »
 * le rail est rendu (miroir `shouldRender(selfEntry:entries:)`).
 */
export function shouldRenderRail(
  selfEntry: RailSelfEntry | undefined,
  entries: readonly RailEntry[],
): boolean {
  return selfEntry !== undefined || shouldRenderEntries(entries);
}

/**
 * Anneau ACCENTUÉ = « il y a quelque chose à voir » — un direct en cours, ou
 * au moins une story non vue. Tout vu ⇒ anneau SOURD, jamais absent : la
 * pastille reste une porte ouverte (miroir `ringIsAccented`).
 */
export function ringIsAccented(entry: RailEntry): boolean {
  return entry.isLive || entry.hasUnviewed;
}

/**
 * `railStoryGroups` — miroir `ConversationListView.swift:1426-1429+suite` :
 * ni le groupe de `excludingUserId` (« moi », porté par sa propre entrée
 * `RailSelfEntry`), ni un groupe entièrement expiré. `at` est INJECTÉE
 * (jamais `new Date()` lu ici) — le même motif que `isGroupFullyExpired`
 * (`api/stories.ts`), pour que ce filtre reste déterministe en test.
 */
export function railStoryGroups(
  groups: readonly StoryGroup[],
  excludingUserId: string,
  at: Date,
): readonly StoryGroup[] {
  return groups.filter((group) => group.id !== excludingUserId && !isGroupFullyExpired(group, at));
}
