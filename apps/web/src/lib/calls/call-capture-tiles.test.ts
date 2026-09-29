import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { visibleTiles } from './call-capture-tiles';

/**
 * CE QUE L'ÉCRAN MONTRE (#8552) — seules les vidéos affichées se capturent,
 * chacune à sa place, avec son miroir et son cadrage ; la plus grande d'abord.
 */

type Box = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

const place = (element: Element, box: Box): void => {
  Object.defineProperty(element, 'getBoundingClientRect', { value: () => ({ ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height }) });
};

const video = (options: { readonly box: Box; readonly width?: number; readonly fit?: string; readonly mirrored?: boolean }): HTMLVideoElement => {
  const element = document.createElement('video');
  element.setAttribute('data-call-stream', options.fit ?? 'cover');
  if (options.mirrored === true) element.setAttribute('data-call-mirrored', '');
  Object.defineProperty(element, 'videoWidth', { value: options.width ?? 1280 });
  Object.defineProperty(element, 'videoHeight', { value: options.width === 0 ? 0 : 720 });
  place(element, options.box);
  return element;
};

describe('visibleTiles', () => {
  beforeAll(() => ensureHappyDomRegistered());
  afterAll(async () => releaseHappyDomIfRegistered());

  const stageWith = (...videos: HTMLVideoElement[]) => {
    const stage = document.createElement('div');
    place(stage, { left: 0, top: 0, width: 400, height: 800 });
    videos.forEach((element) => stage.appendChild(element));
    return stage;
  };

  test('la plus grande d’abord, chacune à sa place normalisée, avec son miroir et son cadrage', () => {
    const corner = video({ box: { left: 280, top: 40, width: 100, height: 160 }, mirrored: true });
    const main = video({ box: { left: 0, top: 0, width: 400, height: 800 }, fit: 'contain' });
    const tiles = visibleTiles(stageWith(corner, main));
    expect(tiles.map((tile) => tile.source)).toEqual([main, corner]);
    expect(tiles[0]).toMatchObject({ fit: 'contain', mirrored: false, onScreen: { x: 0, y: 0, width: 1, height: 1 }, size: { width: 1280, height: 720 } });
    expect(tiles[1]).toMatchObject({ fit: 'cover', mirrored: true, onScreen: { x: 0.7, y: 0.05, width: 0.25, height: 0.2 } });
  });

  test('une vidéo sans image ou hors de l’écran ne se capture pas', () => {
    const empty = video({ box: { left: 0, top: 0, width: 200, height: 200 }, width: 0 });
    const scrolledAway = video({ box: { left: 500, top: 0, width: 100, height: 100 } });
    expect(visibleTiles(stageWith(empty, scrolledAway))).toEqual([]);
  });

  test('une scène sans taille ne rend rien', () => {
    const stage = document.createElement('div');
    place(stage, { left: 0, top: 0, width: 0, height: 0 });
    expect(visibleTiles(stage)).toEqual([]);
  });
});
