import { withPage, type StudioDraft } from './studio';
import { pageWithVisualAlt } from './studio-page';

/** L'ÉCRITURE du brouillon que l'hôte remet à une plaque à la demande — un
 * geste d'historique ; `key` fusionne une frappe continue en un seul pas. */
export type StudioDraftEdit = (change: (draft: StudioDraft) => StudioDraft, key?: string | null) => void;

/** LE TEXTE ALTERNATIF d'un média de la page COURANTE (#8518) — un geste
 * d'historique comme la légende ; sans média, rien ne change. */
export function withVisualAlt(draft: StudioDraft, door: 'visual' | 'overlay', alt: string): StudioDraft {
  return withPage(draft, draft.currentPage, (page) => pageWithVisualAlt(page, door, alt));
}
