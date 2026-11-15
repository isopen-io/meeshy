import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import { callStore } from './call-store';
import { setShellAudioRoute, shellAudioRoutes, startShellCall } from './shell-call-runtime';

/**
 * LES RÉELS DE L'APPEL NATIF (#8049) : rien ne démarre hors coque Android ni
 * sur une coque qui ne déclare pas `MeeshyCall`, et le choix de sortie audio
 * ne rend que les sorties connues.
 */

type Sent = { readonly plugin: string; readonly method: string; readonly options: object };

function coque(platform: string, reply: unknown = {}, methods: readonly string[] = ['getAudioRoutes', 'setAudioRoute']) {
  const sent: Sent[] = [];
  const shell: CoqueNative = {
    getPlatform: () => platform,
    PluginHeaders: [{ name: 'MeeshyCall', methods: methods.map((name) => ({ name })) }],
    nativePromise: (plugin, method, options) => {
      sent.push({ plugin, method, options });
      return Promise.resolve(reply);
    },
    addListener: () => ({ remove: () => Promise.resolve() }),
  };
  return { shell, sent };
}

describe('startShellCall — seule la coque Android qui déclare le pont démarre', () => {
  test('une coque iOS ne démarre rien', () => {
    const { shell, sent } = coque('ios');
    startShellCall(shell);
    callStore.setState({ call: null });
    expect(sent.filter((entry) => entry.method === 'startCallService')).toEqual([]);
  });

  test('un navigateur (aucune coque) ne démarre rien', () => {
    expect(() => startShellCall(undefined)).not.toThrow();
  });
});

describe('shellAudioRoutes / setShellAudioRoute — le choix de sortie audio', () => {
  test('hors coque Android : null', async () => {
    expect(await shellAudioRoutes(coque('web').shell)).toBeNull();
    expect(await setShellAudioRoute('speaker', undefined)).toBeNull();
  });

  test('une coque sans la méthode : null, jamais un rejet au premier geste', async () => {
    expect(await shellAudioRoutes(coque('android', {}, []).shell)).toBeNull();
  });

  test('les sorties servies, filtrées aux sorties connues', async () => {
    const { shell } = coque('android', { routes: ['earpiece', 'speaker', 'hdmi', 'bluetooth'], route: 'earpiece' });
    expect(await shellAudioRoutes(shell)).toEqual({ routes: ['earpiece', 'speaker', 'bluetooth'], route: 'earpiece' });
  });

  test('choisir une sortie la transmet au plugin', async () => {
    const { shell, sent } = coque('android', { routes: ['earpiece', 'speaker'], route: 'speaker' });
    expect(await setShellAudioRoute('speaker', shell)).toEqual({ routes: ['earpiece', 'speaker'], route: 'speaker' });
    expect(sent).toEqual([{ plugin: 'MeeshyCall', method: 'setAudioRoute', options: { route: 'speaker' } }]);
  });

  test('une réponse illisible rend une liste vide', async () => {
    expect(await shellAudioRoutes(coque('android', null).shell)).toEqual({ routes: [], route: null });
  });
});
