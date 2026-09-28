import { withPage, type StudioDraft } from './studio';
import { pageWithVisualAlt } from './studio-page';

/** LE TEXTE ALTERNATIF d'un média de la page COURANTE (#8518) — un geste
 * d'historique comme la légende ; sans média, rien ne change. */
export function withVisualAlt(draft: StudioDraft, door: 'visual' | 'overlay', alt: string): StudioDraft {
  return withPage(draft, draft.currentPage, (page) => pageWithVisualAlt(page, door, alt));
}
