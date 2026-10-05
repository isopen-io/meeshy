import { describe, expect, test } from 'bun:test';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { DIRECT, flush, harness, PEER, track, type FakeLink, type FakeTrack } from '@/test-support/call-engine-harness';

/**
 * LA CAMÉRA RÉPOND AU PREMIER TOUCHER (#8735) — couper, allumer ou retourner
 * la caméra attendait `getUserMedia`, les effets et chaque lien avant que
 * l'écran ne bouge : rien ne changeait pendant des centaines de millisecondes,
 * on touchait encore, et le second geste partait d'un état périmé. L'écran
 * bascule désormais AUSSITÔT ; un geste en vol n'est jamais perdu — la
 * DERNIÈRE intention s'applique quand l'ouverture en cours se termine, comme
 * `CallManager.toggleVideo` sur iOS (#9095) ; un échec rend l'état d'avant et
 * se DIT. Retourner relâche la caméra en cours quand l'appareil
 * ne sait pas en ouvrir deux, et rouvre celle d'avant si l'autre ne vient pas.
 */
describe('la caméra bascule aussitôt, la dernière intention gagne (#8735, #9095)', () => {
  type Pending = { readonly facing: string; readonly resolve: (camera: FakeTrack) => void; readonly reject: (error: Error) => void };

  const deferredCameras = () => {
    const pending: Pending[] = [];
    const acquireCamera = (facing: string) =>
      new Promise<MediaStreamTrack>((resolve, reject) => {
        pending.push({ facing, resolve: (camera) => resolve(camera as unknown as MediaStreamTrack), reject });
      });
    return { pending, acquireCamera };
  };

  const connectedWith = async (acquireCamera: (facing: 'user' | 'environment') => Promise<MediaStreamTrack>, acquireCameraDevice?: (deviceId: string) => Promise<MediaStreamTrack>) => {
    const h = harness({ acquireCamera, ...(acquireCameraDevice === undefined ? {} : { acquireCameraDevice }) });
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-2', userId: PEER, username: 'amina', displayName: 'Amina' } });
    h.linkState(h.links[0] as FakeLink, 'connected');
    return h;
  };

  const videoToggles = (h: Awaited<ReturnType<typeof connectedWith>>) => h.emitted.filter(([event]) => event === CLIENT_EVENTS.CALL_TOGGLE_VIDEO);

  test('allumer : l’écran montre la caméra allumée AVANT que getUserMedia ne réponde', async () => {
    const cameras = deferredCameras();
    const h = await connectedWith(cameras.acquireCamera);
    const first = h.engine.toggleCamera();
    expect(h.call()?.cameraOn).toBe(true);
    const camera = track('video');
    cameras.pending[0]?.resolve(camera);
    await first;
    expect(h.call()?.cameraOn).toBe(true);
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([camera] as unknown as MediaStreamTrack[]);
    expect(videoToggles(h)).toEqual([[CLIENT_EVENTS.CALL_TOGGLE_VIDEO, { callId: 'call-1', enabled: true }]]);
  });

  test('allumer puis couper pendant l’ouverture : la coupure gagne — la caméra ouverte est relâchée, rien n’est annoncé', async () => {
    const cameras = deferredCameras();
    const h = await connectedWith(cameras.acquireCamera);
    const on = h.engine.toggleCamera();
    const off = h.engine.toggleCamera();
    expect(h.call()?.cameraOn).toBe(false);
    expect(cameras.pending).toHaveLength(1);
    const camera = track('video');
    cameras.pending[0]?.resolve(camera);
    await Promise.all([on, off]);
    expect(h.call()?.cameraOn).toBe(false);
    expect(camera.readyState).toBe('ended');
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([]);
    expect(h.call()?.media).toBe('audio');
    expect(videoToggles(h)).toEqual([]);
  });

  test('allumer, couper, rallumer pendant l’ouverture : une seule caméra s’ouvre, et elle reste', async () => {
    const cameras = deferredCameras();
    const h = await connectedWith(cameras.acquireCamera);
    const taps = [h.engine.toggleCamera(), h.engine.toggleCamera(), h.engine.toggleCamera()];
    expect(h.call()?.cameraOn).toBe(true);
    const camera = track('video');
    cameras.pending[0]?.resolve(camera);
    await Promise.all(taps);
    expect(cameras.pending).toHaveLength(1);
    expect(h.call()?.cameraOn).toBe(true);
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([camera] as unknown as MediaStreamTrack[]);
    expect(videoToggles(h)).toEqual([[CLIENT_EVENTS.CALL_TOGGLE_VIDEO, { callId: 'call-1', enabled: true }]]);
  });

  test('allumer : un refus rend l’état d’avant — caméra éteinte, appel vocal, rien d’annoncé — et le DIT', async () => {
    const cameras = deferredCameras();
    const h = await connectedWith(cameras.acquireCamera);
    const pending = h.engine.toggleCamera();
    expect(h.call()?.cameraOn).toBe(true);
    cameras.pending[0]?.reject(new Error('NotAllowedError'));
    await pending;
    expect(h.call()?.cameraOn).toBe(false);
    expect(h.call()?.media).toBe('audio');
    expect(videoToggles(h)).toEqual([]);
    expect(h.notices.getState().notice).toEqual({ kind: 'camera-failed', failure: 'unavailable' });
    const retry = h.engine.toggleCamera();
    expect(cameras.pending).toHaveLength(2);
    cameras.pending[1]?.reject(new Error('NotAllowedError'));
    await retry;
  });

  test('couper : l’écran montre la caméra coupée aussitôt', async () => {
    const h = await connectedWith(async () => track('video') as unknown as MediaStreamTrack);
    await h.engine.toggleCamera();
    const off = h.engine.toggleCamera();
    expect(h.call()?.cameraOn).toBe(false);
    await off;
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([]);
  });

  test('l’appel fini pendant que la caméra s’ouvre : la caméra ouverte trop tard est relâchée', async () => {
    const cameras = deferredCameras();
    const h = await connectedWith(cameras.acquireCamera);
    const pending = h.engine.toggleCamera();
    h.engine.hangup();
    const late = track('video');
    cameras.pending[0]?.resolve(late);
    await pending;
    expect(late.readyState).toBe('ended');
  });

  test('retourner : l’écran se retourne aussitôt ; un second toucher pendant l’ouverture revient à la caméra d’avant', async () => {
    const cameras = deferredCameras();
    const h = await connectedWith(cameras.acquireCamera);
    const on = h.engine.toggleCamera();
    cameras.pending[0]?.resolve(track('video'));
    await on;
    const flip = h.engine.switchCamera();
    expect(h.call()?.facing).toBe('environment');
    const again = h.engine.switchCamera();
    expect(h.call()?.facing).toBe('user');
    expect(cameras.pending).toHaveLength(2);
    cameras.pending[1]?.resolve(track('video'));
    await flush();
    expect(cameras.pending.map((entry) => entry.facing)).toEqual(['user', 'environment', 'user']);
    const front = track('video');
    cameras.pending[2]?.resolve(front);
    await Promise.all([flip, again]);
    expect(h.call()?.facing).toBe('user');
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([front] as unknown as MediaStreamTrack[]);
  });

  test('retourner deux fois puis trois pendant l’ouverture : seule la dernière intention s’applique, sans réouverture inutile', async () => {
    const cameras = deferredCameras();
    const h = await connectedWith(cameras.acquireCamera);
    const on = h.engine.toggleCamera();
    cameras.pending[0]?.resolve(track('video'));
    await on;
    const taps = [h.engine.switchCamera(), h.engine.switchCamera(), h.engine.switchCamera()];
    expect(h.call()?.facing).toBe('environment');
    const rear = track('video');
    cameras.pending[1]?.resolve(rear);
    await Promise.all(taps);
    expect(cameras.pending).toHaveLength(2);
    expect(h.call()?.facing).toBe('environment');
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([rear] as unknown as MediaStreamTrack[]);
  });

  /* Un téléphone qui n'ouvre qu'une caméra à la fois refuse la seconde tant
     que la première tourne : Retourner ne faisait RIEN, à chaque fois. */
  const oneCameraAtATime = () => {
    const opened: Array<{ readonly facing: string; readonly camera: FakeTrack }> = [];
    const refusals: string[] = [];
    const acquireCamera = async (facing: string) => {
      if (opened.some((entry) => entry.camera.readyState === 'live')) {
        refusals.push(facing);
        throw new Error('NotReadableError');
      }
      const camera = track('video');
      opened.push({ facing, camera });
      return camera as unknown as MediaStreamTrack;
    };
    return { opened, refusals, acquireCamera };
  };

  test('retourner sur un appareil qui n’ouvre qu’une caméra : l’ancienne est relâchée, puis l’autre s’ouvre', async () => {
    const device = oneCameraAtATime();
    const h = await connectedWith(device.acquireCamera);
    await h.engine.toggleCamera();
    await h.engine.switchCamera();
    expect(device.refusals).toEqual(['environment']);
    expect(device.opened.map((entry) => [entry.facing, entry.camera.readyState])).toEqual([
      ['user', 'ended'],
      ['environment', 'live'],
    ]);
    expect(h.call()?.facing).toBe('environment');
    expect(h.call()?.cameraOn).toBe(true);
  });

  test('retourner vers une caméra qui ne vient pas : celle d’avant se rouvre, et l’écran revient à elle', async () => {
    const device = oneCameraAtATime();
    const h = await connectedWith((facing) => (facing === 'environment' ? Promise.reject(new Error('NotFoundError')) : device.acquireCamera(facing)));
    await h.engine.toggleCamera();
    await h.engine.switchCamera();
    expect(h.call()?.facing).toBe('user');
    expect(h.call()?.cameraOn).toBe(true);
    expect(h.call()?.localStream?.getVideoTracks()).toHaveLength(1);
    expect(h.call()?.localStream?.getVideoTracks()[0]?.readyState).toBe('live');
    expect(h.notices.getState().notice).toEqual({ kind: 'camera-failed', failure: 'unavailable' });
  });
});

/**
 * CHOISIR SA CAMÉRA (#9094) — sur un ordinateur à plusieurs webcams, la
 * caméra choisie s'ouvre par son identifiant et REMPLACE la piste envoyée
 * (`setVideoTrack`, sans renégociation) ; un refus rouvre celle d'avant. Le
 * miroir suit la caméra réellement ouverte : une webcam qui ne dit pas son
 * orientation est une caméra de l'utilisateur, donc un miroir.
 */
describe('choisir sa caméra par son identifiant (#9094)', () => {
  const facing = (mode: string | undefined): FakeTrack => Object.assign(track('video'), { getSettings: () => (mode === undefined ? {} : { facingMode: mode }) });

  const connected = async (acquireCameraDevice: (deviceId: string) => Promise<MediaStreamTrack>, acquireCamera: (facing: 'user' | 'environment') => Promise<MediaStreamTrack> = async () => facing(undefined) as unknown as MediaStreamTrack) => {
    const h = harness({ acquireCamera, acquireCameraDevice });
    await h.engine.start(DIRECT);
    h.engine.handle(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, { callId: 'call-1', participant: { id: 'p-2', userId: PEER, username: 'amina', displayName: 'Amina' } });
    h.linkState(h.links[0] as FakeLink, 'connected');
    await h.engine.toggleCamera();
    return h;
  };

  test('la caméra choisie s’ouvre par son identifiant, remplace la piste sur chaque lien sans renégocier, et devient la caméra retenue', async () => {
    const asked: string[] = [];
    const chosen = facing(undefined);
    const h = await connected(async (deviceId) => {
      asked.push(deviceId);
      return chosen as unknown as MediaStreamTrack;
    });
    const offers = h.links[0]?.offers;
    await h.engine.selectCamera('cam-2');
    expect(asked).toEqual(['cam-2']);
    expect(h.call()?.localStream?.getVideoTracks()).toEqual([chosen] as unknown as MediaStreamTrack[]);
    expect(h.links[0]?.sent.at(-1)).toBe(chosen);
    expect(h.links[0]?.offers).toBe(offers);
    expect(h.remembered).toEqual(['cam-2']);
  });

  test('une webcam qui ne dit pas son orientation est la caméra de l’utilisateur : l’aperçu reste un miroir', async () => {
    const h = await connected(async () => facing(undefined) as unknown as MediaStreamTrack);
    await h.engine.selectCamera('cam-2');
    expect(h.call()?.facing).toBe('user');
  });

  test('une caméra qui dit regarder le monde n’est pas retournée', async () => {
    const h = await connected(async () => facing('environment') as unknown as MediaStreamTrack);
    await h.engine.selectCamera('cam-2');
    expect(h.call()?.facing).toBe('environment');
  });

  test('retourner vers une webcam qui ignore `facingMode` : l’aperçu suit la caméra ouverte, il reste un miroir', async () => {
    const h = await connected(async () => facing(undefined) as unknown as MediaStreamTrack, async () => facing('user') as unknown as MediaStreamTrack);
    await h.engine.switchCamera();
    expect(h.call()?.facing).toBe('user');
  });

  test('la caméra choisie refusée : celle d’avant revient, le refus se dit, rien n’est retenu', async () => {
    const h = await connected(async () => Promise.reject(Object.assign(new Error('busy'), { name: 'NotReadableError' })));
    await h.engine.selectCamera('cam-2');
    expect(h.call()?.cameraOn).toBe(true);
    expect(h.call()?.localStream?.getVideoTracks()).toHaveLength(1);
    expect(h.call()?.localStream?.getVideoTracks()[0]?.readyState).toBe('live');
    expect(h.notices.getState().notice).toEqual({ kind: 'camera-failed', failure: 'unavailable' });
    expect(h.remembered).toEqual([]);
  });
});
