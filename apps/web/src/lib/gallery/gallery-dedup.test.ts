import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { APP_PREFERENCES_QUERY_KEY } from '@/lib/api/app-preferences';
import type { CoqueNative } from '@/lib/native-shell';
import { fakeIndexedDb } from '@/lib/share-incoming/idb-double';

import { galleryConsentOf } from './auto-save-runtime';
import { GALLERY_ALBUM, shellGallerySaver } from './gallery-saver';
import { GALLERY_SAVED_DB_NAME, GALLERY_SAVED_STORE_NAME, galleryDigest, idbGallerySavedRegistry, memoryGallerySavedRegistry } from './saved-registry';
import { isInGallery, saveToGallery } from './save-to-gallery';

/**
 * **UN MÉDIA NE REJOINT LA GALERIE QU'UNE FOIS** (#14641) — le saver de la
 * coque consulte un registre « empreinte SHA-256 du fichier → déjà
 * enregistré » : des octets déjà présents ne sont jamais réécrits, quel que
 * soit le nom ou la porte (visionneuse, menu d'une pièce, réception).
 */

type NativeCall = { readonly methode: string; readonly options: Record<string, unknown> };

function shellWithAlbum() {
  const calls: NativeCall[] = [];
  const shell: CoqueNative = {
    getPlatform: () => 'android',
    PluginHeaders: [{ name: 'Media', methods: ['getAlbums', 'createAlbum', 'savePhoto', 'saveVideo'].map((name) => ({ name })) }],
    nativePromise: async (_plugin, methode, opts) => {
      const options = opts as Record<string, unknown>;
      calls.push({ methode, options });
      if (methode === 'getAlbums') return { albums: [{ name: GALLERY_ALBUM, identifier: '/p/Meeshy' }] };
      return { filePath: `/p/Meeshy/${String(options.fileName)}.jpg` };
    },
  };
  const writes = () => calls.filter((call) => call.methode === 'savePhoto' || call.methode === 'saveVideo');
  return { shell, writes };
}

const photo = (bytes: string, fileName = 'a.jpg') => ({ blob: new Blob([bytes], { type: 'image/jpeg' }), fileName, mimeType: 'image/jpeg' });

describe('galleryDigest — l’empreinte des octets', () => {
  test('SHA-256 hexadécimal des octets, indépendant du nom', async () => {
    expect(await galleryDigest(new Blob(['abc']))).toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('au-delà du plafond de lecture entière, une empreinte ÉCHANTILLONNÉE, distincte pour deux tailles', async () => {
    const a = await galleryDigest(new Blob(['x'.repeat(40)]), { fullMaxBytes: 16, sampleBytes: 8 });
    const b = await galleryDigest(new Blob(['x'.repeat(41)]), { fullMaxBytes: 16, sampleBytes: 8 });
    expect(a.startsWith('sha256-sampled:')).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('le saver de la coque ne réécrit jamais un média déjà enregistré', () => {
  test('les mêmes octets, deux fois : une seule écriture, la seconde rend « already-saved »', async () => {
    const { shell, writes } = shellWithAlbum();
    const saver = shellGallerySaver(shell, { saved: memoryGallerySavedRegistry() });
    expect(await saver.save(photo('pixels'))).toBe('saved');
    expect(await saver.save(photo('pixels', 'renomme.jpg'))).toBe('already-saved');
    expect(writes()).toHaveLength(1);
  });

  test('deux enregistrements SIMULTANÉS des mêmes octets n’écrivent qu’une fois', async () => {
    const { shell, writes } = shellWithAlbum();
    const saver = shellGallerySaver(shell, { saved: memoryGallerySavedRegistry() });
    const outcomes = await Promise.all([saver.save(photo('pixels')), saver.save(photo('pixels'))]);
    expect([...outcomes].sort()).toEqual(['already-saved', 'saved']);
    expect(writes()).toHaveLength(1);
  });

  test('des octets différents s’écrivent chacun', async () => {
    const { shell, writes } = shellWithAlbum();
    const saver = shellGallerySaver(shell, { saved: memoryGallerySavedRegistry() });
    expect(await saver.save(photo('un'))).toBe('saved');
    expect(await saver.save(photo('deux'))).toBe('saved');
    expect(writes()).toHaveLength(2);
  });

  test('un échec d’écriture ne note rien : le prochain essai écrit', async () => {
    let fail = true;
    const calls: string[] = [];
    const shell: CoqueNative = {
      getPlatform: () => 'android',
      PluginHeaders: [{ name: 'Media', methods: ['getAlbums', 'createAlbum', 'savePhoto', 'saveVideo'].map((name) => ({ name })) }],
      nativePromise: async (_plugin, methode) => {
        calls.push(methode);
        if (methode === 'getAlbums') return { albums: [{ name: GALLERY_ALBUM, identifier: '/p/Meeshy' }] };
        if (fail) throw new Error('disk full');
        return {};
      },
    };
    const saver = shellGallerySaver(shell, { saved: memoryGallerySavedRegistry() });
    expect(await saver.save(photo('pixels'))).toBe('failed');
    fail = false;
    expect(await saver.save(photo('pixels'))).toBe('saved');
    expect(calls.filter((methode) => methode === 'savePhoto')).toHaveLength(2);
  });

  test('le registre survit au saver : IndexedDB retient l’empreinte d’une session à l’autre', async () => {
    const idb = fakeIndexedDb();
    const first = shellWithAlbum();
    expect(await shellGallerySaver(first.shell, { saved: idbGallerySavedRegistry(idb.factory) }).save(photo('pixels'))).toBe('saved');
    const second = shellWithAlbum();
    expect(await shellGallerySaver(second.shell, { saved: idbGallerySavedRegistry(idb.factory) }).save(photo('pixels'))).toBe('already-saved');
    expect(second.writes()).toHaveLength(0);
    expect([...idb.rowsOf(GALLERY_SAVED_DB_NAME, GALLERY_SAVED_STORE_NAME).keys()]).toEqual([await galleryDigest(new Blob(['pixels']))]);
  });

  test('IndexedDB absente ou refusée : l’enregistrement se fait, sans registre', async () => {
    const idb = fakeIndexedDb();
    idb.failOpen();
    const { shell, writes } = shellWithAlbum();
    expect(await shellGallerySaver(shell, { saved: idbGallerySavedRegistry(idb.factory) }).save(photo('pixels'))).toBe('saved');
    expect(await shellGallerySaver(shell, { saved: idbGallerySavedRegistry(undefined) }).save(photo('pixels'))).toBe('saved');
    expect(writes()).toHaveLength(2);
  });
});

describe('ce que l’utilisateur voit', () => {
  test('un média déjà présent dit « Déjà enregistré », jamais « Enregistré »', async () => {
    const { shell } = shellWithAlbum();
    const saver = shellGallerySaver(shell, { saved: memoryGallerySavedRegistry() });
    expect(await saveToGallery({ saver, ...photo('pixels') })).toBe('media.viewer.saved');
    expect(await saveToGallery({ saver, ...photo('pixels') })).toBe('media.viewer.already_saved');
  });

  test('« déjà enregistré » est une réussite pour les autres portes (capture, export, story) — jamais un échec', () => {
    expect(isInGallery('media.viewer.saved')).toBe(true);
    expect(isInGallery('media.viewer.already_saved')).toBe(true);
    expect(isInGallery('media.viewer.save_failed')).toBe(false);
  });
});

describe('« Sauvegarder média » gouverne la réception (#14641)', () => {
  test('lu dans le cache des réglages synchronisés ; absent ⇒ coupé', () => {
    const queryClient = new QueryClient();
    expect(galleryConsentOf(queryClient)).toBe(false);
    queryClient.setQueryData(APP_PREFERENCES_QUERY_KEY, { saveMediaToGallery: true });
    expect(galleryConsentOf(queryClient)).toBe(true);
    queryClient.setQueryData(APP_PREFERENCES_QUERY_KEY, { saveMediaToGallery: false });
    expect(galleryConsentOf(queryClient)).toBe(false);
  });
});
