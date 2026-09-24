import { beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { PortailPartage } from '@/lib/view/invitation';

import { shareStory } from './share-story';

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

function attend<T>(ms = 0): Promise<T> {
  return new Promise((resolve) => setTimeout(resolve, ms)) as Promise<T>;
}

describe('shareStory — l’adresse canonique, DANS le geste (D-48)', () => {
  test('le partage RÉUSSI n’annonce rien — la feuille du système a déjà parlé', async () => {
    const messages: string[] = [];
    let shared: { url: string } | undefined;
    const portail: PortailPartage = { share: async (d) => { shared = d; } };
    shareStory({ storyId: 'st-mienne', language: 'fr', announce: (m) => messages.push(m), portail });
    await attend();
    expect(shared?.url).toBe('https://meeshy.me/feeds/post/st-mienne');
    expect(messages).toEqual([]);
  });

  test('l’annulation n’annonce rien non plus', async () => {
    const messages: string[] = [];
    const portail: PortailPartage = {
      share: async () => {
        const error = new Error('cancelled');
        error.name = 'AbortError';
        throw error;
      },
    };
    shareStory({ storyId: 'st-mienne', language: 'fr', announce: (m) => messages.push(m), portail });
    await attend();
    expect(messages).toEqual([]);
  });

  test('le repli presse-papier ANNONCE la copie', async () => {
    const messages: string[] = [];
    const portail: PortailPartage = { copier: async () => {} };
    shareStory({ storyId: 'st-mienne', language: 'fr', announce: (m) => messages.push(m), portail });
    await attend();
    expect(messages).toEqual(['Lien copié — il ne reste qu’à le coller.']);
  });

  test('sans aucune porte, ANNONCE l’impossibilité de partager', async () => {
    const messages: string[] = [];
    shareStory({ storyId: 'st-mienne', language: 'fr', announce: (m) => messages.push(m), portail: {} });
    await attend();
    expect(messages).toEqual(['Impossible de partager la publication']);
  });
});
