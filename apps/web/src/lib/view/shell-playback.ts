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
 * Un navigateur, ou une coque construite avant le plugin, reçoit une prise
 * sans effet ; un refus de la coque ne remonte jamais à la lecture.
 */
export type PlaybackHold = {
  readonly hold: () => void;
  readonly release: () => void;
};

const PLUGIN = 'MeeshyPlayback';

function geste(coque: CoqueNative | undefined, methode: string): () => void {
  const appel = appelNatifMethode(coque, PLUGIN, methode);
  if (appel === null) return () => {};
  return () => {
    appel({}).catch(() => {});
  };
}

export function shellPlaybackHold(coque: CoqueNative | undefined = coqueCourante()): PlaybackHold {
  return { hold: geste(coque, 'holdPlayback'), release: geste(coque, 'releasePlayback') };
}

type MediaEvents = Pick<Document, 'addEventListener' | 'removeEventListener'>;

const STOPS = ['pause', 'ended', 'error', 'emptied'] as const;

/**
 * Les événements d'un média ne remontent pas : l'écoute se fait en CAPTURE,
 * au document, pour tous les `<audio>` de la page à la fois. La lecture est
 * tenue dès qu'un audio joue, rendue quand le DERNIER s'arrête.
 */
export function holdWhileAudioPlays(target: MediaEvents, hold: PlaybackHold): () => void {
  const playing = new Set<EventTarget>();
  const audioOf = (event: Event): EventTarget | null =>
    event.target instanceof HTMLAudioElement ? event.target : null;
  const onPlaying = (event: Event): void => {
    const audio = audioOf(event);
    if (audio === null || playing.has(audio)) return;
    playing.add(audio);
    if (playing.size === 1) hold.hold();
  };
  const onStop = (event: Event): void => {
    const audio = audioOf(event);
    if (audio === null || !playing.delete(audio)) return;
    if (playing.size === 0) hold.release();
  };
  target.addEventListener('playing', onPlaying, true);
  for (const type of STOPS) target.addEventListener(type, onStop, true);
  return () => {
    target.removeEventListener('playing', onPlaying, true);
    for (const type of STOPS) target.removeEventListener(type, onStop, true);
    if (playing.size > 0) hold.release();
    playing.clear();
  };
}
