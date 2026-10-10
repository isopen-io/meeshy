import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import { shellVideoFloat, type FloatableVideo } from './shell-video-float';

/**
 * **UNE VIDÉO PASSE EN IMAGE DANS L'IMAGE D'UN APPUI, DANS LA COQUE ANDROID
 * COMME SUR LE WEB** (#9410) — la WebView n'expose pas l'API
 * Picture-in-Picture : le bouton de la barre vidéo disparaissait. La coque
 * sait faire flotter une vidéo en plein écran (#9242) ; l'appui la passe donc
 * en plein écran, puis demande à la coque de flotter (`MeeshyPlayback.floatVideo`).
 */

type Appel = { readonly plugin: string; readonly methode: string };

type Ecouteurs = Map<string, Set<() => void>>;

function emettre(ecouteurs: Ecouteurs, type: string): void {
  for (const rappel of ecouteurs.get(type) ?? []) rappel();
}

function ecouter(ecouteurs: Ecouteurs, type: string, rappel: () => void): void {
  ecouteurs.set(type, new Set([...(ecouteurs.get(type) ?? []), rappel]));
}

function oublier(ecouteurs: Ecouteurs, type: string, rappel: () => void): void {
  ecouteurs.get(type)?.delete(rappel);
}

function coque(
  methodes: readonly string[],
  reponse: unknown = { floated: true },
): CoqueNative & { readonly appels: Appel[]; readonly options: object[]; readonly evenements: Ecouteurs } {
  const appels: Appel[] = [];
  const options: object[] = [];
  const evenements: Ecouteurs = new Map();
  return {
    appels,
    options,
    evenements,
    getPlatform: () => 'android',
    addListener: (_plugin, evenement, rappel) => {
      const sans = (): void => rappel(undefined);
      ecouter(evenements, evenement, sans);
      return { remove: () => Promise.resolve(oublier(evenements, evenement, sans)) };
    },
    PluginHeaders: [{ name: 'MeeshyPlayback', methods: methodes.map((name) => ({ name })) }],
    nativePromise: (plugin, methode, recues) => {
      appels.push({ plugin, methode });
      options.push(recues);
      return Promise.resolve(reponse);
    },
  };
}

function video(
  issue: 'resout' | 'rejette' = 'resout',
  taille = { videoWidth: 1080, videoHeight: 1920 },
): FloatableVideo & { pleinEcran: number; paused: boolean } {
  const ecouteurs: Ecouteurs = new Map();
  const v = {
    ...taille,
    paused: false,
    play: () => {
      v.paused = false;
      emettre(ecouteurs, 'play');
      return Promise.resolve();
    },
    pause: () => {
      v.paused = true;
      emettre(ecouteurs, 'pause');
    },
    addEventListener: (type: string, rappel: () => void) => ecouter(ecouteurs, type, rappel),
    removeEventListener: (type: string, rappel: () => void) => oublier(ecouteurs, type, rappel),
    pleinEcran: 0,
    requestFullscreen: () => {
      v.pleinEcran += 1;
      return issue === 'resout' ? Promise.resolve() : Promise.reject(new Error('refus'));
    },
  };
  return v;
}

function documentSortant(): {
  sorties: number;
  fullscreenElement: unknown;
  readonly exitFullscreen: () => Promise<void>;
  readonly addEventListener: (type: string, rappel: () => void) => void;
  readonly removeEventListener: (type: string, rappel: () => void) => void;
  readonly quitterPleinEcran: () => void;
} {
  const ecouteurs: Ecouteurs = new Map();
  const d = {
    sorties: 0,
    fullscreenElement: {} as unknown,
    addEventListener: (type: string, rappel: () => void) => ecouter(ecouteurs, type, rappel),
    removeEventListener: (type: string, rappel: () => void) => oublier(ecouteurs, type, rappel),
    quitterPleinEcran: () => {
      d.fullscreenElement = null;
      emettre(ecouteurs, 'fullscreenchange');
    },
    exitFullscreen: () => {
      d.sorties += 1;
      return Promise.resolve();
    },
  };
  return d;
}

const laisserFiler = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('la vidéo qui flotte d’un appui dans la coque Android (#9410)', () => {
  test('un navigateur, ou une coque construite avant la méthode, ne propose rien', () => {
    expect(shellVideoFloat(undefined)).toBeNull();
    expect(shellVideoFloat(coque(['holdPlayback', 'releasePlayback']))).toBeNull();
  });

  test('l’appui passe la vidéo en plein écran, PUIS demande à la coque de flotter', async () => {
    const hote = coque(['floatVideo']);
    const doc = documentSortant();
    const flotter = shellVideoFloat(hote, doc)!;
    const v = video();
    flotter(v);
    expect(v.pleinEcran).toBe(1);
    expect(hote.appels).toEqual([]);
    await laisserFiler();
    expect(hote.appels).toEqual([{ plugin: 'MeeshyPlayback', methode: 'floatVideo' }]);
    expect(doc.sorties).toBe(0);
  });

  test('un système qui refuse de flotter rend la vidéo à la page, hors du plein écran', async () => {
    const doc = documentSortant();
    const flotter = shellVideoFloat(coque(['floatVideo'], { floated: false }), doc)!;
    flotter(video());
    await laisserFiler();
    expect(doc.sorties).toBe(1);
  });

  test('un plein écran refusé ne demande rien à la coque et ne remonte rien', async () => {
    const hote = coque(['floatVideo']);
    const doc = documentSortant();
    shellVideoFloat(hote, doc)!(video('rejette'));
    await laisserFiler();
    expect(hote.appels).toEqual([]);
    expect(doc.sorties).toBe(0);
  });

  test('la coque reçoit la taille de la vidéo, pour flotter à sa forme comme dans Chrome (#9845)', async () => {
    const hote = coque(['floatVideo']);
    shellVideoFloat(hote, documentSortant())!(video('resout', { videoWidth: 1080, videoHeight: 1920 }));
    await laisserFiler();
    expect(hote.options).toEqual([{ width: 1080, height: 1920 }]);
  });

  test('la fenêtre flottante met la vidéo en pause et la relance, et son bouton suit la vidéo (#9847)', async () => {
    const hote = coque(['floatVideo', 'setFloatPlaying']);
    const doc = documentSortant();
    const v = video();
    shellVideoFloat(hote, doc)!(v);
    await laisserFiler();
    expect(hote.appels.map((a) => a.methode)).toEqual(['setFloatPlaying', 'floatVideo']);
    expect(hote.options[0]).toEqual({ playing: true });

    emettre(hote.evenements, 'floatToggleRequested');
    expect(v.paused).toBe(true);
    expect(hote.options.at(-1)).toEqual({ playing: false });

    emettre(hote.evenements, 'floatToggleRequested');
    expect(v.paused).toBe(false);
    expect(hote.options.at(-1)).toEqual({ playing: true });
  });

  test('sorti du plein écran, le bouton de la fenêtre ne pilote plus la vidéo (#9847)', async () => {
    const hote = coque(['floatVideo', 'setFloatPlaying']);
    const doc = documentSortant();
    const v = video();
    shellVideoFloat(hote, doc)!(v);
    await laisserFiler();
    doc.quitterPleinEcran();
    await laisserFiler();
    const avant = hote.options.length;
    emettre(hote.evenements, 'floatToggleRequested');
    v.pause();
    expect(v.paused).toBe(true);
    expect(hote.options.length).toBe(avant);
  });
});

