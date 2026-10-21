import type { useLongPress } from '@/lib/view/long-press';

/** Les six gestionnaires d'appui long que l'hôte du Résumé étale sur ses entrées (#11225). */
export type SummaryEntryPress = ReturnType<typeof useLongPress>;

type EntryPressAttributes = Partial<SummaryEntryPress> & {
  readonly 'data-summary-target'?: string;
  readonly 'data-summary-label'?: string;
  readonly 'aria-keyshortcuts'?: string;
};

/**
 * CE QU'UNE ENTRÉE DU RÉSUMÉ PORTE POUR OUVRIR SON MENU (#11225) — loi PURE :
 * la rampe et la liste des épisodes restent sans hook (leurs témoins les
 * déplient en appelant le composant), le geste vit UNE fois chez l'hôte
 * (`useSummaryEntryMenu`), comme celui des rangées du fil.
 *
 * L'entrée DÉCLARE ce qu'elle désigne (`data-summary-target`) et comment le
 * menu la nomme (`data-summary-label`) : l'hôte lit l'élément ouvert, jamais une
 * fermeture par entrée. Sans capacité de menu ou sans message désigné, rien
 * n'est posé — l'entrée est exactement celle d'avant.
 */
export function entryPressAttributes(params: {
  readonly press: SummaryEntryPress | undefined;
  readonly target: string | null;
  readonly label: string;
}): EntryPressAttributes {
  const { press, target, label } = params;
  if (press === undefined || target === null) return {};
  return { ...press, 'data-summary-target': target, 'data-summary-label': label, 'aria-keyshortcuts': 'Shift+F10' };
}
