import type { Attachment } from '@/lib/api/types';

/**
 * L'APERÇU DE L'APPUI LONG — ce que le menu du message montre de la rangée
 * pressée (#8008, complément porteur du 2026-09-26).
 *
 * L'aperçu est un CLONE du DOM vivant (`message-menu.tsx`, question 10 de sa
 * spécification) : les mêmes pixels que la rangée, par construction. Deux
 * choses ne doivent pourtant PAS être recopiées telles quelles, et c'est ce
 * module qui les projette sur le clone — jamais sur la rangée elle-même.
 *
 * 1. LA FORME PROTÉGÉE. Une rangée dont la fenêtre de lecture est ouverte à
 *    l'instant de l'appui (flou révélé, vue unique ouverte) porte son texte en
 *    clair ; le clone l'aurait posé, net et agrandi, au-dessus du fil. Chaque
 *    fenêtre déclare sa forme au repos (`[data-protected-rest]`, posée par
 *    `ProtectedContent`, SANS contenu) ; le clone la prend à sa place. Une
 *    fenêtre qui n'en déclare pas est retirée entière : fail-closed.
 * 2. LA PROPORTION D'ORIGINE. Dans le fil, une case de grille recadre sa
 *    pièce (`object-cover`) et une tuile masquée garde un carré fixe. Dans
 *    l'aperçu, chaque pièce reprend son rapport d'aspect ORIGINAL (`width` /
 *    `height`, repli carré), sans rognage ni étirement ; une grille se déplie
 *    en colonne pour que chaque case puisse avoir le sien.
 */

/** L'attribut qui porte, sur chaque case ou pièce visuelle, son rapport d'origine. */
export const PIECE_RATIO_ATTRIBUTE = 'data-piece-ratio';

const SQUARE = '1 / 1';

export function pieceAspectRatio(attachment: Pick<Attachment, 'width' | 'height'>): string {
  const { width, height } = attachment;
  if (width === undefined || height === undefined || width <= 0 || height <= 0) return SQUARE;
  return `${width} / ${height}`;
}

function restoreProtectedRest(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-protected="revealed"]').forEach((window) => {
    const rest = window.querySelector<HTMLElement>(':scope > [data-protected-rest]');
    if (rest === null) {
      window.remove();
      return;
    }
    window.replaceWith(...Array.from(rest.childNodes));
  });
  root.querySelectorAll('[data-protected-rest]').forEach((rest) => rest.remove());
}

function containMedia(scope: HTMLElement): void {
  scope.querySelectorAll<HTMLElement>('img, video').forEach((media) => {
    media.style.objectFit = 'contain';
  });
}

function unfoldGrid(grid: HTMLElement): void {
  const cells = Array.from(grid.querySelectorAll<HTMLElement>(`[${PIECE_RATIO_ATTRIBUTE}]`)).filter((cell) => {
    const holder = cell.parentElement?.closest(`[${PIECE_RATIO_ATTRIBUTE}]`) ?? null;
    return holder === null || !grid.contains(holder);
  });
  cells.forEach((cell) => {
    cell.style.aspectRatio = cell.getAttribute(PIECE_RATIO_ATTRIBUTE) ?? SQUARE;
    cell.style.width = '100%';
    cell.style.height = 'auto';
    cell.style.flex = 'none';
    containMedia(cell);
  });
  grid.replaceChildren(...cells);
  grid.setAttribute('data-preview-layout', 'column');
  grid.style.aspectRatio = 'auto';
  grid.style.display = 'flex';
  grid.style.flexDirection = 'column';
  grid.style.gap = '2px';
}

function fitSoloPieces(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(`[${PIECE_RATIO_ATTRIBUTE}]`).forEach((piece) => {
    if (piece.closest('[data-media-grid]') !== null) return;
    piece.style.aspectRatio = piece.getAttribute(PIECE_RATIO_ATTRIBUTE) ?? SQUARE;
    piece.style.height = 'auto';
    containMedia(piece);
  });
}

export function projectMessagePreview(root: HTMLElement): void {
  restoreProtectedRest(root);
  root.querySelectorAll<HTMLElement>('[data-media-grid]').forEach(unfoldGrid);
  fitSoloPieces(root);
}
