import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CommentItem } from '@/components/v2/CommentItem';
import { CommentList } from '@/components/v2/CommentList';
import { StatusBar } from '@/components/v2/StatusBar';
import type { PostComment } from '@meeshy/shared/types/post';

// useI18n is the only real dependency of TranslationToggle (via getFlag / cn is
// pure). Stub it so the REAL TranslationToggle resolves and renders served text.
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    tArray: () => [],
    locale: 'en',
    currentLanguage: 'en',
    setLocale: () => {},
    isLoading: false,
  }),
}));

jest.mock('@/components/v2/Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

jest.mock('@/hooks/queries/use-comments-query', () => ({
  useCommentRepliesQuery: () => ({
    data: undefined,
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
  }),
  useCommentRepliesList: () => [],
}));

// A comment written in Spanish, translated to English but NOT French. The
// reader's prism is ['fr', 'en'] — fr at rank 1 (in-app language), en at rank 4
// (device locale). fr has no translation, so descending the prism must serve
// the English translation. A rank-1-only resolver ('fr' alone) never consults
// rank 4 and falls back to the Spanish original — the exact rank-blindness the
// posts surface already fixed (cycle 120 follow-up).
const spanishComment: PostComment = {
  id: 'comment-es',
  postId: 'post-1',
  authorId: 'user-2',
  parentId: null,
  content: 'Hola mundo',
  originalLanguage: 'es',
  translations: { en: { text: 'Hello world' } },
  likeCount: 0,
  replyCount: 0,
  createdAt: new Date(Date.now() - 3600000).toISOString(),
  author: { id: 'user-2', username: 'john', displayName: 'John Doe', avatar: null },
} as unknown as PostComment;

describe('CommentItem — descends the ordered Prisme (rank-conscious)', () => {
  it('serves the English (rank-4) translation when rank 1 has none', () => {
    render(
      <CommentItem comment={spanishComment} preferredLanguages={['fr', 'en']} />,
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.queryByText('Hola mundo')).not.toBeInTheDocument();
  });
});

describe('CommentList — threads preferredLanguages to items', () => {
  it('serves the English translation for a list comment via the reader prism', () => {
    render(
      <CommentList
        postId="post-1"
        comments={[spanishComment]}
        preferredLanguages={['fr', 'en']}
      />,
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.queryByText('Hola mundo')).not.toBeInTheDocument();
  });
});

describe('StatusBar — descends the ordered Prisme (rank-conscious)', () => {
  it('serves the English (rank-4) translation in the popover when rank 1 has none', () => {
    render(
      <StatusBar
        statuses={[
          {
            id: 'status-es',
            author: { name: 'John' },
            moodEmoji: '😀',
            content: 'Hola mundo',
            originalLanguage: 'es',
            translations: [
              { languageCode: 'en', languageName: 'EN', content: 'Hello world' },
            ],
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
            isOwn: false,
          },
        ]}
        onStatusPress={jest.fn()}
        onAddStatus={jest.fn()}
        preferredLanguages={['fr', 'en']}
      />,
    );
    fireEvent.click(screen.getByText('John'));
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.queryByText('Hola mundo')).not.toBeInTheDocument();
  });
});
