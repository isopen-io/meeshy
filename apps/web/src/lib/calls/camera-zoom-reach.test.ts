import { describe, expect, test } from 'bun:test';

import { mineInMenu, selfControlsPlace, zoomControlIn } from './call-self-controls';
import { LOCAL_ZOOM_RANGE, nextZoomStop, zoomStops } from './camera-zoom';
import { acquireRearCamera, rearCameraOf, rearVideoConstraints, widestRearCamera } from './rear-camera';
import { localZoomFor, selfZoomStore, setLocalZoom } from './self-zoom';

/**
 * LE ZOOM SUR LES DEUX CAMÉRAS (#8441) — le zoom de l'appareil quand la piste
 * le propose, sinon un zoom NUMÉRIQUE de mon seul aperçu, jamais envoyé ; un
 * cran « 1× · 2× · … » sur ma vignette ; et, sur la caméra arrière, l'objectif
 * qui zoome le plus loin.
 */

describe('le zoom numérique de mon aperçu', () => {
  test('borné de 1× à 3× : un recadrage au-delà ne montrerait plus rien de net', () => {
    expect(LOCAL_ZOOM_RANGE).toEqual({ min: 1, max: 3, step: 0.1 });
  });

  test('retenu pour l’appel ET la caméra : se retourner repart de 1×', () => {
    setLocalZoom('call-1', 'user', 2);
    expect(localZoomFor(selfZoomStore.getState(), 'call-1', 'user')).toBe(2);
    expect(localZoomFor(selfZoomStore.getState(), 'call-1', 'environment')).toBe(1);
    expect(localZoomFor(selfZoomStore.getState(), 'call-2', 'user')).toBe(1);
  });
});

describe('les crans de ma vignette', () => {
  test('1×, 2×, 5× dans la plage de l’appareil, et son maximum quand il est plus court', () => {
    expect(zoomStops({ min: 1, max: 10, step: 0.1 })).toEqual([1, 2, 5]);
    expect(zoomStops({ min: 1, max: 3, step: 0.1 })).toEqual([1, 2, 3]);
    expect(zoomStops({ min: 0.5, max: 8, step: 0.1 })).toEqual([0.5, 1, 2, 5]);
  });

  test('un toucher passe au cran suivant, et le dernier revient au premier', () => {
    const range = { min: 1, max: 10, step: 0.1 };
    expect(nextZoomStop(range, 1)).toBe(2);
    expect(nextZoomStop(range, 1.4)).toBe(2);
    expect(nextZoomStop(range, 2)).toBe(5);
    expect(nextZoomStop(range, 5)).toBe(1);
    expect(nextZoomStop(range, 7)).toBe(1);
  });
});

describe('où vit le zoom', () => {
  test('un cran dans ma vignette, la capsule quand mon image remplit l’écran, rien dans le (…)', () => {
    expect(zoomControlIn(selfControlsPlace({ layout: 'video-duo', selfFull: false, selfTileShown: true }))).toBe('step');
    expect(zoomControlIn(selfControlsPlace({ layout: 'video-duo', selfFull: true, selfTileShown: true }))).toBe('capsule');
    expect(zoomControlIn(selfControlsPlace({ layout: 'grid', selfFull: false, selfTileShown: true }))).toBeNull();
    expect(mineInMenu({ mine: ['flip'], call: [] }, 'tile').mine).toEqual([]);
  });
});

describe('la caméra arrière qui zoome le plus loin', () => {
  test('parmi les caméras arrière, celle dont le zoom va le plus loin', () => {
    expect(
      widestRearCamera([
        { deviceId: 'front', facing: 'user', zoomMax: 10 },
        { deviceId: 'wide', facing: 'environment', zoomMax: 2 },
        { deviceId: 'tele', facing: 'environment', zoomMax: 10 },
      ]),
    ).toBe('tele');
  });

  test('rien de connu (permission pas encore donnée, capacités muettes) : le navigateur choisit', () => {
    expect(widestRearCamera([{ deviceId: 'a', facing: 'environment', zoomMax: null }])).toBeNull();
    expect(widestRearCamera([])).toBeNull();
  });

  test('lue dans l’énumération des appareils, par leurs capacités', async () => {
    const device = (deviceId: string, capabilities: unknown) => ({ kind: 'videoinput', deviceId, getCapabilities: () => capabilities });
    const devices = {
      enumerateDevices: async () =>
        [
          device('front', { facingMode: ['user'], zoom: { min: 1, max: 4 } }),
          device('main', { facingMode: ['environment'], zoom: { min: 1, max: 8 } }),
          { kind: 'audioinput', deviceId: 'mic' },
          device('wide', { facingMode: ['environment'] }),
        ] as unknown as MediaDeviceInfo[],
    };
    expect(await rearCameraOf(devices)).toBe('main');
    expect(await rearCameraOf({ enumerateDevices: async () => Promise.reject(new Error('no')) })).toBeNull();
  });

  test('la caméra choisie est demandée par son identifiant, sans contredire son orientation', () => {
    expect(rearVideoConstraints('tele')).toMatchObject({ deviceId: { ideal: 'tele' } });
    expect('facingMode' in rearVideoConstraints('tele')).toBe(false);
    expect(rearVideoConstraints(null)).toMatchObject({ facingMode: 'environment' });
  });

  test('se retourner vers l’arrière ouvre cette caméra-là', async () => {
    const asked: MediaStreamConstraints[] = [];
    const track = { kind: 'video' } as MediaStreamTrack;
    const mediaDevices = {
      enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'tele', getCapabilities: () => ({ facingMode: ['environment'], zoom: { min: 1, max: 10 } }) }] as unknown as MediaDeviceInfo[],
      getUserMedia: async (constraints?: MediaStreamConstraints) => {
        asked.push(constraints ?? {});
        return { getVideoTracks: () => [track] } as unknown as MediaStream;
      },
    };
    expect(await acquireRearCamera({ mediaDevices })).toBe(track);
    expect(asked[0]?.video).toMatchObject({ deviceId: { ideal: 'tele' } });
  });
});
