import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';

import ScenePlayer from './scene-player';

/**
 * LE CONTRAT QU'UN HÔTE QUI ATTEND SA SCÈNE PASSE AU MOTEUR (#6899) — miroir
 * de `MeeshyScenePlayer.init(isMuted:onContentReady:…)`
 * (`MeeshyScenePlayer.swift:76-99`). Le lecteur de story ne démarre sa
 * diapositive qu'au signal « contenu prêt » (`StoryCanvasUIView.onContentReady`) :
 * sans lui, une scène à fond image laissait la barre à 0 pour toujours
 * (mesuré au navigateur sur `/story/st-scene`, 4 s, `aria-valuenow="0"`).
 *
 * Le fil ne passe AUCUNE de ces options : son comportement reste celui que
 * `check-feed-scenes.mjs` garde (muet de config, `preload="none"`).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function mount(node: ReactElement): HTMLDivElement {
  container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return container;
}

function documentOf(objects: readonly unknown[]): CanvasDocument {
  const doc = parseCanvasDocument({ v: 3, scenes: [{ id: 's1', objects }] });
  if (doc === null) throw new Error('vecteur invalide');
  return doc;
}

const fond = (payload: Record<string, unknown>) => ({
  id: 'bg',
  kind: 'media',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'bg',
  z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload,
});

const carrier: SceneCarrier = { postId: 'p1', media: [{ id: 'img', src: 'photo.png' }, { id: 'vid', src: 'clip.mp4' }] };

describe('ScenePlayer — `onContentReady`, le signal qui démarre la diapositive', () => {
  test('un fond COULEUR est prêt dès le montage — rien ne reste à télécharger', () => {
    let ready = 0;
    mount(
      <ScenePlayer document={documentOf([fond({ background: '4338CA' })])} sceneIndex={0} mode="reader" playing={false} carrier={carrier} preferredLanguages={['fr']} onContentReady={() => (ready += 1)} />,
    );
    expect(ready).toBe(1);
  });

  /* Sous happy-dom, une `<img>` émet `error` DÈS son insertion (aucun réseau) :
     le « pas avant le chargement » d'une image ne s'observe donc qu'au
     navigateur (`check-story-scene.mjs`, placeholder peint AVANT le signal).
     Ici on prouve que le signal est BRANCHÉ sur les deux événements. */
  test('un fond IMAGE signale « prêt » à chacun de ses événements, `load` comme `error`', () => {
    let ready = 0;
    const el = mount(
      <ScenePlayer document={documentOf([fond({ postMediaId: 'img' })])} sceneIndex={0} mode="reader" playing={false} carrier={carrier} preferredLanguages={['fr']} onContentReady={() => (ready += 1)} />,
    );
    const image = el.querySelector('img');
    const before = ready;
    act(() => {
      image?.dispatchEvent(new window.Event('load'));
    });
    expect(ready).toBe(before + 1);
    act(() => {
      image?.dispatchEvent(new window.Event('error'));
    });
    expect(ready).toBe(before + 2);
  });

  test('un fond VIDÉO attendu se précharge (`preload="auto"`) et n’est prêt qu’à `loadeddata`', () => {
    let ready = 0;
    const el = mount(
      <ScenePlayer
        document={documentOf([fond({ postMediaId: 'vid', mediaType: 'video/mp4' })])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        carrier={carrier}
        preferredLanguages={['fr']}
        onContentReady={() => (ready += 1)}
      />,
    );
    const video = el.querySelector('video');
    expect(video?.getAttribute('preload')).toBe('auto');
    expect(ready).toBe(0);
    act(() => {
      video?.dispatchEvent(new window.Event('loadeddata'));
    });
    expect(ready).toBe(1);
  });

  test('sans hôte qui attend (le fil), la vidéo reste `preload="none"`', () => {
    const el = mount(
      <ScenePlayer document={documentOf([fond({ postMediaId: 'vid', mediaType: 'video/mp4' })])} sceneIndex={0} mode="card" playing={false} carrier={carrier} preferredLanguages={['fr']} />,
    );
    expect(el.querySelector('video')?.getAttribute('preload')).toBe('none');
  });
});

describe('ScenePlayer — `muted`, la demande de l’hôte gouverne le muet du mode', () => {
  test('`mode="reader"` (sonore) + `muted` ⇒ la vidéo de fond est muette', () => {
    const el = mount(
      <ScenePlayer document={documentOf([fond({ postMediaId: 'vid', mediaType: 'video/mp4' })])} sceneIndex={0} mode="reader" playing={false} muted carrier={carrier} preferredLanguages={['fr']} />,
    );
    expect(el.querySelector('video')?.muted).toBe(true);
  });

  test('`mode="reader"` sans demande ⇒ le muet du mode (sonore)', () => {
    const el = mount(
      <ScenePlayer document={documentOf([fond({ postMediaId: 'vid', mediaType: 'video/mp4' })])} sceneIndex={0} mode="reader" playing={false} carrier={carrier} preferredLanguages={['fr']} />,
    );
    expect(el.querySelector('video')?.muted).toBe(false);
  });

  // T-E7 (#6901, D5) — le verrou du muet : `card` VERROUILLE le son quel que
  // soit ce que l'hôte demande (miroir `MeeshyScenePlayer.hostMute`).
  test('mode="card" + muted={false} ⇒ la vidéo de fond reste muette (le verrou de la carte)', () => {
    const el = mount(
      <ScenePlayer
        document={documentOf([fond({ postMediaId: 'vid', mediaType: 'video/mp4' })])}
        sceneIndex={0}
        mode="card"
        playing={false}
        muted={false}
        carrier={carrier}
        preferredLanguages={['fr']}
      />,
    );
    expect(el.querySelector('video')?.muted).toBe(true);
  });

  test('une entrée de porteur SANS adresse ne masque pas le `mediaURL` de l’objet', () => {
    const el = mount(
      <ScenePlayer
        document={documentOf([fond({ postMediaId: 'vide', mediaURL: 'data:image/png;base64,AAAA' })])}
        sceneIndex={0}
        mode="reader"
        playing={false}
        carrier={{ postId: 'p1', media: [{ id: 'vide', src: '' }] }}
        preferredLanguages={['fr']}
      />,
    );
    expect(el.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });
});
