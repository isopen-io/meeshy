import { describe, expect, it } from 'vitest';

import { isSmallMediaAutoDownload, SMALL_MEDIA_AUTO_DOWNLOAD_BYTES } from './small-media-auto-download';

describe('isSmallMediaAutoDownload', () => {
  it('fixe le seuil à 100 Ko, la valeur que les miroirs Swift et Kotlin reprennent', () => {
    expect(SMALL_MEDIA_AUTO_DOWNLOAD_BYTES).toBe(102_400);
  });

  it('télécharge seul un média de 99 999 octets en ligne', () => {
    expect(isSmallMediaAutoDownload({ sizeBytes: 99_999, online: true })).toBe(true);
  });

  it('télécharge seul un média de 102 399 octets en ligne', () => {
    expect(isSmallMediaAutoDownload({ sizeBytes: 102_399, online: true })).toBe(true);
  });

  it('rend la main à la politique réseau à 102 400 octets', () => {
    expect(isSmallMediaAutoDownload({ sizeBytes: 102_400, online: true })).toBe(false);
  });

  it('ne télécharge rien hors ligne, même un petit média', () => {
    expect(isSmallMediaAutoDownload({ sizeBytes: 10, online: false })).toBe(false);
  });

  it('ne décide rien sur une taille inconnue, nulle, négative ou non finie', () => {
    expect(isSmallMediaAutoDownload({ sizeBytes: 0, online: true })).toBe(false);
    expect(isSmallMediaAutoDownload({ sizeBytes: -1, online: true })).toBe(false);
    expect(isSmallMediaAutoDownload({ sizeBytes: Number.NaN, online: true })).toBe(false);
    expect(isSmallMediaAutoDownload({ sizeBytes: Number.POSITIVE_INFINITY, online: true })).toBe(false);
  });
});
