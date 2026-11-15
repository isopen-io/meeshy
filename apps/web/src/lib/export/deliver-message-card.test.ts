import { describe, expect, test } from 'bun:test';

import type { GallerySaveOutcome, GallerySaver } from '@/lib/gallery/gallery-saver';
import { fileDeliveryPortal, type DeliverFileOutcome, type FileDeliveryPortal } from '@/lib/media/deliver-file';
import { browserFileDeliveryHost, type FileDeliveryEnvironment } from '@/lib/media/file-delivery-host';

import { deliverMessageCard } from './deliver-message-card';

const blob = new Blob(['png'], { type: 'image/png' });

const gallery = (outcome: GallerySaveOutcome, journal: string[]): GallerySaver => ({
  available: true,
  save: async ({ fileName, mimeType }) => {
    journal.push(`gallery:${fileName}:${mimeType}`);
    return outcome;
  },
});

const portal = (outcome: DeliverFileOutcome, journal: string[]): FileDeliveryPortal => ({
  deliver: async (_blob, fileName) => {
    journal.push(`portal:${fileName}`);
    return outcome;
  },
});

describe('deliverMessageCard(« Sauvegarder ») — la photothèque d’abord', () => {
  test('la galerie de la coque Android enregistre directement, sans feuille', async () => {
    const journal: string[] = [];
    expect(await deliverMessageCard(blob, 'm.png', 'save', { gallery: gallery('saved', journal), portal: async () => portal('delivered', journal) })).toBe('gallery');
    expect(journal).toEqual(['gallery:m.png:image/png']);
  });

  test('un GIF ou une vidéo part avec SON type, jamais comme un PNG (#8693)', async () => {
    const journal: string[] = [];
    const video = new Blob(['v'], { type: 'video/webm;codecs=vp9,opus' });
    await deliverMessageCard(video, 'm.webm', 'save', { gallery: gallery('saved', journal), portal: async () => portal('delivered', journal) });
    await deliverMessageCard(new Blob(['g'], { type: 'image/gif' }), 'm.gif', 'save', { gallery: gallery('saved', journal), portal: async () => portal('delivered', journal) });
    expect(journal).toEqual(['gallery:m.webm:video/webm', 'gallery:m.gif:image/gif']);
  });

  test('une galerie en échec retombe sur le partage du système', async () => {
    const journal: string[] = [];
    expect(await deliverMessageCard(blob, 'm.png', 'save', { gallery: gallery('failed', journal), portal: async () => portal('delivered', journal) })).toBe('shared');
    expect(journal).toEqual(['gallery:m.png:image/png', 'portal:m.png']);
  });

  test('sans galerie : feuille de partage (iOS, Safari) ou téléchargement (bureau)', async () => {
    const journal: string[] = [];
    expect(await deliverMessageCard(blob, 'm.png', 'save', { gallery: null, portal: async () => portal('delivered', journal) })).toBe('shared');
    expect(journal).toEqual(['portal:m.png']);
  });

  test('une feuille fermée est une annulation, pas un échec', async () => {
    expect(await deliverMessageCard(blob, 'm.png', 'save', { gallery: null, portal: async () => portal('cancelled', []) })).toBe('cancelled');
  });

  test('aucune porte ⇒ indisponible', async () => {
    expect(await deliverMessageCard(blob, 'm.png', 'save', { gallery: null, portal: async () => null })).toBe('unavailable');
  });
});

describe('deliverMessageCard(« Partager ») — toujours la feuille du système', () => {
  test('la galerie n’est jamais touchée : l’utilisateur choisit où envoyer', async () => {
    const journal: string[] = [];
    expect(await deliverMessageCard(blob, 'm.png', 'share', { gallery: gallery('saved', journal), portal: async () => portal('delivered', journal) })).toBe('shared');
    expect(journal).toEqual(['portal:m.png']);
  });

  test('une feuille fermée reste une annulation, et sans porte rien ne part', async () => {
    expect(await deliverMessageCard(blob, 'm.png', 'share', { gallery: null, portal: async () => portal('cancelled', []) })).toBe('cancelled');
    expect(await deliverMessageCard(blob, 'm.png', 'share', { gallery: null, portal: async () => null })).toBe('unavailable');
  });
});

/**
 * #9038 — PARTAGER UNE CARTE IMAGÉE PARTAGE L'IMAGE, JAMAIS SON CHEMIN. Le
 * témoin traverse les VRAIES portes (`browserFileDeliveryHost` →
 * `fileDeliveryPortal`) et lit ce que la feuille du système reçoit : un
 * `File` image, et aucune chaîne (`text`, `url`, chemin, URL blob).
 */
describe('deliverMessageCard(« Partager ») — la feuille reçoit le FICHIER image (#9038)', () => {
  const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
  const documentLike = () =>
    ({ createElement: () => ({}) as HTMLElement, body: { appendChild: (el: HTMLElement) => el, removeChild: (el: HTMLElement) => el } }) as never;
  const urls = { createObjectURL: () => 'blob:https://meeshy.me/1', revokeObjectURL: () => undefined };
  const viaHost = (environment: FileDeliveryEnvironment) => ({
    gallery: null,
    portal: async () => fileDeliveryPortal(browserFileDeliveryHost(environment)),
  });
  type BridgeCall = { readonly methode: string; readonly options: Record<string, unknown> };
  const bridge = (calls: BridgeCall[]) => ({
    PluginHeaders: [{ name: 'MeeshyShare', methods: [{ name: 'share' }, { name: 'shareFile' }] }],
    nativePromise: async (_plugin: string, methode: string, options: object) => {
      calls.push({ methode, options: options as Record<string, unknown> });
      return undefined;
    },
  });

  test('navigateur à partage de fichiers : `share({ files: [File image/png] })`, rien d’autre', async () => {
    const shared: { readonly files: readonly File[] }[] = [];
    const navigatorLike = {
      canShare: (data: { files: File[] }) => data.files.every((file) => file.type.startsWith('image/')),
      share: async (data: { files: File[] }) => {
        shared.push(data);
      },
    };
    const outcome = await deliverMessageCard(png, 'meeshy-20261001-090507.png', 'share', viaHost({ document: documentLike(), navigator: navigatorLike, urls, shell: undefined }));
    expect(outcome).toBe('shared');
    expect(shared).toHaveLength(1);
    const [data] = shared;
    expect(Object.keys(data ?? {})).toEqual(['files']);
    expect(data?.files).toHaveLength(1);
    expect(data?.files[0]).toBeInstanceOf(File);
    expect(data?.files[0]?.type).toBe('image/png');
    expect(data?.files[0]?.name).toBe('meeshy-20261001-090507.png');
    expect(Object.values(data ?? {}).some((value) => typeof value === 'string')).toBe(false);
  });

  test('coque Android : le pont `shareFile` reçoit les OCTETS de l’image, jamais un chemin ni une URL', async () => {
    const calls: BridgeCall[] = [];
    expect(await deliverMessageCard(png, 'meeshy.png', 'share', viaHost({ document: documentLike(), navigator: {}, urls, shell: bridge(calls) }))).toBe('shared');
    expect(calls.map((call) => call.methode)).toEqual(['shareFile']);
    expect(calls[0]?.options).toEqual({ fileName: 'meeshy.png', mimeType: 'image/png', data: btoa(String.fromCharCode(137, 80, 78, 71)) });
  });

  test('une WebView qui expose `navigator.share` SANS fichiers passe par le pont de la coque, jamais par un lien', async () => {
    const calls: BridgeCall[] = [];
    const shared: object[] = [];
    const textOnly = {
      canShare: (data: { files?: File[] }) => data.files === undefined,
      share: async (data: object) => {
        shared.push(data);
      },
    };
    expect(await deliverMessageCard(png, 'meeshy.png', 'share', viaHost({ document: documentLike(), navigator: textOnly, urls, shell: bridge(calls) }))).toBe('shared');
    expect(shared).toEqual([]);
    expect(calls.map((call) => call.methode)).toEqual(['shareFile']);
    expect(calls[0]?.options['mimeType']).toBe('image/png');
  });

  test('sans partage de fichiers (bureau) : repli sur le téléchargement de l’image', async () => {
    const anchors: { href?: string; download?: string }[] = [];
    const doc = {
      createElement: () => {
        const anchor: { href?: string; download?: string; click: () => void } = { click: () => anchors.push(anchor) };
        return anchor as unknown as HTMLElement;
      },
      body: { appendChild: (el: HTMLElement) => el, removeChild: (el: HTMLElement) => el },
    } as never;
    expect(await deliverMessageCard(png, 'meeshy.png', 'share', viaHost({ document: doc, navigator: {}, urls, shell: undefined }))).toBe('shared');
    expect(anchors.map((anchor) => anchor.download)).toEqual(['meeshy.png']);
  });
});
