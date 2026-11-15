import { describe, expect, test } from 'bun:test';

import type { StickerPackItem, StickerPackSummary } from '@meeshy/shared/types/sticker-pack';

import { decodePackDetail, decodePackSummary } from '@/lib/api/sticker-packs';
import { decodeShopPack } from '@/lib/api/packs-shop';

import { packStickerFile } from './file';
import { resolveStickerPackCoverSrc, resolveStickerPackFileSrc, stickerPackFileSrc } from './src';

/**
 * **UN FICHIER DE PACK DE TIERS SE LIT DANS LE MAGASIN ADRESSÉ** (#10188) —
 * quand la passerelle sert sa référence `asset` (ou `cover`), le client la
 * préfère à l'ancien chemin `/attachments/file/*` ; un ancien serveur, ou un
 * fichier pas encore rattrapé, garde l'ancien chemin. Une référence malformée
 * tombe seule : le sticker reste, sur son ancien chemin.
 */

const SHA = 'a3f1c0de9b8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a392817060f1e';
const ASSET = { src: `${SHA.slice(0, 16)}.webp`, sha256: SHA, bytes: 4096 } as const;
const ORIGIN = 'https://gate.meeshy.me';
const legacy = (fileUrl: string) => `${ORIGIN}/api/v1/attachments/file/${encodeURIComponent(fileUrl)}`;

const item = (over: Partial<StickerPackItem> = {}): StickerPackItem => ({
  key: 'bonjour', title: 'Bonjour', emoji: '👋', kind: 'static', mimeType: 'image/webp', fileUrl: 'sticker-packs/f1/bonjour.webp', width: 512, height: 512, zones: [], ...over,
});

const summary = (over: Partial<StickerPackSummary> = {}): StickerPackSummary => ({
  slug: 'chats-de-paris', name: 'Chats', description: 'Des chats', author: 'Studio', builtin: false, status: 'approved', itemCount: 1, kinds: ['static'],
  coverUrl: 'sticker-packs/f1/bonjour.webp', installed: false, installCount: 0, ...over,
});

const wireDetail = (itemExtra: Record<string, unknown>, summaryExtra: Record<string, unknown> = {}) => ({
  ...summary(), ...summaryExtra, items: [{ ...item(), ...itemExtra }],
});

describe('resolveStickerPackFileSrc — l’adresse d’un sticker de pack', () => {
  test('préfère le magasin adressé quand la référence est servie', () => {
    expect(resolveStickerPackFileSrc(item({ asset: ASSET }), { origin: ORIGIN, legacy })).toBe(`${ORIGIN}/api/v1/pack-assets/${ASSET.src}`);
  });

  test('garde l’ancien chemin sans référence, ou sans origine lisible', () => {
    expect(resolveStickerPackFileSrc(item(), { origin: ORIGIN, legacy })).toBe(legacy('sticker-packs/f1/bonjour.webp'));
    expect(resolveStickerPackFileSrc(item({ asset: ASSET }), { origin: '', legacy })).toBe(legacy('sticker-packs/f1/bonjour.webp'));
  });
});

describe('resolveStickerPackCoverSrc — la couverture d’un pack', () => {
  test('préfère la couverture adressée, puis l’ancien chemin, puis rien', () => {
    expect(resolveStickerPackCoverSrc(summary({ cover: ASSET }), { origin: ORIGIN, legacy })).toBe(`${ORIGIN}/api/v1/pack-assets/${ASSET.src}`);
    expect(resolveStickerPackCoverSrc(summary(), { origin: ORIGIN, legacy })).toBe(legacy('sticker-packs/f1/bonjour.webp'));
    expect(resolveStickerPackCoverSrc(summary({ coverUrl: null }), { origin: ORIGIN, legacy })).toBeNull();
  });
});

describe('packStickerFile — l’image qui part avec un sticker', () => {
  test('lit ses octets à l’adresse même que la feuille affiche', async () => {
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      return new Response(new Uint8Array([1, 2, 3]));
    };
    const sticker = item({ asset: ASSET });
    const file = await packStickerFile('chats-de-paris', sticker, {}, { fetcher });
    expect(asked).toEqual([stickerPackFileSrc(sticker)]);
    expect(file?.name).toBe('chats-de-paris-bonjour.webp');
  });
});

describe('le port des packs de stickers décode `asset` et `cover`, additifs', () => {
  test('une référence bien formée est gardée', () => {
    const detail = decodePackDetail(wireDetail({ asset: ASSET }, { cover: ASSET }));
    expect(detail?.items[0]?.asset).toEqual(ASSET);
    expect(detail?.cover).toEqual(ASSET);
    expect(decodePackSummary({ ...summary(), cover: ASSET })?.cover).toEqual(ASSET);
  });

  test('sans référence sur le fil, ni le sticker ni le pack n’en portent la clé', () => {
    const detail = decodePackDetail(wireDetail({}));
    expect(Object.hasOwn(detail!.items[0]!, 'asset')).toBe(false);
    expect(Object.hasOwn(detail!, 'cover')).toBe(false);
  });

  test('une référence malformée tombe seule : le sticker reste, sur son ancien chemin', () => {
    const forged = { src: '../../etc/passwd', sha256: SHA, bytes: 1 };
    const detail = decodePackDetail(wireDetail({ asset: forged }, { cover: { src: `${'0'.repeat(16)}.webp`, sha256: SHA, bytes: 1 } }));
    expect(detail?.items).toHaveLength(1);
    expect(Object.hasOwn(detail!.items[0]!, 'asset')).toBe(false);
    expect(Object.hasOwn(detail!, 'cover')).toBe(false);
  });

  test('la vitrine unique lit la couverture adressée d’un pack de stickers, et d’aucun autre domaine', () => {
    const wire = { slug: 'chats-de-paris', name: 'Chats', installed: false, coverUrl: 'sticker-packs/f1/bonjour.webp', cover: ASSET };
    expect(decodeShopPack('sticker')(wire)?.cover).toEqual(ASSET);
    expect(Object.hasOwn(decodeShopPack('wallpaper')(wire)!, 'cover')).toBe(false);
  });
});
