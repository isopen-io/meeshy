import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  ExpandableMessageText,
  exceedsLimit,
  truncateAtWord,
  MESSAGE_TRUNCATE_LIMIT,
} from '../ExpandableMessageText';

// useI18n → libellé stable « Voir plus » (clé common.showMore).
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'showMore' ? 'Voir plus' : key),
  }),
}));

const short = 'Bonjour';
const longNoSpace = 'a'.repeat(MESSAGE_TRUNCATE_LIMIT + 50);
const longWithSpaces = `${'mot '.repeat(200)}fin`; // > 512 caractères, avec espaces
const overLimitRun = 'a'.repeat(MESSAGE_TRUNCATE_LIMIT + 1); // signature « non tronqué »

describe('truncateAtWord (parité iOS BubbleExpandableText.truncateAtWord)', () => {
  it('renvoie la chaîne complète quand plus courte que la limite', () => {
    expect(truncateAtWord('hello', 100)).toBe('hello');
  });

  it('tronque au dernier espace', () => {
    expect(truncateAtWord('hello world this is a test', 14)).toBe('hello world');
  });

  it('coupe net quand il n’y a aucun espace', () => {
    expect(truncateAtWord('abcdefghijklmnop', 5)).toBe('abcde');
  });
});

describe('exceedsLimit (parité iOS BubbleExpandableText.exceeds)', () => {
  it('false quand plus court que la limite', () => {
    expect(exceedsLimit('hello', 10)).toBe(false);
  });

  it('false quand exactement à la limite (count > limit, pas >=)', () => {
    expect(exceedsLimit('12345', 5)).toBe(false);
  });

  it('true quand un caractère au-dessus', () => {
    expect(exceedsLimit('123456', 5)).toBe(true);
  });
});

describe('<ExpandableMessageText />', () => {
  it('message court : texte complet, aucun bouton', () => {
    const { container } = render(<ExpandableMessageText content={short} />);
    expect(container).toHaveTextContent(short);
    expect(screen.queryByRole('button', { name: 'Voir plus' })).toBeNull();
  });

  it('message long : texte tronqué (+ « … ») et bouton « Voir plus »', () => {
    const { container } = render(<ExpandableMessageText content={longNoSpace} />);
    expect(screen.getByRole('button', { name: 'Voir plus' })).toBeInTheDocument();
    expect(container.textContent).toContain('...');
    // Tronqué : la séquence complète au-delà de la limite n'est PAS rendue.
    expect(container.textContent).not.toContain(overLimitRun);
  });

  it('clic « Voir plus » : déplie définitivement (texte complet, bouton disparaît)', () => {
    const { container } = render(<ExpandableMessageText content={longWithSpaces} />);
    fireEvent.click(screen.getByRole('button', { name: 'Voir plus' }));
    expect(container).toHaveTextContent(longWithSpaces);
    expect(screen.queryByRole('button', { name: 'Voir plus' })).toBeNull();
  });

  it('isolation : déplier une instance n’affecte pas les autres', () => {
    render(
      <div>
        <div data-testid="bubble-a">
          <ExpandableMessageText content={longNoSpace} />
        </div>
        <div data-testid="bubble-b">
          <ExpandableMessageText content={longNoSpace} />
        </div>
      </div>
    );

    expect(screen.getAllByRole('button', { name: 'Voir plus' })).toHaveLength(2);

    const a = within(screen.getByTestId('bubble-a'));
    const b = within(screen.getByTestId('bubble-b'));

    fireEvent.click(a.getByRole('button', { name: 'Voir plus' })); // déplie A uniquement

    // A : bouton parti + contenu complet ; B : intact (bouton + tronqué)
    expect(a.queryByRole('button', { name: 'Voir plus' })).toBeNull();
    expect(b.getByRole('button', { name: 'Voir plus' })).toBeInTheDocument();
    expect(screen.getByTestId('bubble-a').textContent).toContain(overLimitRun);
    expect(screen.getByTestId('bubble-b').textContent).not.toContain(overLimitRun);
  });
});
