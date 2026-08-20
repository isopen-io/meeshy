import { render, screen, fireEvent } from '@testing-library/react';
import { StreamThreadHeader } from '../StreamThreadHeader';

/**
 * L'en-tête d'identité de la conversation partagée (`/chat/:linkId`).
 *
 * Contrairement au `StreamHeader` du feed (masqué sous `md`), cet en-tête est
 * l'ANCRE de la vue anonyme : identité de la conversation (avatar accent +
 * titre), état vivant (participants, connexion, frappe) et la Lentille — le
 * sélecteur des modes de lecture Focal / Script / Bulles + densité `Aa`.
 */
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, paramsOrFallback?: Record<string, unknown> | string) => {
      if (typeof paramsOrFallback === 'string') return paramsOrFallback;
      if (paramsOrFallback) return `${key}:${JSON.stringify(paramsOrFallback)}`;
      return key;
    },
    isLoading: false,
  }),
}));

const baseProps = {
  title: 'Meeshy Crew',
  participantCount: 7,
  isConnected: true,
  typingUsers: [] as Array<{ id: string; displayName: string }>,
  readingMode: 'focal' as const,
  onReadingModeChange: jest.fn(),
  onToggleDensity: jest.fn(),
  onReconnect: jest.fn(),
};

describe('StreamThreadHeader', () => {
  beforeEach(() => jest.clearAllMocks());

  it('affiche le titre et son initiale dans la pastille accent', () => {
    render(<StreamThreadHeader {...baseProps} />);
    expect(screen.getByRole('heading', { name: 'Meeshy Crew' })).toBeInTheDocument();
    expect(screen.getByTestId('thread-header-avatar')).toHaveTextContent('M');
  });

  it('affiche le compteur de participants quand personne n’écrit', () => {
    render(<StreamThreadHeader {...baseProps} />);
    expect(screen.getByTestId('thread-header-subtitle').textContent).toContain('7');
  });

  it('la frappe remplace le sous-titre', () => {
    render(
      <StreamThreadHeader
        {...baseProps}
        typingUsers={[{ id: 'u1', displayName: 'Léa' }]}
      />
    );
    expect(screen.getByTestId('thread-header-subtitle').textContent).toContain('Léa');
  });

  it('monte la Lentille et la bascule de densité', () => {
    render(<StreamThreadHeader {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Lentille' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Densité de lecture' }));
    expect(baseProps.onToggleDensity).toHaveBeenCalledTimes(1);
  });

  it('déconnecté : propose la reconnexion', () => {
    render(<StreamThreadHeader {...baseProps} isConnected={false} />);
    fireEvent.click(screen.getByTestId('thread-header-reconnect'));
    expect(baseProps.onReconnect).toHaveBeenCalledTimes(1);
  });
});
