import { acquireCamera } from './call-media';
import type { AcceptOptions } from './engine';

/**
 * **MA CAMÉRA PENDANT QU'UN APPEL VIDÉO SONNE** (#16944, vue P17) — avant de
 * décrocher, je vois ce que l'autre verra, et je choisis : micro, caméra.
 * L'aperçu ne s'ouvre que si la caméra est DÉJÀ autorisée — la sonnerie ne
 * pose jamais la question du navigateur ; sinon la vignette ne paraît pas, et
 * la demande viendra au décroché, comme avant.
 */

type Stoppable = { readonly stop: () => void };
type PreviewStream = { readonly getTracks: () => readonly Stoppable[] };

export type SelfPreviewDeps<S extends PreviewStream> = {
  /** La caméra est-elle déjà autorisée ? Ne demande jamais rien. */
  readonly granted: () => Promise<boolean>;
  readonly open: () => Promise<S>;
};

const stopAll = (stream: PreviewStream): void => {
  for (const track of stream.getTracks()) track.stop();
};

/** Ouvre l'aperçu si la caméra est autorisée ; rend ce qui le ferme, même s'il arrive après. */
export function startSelfPreview<S extends PreviewStream>(deps: SelfPreviewDeps<S>, onStream: (stream: S | null) => void): () => void {
  const state: { alive: boolean; stream: S | null } = { alive: true, stream: null };
  void deps
    .granted()
    .then((granted) => (granted && state.alive ? deps.open() : null))
    .then(
      (stream) => {
        if (stream === null) return;
        if (!state.alive) return stopAll(stream);
        state.stream = stream;
        onStream(stream);
      },
      () => undefined,
    );
  return () => {
    state.alive = false;
    if (state.stream === null) return;
    stopAll(state.stream);
    state.stream = null;
    onStream(null);
  };
}

const cameraGranted = async (): Promise<boolean> => {
  try {
    const status = await navigator.permissions?.query({ name: 'camera' });
    return status?.state === 'granted';
  } catch {
    return false;
  }
};

export const browserSelfPreview: SelfPreviewDeps<MediaStream> = {
  granted: cameraGranted,
  open: async () => new MediaStream([await acquireCamera({ facing: 'user' })]),
};

export type IncomingChoice = { readonly micOn: boolean; readonly cameraOn: boolean };

export type IncomingConsentKey = 'callControls.incoming.seenBy' | 'callControls.incoming.seenMuted' | 'callControls.incoming.heardBy' | 'callControls.incoming.silent';

/** Ma caméra filme vraiment : une piste vidéo VIVANTE est ouverte. Choisie ne suffit pas — tant qu'elle démarre, ou si elle est refusée, rien ne promet une image. */
export const hasLiveVideo = (stream: { readonly getVideoTracks: () => readonly { readonly readyState: string }[] } | null): boolean => stream?.getVideoTracks().some((track) => track.readyState === 'live') === true;

/** Ce que la barre promet (P17.7, `IncomingPreAnswer.Exposure` d'iOS) : ce que l'autre recevra de moi en décrochant, selon ma caméra `filming` et mon micro. */
export function incomingConsentKey(choice: IncomingChoice, filming: boolean): IncomingConsentKey {
  const seen = choice.cameraOn && filming;
  if (seen) return choice.micOn ? 'callControls.incoming.seenBy' : 'callControls.incoming.seenMuted';
  return choice.micOn ? 'callControls.incoming.heardBy' : 'callControls.incoming.silent';
}

/** Décrocher tient la promesse de la barre. */
export function incomingAcceptOptions(choice: IncomingChoice): Required<AcceptOptions> {
  return { audioOnly: !choice.cameraOn, micMuted: !choice.micOn };
}

/** Le prénom de l'appelant, pour la barre (« Awa vous verra… ») : le premier mot de son nom. */
export function callerFirstName(title: string): string {
  return title.trim().split(/\s+/u)[0] ?? '';
}
