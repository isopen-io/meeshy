import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import { fileDeliveryPortal } from './deliver-file';
import { browserFileDeliveryHost } from './file-delivery-host';

/**
 * **UNE VIDÉO DE PLUS DE 32 MO SE PARTAGE DANS LA COQUE ANDROID, COMME SUR LE
 * WEB** (#9553). Chrome Android remet le fichier à `navigator.share({ files })`
 * quelle que soit sa taille ; la coque refusait au-delà du plafond du pont
 * (#9512), qui porte le fichier en base64 dans une seule chaîne. Elle reçoit
 * désormais la pièce par tranches dans son récepteur (`MeeshyFileSink`, #9514),
 * puis `MeeshyShare.shareFileAt` partage le fichier écrit. Le plafond et la
 * taille des tranches sont réduits ici à quelques octets : seule la mécanique
 * compte.
 */

type AppelPont = { readonly plugin: string; readonly methode: string; readonly options: Record<string, unknown> };

const SINK = ['open', 'append', 'close', 'discard'];

function coqueAndroid(options: { readonly share: readonly string[]; readonly withSink?: boolean; readonly rejet?: unknown }) {
  const appels: AppelPont[] = [];
  const shell: CoqueNative = {
    getPlatform: () => 'android',
    PluginHeaders: [
      { name: 'MeeshyShare', methods: options.share.map((name) => ({ name })) },
      ...(options.withSink === false ? [] : [{ name: 'MeeshyFileSink', methods: SINK.map((name) => ({ name })) }]),
    ],
    nativePromise: async (plugin, methode, opts) => {
      appels.push({ plugin, methode, options: opts as Record<string, unknown> });
      if (methode === 'open') return { id: 'sink-1' };
      if (methode === 'close') return { path: '/data/cache/file-sink/sink-1.mp4' };
      if (methode === 'shareFileAt' && options.rejet !== undefined) throw options.rejet;
      return undefined;
    },
  };
  return { shell, appels };
}

function documentLike() {
  return { createElement: () => ({}) as HTMLElement, body: { appendChild: (el: HTMLElement) => el, removeChild: (el: HTMLElement) => el } } as never;
}

const urls = { createObjectURL: () => 'blob:1', revokeObjectURL: () => undefined };
const LIMITS = { bridgeMaxBytes: 4, chunkBytes: 3 };
const hote = (shell: CoqueNative) => browserFileDeliveryHost({ document: documentLike(), navigator: {}, urls, shell }, LIMITS);
const longue = (contenu = 'abcdefgh', type = 'video/mp4') => new File([contenu], 'longue.mp4', { type });
const decode = (appels: readonly AppelPont[]): string =>
  appels
    .filter((a) => a.methode === 'append')
    .map((a) => atob(String(a.options.data)))
    .join('');

describe('partager un fichier plus lourd que le pont de la coque (#9553)', () => {
  test('une coque qui sait partager un fichier écrit l’offre au-delà du plafond', () => {
    const { shell } = coqueAndroid({ share: ['share', 'shareFile', 'shareFileAt'] });
    expect(hote(shell).canShareFiles?.({ files: [longue()] })).toBe(true);
  });

  test('la pièce passe par tranches dans le récepteur, puis le fichier écrit part dans la feuille', async () => {
    const { shell, appels } = coqueAndroid({ share: ['share', 'shareFile', 'shareFileAt'] });
    await hote(shell).shareFiles?.({ files: [longue()], text: 'https://meeshy.me/signup/affiliate/aff_1' });
    expect(appels.map((a) => a.methode)).toEqual(['open', 'append', 'append', 'append', 'close', 'shareFileAt', 'discard']);
    expect(appels[0]?.options).toEqual({ mimeType: 'video/mp4' });
    expect(decode(appels)).toBe('abcdefgh');
    expect(appels.find((a) => a.methode === 'shareFileAt')?.options).toEqual({
      fileName: 'longue.mp4',
      mimeType: 'video/mp4',
      path: '/data/cache/file-sink/sink-1.mp4',
      text: 'https://meeshy.me/signup/affiliate/aff_1',
    });
    expect(appels.some((a) => a.methode === 'shareFile')).toBe(false);
  });

  test('la feuille fermée sans choix ⇒ annulé, et le fichier écrit est effacé', async () => {
    const { shell, appels } = coqueAndroid({
      share: ['share', 'shareFile', 'shareFileAt'],
      rejet: Object.assign(new Error('Partage annule'), { code: 'CANCELED' }),
    });
    const portal = fileDeliveryPortal(hote(shell));
    expect(await portal?.deliver(new Blob(['abcdefgh'], { type: 'video/mp4' }), 'longue.mp4', 'video/mp4')).toBe('cancelled');
    expect(appels.at(-1)).toEqual({ plugin: 'MeeshyFileSink', methode: 'discard', options: { id: 'sink-1' } });
  });

  test('une coque construite avant `shareFileAt`, ou sans récepteur, garde le refus d’avant', () => {
    const sansPartageEcrit = coqueAndroid({ share: ['share', 'shareFile'] });
    expect(hote(sansPartageEcrit.shell).canShareFiles?.({ files: [longue()] })).toBe(false);
    const sansRecepteur = coqueAndroid({ share: ['share', 'shareFile', 'shareFileAt'], withSink: false });
    expect(hote(sansRecepteur.shell).canShareFiles?.({ files: [longue()] })).toBe(false);
  });

  test('un fichier sans type ne peut pas nommer son fichier écrit : il reste refusé au-delà du plafond', () => {
    const { shell } = coqueAndroid({ share: ['share', 'shareFile', 'shareFileAt'] });
    expect(hote(shell).canShareFiles?.({ files: [longue('abcdefgh', '')] })).toBe(false);
  });

  test('sous le plafond, rien ne change : le fichier voyage en une fois', async () => {
    const { shell, appels } = coqueAndroid({ share: ['share', 'shareFile', 'shareFileAt'] });
    await hote(shell).shareFiles?.({ files: [longue('abc')] });
    expect(appels).toEqual([
      { plugin: 'MeeshyShare', methode: 'shareFile', options: { fileName: 'longue.mp4', mimeType: 'video/mp4', data: btoa('abc') } },
    ]);
  });
});
