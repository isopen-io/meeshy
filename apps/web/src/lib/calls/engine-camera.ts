import { facingOf, mediaFailureOf, type Facing, type MediaFailure } from './call-media';
import { isCallLive, type ActiveCall } from './call-store';

/**
 * **LES GESTES DE MA CAMÉRA** (#8735, #9094, #9095) — Caméra, Retourner et le
 * choix d'une caméra, comme `CallManager.toggleVideo` sur iOS : l'écran suit
 * le geste AVANT que la caméra ne réponde, et c'est la DERNIÈRE intention qui
 * gagne. Un geste pendant qu'une caméra s'ouvre n'est jamais perdu : il
 * attend, remplace toute intention encore en attente, et s'applique quand
 * l'ouverture en cours se termine. Une caméra qui ne s'ouvre pas se DIT (le
 * mot de l'écran d'appel), en plus du retour arrière.
 *
 * Le miroir de l'aperçu suit la caméra réellement ouverte (`facingOf`) : une
 * webcam qui ignore `facingMode` reste la caméra de l'utilisateur.
 */

type Intent = { readonly kind: 'on' } | { readonly kind: 'off' } | { readonly kind: 'facing'; readonly facing: Facing } | { readonly kind: 'device'; readonly deviceId: string };

type Opened = { readonly track: MediaStreamTrack } | { readonly failure: MediaFailure };

export type EngineCameraDeps = {
  readonly read: () => ActiveCall | null;
  readonly write: (call: ActiveCall) => void;
  readonly update: (fn: (call: ActiveCall) => ActiveCall) => void;
  readonly stream: () => MediaStream | null;
  readonly acquireCamera: (facing: Facing) => Promise<MediaStreamTrack>;
  readonly acquireCameraDevice: (deviceId: string) => Promise<MediaStreamTrack>;
  readonly setCamera: (track: MediaStreamTrack | null, cameraOn?: boolean) => Promise<void>;
  readonly announce: (enabled: boolean) => void;
  readonly failed: (failure: MediaFailure) => void;
  /** La caméra choisie a répondu : elle devient celle qu'on rouvre (`call-devices.ts`, #8046). */
  readonly remember: (deviceId: string) => void;
};

export type EngineCamera = {
  readonly toggleCamera: () => Promise<void>;
  readonly switchCamera: () => Promise<void>;
  readonly selectCamera: (deviceId: string) => Promise<void>;
};

export function createEngineCamera(deps: EngineCameraDeps): EngineCamera {
  let pending: Intent | null = null;
  let draining: Promise<void> | null = null;
  let settled: Facing = 'user';

  const sending = (stream: MediaStream): boolean => stream.getVideoTracks().length > 0;

  const open = async (stream: MediaStream, acquire: () => Promise<MediaStreamTrack>): Promise<Opened | null> => {
    const opened = await acquire().then(
      (track): Opened => ({ track }),
      (error: unknown): Opened => ({ failure: mediaFailureOf(error) }),
    );
    if ('track' in opened && deps.stream() !== stream) {
      opened.track.stop();
      return null;
    }
    return deps.stream() === stream ? opened : null;
  };

  const show = (patch: Partial<Pick<ActiveCall, 'cameraOn' | 'facing'>>): void => {
    if (pending === null) deps.update((call) => ({ ...call, ...patch }));
  };

  const turnOn = async (stream: MediaStream): Promise<void> => {
    if (sending(stream)) return show({ cameraOn: true });
    const opened = await open(stream, () => deps.acquireCamera(settled));
    if (opened === null) return;
    if (!('track' in opened)) {
      if (pending !== null) return;
      show({ cameraOn: false });
      deps.failed(opened.failure);
      return;
    }
    if (pending?.kind === 'off') {
      opened.track.stop();
      return;
    }
    settled = facingOf(opened.track, settled);
    await deps.setCamera(opened.track);
    deps.update((call) => ({ ...call, ...(call.media === 'audio' ? { media: 'video' as const } : {}), ...(pending === null ? { facing: settled } : {}) }));
    deps.announce(true);
  };

  const turnOff = async (stream: MediaStream): Promise<void> => {
    if (!sending(stream)) return show({ cameraOn: false });
    await deps.setCamera(null);
    deps.announce(false);
  };

  const releaseThenOpen = async (stream: MediaStream, acquire: () => Promise<MediaStreamTrack>): Promise<Opened | null> => {
    await deps.setCamera(null, true);
    return open(stream, acquire);
  };

  const use = async (track: MediaStreamTrack, fallback: Facing): Promise<void> => {
    settled = facingOf(track, fallback);
    await deps.setCamera(track);
    show({ facing: settled });
  };

  /**
   * L'autre caméra, ouverte d'abord à côté de celle qui tourne ; un appareil
   * qui n'en ouvre qu'une à la fois la refuse — la caméra en cours est alors
   * relâchée, puis l'autre rouverte. Si elle ne vient pas, celle d'avant
   * revient (et l'écran avec elle) ; sans aucune, la caméra s'éteint et le
   * pair l'apprend.
   */
  const replace = async (stream: MediaStream, acquire: () => Promise<MediaStreamTrack>, fallback: Facing): Promise<boolean> => {
    const beside = await open(stream, acquire);
    if (beside === null) return false;
    const opened = 'track' in beside ? beside : await releaseThenOpen(stream, acquire);
    if (opened === null) return false;
    if ('track' in opened) {
      await use(opened.track, fallback);
      return true;
    }
    deps.failed(opened.failure);
    const previous = await open(stream, () => deps.acquireCamera(settled));
    if (previous === null) return false;
    if ('track' in previous) {
      await use(previous.track, settled);
      return false;
    }
    await deps.setCamera(null);
    deps.update((call) => ({ ...call, facing: settled }));
    deps.announce(false);
    return false;
  };

  const apply = async (intent: Intent): Promise<void> => {
    const call = deps.read();
    const stream = deps.stream();
    if (call === null || stream === null) return;
    if (intent.kind === 'on') return turnOn(stream);
    if (intent.kind === 'off') return turnOff(stream);
    if (!sending(stream) || call.screenSharing) return;
    if (intent.kind === 'facing') {
      if (intent.facing === settled) return show({ facing: settled });
      await replace(stream, () => deps.acquireCamera(intent.facing), intent.facing);
      return;
    }
    const chosen = await replace(stream, () => deps.acquireCameraDevice(intent.deviceId), 'user');
    if (chosen) deps.remember(intent.deviceId);
  };

  const drain = async (): Promise<void> => {
    while (pending !== null) {
      const next = pending;
      pending = null;
      await apply(next);
    }
    draining = null;
  };

  const enqueue = (intent: Intent, base: Facing): Promise<void> => {
    pending = intent;
    if (draining !== null) return draining;
    settled = base;
    draining = drain();
    return draining;
  };

  const usable = (call: ActiveCall | null): call is ActiveCall => call !== null && deps.stream() !== null && isCallLive(call) && call.phase.kind !== 'incoming' && !call.screenSharing;

  return {
    toggleCamera: () => {
      const call = deps.read();
      if (!usable(call)) return draining ?? Promise.resolve();
      const on = !call.cameraOn;
      deps.write({ ...call, cameraOn: on });
      return enqueue({ kind: on ? 'on' : 'off' }, call.facing);
    },
    switchCamera: () => {
      const call = deps.read();
      if (!usable(call) || !call.cameraOn) return draining ?? Promise.resolve();
      const facing: Facing = call.facing === 'user' ? 'environment' : 'user';
      deps.write({ ...call, facing });
      return enqueue({ kind: 'facing', facing }, call.facing);
    },
    selectCamera: (deviceId) => {
      const call = deps.read();
      if (!usable(call) || !call.cameraOn) return draining ?? Promise.resolve();
      return enqueue({ kind: 'device', deviceId }, call.facing);
    },
  };
}
