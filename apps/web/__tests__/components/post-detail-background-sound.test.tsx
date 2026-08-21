/**
 * Constat 2 (F7c, rattrapage revue Opus, BLOQUANT) — B3.6 exige le bouton 🔇
 * sur les 3 surfaces « carte, détail, plein écran » (`spec:118-119`). Le
 * détail (`PostDetail.tsx`) n'était pas touché DU TOUT par F3 : ni props, ni
 * `BackgroundSoundBadge` monté. Ce test prouve que `PostDetail` accepte les
 * MÊMES props que `PostCard` (`backgroundSound`/`backgroundSoundMeta`/
 * `backgroundSoundMuted`/`onToggleBackgroundSoundMute`) et monte le badge
 * dans la rangée auteur.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { PostDetail } from '@/components/v2/PostDetail';
import type { Post } from '@meeshy/shared/types/post';
import type { BackgroundSoundV3 } from '@meeshy/shared/types/canvas-v3';

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    authorId: 'user-1',
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'Hello',
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    viewCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    isPinned: false,
    isEdited: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Post;
}

const originalSound: BackgroundSoundV3 = { source: { t: 'original' }, volume: 1 };

describe('PostDetail — background sound badge (constat 2, B3.6 2nd of 3 surfaces)', () => {
  it('renders nothing when there is no background sound — no placeholder', () => {
    render(<PostDetail post={makePost()} comments={[]} />);
    expect(screen.queryByTestId('background-sound-badge')).toBeNull();
  });

  it('renders the badge when a background sound is passed', () => {
    render(<PostDetail post={makePost()} comments={[]} backgroundSound={originalSound} backgroundSoundMuted />);
    expect(screen.getByTestId('background-sound-badge')).toBeInTheDocument();
    expect(screen.getByTestId('background-sound-announcement')).toHaveTextContent('♫〰');
  });

  it('toggles the LOCAL mute state through onToggleBackgroundSoundMute', () => {
    const onToggle = jest.fn();
    render(
      <PostDetail
        post={makePost()}
        comments={[]}
        backgroundSound={originalSound}
        backgroundSoundMuted
        onToggleBackgroundSoundMute={onToggle}
      />,
    );
    fireEvent.click(screen.getByTestId('background-sound-mute-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
