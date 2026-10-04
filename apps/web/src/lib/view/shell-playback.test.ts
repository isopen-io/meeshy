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
type Ecoute = { readonly plugin: string; readonly evenement: string; readonly rappel: (donnees: unknown) => void; retiree: boolean };

function coque(
  methodes: readonly string[],
  issue: 'resout' | 'rejette' = 'resout',
): CoqueNative & { readonly appels: Appel[]; readonly ecoutes: Ecoute[] } {
  const appels: Appel[] = [];
  const ecoutes: Ecoute[] = [];
  return {
    appels,
    ecoutes,
    getPlatform: () => 'android',
    PluginHeaders: [{ name: 'MeeshyPlayback', methods: methodes.map((name) => ({ name })) }],
    nativePromise: (plugin, methode) => {
      appels.push({ plugin, methode });
      return issue === 'resout' ? Promise.resolve({}) : Promise.reject(new Error('coque'));
    },
    addListener: (plugin, evenement, rappel) => {
      const ecoute: Ecoute = { plugin, evenement, rappel, retiree: false };
      ecoutes.push(ecoute);
      return {
        remove: async () => {
          ecoute.retiree = true;
        },
      };
    },
  };
}

const emettre = (hote: { readonly ecoutes: Ecoute[] }, evenement: string): void => {
  for (const ecoute of hote.ecoutes) if (ecoute.evenement === evenement && !ecoute.retiree) ecoute.rappel({});
};

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

  test('la « Pause » de la notification de la coque parvient à la page, jusqu’à ce qu’elle cesse d’écouter (#9301)', () => {
    const hote = coque(['holdPlayback', 'releasePlayback']);
    const journal: string[] = [];
    const cesser = shellPlaybackHold(hote).onPauseRequested(() => journal.push('pause'));
    emettre(hote, 'pauseRequested');
    expect(journal).toEqual(['pause']);
    expect(hote.ecoutes.map(({ plugin, evenement }) => ({ plugin, evenement }))).toEqual([
      { plugin: 'MeeshyPlayback', evenement: 'pauseRequested' },
    ]);
    cesser();
    emettre(hote, 'pauseRequested');
    expect(journal).toEqual(['pause']);
  });

  test('un navigateur n’écoute aucune notification (#9301)', () => {
    expect(() => shellPlaybackHold(undefined).onPauseRequested(() => undefined)()).not.toThrow();
  });
});

beforeAll(() => {
  ensureHappyDomRegistered();
});
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

function priseComptee(): PlaybackHold & { readonly journal: string[]; readonly demanderPause: () => void } {
  const journal: string[] = [];
  const ecouteurs = new Set<() => void>();
  return {
    journal,
    hold: () => journal.push('hold'),
    release: () => journal.push('release'),
    onPauseRequested: (ecouteur) => {
      ecouteurs.add(ecouteur);
      return () => ecouteurs.delete(ecouteur);
    },
    demanderPause: () => {
      for (const ecouteur of ecouteurs) ecouteur();
    },
  };
}

function vocalQuiSePause(): HTMLMediaElement & { readonly pauses: () => number } {
  const vocal = media('audio');
  let pauses = 0;
  vocal.pause = () => {
    pauses += 1;
    vocal.dispatchEvent(new Event('pause'));
  };
  return Object.assign(vocal, { pauses: () => pauses });
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

describe('la « Pause » de la notification de la coque met les vocaux en pause (#9301)', () => {
  test('chaque audio qui joue se met en pause, et la lecture est rendue', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const premier = vocalQuiSePause();
    const second = vocalQuiSePause();
    const muet = vocalQuiSePause();
    signal(premier, 'playing');
    signal(second, 'playing');
    prise.demanderPause();
    expect([premier.pauses(), second.pauses(), muet.pauses()]).toEqual([1, 1, 0]);
    expect(prise.journal).toEqual(['hold', 'release']);
    arreter();
    for (const vocal of [premier, second, muet]) vocal.remove();
  });

  test('la page qui a cessé d’écouter ne répond plus à la notification', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const vocal = vocalQuiSePause();
    signal(vocal, 'playing');
    arreter();
    prise.demanderPause();
    expect(vocal.pauses()).toBe(0);
    vocal.remove();
  });
});
