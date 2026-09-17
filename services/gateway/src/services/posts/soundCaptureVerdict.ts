import type { CaptureTrack, SoundCaptureService } from './SoundCaptureService';
import { soundLibraryEnabled } from './SoundCaptureService';
import { feedsSoundLibrary } from './soundEligibility';

/**
 * Le sort de CHAQUE piste soumise à `POST /posts` / `PUT .../posts/:id`,
 * connu SANS attendre `SoundCaptureService.captureSounds` — qui reste
 * fire-and-forget (« publier ne dépend jamais de la bibliothèque »,
 * SoundCaptureService.ts). L'éligibilité (`feedsSoundLibrary`) et la présence
 * d'une référence structurelle (`postMediaId` ou `soundId`) sont connues
 * AVANT même l'appel — rien de plus n'est nécessaire pour distinguer
 * « soumis au pipeline » de « écarté d'emblée ».
 *
 * Ne dit RIEN du résultat de la capture elle-même (dédoublonnage par hash,
 * extraction ffmpeg, écriture `Sound`/`SoundUsage`) : ce résultat est
 * asynchrone et le chemin nominal ne l'attend pas. #6603.
 */
export interface SoundCaptureTrackVerdict {
  trackId: string;
  /** La piste a-t-elle été transmise au pipeline de capture (pas son issue) ? */
  submitted: boolean;
}

export interface SoundCaptureVerdict {
  /** Le contenu alimente-t-il la bibliothèque (`feedsSoundLibrary`) ? */
  eligible: boolean;
  tracks: SoundCaptureTrackVerdict[];
}

export function soundCaptureVerdict(input: {
  feedsLibrary: boolean;
  tracks: readonly Pick<CaptureTrack, 'trackId' | 'postMediaId' | 'soundId'>[];
}): SoundCaptureVerdict {
  // `eligible` reflète la règle de CONTENU (`feedsSoundLibrary` — visibilité,
  // repost) : elle a un sens même quand le feature-flag ci-dessous est éteint.
  // `submitted`, lui, dit si la piste a RÉELLEMENT été transmise au pipeline —
  // faux dès que la bibliothèque est désactivée, quelle que soit l'éligibilité.
  const enabled = input.feedsLibrary && soundLibraryEnabled();
  return {
    eligible: input.feedsLibrary,
    tracks: input.tracks.map((track) => ({
      trackId: track.trackId,
      submitted: enabled && Boolean(track.postMediaId || track.soundId),
    })),
  };
}

/**
 * Le trio « éligibilité → capture fire-and-forget → verdict synchrone »,
 * IDENTIQUE à la création et à l'édition (`PostService.createPost` /
 * `updatePost`) — les deux sites le recopiaient (#6603 les a fait diverger un
 * instant : la seconde copie avait failli oublier le verdict). Extrait plutôt
 * qu'ajouté en ligne dans `PostService.ts`, déjà hors du budget de taille du
 * dépôt (1000–1200 lignes) — l'y faire grossir encore est interdit.
 */
export function orchestrateSoundCapture(input: {
  postId: string;
  authorId: string;
  visibility: Parameters<typeof feedsSoundLibrary>[0]['visibility'];
  repostOfId?: string | null;
  tracks: CaptureTrack[];
  soundCaptureService: SoundCaptureService;
  onError: (error: unknown) => void;
}): SoundCaptureVerdict {
  const feedsLibrary = feedsSoundLibrary({ visibility: input.visibility, repostOfId: input.repostOfId });
  input.soundCaptureService.captureSounds({
    postId: input.postId,
    authorId: input.authorId,
    feedsLibrary,
    tracks: input.tracks,
  }).catch(input.onError);
  return soundCaptureVerdict({ feedsLibrary, tracks: input.tracks });
}
