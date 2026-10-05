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

function priseComptee(): PlaybackHold & {
  readonly journal: string[];
  readonly demanderPause: () => void;
  readonly demanderLecture: () => void;
} {
  const journal: string[] = [];
  const pauses = new Set<() => void>();
  const lectures = new Set<() => void>();
  const abonner = (ecouteurs: Set<() => void>) => (ecouteur: () => void) => {
    ecouteurs.add(ecouteur);
    return () => {
      ecouteurs.delete(ecouteur);
    };
  };
  return {
    journal,
    hold: () => journal.push('hold'),
    release: () => journal.push('release'),
    park: () => journal.push('park'),
    onPauseRequested: abonner(pauses),
    onPlayRequested: abonner(lectures),
    demanderPause: () => {
      for (const ecouteur of pauses) ecouteur();
    },
    demanderLecture: () => {
      for (const ecouteur of lectures) ecouteur();
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
  test('chaque audio qui joue se met en pause, et la lecture est garée (#9394)', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const premier = vocalQuiSePause();
    const second = vocalQuiSePause();
    const muet = vocalQuiSePause();
    signal(premier, 'playing');
    signal(second, 'playing');
    prise.demanderPause();
    expect([premier.pauses(), second.pauses(), muet.pauses()]).toEqual([1, 1, 0]);
    expect(prise.journal).toEqual(['hold', 'park']);
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

function enLecture(element: HTMLMediaElement): HTMLMediaElement {
  Object.defineProperty(element, 'paused', { configurable: true, get: () => false });
  return element;
}

const couper = (element: HTMLMediaElement, muet: boolean): void => {
  element.muted = muet;
  signal(element, 'volumechange');
};

describe('un audio muet ne tient pas la lecture, comme la notification média de Chrome Android (#9324)', () => {
  test('un réel qui joue sans le son ne tient rien', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const reel = media('audio');
    reel.muted = true;
    signal(reel, 'playing');
    signal(reel, 'pause');
    expect(prise.journal).toEqual([]);
    arreter();
    reel.remove();
  });

  test('rendre le son d’un audio qui joue tient la lecture, le couper la rend', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const reel = enLecture(media('audio'));
    reel.muted = true;
    signal(reel, 'playing');
    couper(reel, false);
    expect(prise.journal).toEqual(['hold']);
    couper(reel, true);
    expect(prise.journal).toEqual(['hold', 'release']);
    arreter();
    reel.remove();
  });

  test('rendre le son d’un audio à l’arrêt ne tient rien', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const vocal = media('audio');
    vocal.muted = true;
    couper(vocal, false);
    expect(prise.journal).toEqual([]);
    arreter();
    vocal.remove();
  });

  test('couper le son d’un audio laisse tenue la lecture d’un autre qui s’entend', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const vocal = enLecture(media('audio'));
    const reel = enLecture(media('audio'));
    signal(vocal, 'playing');
    signal(reel, 'playing');
    couper(reel, true);
    expect(prise.journal).toEqual(['hold']);
    arreter();
    vocal.remove();
    reel.remove();
  });
});

function vocalQuiSeRelance(issue: 'joue' | 'refuse' = 'joue'): HTMLMediaElement & { readonly pauses: () => number; readonly lectures: () => number } {
  const vocal = vocalQuiSePause();
  let lectures = 0;
  vocal.play = () => {
    lectures += 1;
    if (issue === 'refuse') return Promise.reject(new DOMException('refus', 'NotAllowedError'));
    vocal.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  };
  return Object.assign(vocal, { lectures: () => lectures });
}

describe('un vocal mis en pause par la coque reprend d’un appui sur « Lecture », comme dans Chrome (#9394)', () => {
  test('« Lecture » relance les vocaux garés, et la lecture est de nouveau tenue', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const vocal = vocalQuiSeRelance();
    const autre = vocalQuiSeRelance();
    signal(vocal, 'playing');
    prise.demanderPause();
    prise.demanderLecture();
    expect([vocal.lectures(), autre.lectures()]).toEqual([1, 0]);
    expect(prise.journal).toEqual(['hold', 'park', 'hold']);
    arreter();
    vocal.remove();
    autre.remove();
  });

  test('une pause faite dans l’app rend toujours la lecture : « Lecture » n’a rien à reprendre', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const vocal = vocalQuiSeRelance();
    signal(vocal, 'playing');
    signal(vocal, 'pause');
    prise.demanderLecture();
    expect(vocal.lectures()).toBe(0);
    expect(prise.journal).toEqual(['hold', 'release', 'release']);
    arreter();
    vocal.remove();
  });

  test('un vocal garé qui disparaît rend la lecture', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const vocal = vocalQuiSeRelance();
    signal(vocal, 'playing');
    prise.demanderPause();
    signal(vocal, 'emptied');
    expect(prise.journal).toEqual(['hold', 'park', 'release']);
    arreter();
    vocal.remove();
  });

  test('un autre vocal lancé dans l’app remplace celui qui était garé', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const vocal = vocalQuiSeRelance();
    const suivant = vocalQuiSeRelance();
    signal(vocal, 'playing');
    prise.demanderPause();
    signal(suivant, 'playing');
    signal(suivant, 'ended');
    prise.demanderLecture();
    expect(vocal.lectures()).toBe(0);
    expect(prise.journal).toEqual(['hold', 'park', 'hold', 'release', 'release']);
    arreter();
    vocal.remove();
    suivant.remove();
  });

  test('une reprise refusée par le navigateur rend la lecture', async () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const vocal = vocalQuiSeRelance('refuse');
    signal(vocal, 'playing');
    prise.demanderPause();
    prise.demanderLecture();
    await Promise.resolve();
    await Promise.resolve();
    expect(prise.journal).toEqual(['hold', 'park', 'release']);
    arreter();
    vocal.remove();
  });

  test('cesser d’écouter rend une lecture garée', () => {
    const prise = priseComptee();
    const arreter = holdWhileAudioPlays(document, prise);
    const vocal = vocalQuiSeRelance();
    signal(vocal, 'playing');
    prise.demanderPause();
    arreter();
    expect(prise.journal).toEqual(['hold', 'park', 'release']);
    vocal.remove();
  });
});

describe('la coque gare la lecture et rend « Lecture » à la page (#9394)', () => {
  test('garer appelle le plugin, et « Lecture » parvient à la page', () => {
    const hote = coque(['holdPlayback', 'releasePlayback', 'parkPlayback']);
    const prise = shellPlaybackHold(hote);
    const journal: string[] = [];
    prise.onPlayRequested(() => journal.push('lecture'));
    prise.park();
    emettre(hote, 'playRequested');
    expect(hote.appels).toEqual([{ plugin: 'MeeshyPlayback', methode: 'parkPlayback' }]);
    expect(journal).toEqual(['lecture']);
  });

  test('une coque construite avant ce lot rend la lecture au lieu de la garer', () => {
    const hote = coque(['holdPlayback', 'releasePlayback']);
    shellPlaybackHold(hote).park();
    expect(hote.appels).toEqual([{ plugin: 'MeeshyPlayback', methode: 'releasePlayback' }]);
  });
});
