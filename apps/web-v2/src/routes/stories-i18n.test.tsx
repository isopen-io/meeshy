import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { StoryTrayGroup } from '@/lib/view/story-tray';

import { StoriesEmpty, StoriesHeader, StoriesLoadError, StoriesLoading, StoryRow } from './stories';

/**
 * **TOUTES LES STORIES PARLENT LA LANGUE D'INTERFACE** (#6547) — patron
 * `communities.test.tsx` : chaque pièce pure de `routes/stories.tsx` est
 * rendue sans DOM ni TanStack Query (`renderToStaticMarkup`), en français
 * puis en anglais, pour prouver qu'AUCUN des libellés relevés par #6488 ne
 * survit — plutôt qu'un titre isolé.
 */

const LABELS_FR = [
  'Retour aux conversations',
  'Chargement des stories…',
  "Les stories n'ont pas pu être chargées.",
  "Aucune story pour l'instant",
  'Les stories de vos contacts apparaîtront ici pendant vingt heures.',
  'Créer une story',
];

const group = (overrides: Partial<StoryTrayGroup> = {}): StoryTrayGroup => ({
  authorId: 'u-ines',
  author: { id: 'u-ines', displayName: 'Inès' },
  stories: [{ id: 's1', type: 'image', createdAt: new Date().toISOString() }],
  latestAt: Date.now(),
  hasUnseen: true,
  isMine: false,
  entryStoryId: 's1',
  ...overrides,
});

describe('routes/stories.tsx — le catalogue d’interface, pas le français en dur (#6547)', () => {
  test('l’en-tête réutilise `pending.back` et affiche le titre par défaut, en français', () => {
    const html = renderToStaticMarkup(<StoriesHeader language="fr" title="Stories" />);
    expect(html).toContain('aria-label="Revenir aux conversations"');
    expect(html).toContain('Stories');
  });

  test('rendu en anglais, aucune pièce ne porte un libellé français relevé par #6488', async () => {
    await loadInterfaceCatalog('en');
    const html = [
      renderToStaticMarkup(<StoriesHeader language="en" title="Stories" />),
      renderToStaticMarkup(<StoriesLoading language="en" />),
      renderToStaticMarkup(<StoriesLoadError language="en" />),
      renderToStaticMarkup(<StoriesEmpty language="en" />),
      renderToStaticMarkup(<StoryRow language="en" group={group({ stories: [group().stories[0]!, group().stories[0]!] })} />),
    ].join('\n');

    for (const label of LABELS_FR) {
      expect(html).not.toContain(label);
    }

    expect(html).toContain('Back to conversations');
    expect(html).toContain('Loading stories…');
    expect(html).toContain('Stories could not be loaded.');
    expect(html).toContain('No stories yet');
    expect(html).toContain('Stories from your contacts will appear here for twenty hours.');
    expect(html).toContain('Create a story');
    expect(html).toContain('2 stories');
  });

  test('une ligne de story mène au lecteur par l’id d’ENTRÉE du groupe, jamais par `?author=`', () => {
    const html = renderToStaticMarkup(<StoryRow language="fr" group={group({ entryStoryId: 's42' })} />);
    expect(html).toContain('href="/story/s42"');
    expect(html).not.toContain('?author=');
    expect(html).toContain('1 story<');
  });

  test('le compteur se décline au singulier et au pluriel, dans chaque langue', () => {
    expect(renderToStaticMarkup(<StoryRow language="fr" group={group()} />)).toContain('1 story<');
    expect(
      renderToStaticMarkup(<StoryRow language="fr" group={group({ stories: [group().stories[0]!, group().stories[0]!, group().stories[0]!] })} />),
    ).toContain('3 stories<');
  });
});
