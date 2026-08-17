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
    layout: 'lanes',
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

  // §7ter A.5 (2026-08-17) : l'interaction reste sur l'enveloppe EXTÉRIEURE
  // `river-bubble` (identité comprise) — `river-bubble-box` (la boîte
  // bordée) devient purement VISUEL (fond + contour, §7ter A.6).
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

  it('consomme les tokens river.line/river.bubble (contour, rayon, écart) — jamais un littéral en dur, en couloirs (layout: "lanes")', () => {
    render(<RiverBubble content={makeContent({ layout: 'lanes' })} youLabel="Toi" />);
    const el = screen.getByTestId('river-bubble-box');
    expect(el.style.borderWidth).toBe('var(--lentille-river-line-width)');
    expect(el.style.borderRadius).toBe('var(--lentille-river-bubble-detour-radius)');
    expect(el.style.padding).toBe('var(--lentille-river-bubble-base-gap)');
  });

  /**
   * §7ter A.6 — l'habillage suit le VERDICT DE FORME. En couloirs, une ligne
   * ABORDE la bulle : contour complet coloré. En sérialisé, AUCUNE ligne ne
   * l'aborde (axe horizontal retiré par la loi) : un contour complet coloré
   * y mimerait une branche qui n'existe plus — seuls le bord gauche et le
   * bord bas restent couleur d'auteur, le reste neutre.
   */
  describe('§7ter A.6 — habillage du contour selon le verdict de forme', () => {
    it('layout "lanes" : contour COMPLET coloré (couleur d\'auteur sur les 4 bords)', () => {
      render(<RiverBubble content={makeContent({ layout: 'lanes' })} youLabel="Toi" />);
      const el = screen.getByTestId('river-bubble-box');
      expect(el.style.borderWidth).toBe('var(--lentille-river-line-width)');
      expect(el.style.borderLeftWidth).toBe('');
      expect(el.style.borderBottomWidth).toBe('');
    });

    it('layout "serialized" : AUCUN contour complet coloré — bord gauche + bord bas SEULS, épaisseur du trait', () => {
      render(<RiverBubble content={makeContent({ layout: 'serialized' })} youLabel="Toi" />);
      const el = screen.getByTestId('river-bubble-box');
      // Les quatre côtés ne sont pas uniformes (gauche/bas diffèrent de
      // haut/droite) : le RACCOURCI CSS `border-width`/`border-color` se lit
      // alors vide (jsdom, comme un navigateur) — les LONGHANDS restent la
      // preuve fiable.
      expect(el.style.borderTopWidth).toBe('var(--lentille-river-bubble-flat-border-width)');
      expect(el.style.borderRightWidth).toBe('var(--lentille-river-bubble-flat-border-width)');
      expect(el.style.borderLeftWidth).toBe('var(--lentille-river-line-width)');
      expect(el.style.borderBottomWidth).toBe('var(--lentille-river-line-width)');
      expect(el.style.borderTopColor).toBe('hsl(var(--border))');
      expect(el.style.borderRightColor).toBe('hsl(var(--border))');
    });

    it('identité HORS de la boîte bordée : `river-bubble-identity` est un FRÈRE de `river-bubble-box`, jamais un enfant', () => {
      render(<RiverBubble content={makeContent()} youLabel="Toi" />);
      const identity = screen.getByTestId('river-bubble-identity');
      const box = screen.getByTestId('river-bubble-box');
      expect(box.contains(identity)).toBe(false);
      expect(identity.contains(box)).toBe(false);
      // Le nom en tête de groupe est BORNÉ — la branche croise du vide, jamais un mot.
      expect(screen.getByTestId('river-bubble-name').style.maxWidth).toBe(
        'var(--lentille-river-bubble-identity-name-max-width)'
      );
    });

    it('`river-bubble` (l\'enveloppe mesurée par registerRef) contient identité ET boîte', () => {
      render(<RiverBubble content={makeContent()} youLabel="Toi" />);
      const wrapper = screen.getByTestId('river-bubble');
      expect(wrapper.contains(screen.getByTestId('river-bubble-identity'))).toBe(true);
      expect(wrapper.contains(screen.getByTestId('river-bubble-box'))).toBe(true);
    });
  });
});
