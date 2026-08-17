import { render, screen, fireEvent } from '@testing-library/react';
import { RiverBubble } from '../RiverBubble';
import type { RiverBubbleContent } from '../river-bubble-types';

const bubble = {
  messageId: 'm1',
  laneId: 'alice',
  laneIndex: 1,
  rank: 0,
  createdAtMs: 0,
  isViewer: false,
  replyToMessageId: null,
  isFirstInGroup: true,
} as const;

function makeContent(overrides: Partial<RiverBubbleContent> = {}): RiverBubbleContent {
  return {
    bubble: { ...bubble, ...(overrides.bubble ?? {}) },
    senderDisplayName: 'Alice',
    colorSeed: 'Alice',
    timeString: '10:32',
    text: "Un très long message sur plusieurs phrases, jamais tronqué — la loi §7ter A1 l'exige.",
    replyPreview: null,
    ...overrides,
  };
}

describe('RiverBubble — anatomie gelée du Fil (thread.*), R-134', () => {
  it('rend le texte EN ENTIER, sans classe de troncature (§7ter A1)', () => {
    render(<RiverBubble content={makeContent()} youLabel="Toi" />);
    const text = screen.getByTestId('river-bubble-text');
    expect(text).toHaveTextContent(makeContent().text);
    expect(text.className).not.toMatch(/truncate|line-clamp/);
  });

  it('tête de groupe (isFirstInGroup=true) : identité affichée, heure DANS l\'en-tête', () => {
    render(<RiverBubble content={makeContent()} youLabel="Toi" />);
    expect(screen.getByTestId('river-bubble-identity')).toBeInTheDocument();
    expect(screen.getByTestId('river-bubble-name')).toHaveTextContent('Alice');
  });

  it('suite de groupe (isFirstInGroup=false) : PAS d\'identité, heure en base de bulle', () => {
    render(
      <RiverBubble
        content={makeContent({ bubble: { ...bubble, isFirstInGroup: false } })}
        youLabel="Toi"
      />
    );
    expect(screen.queryByTestId('river-bubble-identity')).not.toBeInTheDocument();
    expect(screen.getByTestId('river-bubble-time')).toHaveTextContent('10:32');
  });

  it('le lecteur (isViewer=true) affiche youLabel, jamais le nom résolu', () => {
    render(
      <RiverBubble
        content={makeContent({ bubble: { ...bubble, isViewer: true } })}
        youLabel="Toi"
      />
    );
    expect(screen.getByTestId('river-bubble-name')).toHaveTextContent('Toi');
  });

  it('la citation reste TRONQUÉE sur une ligne (§7ter A4 — jamais "le message en entier")', () => {
    render(
      <RiverBubble
        content={makeContent({
          replyPreview: { authorDisplayName: 'Bob', text: 'une citation qui pourrait être longue' },
        })}
        youLabel="Toi"
      />
    );
    const quote = screen.getByTestId('river-bubble-quote');
    expect(quote.className).toMatch(/truncate/);
    expect(quote).toHaveTextContent('Bob');
  });

  it('appelle onSelect(messageId) au clic', () => {
    const onSelect = jest.fn();
    render(<RiverBubble content={makeContent()} youLabel="Toi" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('river-bubble'));
    expect(onSelect).toHaveBeenCalledWith('m1');
  });

  it('appelle onSelect(messageId) sur Entrée (a11y clavier)', () => {
    const onSelect = jest.fn();
    render(<RiverBubble content={makeContent()} youLabel="Toi" onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByTestId('river-bubble'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('m1');
  });

  it('consomme les tokens river.line/river.bubble (contour, rayon, écart) — jamais un littéral en dur', () => {
    render(<RiverBubble content={makeContent()} youLabel="Toi" />);
    const el = screen.getByTestId('river-bubble');
    expect(el.style.borderWidth).toBe('var(--lentille-river-line-width)');
    expect(el.style.borderRadius).toBe('var(--lentille-river-bubble-detour-radius)');
    expect(el.style.padding).toBe('var(--lentille-river-bubble-base-gap)');
  });
});
