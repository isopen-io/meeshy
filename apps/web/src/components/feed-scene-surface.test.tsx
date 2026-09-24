import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { CanvasDocument, CanvasObject } from '@/lib/canvas/document';
import type { SceneCarrier } from '@/lib/canvas/carrier';

import { FeedSceneSurface } from './feed-scene-surface';

/**
 * T13 (#6898) — `FeedSceneSurface` : la lecture est une VALEUR REÇUE
 * (`active`), jamais un état local. `ScenePlayer` est chargé À LA DEMANDE
 * (`lazy`) : chaque test flushe le `Suspense` par un `act(async () => {})`.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  // Le moteur est chargé À LA DEMANDE (`lazy`) : le PREMIER `import()` du
  // module coûte une compilation que 20 ms d'attente ne couvrent pas toujours
  // — le premier témoin du fichier rougissait seul, au hasard de la machine.
  // Chauffé ici, chaque montage ne paie plus qu'une microtâche.
  await import('./scene-player');
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

const videoObject: CanvasObject = {
  id: 'v1',
  kind: 'media',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'bg',
  z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: { postMediaId: 'media-a', mediaType: 'video/webm' },
};

const fixedObject: CanvasObject = {
  id: 't1',
  kind: 'text',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'fg',
  z: 1,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload: { text: 'x' },
};

const carrier: SceneCarrier = { postId: 'p1', media: [{ id: 'media-a', src: 'data:video/webm;base64,AAAA' }] };

async function mount(document: CanvasDocument, active: boolean): Promise<HTMLDivElement> {
  const c = window.document.createElement('div');
  window.document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  await act(async () => {
    r.render(<FeedSceneSurface document={document} sceneIndex={0} carrier={carrier} preferredLanguages={['fr']} active={active} frame="page" authorName="Léa" />);
  });
  // Le PLAYER est chargé À LA DEMANDE (`lazy`, D-54) : la résolution du
  // `Suspense` requiert d'attendre l'import() (une macrotâche, pas
  // seulement une microtâche) pour que React rejoue le rendu.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return c;
}

describe('FeedSceneSurface — la lecture est une VALEUR reçue', () => {
  test('active=false ⇒ ScenePlayer reçoit playing=false (le <video> ne joue pas)', async () => {
    const doc: CanvasDocument = { v: 3, scenes: [{ id: 's1', objects: [videoObject] }] };
    const el = await mount(doc, false);
    const video = el.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.paused).not.toBe(false);
  });

  test('active=true ET scène cinématique ⇒ playing=true', async () => {
    const doc: CanvasDocument = { v: 3, scenes: [{ id: 's1', objects: [videoObject] }] };
    const el = await mount(doc, true);
    // L'indicateur « son coupé » n'apparaît QUE si la scène joue ET est
    // audible — une vidéo SANS `muted:true` est audible par défaut.
    expect(el.querySelector('[data-scene-sound="muted"]')).not.toBeNull();
  });

  test('active=true ET scène FIXE (texte seul) ⇒ playing=false, aucun indicateur son', async () => {
    const doc: CanvasDocument = { v: 3, scenes: [{ id: 's1', objects: [fixedObject] }] };
    const el = await mount(doc, true);
    expect(el.querySelector('[data-scene-sound="muted"]')).toBeNull();
    expect(el.querySelector('[data-scene-text]')?.textContent).toBe('x');
  });

  test('glyphe lecture ssi !active && isCinematic', async () => {
    const doc: CanvasDocument = { v: 3, scenes: [{ id: 's1', objects: [videoObject] }] };
    const paused = await mount(doc, false);
    expect(paused.querySelector('svg')).not.toBeNull();
    const playing = await mount(doc, true);
    // Le SEUL svg qui doit apparaître désormais est celui de l'indicateur
    // « son coupé » (montré côté ScenePlayer), pas le glyphe de lecture de
    // la surface — la scène étant active, `!active` est faux.
    expect(playing.querySelectorAll('svg').length).toBeLessThanOrEqual(1);
  });
});

/** Revue-correction #6898 — ce que la première forme ne rendait pas. */
describe('FeedSceneSurface — ce que la tuile ANNONCE et ce que la scène PEINT', () => {
  async function mountWith(node: ReactElement): Promise<HTMLDivElement> {
    const c = window.document.createElement('div');
    window.document.body.appendChild(c);
    const r = createRoot(c);
    container = c;
    root = r;
    await act(async () => {
      r.render(node);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    return c;
  }

  test('la tuile qui porte un report « +N » l’ANNONCE : « Scène 4, et 1 de plus »', async () => {
    const doc: CanvasDocument = { v: 3, scenes: Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, objects: [fixedObject] })) };
    const el = await mountWith(
      <FeedSceneSurface document={doc} sceneIndex={3} carrier={carrier} preferredLanguages={['fr']} active={false} frame="tile" overflow={1} onOpen={() => {}} />,
    );
    expect(el.querySelector('button')?.getAttribute('aria-label')).toBe('Scène 4, et 1 de plus');
  });

  test('une tuile dont la scène est une VIDÉO le dit : « Scène 1, vidéo »', async () => {
    const doc: CanvasDocument = { v: 3, scenes: [{ id: 's1', objects: [videoObject] }, { id: 's2', objects: [fixedObject] }] };
    const el = await mountWith(<FeedSceneSurface document={doc} sceneIndex={0} carrier={carrier} preferredLanguages={['fr']} active={false} frame="tile" onOpen={() => {}} />);
    expect(el.querySelector('button')?.getAttribute('aria-label')).toBe('Scène 1, vidéo');
  });

  test('la légende d’une tuile se borne à sa limite de mots', async () => {
    const doc: CanvasDocument = { v: 3, scenes: [{ id: 's1', objects: [{ ...videoObject, payload: { postMediaId: 'media-a' } }] }] };
    const long: SceneCarrier = { postId: 'p1', media: [{ id: 'media-a', src: 'a.jpg', caption: 'un deux trois quatre cinq six sept huit', captionOrigin: 'media' }] };
    const el = await mountWith(<FeedSceneSurface document={doc} sceneIndex={0} carrier={long} preferredLanguages={['fr']} active={false} frame="tile" captionWordLimit={3} />);
    expect(el.querySelector('[data-feed-scene-caption]')?.textContent).toBe('un deux trois...');
  });

  test('le fond REMPLIT la scène par défaut (`aspectFill`), il ne s’ajuste que sur « fit » déclaré', async () => {
    const image: CanvasObject = { ...videoObject, payload: { postMediaId: 'media-a' } };
    const filled = await mountWith(<FeedSceneSurface document={{ v: 3, scenes: [{ id: 's1', objects: [image, fixedObject] }] }} sceneIndex={0} carrier={carrier} preferredLanguages={['fr']} active={false} frame="tile" />);
    expect(filled.querySelector('img')?.className).toContain('object-cover');
    const carrierOfFraming: CanvasObject = { ...videoObject, id: 'bg', payload: { transform: { videoFitMode: 'fit' } } };
    const fitted = await mountWith(
      <FeedSceneSurface document={{ v: 3, scenes: [{ id: 's1', objects: [carrierOfFraming, { ...image, id: 'img', plane: 'bg' }, fixedObject] }] }} sceneIndex={0} carrier={carrier} preferredLanguages={['fr']} active={false} frame="tile" />,
    );
    expect(fitted.querySelector('img')?.className).toContain('object-contain');
  });

  test('un `mediaURL` de scène se résout comme toute pièce jointe (`attachmentSrc`) — jamais contre l’origine du document', async () => {
    const legacy: CanvasObject = { ...videoObject, payload: { mediaURL: '2026/09/u1/photo.png' } };
    const el = await mountWith(
      <FeedSceneSurface document={{ v: 3, scenes: [{ id: 's1', objects: [legacy, fixedObject] }] }} sceneIndex={0} carrier={{ postId: 'p1', media: [] }} preferredLanguages={['fr']} active={false} frame="tile" />,
    );
    expect(el.querySelector('img')?.getAttribute('src')).toContain('/api/v1/attachments/file/');
  });

  // Défaut de revue #6898 (correction) : une scène vidéo NON ÉLUE (`playing`
  // faux, `preload="none"`) ne peint AUCUNE image tant que le navigateur n'a
  // rien chargé — le fond retombe alors sur la couleur DE LA CARTE, comme si
  // la scène n'existait pas. Le porteur (`SceneCarrier`) connaît déjà la
  // vignette du média RÉEL (`FeedCardMedia.thumbnailSrc`/`placeholder`,
  // exactement ce que `FeedMediaSurface` pose en `poster`) : le player doit
  // la reporter sur le `<video>` de fond, jamais rester posterless.
  test('une vidéo de FOND porte le poster de son porteur — jamais une boîte vide en attente de chargement', async () => {
    const withPoster: SceneCarrier = { postId: 'p1', media: [{ id: 'media-a', src: 'clip.webm', poster: 'data:image/png;base64,AAAA' }] };
    const el = await mountWith(
      <FeedSceneSurface document={{ v: 3, scenes: [{ id: 's1', objects: [videoObject] }] }} sceneIndex={0} carrier={withPoster} preferredLanguages={['fr']} active={false} frame="tile" />,
    );
    expect(el.querySelector('video')?.getAttribute('poster')).toBe('data:image/png;base64,AAAA');
  });

  test('sans poster de porteur, le `<video>` de fond n’en porte aucun (jamais inventé)', async () => {
    const el = await mountWith(
      <FeedSceneSurface document={{ v: 3, scenes: [{ id: 's1', objects: [videoObject] }] }} sceneIndex={0} carrier={carrier} preferredLanguages={['fr']} active={false} frame="tile" />,
    );
    expect(el.querySelector('video')?.hasAttribute('poster')).toBe(false);
  });
});

