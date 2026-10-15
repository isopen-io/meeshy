import { appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

import { nowPlayingTagsOf, type NowPlayingTags } from './now-playing';

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
 *
 * La carte de lecture DIT ce qui joue et SE PILOTE (#10624), comme la carte
 * Now Playing d'iOS : la page remet à la coque les faits du vocal (auteur,
 * conversation, date, avatar — `now-playing.ts`), sa durée, sa position et sa
 * vitesse (`update`), aux SEULES ruptures — lecture, pause, saut, vitesse,
 * durée connue —, jamais à chaque `timeupdate` : la coque extrapole la
 * position. La page reste le SEUL moteur : aucun lecteur natif ne relit le
 * fichier. La barre glissée et les ±15 s de la notification reviennent en
 * position visée (`seekRequested`), que la page pose sur l'audio qui joue.
 * Une coque construite avant `nowPlaying` garde sa carte générique.
 */
export type NowPlayingState = NowPlayingTags & {
  /** L'id de la pièce, sinon l'adresse du fichier : la coque n'applique une image qu'à la piste qui l'a demandée. */
  readonly key: string;
  readonly durationMs: number;
  readonly positionMs: number;
  readonly rate: number;
  readonly playing: boolean;
  /** En lecture mais en attente du réseau : la coque fige sa barre au lieu de courir devant le son. */
  readonly buffering: boolean;
  /** Une file déclarée (#10627) arme suivant / précédent ; sans elle, la coque ne les offre pas. */
  readonly canNext: boolean;
  readonly canPrevious: boolean;
};

export type PlaybackHold = {
  readonly hold: () => void;
  readonly release: () => void;
  readonly park: () => void;
  readonly update: (state: NowPlayingState) => void;
  readonly onPauseRequested: (listener: () => void) => () => void;
  readonly onPlayRequested: (listener: () => void) => () => void;
  readonly onSeekRequested: (listener: (positionMs: number) => void) => () => void;
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

function ecouteSauts(coque: CoqueNative | undefined): PlaybackHold['onSeekRequested'] {
  const declare = coque?.PluginHeaders?.some((header) => header.name === PLUGIN) === true;
  const addListener = coque?.addListener;
  if (!declare || typeof addListener !== 'function') return () => () => {};
  return (listener) => {
    const handle = addListener(PLUGIN, 'seekRequested', (donnees) => {
      const positionMs = (donnees as { readonly positionMs?: unknown } | null)?.positionMs;
      if (typeof positionMs === 'number' && Number.isFinite(positionMs)) listener(positionMs);
    });
    return () => {
      void handle.remove().catch(() => {});
    };
  };
}

function description(coque: CoqueNative | undefined): PlaybackHold['update'] {
  const appel = appelNatifMethode(coque, PLUGIN, 'nowPlaying');
  if (appel === null) return () => {};
  return (state) => {
    const remis = Object.fromEntries(Object.entries(state).filter(([, valeur]) => valeur !== null));
    appel(remis).catch(() => {});
  };
}

export function shellPlaybackHold(coque: CoqueNative | undefined = coqueCourante()): PlaybackHold {
  const release = geste(coque, 'releasePlayback');
  const garable = appelNatifMethode(coque, PLUGIN, 'parkPlayback') !== null;
  return {
    hold: geste(coque, 'holdPlayback'),
    release,
    park: garable ? geste(coque, 'parkPlayback') : release,
    update: description(coque),
    onPauseRequested: ecoute(coque, 'pauseRequested'),
    onPlayRequested: ecoute(coque, 'playRequested'),
    onSeekRequested: ecouteSauts(coque),
  };
}

type MediaEvents = Pick<Document, 'addEventListener' | 'removeEventListener'>;

const STOPS = ['pause', 'ended', 'error', 'emptied'] as const;

/** Les ruptures qui changent ce que la carte montre sans changer qui joue — regroupées : un doigt qui parcourt l'onde ne remet qu'un état. */
const RUPTURES = ['seeked', 'ratechange', 'durationchange', 'waiting'] as const;

export type NowPlayingOptions = {
  readonly tagsOf?: (attachmentId: string | undefined) => NowPlayingTags | null;
  readonly settleMs?: number;
};

const HAVE_FUTURE_DATA = 3;

const SANS_ETIQUETTES: NowPlayingTags = { sender: null, conversation: null, sentAtMs: null, artworkUrl: null, protected: false };

const millisecondes = (secondes: number): number => (Number.isFinite(secondes) && secondes > 0 ? Math.round(secondes * 1000) : 0);

function etatDe(audio: HTMLAudioElement, tagsOf: NonNullable<NowPlayingOptions['tagsOf']>): NowPlayingState {
  const attachmentId = audio.dataset.npAttachment;
  return {
    key: attachmentId ?? (audio.currentSrc || audio.src),
    ...(tagsOf(attachmentId) ?? SANS_ETIQUETTES),
    durationMs: millisecondes(audio.duration),
    positionMs: millisecondes(audio.currentTime),
    rate: audio.playbackRate,
    playing: !audio.paused && !audio.ended,
    buffering: !audio.paused && !audio.ended && audio.readyState < HAVE_FUTURE_DATA,
    canNext: false,
    canPrevious: false,
  };
}

/**
 * Les événements d'un média ne remontent pas : l'écoute se fait en CAPTURE,
 * au document, pour tous les `<audio>` de la page à la fois. La lecture est
 * tenue dès qu'un audio joue, rendue quand le DERNIER s'arrête.
 *
 * Un flux en direct (`srcObject`, le son d'un pair pendant un appel) n'est
 * jamais une lecture : Chrome Android ne lui ouvre aucune notification média,
 * et la coque tient déjà l'appel par son propre service (#9455).
 */
export function holdWhileAudioPlays(target: MediaEvents, hold: PlaybackHold, options: NowPlayingOptions = {}): () => void {
  const { tagsOf = nowPlayingTagsOf, settleMs = 200 } = options;
  const playing = new Set<HTMLAudioElement>();
  const parking = new Set<HTMLAudioElement>();
  const parked = new Set<HTMLAudioElement>();
  let current: HTMLAudioElement | null = null;
  let pending: ReturnType<typeof setTimeout> | null = null;
  const cancelPending = (): void => {
    if (pending !== null) clearTimeout(pending);
    pending = null;
  };
  const remettre = (audio: HTMLAudioElement): void => {
    cancelPending();
    hold.update(etatDe(audio, tagsOf));
  };
  const audioOf = (event: Event): HTMLAudioElement | null =>
    event.target instanceof HTMLAudioElement && event.target.srcObject == null ? event.target : null;
  const settle = (): void => {
    if (playing.size > 0) return;
    if (parked.size > 0) {
      hold.park();
      return;
    }
    cancelPending();
    current = null;
    hold.release();
  };
  const take = (audio: HTMLAudioElement): void => {
    if (audio.muted || playing.has(audio)) return;
    parked.clear();
    parking.clear();
    playing.add(audio);
    current = audio;
    if (playing.size === 1) hold.hold();
    remettre(audio);
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
    if (audio === null) return;
    if (audio === current && playing.has(audio)) remettre(audio);
    else take(audio);
  };
  const onStop = (event: Event): void => {
    const audio = audioOf(event);
    if (audio === null) return;
    if (audio === current && event.type === 'pause') remettre(audio);
    drop(audio, event.type);
  };
  const onRupture = (event: Event): void => {
    const audio = audioOf(event);
    if (audio === null || audio !== current) return;
    cancelPending();
    pending = setTimeout(() => remettre(audio), settleMs);
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
  for (const type of RUPTURES) target.addEventListener(type, onRupture, true);
  const stopSeekRequests = hold.onSeekRequested((positionMs) => {
    if (current !== null) current.currentTime = Math.max(0, positionMs) / 1000;
  });
  const stopPauseRequests = hold.onPauseRequested(() => {
    for (const audio of [...playing]) parking.add(audio);
    for (const audio of [...playing]) audio.pause();
  });
  const stopPlayRequests = hold.onPlayRequested(resume);
  return () => {
    stopPauseRequests();
    stopPlayRequests();
    stopSeekRequests();
    cancelPending();
    current = null;
    target.removeEventListener('playing', onPlaying, true);
    target.removeEventListener('volumechange', onVolume, true);
    for (const type of STOPS) target.removeEventListener(type, onStop, true);
    for (const type of RUPTURES) target.removeEventListener(type, onRupture, true);
    if (playing.size > 0 || parked.size > 0) hold.release();
    playing.clear();
    parking.clear();
    parked.clear();
  };
}

/**
 * **LE CASQUE DÉBRANCHÉ MET LA VIDÉO EN PAUSE** (#9985) — Chrome Android met
 * en pause le média qui joue quand un casque se débranche ou se déconnecte ;
 * la WebView de la coque ne le fait pas, et la vidéo repartait sur le
 * haut-parleur. La coque signale le débranchement (`becomingNoisy`) ; un
 * navigateur, ou une coque plus ancienne, n'écoute rien.
 */
export function shellNoisy(coque: CoqueNative | undefined = coqueCourante()): PlaybackHold['onPauseRequested'] {
  return ecoute(coque, 'becomingNoisy');
}

/**
 * Chaque vidéo qui s'entend se met en pause. Les vocaux suivent la « Pause »
 * de la coque (#9946) ; le flux d'un appel (`srcObject`) n'est jamais touché.
 */
export function pauseVideosWhenNoisy(
  root: Pick<ParentNode, 'querySelectorAll'>,
  onNoisy: PlaybackHold['onPauseRequested'],
): () => void {
  return onNoisy(() => {
    for (const video of root.querySelectorAll('video')) {
      if (!video.paused && !video.ended && !video.muted && video.srcObject == null) video.pause();
    }
  });
}
