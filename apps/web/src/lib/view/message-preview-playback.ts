/**
 * L'APERÇU D'APPUI LONG LIT LES VOCAUX ET LES VIDÉOS (#11339, décision porteur
 * du 2026-10-24, option B) — dans les trois modes de lecture, la même règle que
 * l'aperçu iOS (`MessageOverlayPreviewTouch`).
 *
 * L'aperçu est un CLONE du DOM vivant (`message-menu.tsx`) : ses boutons n'ont
 * aucun gestionnaire. Seul le bouton de LECTURE d'un vocal ou d'une vidéo y
 * reprend vie, et il RELAIE au bouton jumeau de la rangée vivante (voilée sous
 * le menu) : un seul moteur, un seul son (`mediaCoordinator`), le même rapport
 * de consommation que le fil. Le clone recopie ensuite l'état du bouton vivant
 * (lecture / pause), le temps du vocal, et peint les images d'une vidéo qui
 * joue. Tout le reste du clone est inerte : le voile garde le toucher qui ferme
 * et le glisser qui réduit.
 *
 * Fermer le menu arrête ce que l'aperçu a lancé, et seulement cela. Une pièce
 * sous une forme protégée (vue unique, flou, chiffré) n'offre rien : le clone
 * ne lit jamais ce que le fil retient.
 */

const PLAY_CONTROL_SELECTOR = '[data-voice-play], [data-video-control="play-pause"]';
const PROTECTED_SELECTOR = '[data-protected], [data-protected-rest]';
const ZONE_SELECTOR = '[data-attachment]';
const FRAME_SELECTOR = '[data-preview-frame]';
const VOICE_TIME_SELECTOR = '[data-voice-time]';
const HAVE_CURRENT_DATA = 2;

export type PreviewPlayback = {
  /** Les boutons de lecture vivants du clone, dans l'ordre du document. */
  readonly controls: readonly HTMLElement[];
  /** Coupe les relais et arrête ce que l'aperçu a lancé. */
  readonly dispose: () => void;
};

const zoneIdOf = (control: Element): string | null => control.closest(ZONE_SELECTOR)?.getAttribute('data-attachment') ?? null;

/** Les boutons de lecture que l'aperçu laisse vivants — jamais sous une forme protégée. */
export function previewPlayControls(clone: HTMLElement): readonly HTMLElement[] {
  return Array.from(clone.querySelectorAll<HTMLElement>(PLAY_CONTROL_SELECTOR)).filter(
    (control) => control.closest(PROTECTED_SELECTOR) === null && zoneIdOf(control) !== null,
  );
}

/** Le bouton jumeau dans la rangée vivante : même pièce, même rôle. */
function liveTwin(control: HTMLElement, source: HTMLElement): HTMLElement | null {
  const id = zoneIdOf(control);
  const zone = Array.from(source.querySelectorAll<HTMLElement>(ZONE_SELECTOR)).find((el) => el.getAttribute('data-attachment') === id);
  if (zone === undefined || zone.closest(PROTECTED_SELECTOR) !== null) return null;
  const twin = Array.from(zone.querySelectorAll<HTMLElement>(PLAY_CONTROL_SELECTOR)).find((el) => el.closest(ZONE_SELECTOR) === zone);
  return twin ?? null;
}

const mediaOf = (control: HTMLElement): HTMLMediaElement | null =>
  control.closest(ZONE_SELECTOR)?.querySelector<HTMLMediaElement>('audio, video') ?? null;

/** Rend inerte tout le clone sauf les boutons gardés et le chemin qui y mène. */
function inertAllBut(root: HTMLElement, keepers: readonly HTMLElement[]): void {
  Array.from(root.children).forEach((child) => {
    if (keepers.some((keeper) => keeper === child)) return;
    if (keepers.some((keeper) => child.contains(keeper))) {
      inertAllBut(child as HTMLElement, keepers);
      return;
    }
    child.setAttribute('inert', '');
  });
}

/** Recopie l'état du bouton vivant (libellé, glyphe) et le temps du vocal sur le clone. */
function mirror(live: HTMLElement, copy: HTMLElement): void {
  const label = live.getAttribute('aria-label');
  if (label !== null) copy.setAttribute('aria-label', label);
  copy.replaceChildren(...Array.from(live.cloneNode(true).childNodes));
  const liveTime = live.closest(ZONE_SELECTOR)?.querySelector(VOICE_TIME_SELECTOR);
  const copyTime = copy.closest(ZONE_SELECTOR)?.querySelector(VOICE_TIME_SELECTOR);
  if (liveTime != null && copyTime != null) copyTime.textContent = liveTime.textContent;
}

/** Le canvas où la vidéo vivante se peint dans le clone — créé à la place de la frame figée. */
function frameCanvas(copy: HTMLElement): HTMLCanvasElement | null {
  const zone = copy.closest<HTMLElement>(ZONE_SELECTOR);
  const frame = zone?.querySelector<HTMLElement>(FRAME_SELECTOR) ?? null;
  if (frame === null) return null;
  if (frame instanceof HTMLCanvasElement) return frame;
  const canvas = document.createElement('canvas');
  ['class', 'style'].forEach((name) => {
    const value = frame.getAttribute(name);
    if (value !== null) canvas.setAttribute(name, value);
  });
  canvas.setAttribute('data-preview-frame', '');
  frame.replaceWith(canvas);
  return canvas;
}

function paint(video: HTMLVideoElement, copy: HTMLElement): void {
  if (video.readyState < HAVE_CURRENT_DATA || video.videoWidth <= 0) return;
  const canvas = frameCanvas(copy);
  if (canvas === null) return;
  if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
  if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
  try {
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch {
    /* Une frame indéchiffrable laisse la précédente : le clone reste une image. */
  }
}

/** Le relais d'UN bouton : clic, miroir, peinture ; rend son propre démontage. */
function relay(copy: HTMLElement, live: HTMLElement, started: Set<HTMLMediaElement>): () => void {
  copy.style.pointerEvents = 'auto';
  const media = mediaOf(live);
  let frame = 0;
  const loop = () => {
    if (!(media instanceof HTMLVideoElement) || media.paused) return;
    paint(media, copy);
    frame = requestAnimationFrame(loop);
  };
  const onClick = (event: Event) => {
    event.stopPropagation();
    if (media !== null && media.paused) started.add(media);
    live.click();
  };
  copy.addEventListener('click', onClick);
  media?.addEventListener('play', loop);
  const observer = new MutationObserver(() => mirror(live, copy));
  const liveZone = live.closest(ZONE_SELECTOR) ?? live;
  observer.observe(liveZone, { attributes: true, childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    copy.removeEventListener('click', onClick);
    media?.removeEventListener('play', loop);
  };
}

/** Arme la lecture dans le clone ; `null` quand aucune pièce ne se lit — le clone reste une image. */
export function armPreviewPlayback(clone: HTMLElement, options: { readonly source: HTMLElement }): PreviewPlayback | null {
  const pairs = previewPlayControls(clone)
    .map((copy) => ({ copy, live: liveTwin(copy, options.source) }))
    .filter((pair): pair is { copy: HTMLElement; live: HTMLElement } => pair.live !== null);
  if (pairs.length === 0) return null;
  const controls = pairs.map((pair) => pair.copy);
  inertAllBut(clone, controls);
  const started = new Set<HTMLMediaElement>();
  const teardowns = pairs.map((pair) => relay(pair.copy, pair.live, started));
  return {
    controls,
    dispose: () => {
      teardowns.forEach((teardown) => teardown());
      started.forEach((media) => {
        if (!media.paused) media.pause();
      });
    },
  };
}

export type PreviewTabTarget = { readonly kind: 'control'; readonly index: number } | { readonly kind: 'roving' } | { readonly kind: 'step' };

/**
 * LE CLAVIER ATTEINT LE BOUTON DE LECTURE — le menu piège Tab dans son
 * parcours (`message-menu.tsx`) ; les boutons de l'aperçu s'y insèrent AVANT
 * la première entrée : Tab depuis la dernière entrée y mène, Tab depuis le
 * dernier bouton rend la main au menu.
 */
export function previewTabTarget(input: {
  readonly controlCount: number;
  readonly focusedControl: number | null;
  readonly rovingIndex: number;
  readonly itemCount: number;
  readonly backwards: boolean;
}): PreviewTabTarget {
  const { controlCount, focusedControl, rovingIndex, itemCount, backwards } = input;
  if (controlCount === 0) return { kind: 'step' };
  if (focusedControl !== null) {
    const next = focusedControl + (backwards ? -1 : 1);
    return next >= 0 && next < controlCount ? { kind: 'control', index: next } : { kind: 'roving' };
  }
  if (!backwards && rovingIndex === itemCount - 1) return { kind: 'control', index: 0 };
  if (backwards && rovingIndex === 0) return { kind: 'control', index: controlCount - 1 };
  return { kind: 'step' };
}
