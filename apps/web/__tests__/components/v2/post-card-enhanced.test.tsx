import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PostCard } from '@/components/v2/PostCard';

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
});
