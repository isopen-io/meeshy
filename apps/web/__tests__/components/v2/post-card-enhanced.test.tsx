import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PostCard } from '@/components/v2/PostCard';

const COMPONENTS_EN: Record<string, string> = {
  'post.pinned': 'Pinned',
  'post.menu': 'Post menu',
  'post.edit': 'Edit',
  'post.pin': 'Pin',
  'post.unpin': 'Unpin',
  'post.delete': 'Delete',
  'post.like': 'Like post',
  'post.unlike': 'Unlike post',
  'post.repost': 'Repost',
  'post.bookmark': 'Bookmark',
  'post.removeBookmark': 'Remove bookmark',
  'post.translate': 'Translate',
  'post.translatePost': 'Translate post',
  'post.imageAlt': 'Image {index}',
};

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, string> | string) => {
      if (typeof paramsOrFallback === 'string') return COMPONENTS_EN[key] ?? paramsOrFallback;
      const val = COMPONENTS_EN[key] ?? key;
      if (paramsOrFallback) return val.replace(/\{(\w+)\}/g, (_: string, k: string) => paramsOrFallback[k] ?? `{${k}}`);
      return val;
    },
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

jest.mock('@/components/v2/LanguageOrb', () => ({
  LanguageOrb: () => <span data-testid="language-orb" />,
}));

jest.mock('@/components/v2/TranslationToggle', () => ({
  TranslationToggle: ({ originalContent }: { originalContent: string }) => (
    <div data-testid="translation-toggle">{originalContent}</div>
  ),
}));

jest.mock('@/components/v2/flags', () => ({
  getLanguageName: (code: string) => code.toUpperCase(),
}));

describe('PostCard enhanced features', () => {
  const baseProps = {
    author: { name: 'Alice' },
    lang: 'en',
    content: 'Hello world',
    time: '2h',
    likes: 5,
    comments: 3,
  };

  it('renders bookmark button when onBookmark provided', () => {
    const onBookmark = jest.fn();
    render(<PostCard {...baseProps} onBookmark={onBookmark} />);
    const btn = screen.getByLabelText('Bookmark');
    fireEvent.click(btn);
    expect(onBookmark).toHaveBeenCalled();
  });

  it('shows filled bookmark when isBookmarked', () => {
    render(<PostCard {...baseProps} isBookmarked onBookmark={jest.fn()} />);
    expect(screen.getByLabelText('Remove bookmark')).toBeInTheDocument();
  });

  it('renders context menu for author', () => {
    render(<PostCard {...baseProps} isAuthor onEdit={jest.fn()} onDelete={jest.fn()} onPin={jest.fn()} />);
    fireEvent.click(screen.getByLabelText('Post menu'));
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Pin')).toBeInTheDocument();
  });

  it('shows Unpin when isPinned', () => {
    render(<PostCard {...baseProps} isAuthor isPinned onPin={jest.fn()} />);
    fireEvent.click(screen.getByLabelText('Post menu'));
    expect(screen.getByText('Unpin')).toBeInTheDocument();
  });

  it('calls onEdit from context menu', () => {
    const onEdit = jest.fn();
    render(<PostCard {...baseProps} isAuthor onEdit={onEdit} />);
    fireEvent.click(screen.getByLabelText('Post menu'));
    fireEvent.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalled();
  });

  it('calls onDelete from context menu', () => {
    const onDelete = jest.fn();
    render(<PostCard {...baseProps} isAuthor onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('Post menu'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalled();
  });

  it('does not show context menu for non-author', () => {
    render(<PostCard {...baseProps} isAuthor={false} onEdit={jest.fn()} />);
    expect(screen.queryByLabelText('Post menu')).not.toBeInTheDocument();
  });

  it('renders media images', () => {
    const media = [{ id: 'm-1', mimeType: 'image/jpeg', fileUrl: 'https://example.com/img.jpg', alt: 'A photo' }];
    render(<PostCard {...baseProps} media={media} />);
    expect(screen.getByAltText('A photo')).toBeInTheDocument();
  });

  describe('media download (Task 4, point 3)', () => {
    it('triggers a download and calls onDownloadMedia with the media id', () => {
      const media = [{ id: 'm-1', mimeType: 'image/jpeg', fileUrl: 'https://example.com/img.jpg', alt: 'A photo' }];
      const onDownloadMedia = jest.fn();
      const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      render(<PostCard {...baseProps} media={media} onDownloadMedia={onDownloadMedia} />);

      fireEvent.click(screen.getByLabelText('Download'));

      expect(clickSpy).toHaveBeenCalled();
      expect(onDownloadMedia).toHaveBeenCalledWith('m-1');
      clickSpy.mockRestore();
    });

    it('does not render a download button without onDownloadMedia', () => {
      const media = [{ id: 'm-1', mimeType: 'image/jpeg', fileUrl: 'https://example.com/img.jpg', alt: 'A photo' }];
      render(<PostCard {...baseProps} media={media} />);
      expect(screen.queryByLabelText('Download')).not.toBeInTheDocument();
    });
  });

  describe('audio media tile (Task 4, point 0bis)', () => {
    it('renders an identifiable audio tile with duration instead of an empty grey square', () => {
      const media = [{ id: 'm-1', mimeType: 'audio/webm', fileUrl: 'https://example.com/clip.webm', duration: 75 }];
      render(<PostCard {...baseProps} media={media} />);
      expect(screen.getByTestId('post-card-audio-tile')).toBeInTheDocument();
      expect(screen.getByText('1:15')).toBeInTheDocument();
    });

    it('renders the audio tile without a duration label when duration is unavailable', () => {
      const media = [{ id: 'm-1', mimeType: 'audio/mpeg', fileUrl: 'https://example.com/clip.mp3' }];
      render(<PostCard {...baseProps} media={media} />);
      expect(screen.getByTestId('post-card-audio-tile')).toBeInTheDocument();
      expect(screen.queryByText(/^\d+:\d{2}$/)).not.toBeInTheDocument();
    });
  });

  it('renders pinned badge', () => {
    render(<PostCard {...baseProps} isPinned />);
    expect(screen.getByText('Pinned')).toBeInTheDocument();
  });

  it('shows Translate button when no translations and different language', () => {
    const onTranslate = jest.fn();
    render(<PostCard {...baseProps} lang="ja" userLanguage="fr" onTranslate={onTranslate} />);
    const btn = screen.getByLabelText('Translate post');
    fireEvent.click(btn);
    expect(onTranslate).toHaveBeenCalled();
  });

  it('does not show Translate button when same language', () => {
    render(<PostCard {...baseProps} lang="fr" userLanguage="fr" onTranslate={jest.fn()} />);
    expect(screen.queryByLabelText('Translate post')).not.toBeInTheDocument();
  });

  it('calls onClick when content area is clicked', () => {
    const onClick = jest.fn();
    render(<PostCard {...baseProps} onClick={onClick} />);
    fireEvent.click(screen.getByText('Hello world'));
    expect(onClick).toHaveBeenCalled();
  });

  describe('report menu item (non-author)', () => {
    it('shows a menu with a Report entry for a non-author post', () => {
      render(<PostCard {...baseProps} isAuthor={false} onReport={jest.fn()} />);
      fireEvent.click(screen.getByLabelText('Post menu'));
      expect(screen.getByText('Report')).toBeInTheDocument();
    });

    it('calls onReport from the menu', () => {
      const onReport = jest.fn();
      render(<PostCard {...baseProps} isAuthor={false} onReport={onReport} />);
      fireEvent.click(screen.getByLabelText('Post menu'));
      fireEvent.click(screen.getByText('Report'));
      expect(onReport).toHaveBeenCalled();
    });

    it('does not offer Report on the author own post', () => {
      render(<PostCard {...baseProps} isAuthor onEdit={jest.fn()} onReport={jest.fn()} />);
      fireEvent.click(screen.getByLabelText('Post menu'));
      expect(screen.queryByText('Report')).not.toBeInTheDocument();
    });

    it('still hides the menu entirely for a non-author without onReport', () => {
      render(<PostCard {...baseProps} isAuthor={false} />);
      expect(screen.queryByLabelText('Post menu')).not.toBeInTheDocument();
    });
  });
});
