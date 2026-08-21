/**
 * Constat 4 (BLOQUANT, rejet DoD de F7d) — preuve BOUT EN BOUT que la
 * langue d'origine concourt de nouveau à son rang dans le Prisme (règle 3,
 * CLAUDE.md) une fois la story lue par le vrai funnel de production
 * (`postToStoryData` → `CanvasV3Scene`), sans aucune `locale` posée à la
 * main dans le fixture — exactement le scénario que le DoD a démontré cassé
 * par sonde jetable : texte anglais sans `locale`, prisme `['en','fr']`,
 * traduction `fr` disponible → l'ancien état rendait « Bonjour » au lieu de
 * « Hello there ».
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { Post } from '@meeshy/shared/types/post';

import { CanvasV3Scene } from '@/components/v2/CanvasV3Scene';
import { postToStoryData } from '@/lib/story-transforms';

function createPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    authorId: 'author-1',
    type: 'STORY',
    visibility: 'FRIENDS',
    content: 'Hello there',
    originalLanguage: 'en',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe('Prisme end-to-end — origin language competes at its rank (constat 4)', () => {
  it('serves the English original to an English-primary reader, not the French translation, though the emitted object never carries a hand-set locale', () => {
    const post = createPost({
      storyEffects: {
        v: 3,
        scenes: [{
          id: 's1',
          objects: [{
            id: 't1',
            kind: 'text',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'fg',
            z: 0,
            transform: { scale: 1, rotation: 0, opacity: 1 },
            // Pas de `locale` ici : c'est exactement la forme émise en
            // production par `StoryComposer` (aucun sélecteur de langue).
            payload: { text: 'Hello there', translations: { fr: 'Bonjour' } },
          }],
        }],
      },
    });

    const story = postToStoryData(post);
    render(<CanvasV3Scene doc={story.storyEffects as CanvasV3Doc} preferredLanguages={['en', 'fr']} />);

    expect(screen.getByTestId('canvas-v3-object-t1')).toHaveTextContent('Hello there');
    expect(screen.queryByText('Bonjour')).not.toBeInTheDocument();
  });
});

// `storyEffects` de `StoryData` est un sur-ensemble structurel de `CanvasV3`
// (mêmes clés `v`/`scenes`/`sound`) — alias local pour satisfaire le prop
// `doc: CanvasV3` de `CanvasV3Scene` sans dupliquer le type ici.
type CanvasV3Doc = import('@meeshy/shared/types/canvas-v3').CanvasV3;
