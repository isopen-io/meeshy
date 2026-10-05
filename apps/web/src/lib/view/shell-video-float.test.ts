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

function coque(methodes: readonly string[], reponse: unknown = { floated: true }): CoqueNative & { readonly appels: Appel[] } {
  const appels: Appel[] = [];
  return {
    appels,
    getPlatform: () => 'android',
    PluginHeaders: [{ name: 'MeeshyPlayback', methods: methodes.map((name) => ({ name })) }],
    nativePromise: (plugin, methode) => {
      appels.push({ plugin, methode });
      return Promise.resolve(reponse);
    },
  };
}

function video(issue: 'resout' | 'rejette' = 'resout'): FloatableVideo & { pleinEcran: number } {
  const v = {
    pleinEcran: 0,
    requestFullscreen: () => {
      v.pleinEcran += 1;
      return issue === 'resout' ? Promise.resolve() : Promise.reject(new Error('refus'));
    },
  };
  return v;
}

function documentSortant(): { sorties: number; readonly exitFullscreen: () => Promise<void> } {
  const d = {
    sorties: 0,
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
});
