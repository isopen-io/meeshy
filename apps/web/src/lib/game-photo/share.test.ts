import { describe, expect, test } from 'bun:test';

import { shareImage } from './share';

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
