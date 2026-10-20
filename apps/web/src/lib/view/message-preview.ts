import type { Attachment } from '@/lib/api/types';

/**
 * L'APERÇU DE L'APPUI LONG — ce que le menu du message montre de la rangée
 * pressée (#8008, complément porteur du 2026-09-26).
 *
 * L'aperçu est un CLONE du DOM vivant (`message-menu.tsx`, question 10 de sa
 * spécification) : les mêmes pixels que la rangée, par construction. Plusieurs
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
 * 3. LE MÉDIA TEL QU'IL EST À L'ÉCRAN (#11206). `cloneNode` remet une vidéo à
 *    zéro (et la recharge) et rend un canvas VIDE. Chaque vidéo devient une
 *    image de la frame que le lecteur voit (repli sur le poster), sans source
 *    vidéo ni préchargement ; chaque canvas est recopié depuis le vivant. Les
 *    deux se lisent sur la rangée SOURCE, passée par l'appelant.
 * 4. CE QUI N'EST PAS LE MESSAGE. Un nœud `[data-preview-omit]` (une commande
 *    de la rangée, un débord de geste) est retiré ; un hôte d'effets
 *    (`[data-effects]`, `[data-effects-host]`) ne rejoue aucune animation —
 *    l'aperçu est une image arrêtée.
 */

/** L'attribut qui porte, sur chaque case ou pièce visuelle, son rapport d'origine. */
export const PIECE_RATIO_ATTRIBUTE = 'data-piece-ratio';

export type MessagePreviewOptions = {
  /** La rangée VIVANTE dont `root` est le clone — d'où se lisent la frame
   * d'une vidéo et les pixels d'un canvas. Absente : poster, canvas vide. */
  readonly source?: HTMLElement;
};

const SQUARE = '1 / 1';
const EFFECTS_SELECTOR = '[data-effects], [data-effects-host]';
const FRAME_ATTRIBUTES = ['class', 'style', 'width', 'height', PIECE_RATIO_ATTRIBUTE] as const;
const HAVE_CURRENT_DATA = 2;

export function pieceAspectRatio(attachment: Pick<Attachment, 'width' | 'height'>): string {
  const { width, height } = attachment;
  if (width === undefined || height === undefined || width <= 0 || height <= 0) return SQUARE;
  return `${width} / ${height}`;
}

/** La frame affichée par la vidéo VIVANTE — `null` sans image décodée, ou
 * quand la source est d'une autre origine (canvas « souillé »). */
function currentFrameOf(video: HTMLVideoElement | undefined): string | null {
  if (video === undefined || video.readyState < HAVE_CURRENT_DATA || video.videoWidth <= 0 || video.videoHeight <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}

function frozenFrame(video: HTMLVideoElement, live: HTMLVideoElement | undefined): HTMLImageElement {
  const frame = document.createElement('img');
  FRAME_ATTRIBUTES.forEach((name) => {
    const value = video.getAttribute(name);
    if (value !== null) frame.setAttribute(name, value);
  });
  frame.setAttribute('alt', '');
  frame.setAttribute('data-preview-frame', '');
  const src = currentFrameOf(live) ?? video.getAttribute('poster');
  if (src !== null && src !== '') frame.setAttribute('src', src);
  return frame;
}

function freezeVideos(root: HTMLElement, source: HTMLElement | undefined): void {
  const live = source === undefined ? [] : Array.from(source.querySelectorAll('video'));
  Array.from(root.querySelectorAll('video')).forEach((video, index) => video.replaceWith(frozenFrame(video, live[index])));
}

function copyCanvas(canvas: HTMLCanvasElement, original: HTMLCanvasElement | undefined): void {
  if (original === undefined) return;
  try {
    canvas.getContext('2d')?.drawImage(original, 0, 0);
  } catch {
    /* Un canvas d'une autre origine ne se relit pas : le clone reste vide plutôt que faux. */
  }
}

function copyCanvases(root: HTMLElement, source: HTMLElement | undefined): void {
  if (source === undefined) return;
  const live = Array.from(source.querySelectorAll('canvas'));
  Array.from(root.querySelectorAll('canvas')).forEach((canvas, index) => copyCanvas(canvas, live[index]));
}

function stillEffects(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(EFFECTS_SELECTOR).forEach((host) => {
    [host, ...Array.from(host.querySelectorAll<HTMLElement>('*'))].forEach((node) => {
      node.style.animation = 'none';
    });
  });
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
  scope.querySelectorAll<HTMLElement>('img, video, canvas').forEach((media) => {
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

export function projectMessagePreview(root: HTMLElement, options: MessagePreviewOptions = {}): void {
  /* AVANT la forme protégée : les index du clone et de la source ne
     s'apparient que tant que rien n'est retiré — et une fenêtre ouverte,
     retirée juste après, emporte sa frame avec elle (fail-closed). */
  freezeVideos(root, options.source);
  copyCanvases(root, options.source);
  restoreProtectedRest(root);
  root.querySelectorAll('[data-preview-omit]').forEach((node) => node.remove());
  stillEffects(root);
  root.querySelectorAll<HTMLElement>('[data-media-grid]').forEach(unfoldGrid);
  fitSoloPieces(root);
}
