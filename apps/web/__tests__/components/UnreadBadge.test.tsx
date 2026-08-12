import { render } from '@testing-library/react';
import { UnreadBadge } from '@/components/notifications/UnreadBadge';

describe('UnreadBadge', () => {
  it('ne rend rien si count <= 0', () => {
    const { container } = render(<UnreadBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('ne rend rien pour un count négatif', () => {
    const { container } = render(<UnreadBadge count={-3} />);
    expect(container.firstChild).toBeNull();
  });

  it('affiche le compteur exact jusqu\'à 9', () => {
    const { container } = render(<UnreadBadge count={5} />);
    expect(container.textContent).toBe('5');
  });

  it('affiche "9+" au-delà de 9', () => {
    const { container } = render(<UnreadBadge count={42} />);
    expect(container.textContent).toBe('9+');
  });
});
