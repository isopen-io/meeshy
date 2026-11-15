/**
 * UN MÉDIA QUI ATTEND SES OCTETS (#9277, #6925) — miroir du signal
 * `onPlaybackProgressing` d'iOS (`StoryViewerView+Canvas.swift`) : le
 * `<video>`/`<audio>` VEUT lire (ni en pause, ni fini, ni en erreur) et n'a pas
 * de quoi avancer (`readyState < HAVE_FUTURE_DATA`). C'est l'état que produit
 * un réseau lent ou un décodeur lent — un ancien Android —, et le seul où la
 * scène doit l'attendre plutôt que de courir devant lui.
 */
export type MediaStallProbe = {
  readonly paused: boolean;
  readonly ended: boolean;
  readonly readyState: number;
  readonly error: unknown;
};

const HAVE_FUTURE_DATA = 3;

export function isMediaStalled(media: MediaStallProbe): boolean {
  return !media.paused && !media.ended && media.error === null && media.readyState < HAVE_FUTURE_DATA;
}

/** Les évènements après lesquels l'état peut avoir changé — `waiting` l'ouvre,
 * `playing`/`canplay` le ferment, pause, fin, erreur et source vidée le
 * rendent sans objet. */
const STALL_EVENTS = ['waiting', 'playing', 'canplay', 'canplaythrough', 'loadeddata', 'play', 'pause', 'seeked', 'ended', 'error', 'emptied'] as const;

/**
 * Écoute un élément et annonce chaque CHANGEMENT de son état de buffer. Le
 * détacher annonce la fin d'un buffer en cours : un élément démonté ne doit
 * jamais tenir la scène à sa place.
 */
export function watchMediaStall(element: EventTarget & MediaStallProbe, onChange: (stalled: boolean) => void): () => void {
  let stalled = false;
  const update = () => {
    const now = isMediaStalled(element);
    if (now === stalled) return;
    stalled = now;
    onChange(now);
  };
  for (const name of STALL_EVENTS) element.addEventListener(name, update);
  update();
  return () => {
    for (const name of STALL_EVENTS) element.removeEventListener(name, update);
    if (stalled) {
      stalled = false;
      onChange(false);
    }
  };
}
