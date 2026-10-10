import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { pauseVideosWhenNoisy, shellNoisy } from './shell-playback';

/**
 * **DÉBRANCHER LE CASQUE MET LA VIDÉO EN PAUSE, COMME DANS CHROME** (#9985) —
 * Chrome Android écoute `ACTION_AUDIO_BECOMING_NOISY` et met en pause le
 * média qui joue ; la WebView de la coque ne le fait pas, et une vidéo
 * repartait sur le haut-parleur du téléphone. La coque signale le
 * débranchement (`MeeshyPlayback`, `becomingNoisy`) ; la page met en pause
 * chaque vidéo qui s'entend. Les vocaux suivent déjà la voie de la « Pause »
 * (#9946) ; un flux d'appel n'est jamais touché.
 */

beforeAll(() => {
  ensureHappyDomRegistered();
});
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

type Ecoute = { readonly evenement: string; readonly rappel: () => void; retiree: boolean };

function coque(declare: boolean): CoqueNative & { readonly ecoutes: Ecoute[] } {
  const ecoutes: Ecoute[] = [];
  return {
    ecoutes,
    getPlatform: () => 'android',
    PluginHeaders: declare ? [{ name: 'MeeshyPlayback', methods: [{ name: 'holdPlayback' }] }] : [],
    nativePromise: () => Promise.resolve({}),
    addListener: (_plugin, evenement, rappel) => {
      const ecoute: Ecoute = { evenement, rappel: () => rappel({}), retiree: false };
      ecoutes.push(ecoute);
      return {
        remove: async () => {
          ecoute.retiree = true;
        },
      };
    },
  };
}

function debrancheur(): { readonly onNoisy: (ecouteur: () => void) => () => void; readonly debrancher: () => void } {
  const ecouteurs = new Set<() => void>();
  return {
    onNoisy: (ecouteur) => {
      ecouteurs.add(ecouteur);
      return () => {
        ecouteurs.delete(ecouteur);
      };
    },
    debrancher: () => {
      for (const ecouteur of ecouteurs) ecouteur();
    },
  };
}

type Etat = { readonly paused?: boolean; readonly muted?: boolean; readonly ended?: boolean; readonly flux?: boolean };

function media(tag: 'audio' | 'video', etat: Etat): HTMLMediaElement & { readonly pauses: () => number } {
  const element = document.createElement(tag);
  let pauses = 0;
  Object.defineProperty(element, 'paused', { value: etat.paused ?? false });
  Object.defineProperty(element, 'ended', { value: etat.ended ?? false });
  Object.defineProperty(element, 'muted', { value: etat.muted ?? false });
  Object.defineProperty(element, 'srcObject', { value: etat.flux === true ? {} : null });
  element.pause = () => {
    pauses += 1;
  };
  document.body.appendChild(element);
  return Object.assign(element, { pauses: () => pauses });
}

describe('débrancher le casque met en pause la vidéo qui s’entend (#9985)', () => {
  test('une vidéo qui joue avec le son se met en pause', () => {
    const casque = debrancheur();
    const arreter = pauseVideosWhenNoisy(document, casque.onNoisy);
    const video = media('video', {});
    casque.debrancher();
    expect(video.pauses()).toBe(1);
    arreter();
    video.remove();
  });

  test('une vidéo muette, à l’arrêt, finie, ou le flux d’un appel ne sont pas touchés', () => {
    const casque = debrancheur();
    const arreter = pauseVideosWhenNoisy(document, casque.onNoisy);
    const intactes = [
      media('video', { muted: true }),
      media('video', { paused: true }),
      media('video', { ended: true }),
      media('video', { flux: true }),
    ];
    casque.debrancher();
    expect(intactes.map((video) => video.pauses())).toEqual([0, 0, 0, 0]);
    arreter();
    for (const video of intactes) video.remove();
  });

  test('un vocal suit la voie de la « Pause » de la coque (#9946) : la vidéo seule est visée ici', () => {
    const casque = debrancheur();
    const arreter = pauseVideosWhenNoisy(document, casque.onNoisy);
    const vocal = media('audio', {});
    casque.debrancher();
    expect(vocal.pauses()).toBe(0);
    arreter();
    vocal.remove();
  });

  test('la page qui a cessé d’écouter ne met plus rien en pause', () => {
    const casque = debrancheur();
    const arreter = pauseVideosWhenNoisy(document, casque.onNoisy);
    arreter();
    const video = media('video', {});
    casque.debrancher();
    expect(video.pauses()).toBe(0);
    video.remove();
  });
});

describe('la coque signale le débranchement du casque (#9985)', () => {
  test('dans la coque, le débranchement parvient à la page, jusqu’à ce qu’elle cesse d’écouter', () => {
    const hote = coque(true);
    let recus = 0;
    const cesser = shellNoisy(hote)(() => {
      recus += 1;
    });
    expect(hote.ecoutes.map((ecoute) => ecoute.evenement)).toEqual(['becomingNoisy']);
    hote.ecoutes[0]?.rappel();
    expect(recus).toBe(1);
    cesser();
    expect(hote.ecoutes[0]?.retiree).toBe(true);
  });

  test('un navigateur, ou une coque sans le plugin, n’écoute rien', () => {
    const hote = coque(false);
    const cesser = shellNoisy(hote)(() => {});
    expect(hote.ecoutes).toEqual([]);
    cesser();
    expect(shellNoisy(undefined)(() => {})).toBeInstanceOf(Function);
  });
});
