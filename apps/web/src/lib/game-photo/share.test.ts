import { describe, expect, test } from 'bun:test';

import type { GallerySaveInput, GallerySaver } from '@/lib/gallery/gallery-saver';
import type { FileDeliveryHost } from '@/lib/media/file-delivery-host';

import { savePhoto, shareImage, sharePhoto } from './share';

/**
 * LE PARTAGE DE LA PHOTO (#9382) — `navigator.share` avec fichiers quand il
 * existe (la coque Android, Safari, Chrome mobile), sinon un téléchargement.
 * Aucune image n'est envoyée au serveur de Meeshy : elle part par le partage
 * du système, à un geste de l'utilisateur, ou ne part pas.
 */
const file = new File([new Uint8Array([1, 2, 3])], 'meeshy-rang-voix-ii.png', { type: 'image/png' });

describe('shareImage', () => {
  test('le partage natif avec fichiers, quand le système sait les partager', async () => {
    const shared: ShareData[] = [];
    const outcome = await shareImage({
      file,
      title: 'Voix II',
      nav: { canShare: () => true, share: async (data) => void shared.push(data) },
      download: () => {
        throw new Error('pas de téléchargement');
      },
    });
    expect(outcome).toBe('shared');
    expect(shared).toHaveLength(1);
    expect(shared[0]?.files).toEqual([file]);
    expect(shared[0]?.title).toBe('Voix II');
  });

  test('sans partage de fichiers : un téléchargement', async () => {
    const downloaded: File[] = [];
    const outcome = await shareImage({ file, title: 'x', nav: { canShare: () => false, share: async () => undefined }, download: (f) => void downloaded.push(f) });
    expect(outcome).toBe('downloaded');
    expect(downloaded).toEqual([file]);
  });

  test('navigateur sans share : un téléchargement', async () => {
    const downloaded: File[] = [];
    const outcome = await shareImage({ file, title: 'x', nav: {}, download: (f) => void downloaded.push(f) });
    expect(outcome).toBe('downloaded');
    expect(downloaded).toHaveLength(1);
  });

  test('l’utilisateur ferme la feuille de partage : annulé, pas une erreur', async () => {
    const outcome = await shareImage({
      file,
      title: 'x',
      nav: {
        canShare: () => true,
        share: async () => {
          throw new DOMException('fermé', 'AbortError');
        },
      },
      download: () => {
        throw new Error('pas de téléchargement après une annulation');
      },
    });
    expect(outcome).toBe('cancelled');
  });

  test('un partage qui échoue vraiment retombe sur le téléchargement', async () => {
    const downloaded: File[] = [];
    const outcome = await shareImage({
      file,
      title: 'x',
      nav: {
        canShare: () => true,
        share: async () => {
          throw new Error('indisponible');
        },
      },
      download: (f) => void downloaded.push(f),
    });
    expect(outcome).toBe('downloaded');
    expect(downloaded).toHaveLength(1);
  });

  test('un téléchargement qui échoue se dit « failed »', async () => {
    const outcome = await shareImage({
      file,
      title: 'x',
      nav: {},
      download: () => {
        throw new Error('disque plein');
      },
    });
    expect(outcome).toBe('failed');
  });
});

/**
 * LES PORTES DE LA COQUE (revue #9382) — la WebView de la coque Android n'a ni
 * `navigator.share` ni téléchargement par `<a download>` (mesuré : ni
 * `@capacitor/android` ni `@capacitor/ios` ne branchent le téléchargement).
 * Sans ces portes, « Partager » tombait sur un téléchargement qui ne faisait
 * RIEN et l'écran annonçait « Image enregistrée ». La coque a ses portes : le
 * pont `MeeshyShare.shareFile` (feuille du système) et la galerie
 * (`@capacitor-community/media`, album « Meeshy »).
 */
describe('sharePhoto et savePhoto', () => {
  const noNav = {};
  const shellBridge = (log: File[]) => ({
    canShareFiles: () => true,
    shareFiles: async ({ files }: { readonly files: readonly File[] }) => void log.push(...files),
  });
  const anchorHost = (log: File[]) => ({
    document: {
      createElement: () => ({ click: () => undefined }) as unknown as HTMLElement,
      body: { appendChild: (node: Node) => node, removeChild: (node: Node) => node },
    } as unknown as NonNullable<FileDeliveryHost['document']>,
    createObjectURL: (blob: Blob) => (log.push(blob as File), 'blob:x'),
    revokeObjectURL: () => undefined,
  });
  const gallery = (log: GallerySaveInput[], outcome: 'saved' | 'failed' = 'saved'): GallerySaver => ({
    available: true,
    save: async (input) => (log.push(input), outcome),
  });

  test('coque : le partage passe par le pont de la coque, pas par un téléchargement muet', async () => {
    const bridged: File[] = [];
    const outcome = await sharePhoto(file, 'Voix II', { nav: noNav, host: shellBridge(bridged), saver: null });
    expect(outcome).toBe('shared');
    expect(bridged).toEqual([file]);
  });

  test('coque sans aucune porte : le partage ÉCHOUE, il ne prétend pas avoir enregistré', async () => {
    expect(await sharePhoto(file, 'x', { nav: noNav, host: {}, saver: null })).toBe('failed');
  });

  test('navigateur avec partage de fichiers : le titre voyage avec l’image', async () => {
    const shared: ShareData[] = [];
    const nav = { canShare: () => true, share: async (data: ShareData) => void shared.push(data) };
    expect(await sharePhoto(file, 'Voix II', { nav, host: {}, saver: null })).toBe('shared');
    expect(shared[0]?.title).toBe('Voix II');
  });

  test('navigateur sans partage : un téléchargement', async () => {
    const downloaded: File[] = [];
    expect(await sharePhoto(file, 'x', { nav: noNav, host: anchorHost(downloaded), saver: null })).toBe('downloaded');
    expect(downloaded).toHaveLength(1);
  });

  test('coque Android : « Enregistrer » écrit dans la galerie, album Meeshy', async () => {
    const saved: GallerySaveInput[] = [];
    expect(await savePhoto(file, { nav: noNav, host: shellBridge([]), saver: gallery(saved) })).toBe('downloaded');
    expect(saved.map((entry) => [entry.fileName, entry.mimeType])).toEqual([['meeshy-rang-voix-ii.png', 'image/png']]);
  });

  test('galerie qui refuse : l’échec se dit', async () => {
    expect(await savePhoto(file, { nav: noNav, host: shellBridge([]), saver: gallery([], 'failed') })).toBe('failed');
  });

  test('navigateur : « Enregistrer » télécharge', async () => {
    const downloaded: File[] = [];
    expect(await savePhoto(file, { nav: noNav, host: anchorHost(downloaded), saver: null })).toBe('downloaded');
    expect(downloaded).toHaveLength(1);
  });

  test('coque sans galerie ni téléchargement (iOS) : la feuille du système, qui sait enregistrer l’image', async () => {
    const bridged: File[] = [];
    expect(await savePhoto(file, { nav: noNav, host: shellBridge(bridged), saver: null })).toBe('shared');
    expect(bridged).toEqual([file]);
  });

  test('aucune porte du tout : l’échec se dit', async () => {
    expect(await savePhoto(file, { nav: noNav, host: {}, saver: null })).toBe('failed');
  });
});
