import { describe, expect, test } from 'bun:test';

import type { CanvasObject, CanvasScene } from './document';
import { backgroundPlaceholderHash, mediaHasArrived, noteMediaArrived, scenePlaceholderHash } from './scene-placeholder';

const fond = (payload: Record<string, unknown>): CanvasObject => ({
  id: 'bg',
  kind: 'media',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'bg',
  z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload,
});

const sceneOf = (objects: readonly CanvasObject[], thumbHash?: string): CanvasScene => ({
  id: 's1',
  objects,
  ...(thumbHash !== undefined ? { thumbHash } : {}),
});

describe('backgroundPlaceholderHash — ce qui se peint SOUS le média de fond avant ses pixels', () => {
  test('l’empreinte du MÉDIA d’abord : c’est lui que le placeholder annonce', () => {
    const object = fond({ postMediaId: 'img', thumbHash: 'MEDIA' });
    expect(backgroundPlaceholderHash(object, sceneOf([object], 'SLIDE'))).toBe('MEDIA');
  });

  test('sans empreinte de média, celle du COMPOSITE de la scène — un repli décidé, pas un vide', () => {
    const object = fond({ postMediaId: 'img' });
    expect(backgroundPlaceholderHash(object, sceneOf([object], 'SLIDE'))).toBe('SLIDE');
  });

  test('une empreinte VIDE ne compte pas', () => {
    const object = fond({ postMediaId: 'img', thumbHash: '' });
    expect(backgroundPlaceholderHash(object, sceneOf([object], 'SLIDE'))).toBe('SLIDE');
  });

  test('aucune empreinte nulle part ⇒ `undefined`, la surface de la scène reste', () => {
    const object = fond({ postMediaId: 'img' });
    expect(backgroundPlaceholderHash(object, sceneOf([object]))).toBeUndefined();
  });
});

describe('scenePlaceholderHash — la scène ENTIÈRE avant que le moteur ne soit chargé', () => {
  test('l’empreinte du COMPOSITE d’abord : elle empreinte exactement ce qui sera peint', () => {
    expect(scenePlaceholderHash(sceneOf([fond({ postMediaId: 'img', thumbHash: 'MEDIA' })], 'SLIDE'))).toBe('SLIDE');
  });

  test('sans composite, celle du média de fond', () => {
    expect(scenePlaceholderHash(sceneOf([fond({ postMediaId: 'img', thumbHash: 'MEDIA' })]))).toBe('MEDIA');
  });

  test('ni l’un ni l’autre ⇒ `undefined`', () => {
    expect(scenePlaceholderHash(sceneOf([fond({ background: '4338CA' })]))).toBeUndefined();
  });
});

describe('mediaHasArrived — un média déjà peint ne repasse pas par son placeholder', () => {
  test('une adresse jamais chargée n’est pas arrivée', () => {
    expect(mediaHasArrived('https://cdn/never.jpg')).toBe(false);
  });

  test('une adresse notée arrivée l’est pour le reste de la session', () => {
    noteMediaArrived('https://cdn/seen.jpg');
    expect(mediaHasArrived('https://cdn/seen.jpg')).toBe(true);
  });

  test('la mémoire est BORNÉE : les plus anciennes adresses en sortent', () => {
    noteMediaArrived('https://cdn/oldest.jpg');
    Array.from({ length: 600 }, (_, i) => noteMediaArrived(`https://cdn/${i}.jpg`));
    expect(mediaHasArrived('https://cdn/oldest.jpg')).toBe(false);
    expect(mediaHasArrived('https://cdn/599.jpg')).toBe(true);
  });
});
