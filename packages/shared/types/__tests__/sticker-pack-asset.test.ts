import { describe, it, expect } from 'vitest';
import { isStickerPackAssetRef, stickerPackAssetContentType, stickerPackAssetRef } from '../sticker-pack-asset';

const SHA = 'a3f1c0de9b8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a392817060f1e';

describe('stickerPackAssetRef — l’adresse d’un fichier de pack de tiers dans le magasin adressé (#10188)', () => {
  it('nomme le fichier par les 16 premiers caractères de son empreinte et l’extension de son type', () => {
    expect(stickerPackAssetRef({ sha256: SHA, mimeType: 'image/webp', sizeBytes: 4096 })).toEqual({ src: `${SHA.slice(0, 16)}.webp`, sha256: SHA, bytes: 4096 });
    expect(stickerPackAssetRef({ sha256: SHA, mimeType: 'image/gif', sizeBytes: 12 })?.src).toBe(`${SHA.slice(0, 16)}.gif`);
    expect(stickerPackAssetRef({ sha256: SHA, mimeType: 'image/png', sizeBytes: 12 })?.src).toBe(`${SHA.slice(0, 16)}.png`);
  });

  it('ne rend aucune adresse à un fichier sans empreinte : il reste servi par son ancien chemin', () => {
    expect(stickerPackAssetRef({ sha256: null, mimeType: 'image/png', sizeBytes: 12 })).toBeNull();
    expect(stickerPackAssetRef({ sha256: undefined, mimeType: 'image/png', sizeBytes: 12 })).toBeNull();
  });

  it('refuse une empreinte malformée ou un type que la porte des octets ne produit pas', () => {
    expect(stickerPackAssetRef({ sha256: SHA.toUpperCase(), mimeType: 'image/png', sizeBytes: 12 })).toBeNull();
    expect(stickerPackAssetRef({ sha256: SHA.slice(1), mimeType: 'image/png', sizeBytes: 12 })).toBeNull();
    expect(stickerPackAssetRef({ sha256: SHA, mimeType: 'image/svg+xml', sizeBytes: 12 })).toBeNull();
    expect(stickerPackAssetRef({ sha256: SHA, mimeType: 'image/png', sizeBytes: -1 })).toBeNull();
  });
});

describe('isStickerPackAssetRef — ce qu’un client accepte du fil', () => {
  it('accepte la référence produite par la passerelle', () => {
    expect(isStickerPackAssetRef(stickerPackAssetRef({ sha256: SHA, mimeType: 'image/gif', sizeBytes: 9 }))).toBe(true);
  });

  it('refuse une adresse qui ne commence pas par l’empreinte annoncée', () => {
    expect(isStickerPackAssetRef({ src: `${'0'.repeat(16)}.png`, sha256: SHA, bytes: 9 })).toBe(false);
  });

  it('refuse toute autre forme d’adresse', () => {
    expect(isStickerPackAssetRef({ src: `../${SHA.slice(0, 16)}.png`, sha256: SHA, bytes: 9 })).toBe(false);
    expect(isStickerPackAssetRef({ src: `${SHA.slice(0, 16)}.json`, sha256: SHA, bytes: 9 })).toBe(false);
    expect(isStickerPackAssetRef({ src: `${SHA.slice(0, 16)}.png`, sha256: SHA, bytes: 1.5 })).toBe(false);
    expect(isStickerPackAssetRef(null)).toBe(false);
    expect(isStickerPackAssetRef('x.png')).toBe(false);
  });
});

describe('stickerPackAssetContentType — le type servi pour une adresse', () => {
  it('rend le type de l’extension, et rien pour une autre forme', () => {
    expect(stickerPackAssetContentType(`${SHA.slice(0, 16)}.gif`)).toBe('image/gif');
    expect(stickerPackAssetContentType(`${SHA.slice(0, 16)}.webp`)).toBe('image/webp');
    expect(stickerPackAssetContentType(`${SHA.slice(0, 16)}.png`)).toBe('image/png');
    expect(stickerPackAssetContentType(`${SHA.slice(0, 16)}.json`)).toBeNull();
    expect(stickerPackAssetContentType(`${SHA.slice(0, 15)}.png`)).toBeNull();
  });
});
