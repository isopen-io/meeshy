import { appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

/**
 * **UN VOCAL TENU HORS DE L'ÉCRAN** (#9257) — Chrome Android tient la lecture
 * d'un `<audio>` en arrière-plan, iOS a son mode d'arrière-plan `audio`. Dans
 * la coque Android, rien ne la tenait : quitter l'app laissait Android geler
 * le processus mis en cache, et le vocal s'arrêtait au milieu d'une phrase.
 * La coque démarre donc un service au premier plan de type `mediaPlayback`
 * (`MeeshyPlaybackPlugin`) tant qu'un `<audio>` de la page joue.
 *
 * Seul l'AUDIO est tenu : une vidéo, un réel ou une story se mettent déjà en
 * pause quand la page est masquée (`use-reel-playback.ts`,
 * `use-story-hidden-tab-pause.ts`), comme dans Chrome Android.
 *
 * Et seul l'audio qui S'ENTEND (#9324) : un réel ou un audio de scène muet
 * n'affiche pas « Lecture audio en cours », comme Chrome Android n'ouvre
 * aucune notification média pour un média muet. Couper le son en cours de
 * lecture rend la prise, le rendre la reprend.
 *
 * La notification de la coque porte une « Pause » (#9301), comme la
 * notification média de Chrome Android : la coque la remet à la page
 * (`pauseRequested`), qui met en pause chaque `<audio>` qui joue.
 *
 * Et cette pause GARE la lecture au lieu de la rendre (#9394), comme Chrome
 * garde son lecteur affiché : la notification offre alors « Lecture », que la
 * coque remet à la page (`playRequested`), qui relance les vocaux garés. Une
 * pause faite dans l'app rend la lecture, comme avant ; une coque construite
 * avant `parkPlayback` la rend aussi.
 *
 * Un navigateur, ou une coque construite avant le plugin, reçoit une prise
 * sans effet ; un refus de la coque ne remonte jamais à la lecture.
 */
export type PlaybackHold = {
  readonly hold: () => void;
  readonly release: () => void;
  readonly park: () => void;
  readonly onPauseRequested: (listener: () => void) => () => void;
  readonly onPlayRequested: (listener: () => void) => () => void;
};

const PLUGIN = 'MeeshyPlayback';

function geste(coque: CoqueNative | undefined, methode: string): () => void {
  const appel = appelNatifMethode(coque, PLUGIN, methode);
  if (appel === null) return () => {};
  return () => {
    appel({}).catch(() => {});
  };
}

function ecoute(coque: CoqueNative | undefined, evenement: string): PlaybackHold['onPauseRequested'] {
  const declare = coque?.PluginHeaders?.some((header) => header.name === PLUGIN) === true;
  const addListener = coque?.addListener;
  if (!declare || typeof addListener !== 'function') return () => () => {};
  return (listener) => {
    const handle = addListener(PLUGIN, evenement, () => listener());
    return () => {
      void handle.remove().catch(() => {});
    };
  };
}

export function shellPlaybackHold(coque: CoqueNative | undefined = coqueCourante()): PlaybackHold {
  const release = geste(coque, 'releasePlayback');
  const garable = appelNatifMethode(coque, PLUGIN, 'parkPlayback') !== null;
  return {
    hold: geste(coque, 'holdPlayback'),
    release,
    park: garable ? geste(coque, 'parkPlayback') : release,
    onPauseRequested: ecoute(coque, 'pauseRequested'),
    onPlayRequested: ecoute(coque, 'playRequested'),
  };
}

type MediaEvents = Pick<Document, 'addEventListener' | 'removeEventListener'>;

const STOPS = ['pause', 'ended', 'error', 'emptied'] as const;

/**
 * Les événements d'un média ne remontent pas : l'écoute se fait en CAPTURE,
 * au document, pour tous les `<audio>` de la page à la fois. La lecture est
 * tenue dès qu'un audio joue, rendue quand le DERNIER s'arrête.
 *
 * Un flux en direct (`srcObject`, le son d'un pair pendant un appel) n'est
 * jamais une lecture : Chrome Android ne lui ouvre aucune notification média,
 * et la coque tient déjà l'appel par son propre service (#9455).
 */
export function holdWhileAudioPlays(target: MediaEvents, hold: PlaybackHold): () => void {
  const playing = new Set<HTMLAudioElement>();
  const parking = new Set<HTMLAudioElement>();
  const parked = new Set<HTMLAudioElement>();
  const audioOf = (event: Event): HTMLAudioElement | null =>
    event.target instanceof HTMLAudioElement && event.target.srcObject == null ? event.target : null;
  const settle = (): void => {
    if (playing.size > 0) return;
    if (parked.size > 0) hold.park();
    else hold.release();
  };
  const take = (audio: HTMLAudioElement): void => {
    if (audio.muted || playing.has(audio)) return;
    parked.clear();
    parking.clear();
    playing.add(audio);
    if (playing.size === 1) hold.hold();
  };
  const drop = (audio: HTMLAudioElement, type: string): void => {
    const parks = type === 'pause' && parking.delete(audio);
    if (parks) parked.add(audio);
    if (playing.delete(audio)) {
      settle();
      return;
    }
    if (parked.delete(audio) && parked.size === 0) settle();
  };
  const onPlaying = (event: Event): void => {
    const audio = audioOf(event);
    if (audio !== null) take(audio);
  };
  const onStop = (event: Event): void => {
    const audio = audioOf(event);
    if (audio !== null) drop(audio, event.type);
  };
  const onVolume = (event: Event): void => {
    const audio = audioOf(event);
    if (audio === null) return;
    if (audio.muted) drop(audio, event.type);
    else if (!audio.paused && !audio.ended) take(audio);
  };
  const resume = (): void => {
    if (parked.size === 0) {
      hold.release();
      return;
    }
    for (const audio of [...parked]) {
      void audio.play().catch(() => {
        if (parked.delete(audio) && parked.size === 0) settle();
      });
    }
  };
  target.addEventListener('playing', onPlaying, true);
  target.addEventListener('volumechange', onVolume, true);
  for (const type of STOPS) target.addEventListener(type, onStop, true);
  const stopPauseRequests = hold.onPauseRequested(() => {
    for (const audio of [...playing]) parking.add(audio);
    for (const audio of [...playing]) audio.pause();
  });
  const stopPlayRequests = hold.onPlayRequested(resume);
  return () => {
    stopPauseRequests();
    stopPlayRequests();
    target.removeEventListener('playing', onPlaying, true);
    target.removeEventListener('volumechange', onVolume, true);
    for (const type of STOPS) target.removeEventListener(type, onStop, true);
    if (playing.size > 0 || parked.size > 0) hold.release();
    playing.clear();
    parking.clear();
    parked.clear();
  };
}
