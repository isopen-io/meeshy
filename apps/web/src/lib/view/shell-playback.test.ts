import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { holdWhileAudioPlays, shellPlaybackHold, type PlaybackHold } from './shell-playback';

/**
 * **UN VOCAL CONTINUE DE JOUER QUAND ON QUITTE LA COQUE ANDROID** (#9257) —
 * Chrome Android tient la lecture d'un `<audio>` en arrière-plan, iOS a son
 * mode d'arrière-plan `audio`. Dans la coque, Android gèle le processus mis
 * en cache et le vocal s'arrête au milieu d'une phrase. Tant qu'un `<audio>`
 * de la page joue, la page demande donc à la coque de TENIR la lecture
 * (`MeeshyPlayback.holdPlayback`), et la rend quand le dernier s'arrête.
 */

type Appel = { readonly plugin: string; readonly methode: string };

function coque(methodes: readonly string[], issue: 'resout' | 'rejette' = 'resout'): CoqueNative & { readonly appels: Appel[] } {
  const appels: Appel[] = [];
  return {
    appels,
    getPlatform: () => 'android',
    PluginHeaders: [{ name: 'MeeshyPlayback', methods: methodes.map((name) => ({ name })) }],
    nativePromise: (plugin, methode) => {
      appels.push({ plugin, methode });
      return issue === 'resout' ? Promise.resolve({}) : Promise.reject(new Error('coque'));
    },
  };
}

describe('la prise de la lecture par la coque (#9257)', () => {
  test('dans la coque, tenir puis rendre appellent le plugin de lecture', () => {
    const hote = coque(['holdPlayback', 'releasePlayback']);
    const prise = shellPlaybackHold(hote);
    prise.hold();
    prise.release();
    expect(hote.appels).toEqual([
      { plugin: 'MeeshyPlayback', methode: 'holdPlayback' },
      { plugin: 'MeeshyPlayback', methode: 'releasePlayback' },
    ]);
  });

  test('un navigateur, ou une coque construite avant le plugin, ne reçoit aucun appel', () => {
    const ancienne = coque([]);
    for (const prise of [shellPlaybackHold(undefined), shellPlaybackHold(ancienne)]) {
      expect(() => {
        prise.hold();
        prise.release();
      }).not.toThrow();
    }
    expect(ancienne.appels).toEqual([]);
  });

  test('un refus de la coque ne remonte jamais jusqu’à la lecture', async () => {
    const prise = shellPlaybackHold(coque(['holdPlayback', 'releasePlayback'], 'rejette'));
    prise.hold();
    prise.release();
    await Promise.resolve();
    await Promise.resolve();
  });
});

beforeAll(() => {
  ensureHappyDomRegistered();
});
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

function priseComptee(): PlaybackHold & { readonly journal: string[] } {
  const journal: string[] = [];
  return { journal, hold: () => journal.push('hold'), release: () => journal.push('release') };
}

function media(tag: 'audio' | 'video'): HTMLMediaElement {
  const element = document.createElement(tag);
  document.body.appendChild(element);
  return element;
}

const signal = (element: HTMLMediaElement, type: string): void => {
  element.dispatchEvent(new Event(type));
};

describe('la page tient la lecture tant qu’un audio joue (#9257)', () => {
  test('un vocal qui joue tient la lecture, sa pause la rend', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const vocal = media('audio');
    signal(vocal, 'playing');
    expect(prise.journal).toEqual(['hold']);
    signal(vocal, 'pause');
    expect(prise.journal).toEqual(['hold', 'release']);
    arreter();
    vocal.remove();
  });

  test('la lecture n’est rendue qu’à l’arrêt du DERNIER audio, et jamais tenue deux fois', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const premier = media('audio');
    const second = media('audio');
    signal(premier, 'playing');
    signal(second, 'playing');
    signal(premier, 'ended');
    expect(prise.journal).toEqual(['hold']);
    signal(second, 'error');
    expect(prise.journal).toEqual(['hold', 'release']);
    arreter();
    premier.remove();
    second.remove();
  });

  test('une vidéo ne tient rien : la page masquée la met déjà en pause, comme Chrome Android', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const video = media('video');
    signal(video, 'playing');
    signal(video, 'pause');
    expect(prise.journal).toEqual([]);
    arreter();
    video.remove();
  });

  test('cesser d’écouter rend la lecture encore tenue', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const vocal = media('audio');
    signal(vocal, 'playing');
    arreter();
    signal(vocal, 'pause');
    expect(prise.journal).toEqual(['hold', 'release']);
    vocal.remove();
  });
});
