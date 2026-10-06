import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import { GALLERY_ALBUM, shellGallerySaver } from './gallery-saver';

/**
 * **UNE VIDÉO DE PLUS DE 32 MO S'ENREGISTRE DANS LA COQUE ANDROID, COMME SUR LE
 * WEB** (#9514). Le pont Capacitor porte un fichier en base64 dans une seule
 * chaîne : au-delà de son plafond, la coque refusait. Elle reçoit désormais la
 * pièce par tranches (`MeeshyFileSink`), écrites dans un fichier de son cache,
 * puis le plugin `Media` copie ce fichier dans l'album. Le plafond et la taille
 * des tranches sont réduits ici à quelques octets : seule la mécanique compte.
 */

type NativeCall = { readonly plugin: string; readonly methode: string; readonly options: Record<string, unknown> };

const SINK_METHODS = ['open', 'append', 'close', 'discard'];
const MEDIA_METHODS = ['getAlbums', 'createAlbum', 'savePhoto', 'saveVideo'];

function fakeShell(options: { readonly withSink?: boolean; readonly failingAppend?: boolean } = {}) {
  const calls: NativeCall[] = [];
  const shell: CoqueNative = {
    getPlatform: () => 'android',
    PluginHeaders: [
      { name: 'Media', methods: MEDIA_METHODS.map((name) => ({ name })) },
      ...(options.withSink === false ? [] : [{ name: 'MeeshyFileSink', methods: SINK_METHODS.map((name) => ({ name })) }]),
    ],
    nativePromise: async (plugin, methode, opts) => {
      const o = opts as Record<string, unknown>;
      calls.push({ plugin, methode, options: o });
      if (methode === 'getAlbums') return { albums: [{ name: GALLERY_ALBUM, identifier: '/p/Meeshy' }] };
      if (methode === 'open') return { id: 'sink-1' };
      if (methode === 'append' && options.failingAppend === true) throw new Error('disk-full');
      if (methode === 'close') return { path: '/data/cache/sink/sink-1.mp4' };
      return {};
    },
  };
  return { shell, calls };
}

const LIMITS = { bridgeMaxBytes: 4, chunkBytes: 3 };
const decoded = (calls: readonly NativeCall[]): string =>
  calls
    .filter((c) => c.methode === 'append')
    .map((c) => atob(String(c.options.data)))
    .join('');

describe('une vidéo plus lourde que le pont (#9514)', () => {
  test('elle passe par tranches dans un fichier de la coque, puis rejoint l’album', async () => {
    const { shell, calls } = fakeShell();
    const outcome = await shellGallerySaver(shell, LIMITS).save({ blob: new Blob(['abcdefgh']), fileName: 'long.mp4', mimeType: 'video/mp4' });
    expect(outcome).toBe('saved');
    expect(calls.map((c) => c.methode)).toEqual(['getAlbums', 'open', 'append', 'append', 'append', 'close', 'saveVideo', 'discard']);
    expect(calls[1]?.options).toEqual({ mimeType: 'video/mp4' });
    expect(decoded(calls)).toBe('abcdefgh');
    expect(calls.filter((c) => c.methode === 'append').every((c) => c.options.id === 'sink-1')).toBe(true);
    const save = calls.find((c) => c.methode === 'saveVideo')?.options ?? {};
    expect(save.path).toBe('/data/cache/sink/sink-1.mp4');
    expect(save.albumIdentifier).toBe('/p/Meeshy');
    expect(calls.at(-1)?.options).toEqual({ id: 'sink-1' });
  });

  test('une tranche refusée rend « failed » et le fichier partiel est effacé', async () => {
    const { shell, calls } = fakeShell({ failingAppend: true });
    const outcome = await shellGallerySaver(shell, LIMITS).save({ blob: new Blob(['abcdefgh']), fileName: 'long.mp4', mimeType: 'video/mp4' });
    expect(outcome).toBe('failed');
    expect(calls.some((c) => c.methode === 'saveVideo')).toBe(false);
    expect(calls.at(-1)).toEqual({ plugin: 'MeeshyFileSink', methode: 'discard', options: { id: 'sink-1' } });
  });

  test('une coque construite avant le récepteur garde le refus d’avant', async () => {
    const { shell, calls } = fakeShell({ withSink: false });
    const outcome = await shellGallerySaver(shell, LIMITS).save({ blob: new Blob(['abcdefgh']), fileName: 'long.mp4', mimeType: 'video/mp4' });
    expect(outcome).toBe('unavailable');
    expect(calls).toEqual([]);
  });

  test('sous le plafond, rien ne change : la pièce voyage en une fois', async () => {
    const { shell, calls } = fakeShell();
    await shellGallerySaver(shell, LIMITS).save({ blob: new Blob(['abc']), fileName: 'court.mp4', mimeType: 'video/mp4' });
    expect(calls.map((c) => c.methode)).toEqual(['getAlbums', 'saveVideo']);
  });
});
