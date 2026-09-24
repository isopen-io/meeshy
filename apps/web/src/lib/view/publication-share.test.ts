import { beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { PortailPartage } from '@/lib/view/invitation';

import { sharePublicationLink } from './publication-share';

/**
 * `sharePublicationLink` (#7116, revue) — le SITE UNIQUE du partage d'une
 * publication. Le premier jet de #7116 en avait écrit une JUMELLE
 * (`lib/stories/share-story.ts`) à côté de `usePostGesture().onShare`, que la
 * spécification désignait comme « le site à PARTAGER, pas à recopier » : deux
 * copies du même geste, dont la suivante corrigerait une seule.
 */
beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function recorder() {
  const recorded: string[] = [];
  return { recorded, record: (postId: string) => void recorded.push(postId) };
}

describe('sharePublicationLink — l’adresse canonique, DANS le geste (D-48)', () => {
  test('la feuille du système est appelée SYNCHRONEMENT — avant tout `await`, sinon Safari la refuse hors activation', () => {
    const calls: string[] = [];
    const portal: PortailPartage = {
      share: async (data) => {
        calls.push(data.url);
      },
    };
    sharePublicationLink({ postId: 'st-mienne', language: 'fr', announce: () => undefined, record: () => undefined, portal });
    expect(calls).toEqual(['https://meeshy.me/feeds/post/st-mienne']);
  });

  test('un partage RÉUSSI est COMPTÉ et n’annonce rien — la feuille du système a déjà parlé', async () => {
    const messages: string[] = [];
    const { recorded, record } = recorder();
    sharePublicationLink({ postId: 'p1', language: 'fr', announce: (m) => messages.push(m), record, portal: { share: async () => undefined } });
    await settle();
    expect(recorded).toEqual(['p1']);
    expect(messages).toEqual([]);
  });

  test('l’annulation n’est ni comptée ni annoncée', async () => {
    const messages: string[] = [];
    const { recorded, record } = recorder();
    const portal: PortailPartage = {
      share: async () => {
        const error = new Error('cancelled');
        error.name = 'AbortError';
        throw error;
      },
    };
    sharePublicationLink({ postId: 'p2', language: 'fr', announce: (m) => messages.push(m), record, portal });
    await settle();
    expect(recorded).toEqual([]);
    expect(messages).toEqual([]);
  });

  test('le repli presse-papier est COMPTÉ et ANNONCE la copie', async () => {
    const messages: string[] = [];
    const { recorded, record } = recorder();
    sharePublicationLink({ postId: 'p3', language: 'fr', announce: (m) => messages.push(m), record, portal: { copier: async () => undefined } });
    await settle();
    expect(recorded).toEqual(['p3']);
    expect(messages).toEqual(['Lien copié — il ne reste qu’à le coller.']);
  });

  test('sans aucune porte : rien de compté, l’impossibilité ANNONCÉE', async () => {
    const messages: string[] = [];
    const { recorded, record } = recorder();
    sharePublicationLink({ postId: 'p4', language: 'fr', announce: (m) => messages.push(m), record, portal: {} });
    await settle();
    expect(recorded).toEqual([]);
    expect(messages).toEqual(['Impossible de partager la publication']);
  });
});
