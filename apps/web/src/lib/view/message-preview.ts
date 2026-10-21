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
 *    zéro (et la recharge) et rend un canvas VIDE. Chaque vidéo devient un
 *    canvas où la frame que le lecteur voit est PEINTE (repli sur une image du
 *    poster tant qu'aucune frame n'est décodée), sans source vidéo ni
 *    préchargement ; chaque canvas est recopié depuis le vivant. Les deux se
 *    lisent sur la rangée SOURCE, passée par l'appelant.
 *
 *    PEINTE, JAMAIS ENCODÉE : les médias viennent de la passerelle, une autre
 *    origine que l'application, et `<video>` n'y porte pas `crossOrigin` — un
 *    canvas qui les dessine est « souillé » et `toDataURL` lève. Mais un canvas
 *    souillé AFFICHE ses pixels : il suffit de ne jamais les relire. Et il est
 *    dessiné à la taille AFFICHÉE (bornée), pas à la résolution native : aucun
 *    encodage JPEG d'une frame 4K sur le fil principal avant la première
 *    peinture du menu.
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
/** Densité maximale d'une frame figée — au-delà, l'œil ne gagne rien et le
 * canvas pèse. */
const FRAME_MAX_DENSITY = 2;
/** Côté maximal, en pixels du canvas, d'une frame figée. */
const FRAME_MAX_SIDE = 1280;

export function pieceAspectRatio(attachment: Pick<Attachment, 'width' | 'height'>): string {
  const { width, height } = attachment;
  if (width === undefined || height === undefined || width <= 0 || height <= 0) return SQUARE;
  return `${width} / ${height}`;
}

const copyFrameAttributes = (from: Element, to: Element, names: readonly string[]): void => {
  names.forEach((name) => {
    const value = from.getAttribute(name);
    if (value !== null) to.setAttribute(name, value);
  });
};

/** La taille du canvas d'une frame figée : le rapport de la vidéo, au plus la
 * taille AFFICHÉE × densité (bornée), jamais plus que la résolution native. */
function frameSize(live: HTMLVideoElement): { readonly width: number; readonly height: number } {
  const shown = live.getBoundingClientRect();
  const density = Math.min(FRAME_MAX_DENSITY, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
  const shownSide = Math.max(shown.width, shown.height) * density;
  const budget = Math.min(FRAME_MAX_SIDE, shownSide > 0 ? shownSide : FRAME_MAX_SIDE);
  const scale = Math.min(1, budget / Math.max(live.videoWidth, live.videoHeight));
  return { width: Math.max(1, Math.round(live.videoWidth * scale)), height: Math.max(1, Math.round(live.videoHeight * scale)) };
}

/** La frame que la vidéo VIVANTE affiche, PEINTE sur un canvas — `null` sans
 * image décodée. */
function paintedFrame(video: HTMLVideoElement, live: HTMLVideoElement | undefined): HTMLCanvasElement | null {
  if (live === undefined || live.readyState < HAVE_CURRENT_DATA || live.videoWidth <= 0 || live.videoHeight <= 0) return null;
  const canvas = document.createElement('canvas');
  const { width, height } = frameSize(live);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  try {
    context.drawImage(live, 0, 0, width, height);
  } catch {
    return null;
  }
  copyFrameAttributes(video, canvas, ['class', 'style', PIECE_RATIO_ATTRIBUTE]);
  canvas.setAttribute('data-preview-frame', '');
  return canvas;
}

function posterFrame(video: HTMLVideoElement): HTMLImageElement {
  const frame = document.createElement('img');
  copyFrameAttributes(video, frame, FRAME_ATTRIBUTES);
  frame.setAttribute('alt', '');
  frame.setAttribute('data-preview-frame', '');
  const poster = video.getAttribute('poster');
  if (poster !== null && poster !== '') frame.setAttribute('src', poster);
  return frame;
}

function freezeVideos(root: HTMLElement, source: HTMLElement | undefined): void {
  const live = source === undefined ? [] : Array.from(source.querySelectorAll('video'));
  Array.from(root.querySelectorAll('video')).forEach((video, index) => video.replaceWith(paintedFrame(video, live[index]) ?? posterFrame(video)));
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
     retirée juste après, emporte sa frame avec elle (fail-closed). Les canvas
     AVANT les vidéos : une frame figée est un canvas de plus, qui décalerait
     l'appariement des canvas du message. */
  copyCanvases(root, options.source);
  freezeVideos(root, options.source);
  restoreProtectedRest(root);
  root.querySelectorAll('[data-preview-omit]').forEach((node) => node.remove());
  stillEffects(root);
  root.querySelectorAll<HTMLElement>('[data-media-grid]').forEach(unfoldGrid);
  fitSoloPieces(root);
}
