/**
 * CommentList — expansion des threads de réponses + ciblage d'une réponse
 * depuis une notification (`?parent=<id>#comment-<replyId>`).
 *
 * Couvre :
 * - l'activation paresseuse de useCommentRepliesQuery (enabled à l'expansion) ;
 * - le rendu des réponses + « Load more replies » (curseur ASC) ;
 * - l'expansion automatique du thread du parent ciblé ;
 * - la chasse BORNÉE des pages de réponses jusqu'à la cible ;
 * - le scroll + surlignage de LA réponse (fallback : le parent).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { PostComment } from '@meeshy/shared/types/post';

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

jest.mock('@/hooks/composer/useMentions', () => ({
  useMentions: () => ({
    showMentionAutocomplete: false,
    mentionQuery: '',
    mentionPosition: { top: 0, left: 0 },
    handleTextChange: () => {},
    handleMentionSelect: () => {},
    closeMentionAutocomplete: () => {},
    getMentionedUserIds: () => [],
    clearMentionedUserIds: () => {},
  }),
}));

jest.mock('@/components/common/MentionAutocomplete', () => ({
  MentionAutocomplete: () => null,
}));

jest.mock('@/components/v2/Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

jest.mock('@/components/v2/TranslationToggle', () => ({
  TranslationToggle: ({ originalContent }: { originalContent: string }) => (
    <div data-testid="translation-toggle">{originalContent}</div>
  ),
}));

jest.mock('@/components/v2/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

// ── Mock contrôlable de la query des réponses ────────────────────────────────

interface MockRepliesState {
  replies: PostComment[];
  hasData: boolean;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
}

const mockFetchNextPage = jest.fn();
let repliesState: MockRepliesState;
const repliesQueryCalls: Array<{ postId: string; commentId: string; enabled?: boolean }> = [];

jest.mock('@/hooks/queries/use-comments-query', () => ({
  useCommentRepliesQuery: (options: { postId: string; commentId: string; enabled?: boolean }) => {
    repliesQueryCalls.push(options);
    return {
      data: repliesState.hasData
        ? { pages: [{ data: repliesState.replies }], pageParams: [] }
        : undefined,
      isLoading: repliesState.isLoading,
      isFetchingNextPage: repliesState.isFetchingNextPage,
      hasNextPage: repliesState.hasNextPage,
      fetchNextPage: mockFetchNextPage,
    };
  },
  useCommentRepliesList: (query: { data?: { pages: Array<{ data: PostComment[] }> } }) =>
    query.data ? query.data.pages.flatMap((page) => page.data) : [],
}));

import { CommentList } from '@/components/v2/CommentList';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const parentComment: PostComment = {
  id: 'c-parent',
  postId: 'post-1',
  authorId: 'user-1',
  parentId: null,
  content: 'Parent comment',
  likeCount: 0,
  replyCount: 2,
  createdAt: '2026-03-28T00:00:00Z',
  author: { id: 'user-1', username: 'alice', displayName: 'Alice', avatar: null },
};

const makeReply = (id: string): PostComment => ({
  id,
  postId: 'post-1',
  authorId: 'user-2',
  parentId: 'c-parent',
  content: `Reply ${id}`,
  likeCount: 0,
  replyCount: 0,
  createdAt: '2026-03-28T01:00:00Z',
  author: { id: 'user-2', username: 'bob', displayName: 'Bob', avatar: null },
});

function stubScrollIntoView(): { spy: jest.Mock; restore: () => void } {
  const spy = jest.fn();
  const original = (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView;
  (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = spy;
  return {
    spy,
    restore: () => {
      (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = original;
    },
  };
}

const lastRepliesCall = () => repliesQueryCalls[repliesQueryCalls.length - 1];

beforeEach(() => {
  jest.clearAllMocks();
  repliesQueryCalls.length = 0;
  repliesState = {
    replies: [],
    hasData: false,
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
  };
});

// ── Expansion manuelle ───────────────────────────────────────────────────────

describe('CommentList — reply thread expansion', () => {
  it('keeps the replies query disabled until the thread is expanded', () => {
    render(<CommentList postId="post-1" comments={[parentComment]} />);
    expect(lastRepliesCall()).toEqual(
      expect.objectContaining({ postId: 'post-1', commentId: 'c-parent', enabled: false }),
    );
  });

  it('enables the replies query and renders replies when clicking the replies button', () => {
    repliesState = { ...repliesState, hasData: true, replies: [makeReply('r-1'), makeReply('r-2')] };

    render(<CommentList postId="post-1" comments={[parentComment]} />);
    fireEvent.click(screen.getByText('2 replies'));

    expect(lastRepliesCall()).toEqual(expect.objectContaining({ enabled: true }));
    expect(screen.getByTestId('comment-item-r-1')).toBeInTheDocument();
    expect(screen.getByTestId('comment-item-r-2')).toBeInTheDocument();
    // Chaque rangée de réponse expose son ancre ciblable.
    expect(document.getElementById('comment-r-1')).not.toBeNull();
  });

  it('notifies onShowReplies when a thread is expanded', () => {
    const onShowReplies = jest.fn();
    render(<CommentList postId="post-1" comments={[parentComment]} onShowReplies={onShowReplies} />);
    fireEvent.click(screen.getByText('2 replies'));
    expect(onShowReplies).toHaveBeenCalledWith('c-parent');
  });

  it('loads more replies through the thread load-more button', () => {
    repliesState = {
      ...repliesState,
      hasData: true,
      replies: [makeReply('r-1')],
      hasNextPage: true,
    };

    render(<CommentList postId="post-1" comments={[parentComment]} />);
    fireEvent.click(screen.getByText('2 replies'));
    fireEvent.click(screen.getByTestId('load-more-replies'));

    expect(mockFetchNextPage).toHaveBeenCalled();
  });
});

// ── Ciblage d'une réponse (notification) ─────────────────────────────────────

describe('CommentList — reply targeting from a notification', () => {
  it('auto-expands the parent thread and scroll+highlights the targeted reply', () => {
    const { spy, restore } = stubScrollIntoView();
    repliesState = { ...repliesState, hasData: true, replies: [makeReply('r-1'), makeReply('r-2')] };

    render(
      <CommentList
        postId="post-1"
        comments={[parentComment]}
        targetCommentId="r-2"
        targetParentCommentId="c-parent"
      />,
    );

    // Thread déplié sans clic, query active.
    expect(lastRepliesCall()).toEqual(expect.objectContaining({ enabled: true }));
    // LA réponse est surlignée, pas le parent.
    expect(screen.getByTestId('comment-item-r-2').className).toContain('ring-1');
    expect(screen.getByTestId('comment-item-c-parent').className).not.toContain('ring-1');
    expect(spy).toHaveBeenCalled();
    restore();
  });

  it('hunts reply pages (bounded to 15) while the targeted reply is not loaded', () => {
    // La chasse épuisée retombe sur le parent (scroll) → stub nécessaire.
    const { restore } = stubScrollIntoView();
    repliesState = {
      ...repliesState,
      hasData: true,
      replies: [makeReply('r-1')],
      hasNextPage: true,
    };

    const props = {
      postId: 'post-1',
      comments: [parentComment],
      targetCommentId: 'r-99',
      targetParentCommentId: 'c-parent',
    };

    const { rerender } = render(<CommentList {...props} />);

    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);

    // Simule 20 cycles fetch → page arrivée sans la cible : la chasse relance
    // fetchNextPage à chaque page reçue, mais s'arrête à la borne de 15.
    for (let page = 2; page <= 21; page += 1) {
      repliesState = { ...repliesState, isFetchingNextPage: true };
      rerender(<CommentList {...props} />);
      repliesState = {
        ...repliesState,
        isFetchingNextPage: false,
        replies: Array.from({ length: page }, (_, i) => makeReply(`r-${i + 1}`)),
      };
      rerender(<CommentList {...props} />);
    }

    expect(mockFetchNextPage).toHaveBeenCalledTimes(15);
    restore();
  });

  it('falls back to scroll+highlight the parent when the reply cannot be found', () => {
    const { spy, restore } = stubScrollIntoView();
    repliesState = {
      ...repliesState,
      hasData: true,
      replies: [makeReply('r-1')],
      hasNextPage: false,
    };

    render(
      <CommentList
        postId="post-1"
        comments={[parentComment]}
        targetCommentId="r-gone"
        targetParentCommentId="c-parent"
      />,
    );

    expect(mockFetchNextPage).not.toHaveBeenCalled();
    expect(screen.getByTestId('comment-item-c-parent').className).toContain('ring-1');
    expect(spy).toHaveBeenCalled();
    restore();
  });

  it('hunts top-level pages for the PARENT when it is not loaded yet', () => {
    const onLoadMore = jest.fn();
    const otherTopLevel: PostComment = { ...parentComment, id: 'c-other', replyCount: 0 };

    render(
      <CommentList
        postId="post-1"
        comments={[otherTopLevel]}
        targetCommentId="r-2"
        targetParentCommentId="c-parent"
        hasMore
        onLoadMore={onLoadMore}
      />,
    );

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
