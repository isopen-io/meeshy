import { STUDIO_PAGE_MAX, currentStudioPage, studioDoorAccepts, studioMediaCount, withAddedPage, withCurrentPage, type StudioDraft } from './studio';

/**
 * **IMPORTER PLUSIEURS MÉDIAS D'UN GESTE** (#8533, porteur 2026-09-28 :
 * « autant de scènes que d'images et de vidéos chargées ») — la loi PURE qui
 * range N fichiers choisis en N scènes, dans l'ordre du choix :
 *  - le premier remplit la page COURANTE si elle n'a pas de fond (un fond
 *    posé n'est jamais écrasé par un import multiple) ;
 *  - chaque suivant ouvre sa page (`withAddedPage`) ;
 *  - au-delà du plafond (`STUDIO_PAGE_MAX` pages, et autant de médias pour le
 *    document), les fichiers en trop sont REFUSÉS et COMPTÉS — l'écran le dit,
 *    rien ne se perd en silence ; un fichier ni image ni vidéo est refusé par
 *    la porte.
 * La scène courante devient celle du premier média importé.
 */
export type StudioImportRefusal = { readonly reason: 'import-max' | 'door'; readonly count: number };

export type StudioImportPlan<F> = {
  readonly draft: StudioDraft;
  readonly placements: readonly { readonly pageId: string; readonly file: F }[];
  readonly refused: StudioImportRefusal | null;
};

export function studioImportPlan<F extends { readonly type: string }>(draft: StudioDraft, files: readonly F[], language: string): StudioImportPlan<F> {
  const accepted = files.filter((file) => studioDoorAccepts('visual', file.type));
  const wrongDoor = files.length - accepted.length;
  const current = currentStudioPage(draft);
  const fillsCurrent = current.background === null;
  const mediaRoom = STUDIO_PAGE_MAX - studioMediaCount(draft);
  const pageRoom = STUDIO_PAGE_MAX - draft.pages.length;
  const kept = accepted.slice(0, Math.max(0, Math.min(mediaRoom, pageRoom + (fillsCurrent ? 1 : 0))));
  const overflow = accepted.length - kept.length;
  const start = { draft, placements: [] as { readonly pageId: string; readonly file: F }[] };
  const built = kept.reduce((acc, file, index) => {
    if (index === 0 && fillsCurrent) return { draft: acc.draft, placements: [...acc.placements, { pageId: current.id, file }] };
    const next = withAddedPage(acc.draft, language);
    return { draft: next, placements: [...acc.placements, { pageId: next.currentPage, file }] };
  }, start);
  const first = built.placements[0];
  return {
    draft: first === undefined ? draft : withCurrentPage(built.draft, first.pageId),
    placements: built.placements,
    refused: overflow > 0 ? { reason: 'import-max', count: overflow } : wrongDoor > 0 ? { reason: 'door', count: wrongDoor } : null,
  };
}
