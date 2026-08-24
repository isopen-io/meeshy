/**
 * Cycle 123 — commentaires et statuts (web) deviennent conscients du RANG.
 *
 * `CommentItem` et `StatusBar` ne recevaient qu'une langue unique
 * (`userLanguage`, rang 1). Corrects, mais aveugles à toute traduction d'un
 * rang inférieur — cas NOMINAL dès que la locale appareil (rang 4) diffère de
 * la langue applicative. Ils reçoivent désormais le prisme ORDONNÉ, comme
 * `PostCard` / `PostDetail` depuis le cycle 120.
 *
 * Les témoins s'écrivent au rang 2 : au rang 1, le défaut et la règle juste
 * rendent le même verdict (leçon 261).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { CommentItem } from '@/components/v2/CommentItem';
import { StatusBar } from '@/components/v2/StatusBar';
import type { StatusItem } from '@/components/v2/StatusBar';
import type { PostComment } from '@meeshy/shared/types/post';

function comment(overrides: Partial<PostComment> = {}): PostComment {
  return {
    id: 'comment-1',
    postId: 'post-1',
    authorId: 'author-1',
    author: { id: 'author-1', username: 'bob', displayName: 'Bob', avatar: null },
    content: 'Hello',
    originalLanguage: 'en',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    likeCount: 0,
    replyCount: 0,
    isEdited: false,
    ...overrides,
  } as PostComment;
}

function status(overrides: Partial<StatusItem> = {}): StatusItem {
  return {
    id: 'status-1',
    author: { name: 'Bob' },
    moodEmoji: '🙂',
    content: 'Hello',
    originalLanguage: 'en',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    isOwn: false,
    ...overrides,
  };
}

describe('CommentItem — le Prisme descend jusqu’au rang servi', () => {
  it('sert la traduction du rang 2 quand le rang 1 est absent', () => {
    render(
      <CommentItem
        comment={comment({ translations: { fr: { text: 'Bonjour' } } as never })}
        preferredLanguages={['de', 'fr']}
      />,
    );

    expect(screen.getByText('Bonjour')).toBeInTheDocument();
    expect(screen.queryByText('Hello')).toBeNull();
  });

  it('sert l’original quand aucune langue du prisme n’est disponible', () => {
    render(
      <CommentItem
        comment={comment({ translations: { es: { text: 'Hola' } } as never })}
        preferredLanguages={['de', 'fr']}
      />,
    );

    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});

describe('StatusBar — le Prisme descend jusqu’au rang servi', () => {
  it('sert la traduction du rang 2 dans le popover', () => {
    render(
      <StatusBar
        statuses={[
          status({
            translations: [{ languageCode: 'fr', languageName: 'Français', content: 'Bonjour' }],
          }),
        ]}
        onStatusPress={jest.fn()}
        onAddStatus={jest.fn()}
        preferredLanguages={['de', 'fr']}
      />,
    );

    fireEvent.click(screen.getByText('Bob'));

    expect(screen.getByText('Bonjour')).toBeInTheDocument();
    expect(screen.queryByText('Hello')).toBeNull();
  });
});
