import { render, screen } from '@testing-library/react';
import { PostContentText } from '@/components/v2/PostContentText';

describe('PostContentText', () => {
  it('renders a hashtag as a link to /hashtag/:tag', () => {
    render(<PostContentText content="Belle journée #paris aujourd'hui" />);
    const link = screen.getByRole('link', { name: '#paris' });
    expect(link).toHaveAttribute('href', '/hashtag/paris');
  });

  it('renders a mention as a link to /u/:username', () => {
    render(<PostContentText content="Salut @alice !" />);
    const link = screen.getByRole('link', { name: '@alice' });
    expect(link).toHaveAttribute('href', '/u/alice');
  });

  it('renders a bare URL as a clickable external link', () => {
    render(<PostContentText content="Voir https://example.com/page" />);
    const link = screen.getByRole('link', { name: 'https://example.com/page' });
    expect(link).toHaveAttribute('href', 'https://example.com/page');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toEqual(expect.stringContaining('noopener'));
  });

  it('leaves plain text as plain text — no link for a hash inside a word', () => {
    render(<PostContentText content="C#paris n'est pas un hashtag" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('does not treat a URL fragment as a hashtag', () => {
    render(<PostContentText content="Voir https://exemple.com/#section" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('https://exemple.com/#section');
  });

  it('renders mixed content with mention, hashtag, and URL together, in order', () => {
    render(<PostContentText content="@alice a partagé #paris via https://example.com" />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['@alice', '#paris', 'https://example.com']);
  });

  it('preserves line breaks', () => {
    const { container } = render(<PostContentText content={"Ligne 1\nLigne 2"} />);
    expect(container.textContent).toContain('Ligne 1');
    expect(container.textContent).toContain('Ligne 2');
    expect(container.querySelector('.whitespace-pre-wrap')).not.toBeNull();
  });

  it('renders plain content with no special segments as-is', () => {
    render(<PostContentText content="Rien de spécial ici" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Rien de spécial ici')).toBeInTheDocument();
  });
});
