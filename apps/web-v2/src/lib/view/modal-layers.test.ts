import { describe, expect, test } from 'bun:test';

import { modalLayersOpen, openModalLayer, subscribeModalLayers } from './modal-layers';

describe('modal-layers — le compte des couches', () => {
  test('aucune couche montée ⇒ rien ne recouvre l’écran', () => {
    expect(modalLayersOpen()).toBe(false);
  });

  test('une couche montée recouvre, sa fermeture découvre', () => {
    const release = openModalLayer();
    expect(modalLayersOpen()).toBe(true);
    release();
    expect(modalLayersOpen()).toBe(false);
  });

  test('deux couches superposées : la première fermée ne découvre PAS l’écran', () => {
    const releaseSheet = openModalLayer();
    const releaseViewer = openModalLayer();
    releaseSheet();
    expect(modalLayersOpen()).toBe(true);
    releaseViewer();
    expect(modalLayersOpen()).toBe(false);
  });

  test('une fermeture rejouée ne décompte qu’une fois', () => {
    const releaseFirst = openModalLayer();
    const releaseSecond = openModalLayer();
    releaseFirst();
    releaseFirst();
    expect(modalLayersOpen()).toBe(true);
    releaseSecond();
    expect(modalLayersOpen()).toBe(false);
  });

  test('chaque ouverture et chaque fermeture réveille les abonnés', () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeModalLayers(() => seen.push(modalLayersOpen()));
    const release = openModalLayer();
    release();
    unsubscribe();
    openModalLayer()();
    expect(seen).toEqual([true, false]);
  });
});
