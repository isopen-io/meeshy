import { describe, expect, test } from 'bun:test';

import { deferredFrameImages, lazyFrameImages } from './frame-scene-assets';
import { assetSources, frameAssetUrls } from './frame-scene-urls';
import { createFrameStudio } from './frame-studio';

/**
 * LES FICHIERS DES ILLUSTRATIONS (#12683) — le glob de Vite devient une table
 * `assets/call-frames/<fichier>.webp → adresse` ; le magasin paresseux ne charge
 * une image qu'à la première demande, une fois, et prévient quand elle arrive.
 */

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('les fichiers des illustrations', () => {
  test('le glob se lit en chemins du pack ; une valeur qui n’est pas une adresse est écartée', () => {
    expect(assetSources({ '../../x/assets/call-frames/jovial_fete_back.webp': '/assets/jovial_fete_back-Ab12Cd34.webp', '../../x/assets/call-frames/nope.webp': 42 })).toEqual({
      'assets/call-frames/jovial_fete_back.webp': '/assets/jovial_fete_back-Ab12Cd34.webp',
    });
  });

  test('hors de Vite, aucune adresse — et rien ne lève', () => {
    expect(frameAssetUrls()).toEqual({});
  });

  test('le magasin paresseux : `null` d’abord, un chargement par fichier, l’image ensuite, et un signal à l’arrivée', async () => {
    const asked: string[] = [];
    const arrived: string[] = [];
    const picture = { tag: 'back' } as unknown as CanvasImageSource;
    const images = lazyFrameImages({
      urls: { 'assets/call-frames/a_b_back.webp': '/assets/a.webp' },
      load: (url) => {
        asked.push(url);
        return url === '/assets/a.webp' ? Promise.resolve(picture) : Promise.reject(new Error('404'));
      },
      onLoaded: (src) => arrived.push(src),
    });
    expect(images.get('assets/call-frames/a_b_back.webp')).toBeNull();
    expect(images.get('assets/call-frames/a_b_back.webp')).toBeNull();
    expect(images.get('assets/call-frames/inconnu.webp')).toBeNull();
    await flush();
    expect(asked).toEqual(['/assets/a.webp']);
    expect(images.get('assets/call-frames/a_b_back.webp')).toBe(picture);
    expect(arrived).toEqual(['assets/call-frames/a_b_back.webp']);
  });

  test('un échec de chargement ne se rejoue pas, et ne lève pas', async () => {
    const asked: string[] = [];
    const images = lazyFrameImages({
      urls: { 'assets/call-frames/a_b_back.webp': '/assets/a.webp' },
      load: (url) => {
        asked.push(url);
        return Promise.reject(new Error('offline'));
      },
    });
    images.get('assets/call-frames/a_b_back.webp');
    await flush();
    expect(images.get('assets/call-frames/a_b_back.webp')).toBeNull();
    expect(asked).toHaveLength(1);
  });

  test('la table des adresses ne se charge qu’à la première illustration demandée, une fois, puis le magasin se remplit', async () => {
    const tables: string[] = [];
    const arrived: string[] = [];
    const picture = { tag: 'front' } as unknown as CanvasImageSource;
    const images = deferredFrameImages({
      urls: () => {
        tables.push('table');
        return Promise.resolve({ 'assets/call-frames/a_b_front.webp': '/assets/f.webp' });
      },
      load: () => Promise.resolve(picture),
      onLoaded: (src) => arrived.push(src),
    });
    expect(tables).toEqual([]);
    expect(images.get('assets/call-frames/a_b_front.webp')).toBeNull();
    expect(images.get('assets/call-frames/a_b_front.webp')).toBeNull();
    await flush();
    expect(tables).toEqual(['table']);
    expect(images.get('assets/call-frames/a_b_front.webp')).toBeNull();
    await flush();
    expect(images.get('assets/call-frames/a_b_front.webp')).toBe(picture);
    expect(arrived).toEqual(['assets/call-frames/a_b_front.webp', 'assets/call-frames/a_b_front.webp']);
  });

  test('une table introuvable laisse le cadre peint sans illustration, sans lever ni redemander', async () => {
    const tables: string[] = [];
    const images = deferredFrameImages({
      urls: () => {
        tables.push('table');
        return Promise.reject(new Error('offline'));
      },
      load: () => Promise.reject(new Error('never')),
    });
    images.get('assets/call-frames/a_b_front.webp');
    await flush();
    expect(images.get('assets/call-frames/a_b_front.webp')).toBeNull();
    expect(tables).toHaveLength(1);
  });

  test('l’atelier remet aux images un signal qui jette ses couches', async () => {
    const forgetters: (() => void)[] = [];
    const studio = createFrameStudio({
      fonts: undefined,
      images: (onLoaded) => {
        forgetters.push(onLoaded);
        return { get: () => null };
      },
    });
    await studio.ready;
    expect(forgetters).toHaveLength(1);
    expect(() => forgetters[0]?.()).not.toThrow();
  });
});
