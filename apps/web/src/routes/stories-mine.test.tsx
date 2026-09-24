import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { StoryTrayPost } from '@/lib/api/stories';

import { MyStoriesEmpty, MyStoryCard } from './stories-mine';

/**
 * **« MES STORIES » PARLE LA LANGUE D'INTERFACE, ET RESPECTE LA LOI 4**
 * (#6149) — patron `stories-i18n.test.tsx` : chaque pièce pure de
 * `routes/stories-mine.tsx` est rendue sans DOM ni TanStack Query
 * (`renderToStaticMarkup`), en français puis en anglais.
 */

const NOW = new Date('2026-09-24T12:00:00.000Z');

const story = (over: Partial<StoryTrayPost> & { readonly id: string }): StoryTrayPost => ({
  type: 'STORY',
  createdAt: '2026-09-22T12:00:00.000Z',
  author: { id: 'u-moi', username: 'moi' },
  ...over,
});

const noop = () => undefined;

describe('MyStoryCard — la carte rend ce qu’iOS rend', () => {
  test('la vignette est un lien VERS la story, libellé PAR LA DATE', () => {
    const html = renderToStaticMarkup(
      <ul>
        <MyStoryCard story={story({ id: 's1' })} language="fr" now={NOW} onOpenViews={noop} onRequestDelete={noop} deleteDisabled={false} />
      </ul>,
    );
    expect(html).toContain('href="/story/s1"');
    expect(html).toContain('aria-label="il y a 2 jours"');
  });

  test('« Vues » porte le compte quand il est positif', () => {
    const html = renderToStaticMarkup(
      <ul>
        <MyStoryCard story={story({ id: 's1', viewCount: 8 })} language="fr" now={NOW} onOpenViews={noop} onRequestDelete={noop} deleteDisabled={false} />
      </ul>,
    );
    expect(html).toContain('aria-label="8 vues"');
    expect(html).toMatch(/data-my-story-views[^>]*>[\s\S]*?>8</);
  });

  test('« Vues » ne montre JAMAIS un 0 décoratif', () => {
    const html = renderToStaticMarkup(
      <ul>
        <MyStoryCard story={story({ id: 's1', viewCount: 0 })} language="fr" now={NOW} onOpenViews={noop} onRequestDelete={noop} deleteDisabled={false} />
      </ul>,
    );
    expect(html).toContain('aria-label="Vues"');
    expect(html).not.toContain('>0<');
  });

  test('« Supprimer » est un BOUTON, pas un geste caché, avec une cible de 44 px', () => {
    const html = renderToStaticMarkup(
      <ul>
        <MyStoryCard story={story({ id: 's1' })} language="fr" now={NOW} onOpenViews={noop} onRequestDelete={noop} deleteDisabled={false} />
      </ul>,
    );
    expect(html).toMatch(/<button[^>]*data-my-story-delete[^>]*min-height:\s*44px/);
  });

  test('un bouton Supprimer désactivé le porte réellement', () => {
    const html = renderToStaticMarkup(
      <ul>
        <MyStoryCard story={story({ id: 's1' })} language="fr" now={NOW} onOpenViews={noop} onRequestDelete={noop} deleteDisabled />
      </ul>,
    );
    expect(html).toMatch(/<button[^>]*data-my-story-delete[^>]*disabled/);
  });

  test('rendu en anglais, la vignette et les actions parlent anglais', async () => {
    await loadInterfaceCatalog('en');
    const html = renderToStaticMarkup(
      <ul>
        <MyStoryCard story={story({ id: 's1', viewCount: 3 })} language="en" now={NOW} onOpenViews={noop} onRequestDelete={noop} deleteDisabled={false} />
      </ul>,
    );
    expect(html).toContain('aria-label="2 days ago"');
    expect(html).toContain('aria-label="Open"');
    expect(html).toContain('aria-label="Delete"');
    expect(html).toContain('aria-label="3 views"');
  });
});

describe('MyStoriesEmpty — l’état vide, mot pour mot iOS', () => {
  test('en français', () => {
    const html = renderToStaticMarkup(<MyStoriesEmpty language="fr" />);
    expect(html).toContain('Aucune story envoyée');
    expect(html).toContain('Vos stories publiées apparaîtront ici tant qu’elles sont actives.');
    expect(html).toContain('href="/stories/new"');
  });

  test('en anglais — aucun français ne survit', async () => {
    await loadInterfaceCatalog('en');
    const html = renderToStaticMarkup(<MyStoriesEmpty language="en" />);
    expect(html).toContain('No stories sent');
    expect(html).not.toContain('Aucune story');
  });
});
