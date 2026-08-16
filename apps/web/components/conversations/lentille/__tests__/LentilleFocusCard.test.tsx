/**
 * WL-108 (LWS-8) — `LentilleFocusCard` : la carte de la conversation élue et
 * son encoche.
 *
 * behaviour-matrix:L08 — « le badge de type (groupe/canal/bot + memberCount)
 * est absorbé par la focus card (chip) et l'anneau accent ». Le rang plat
 * n'en rend aucun (`LentilleRow`, WL-102) ; ces tests prouvent que la carte
 * en est bien le domicile côté web, comme `LentilleFocusCard.swift` l'est
 * côté iOS.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Conversation } from '@meeshy/shared/types';
import type { OrchestratorDecision } from '@meeshy/shared/utils/reading-modes';

import { LentilleFocusCard } from '../LentilleFocusCard';

const conv = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c1',
    type: 'group',
    title: 'Équipe',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 4,
    participants: [],
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  }) as unknown as Conversation;

/**
 * `t` de test : les VALEURS `fr` réelles des clés de mode (l'existence des
 * clés dans les quatre locales est prouvée ailleurs, `__tests__/locales/
 * lentille-i18n-keys.test.ts`), avec la même interpolation `{param}` que
 * `useI18n`. Le libellé composé est ce que ces tests vérifient — une clé
 * brute ne prouverait pas que « AUTO · <décision> » se compose.
 */
const FR: Readonly<Record<string, string>> = {
  'lentille.modes.auto': 'Auto',
  'lentille.modes.focal': 'Focal',
  'lentille.modes.script': 'Script',
  'lentille.modes.resume': 'Résumé',
  'lentille.modes.riviere': 'Rivière',
  'lentille.modes.bubbles': 'Bulles',
  'lentille.modes.autoBadge': 'AUTO · {decision}',
};

const t = (key: string, params?: Record<string, unknown> | string): string => {
  const template = FR[key] ?? key;
  if (!params || typeof params === 'string') return template;
  return Object.entries(params).reduce<string>(
    (acc, [name, value]) => acc.replace(`{${name}}`, String(value)),
    template
  );
};

const AUTO_DECISION: OrchestratorDecision = { mode: 'focal', reason: 'default' };

const baseProps = {
  conversation: conv(),
  preference: 'auto' as const,
  decision: AUTO_DECISION,
  t,
  onNotchTap: jest.fn(),
};

describe('LentilleFocusCard', () => {
  beforeEach(() => (baseProps.onNotchTap as jest.Mock).mockClear());

  it('rend un fond + un ring interne à l\'accent DE CETTE conversation (`--row-accent`)', () => {
    render(<LentilleFocusCard {...baseProps} />);
    const card = screen.getByTestId('lentille-focus-card');

    expect(card).toHaveClass('bg-secondary');
    expect(card.style.boxShadow).toContain('inset');
    expect(card.style.boxShadow).toContain('var(--row-accent)');
    expect(card.style.boxShadow).toContain('var(--lentille-list-focus-card-ring-size)');
  });

  it('cote son radius par le token, jamais en dur (garde R15)', () => {
    render(<LentilleFocusCard {...baseProps} />);
    expect(screen.getByTestId('lentille-focus-card').style.borderRadius).toBe(
      'var(--lentille-list-focus-card-radius)'
    );
  });

  it("ne participe à aucun flux : hauteur du rang inchangée, zéro relayout (§4.2)", () => {
    render(<LentilleFocusCard {...baseProps} />);
    expect(screen.getByTestId('lentille-focus-card')).toHaveClass('absolute');
    expect(screen.getByTestId('lentille-focus-card-notch')).toHaveClass('absolute');
    // Aucune hauteur écrite nulle part — la carte PEINT, elle ne dimensionne pas.
    expect(screen.getByTestId('lentille-focus-card').style.height).toBe('');
  });

  it('fond et chip sont décoratifs : aria-hidden et jamais hit-testables', () => {
    render(<LentilleFocusCard {...baseProps} />);
    expect(screen.getByTestId('lentille-focus-card')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('lentille-focus-card')).toHaveClass('pointer-events-none');
    expect(screen.getByTestId('lentille-focus-card-type-chip')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('lentille-focus-card-type-chip')).toHaveClass('pointer-events-none');
  });

  it('reduce motion ⇒ FOND SEUL : le ring disparaît, la carte reste (critère LWS-8)', () => {
    render(<LentilleFocusCard {...baseProps} reducedMotion />);
    const card = screen.getByTestId('lentille-focus-card');
    expect(card).toBeInTheDocument();
    expect(card).toHaveClass('bg-secondary');
    expect(card.style.boxShadow).toBe('');
  });

  describe('encoche', () => {
    it("affiche « AUTO · <décision> » quand la préférence est `auto` — ce qui VA se passer", () => {
      render(<LentilleFocusCard {...baseProps} />);
      // La décision interpolée est bien le NOM DU MODE RENDU, pas « Auto ».
      expect(screen.getByTestId('lentille-focus-card-notch').textContent).toBe('AUTO · Focal');
    });

    it("affiche le CHIP du mode mémorisé (sans « AUTO · ») quand un mode est forcé", () => {
      render(
        <LentilleFocusCard
          {...baseProps}
          preference="script"
          decision={{ mode: 'script', reason: 'sticky' }}
        />
      );
      const notch = screen.getByTestId('lentille-focus-card-notch');
      expect(notch.textContent).toBe('Script');
      expect(notch.textContent).not.toContain('AUTO');
    });

    it('traduit une décision `summary`/`river` avec les noms du menu (Résumé/Rivière)', () => {
      const { rerender } = render(
        <LentilleFocusCard {...baseProps} decision={{ mode: 'summary', reason: 'unread-over-cap' }} />
      );
      expect(screen.getByTestId('lentille-focus-card-notch').textContent).toBe('AUTO · Résumé');

      rerender(<LentilleFocusCard {...baseProps} decision={{ mode: 'river', reason: 'sticky' }} />);
      expect(screen.getByTestId('lentille-focus-card-notch').textContent).toBe('AUTO · Rivière');
    });

    it("est le SEUL élément actionnable de la carte, et un vrai bouton", () => {
      render(<LentilleFocusCard {...baseProps} />);
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveAttribute('data-testid', 'lentille-focus-card-notch');
    });

    it("notifie le montage au clic, SANS laisser le clic ouvrir la conversation", () => {
      const onRowClick = jest.fn();
      render(
        <div onClick={onRowClick}>
          <LentilleFocusCard {...baseProps} />
        </div>
      );

      fireEvent.click(screen.getByTestId('lentille-focus-card-notch'));

      expect(baseProps.onNotchTap).toHaveBeenCalledTimes(1);
      expect(onRowClick).not.toHaveBeenCalled();
    });

    it('cote sa typographie et son ancrage par les tokens (§4.3), jamais en dur', () => {
      render(<LentilleFocusCard {...baseProps} />);
      const notch = screen.getByTestId('lentille-focus-card-notch');
      expect(notch.style.fontSize).toBe('var(--lentille-list-mode-notch-size)');
      expect(notch.style.fontWeight).toBe('var(--lentille-list-mode-notch-weight)');
      expect(notch.style.top).toBe('var(--lentille-list-mode-notch-top)');
      expect(notch.style.right).toBe('var(--lentille-list-mode-notch-right)');
    });

    it("porte un aria-label = son texte (l'utilisateur entend la décision, pas « bouton »)", () => {
      render(<LentilleFocusCard {...baseProps} preference="focal" />);
      expect(screen.getByTestId('lentille-focus-card-notch')).toHaveAttribute(
        'aria-label',
        'Focal'
      );
    });
  });

  describe('behaviour-matrix:L08 — chip de type absorbé par la carte', () => {
    it('rend le chip + le compte de membres hors conversation directe', () => {
      render(<LentilleFocusCard {...baseProps} conversation={conv({ type: 'group', memberCount: 4 })} />);
      expect(screen.getByTestId('lentille-focus-card-type-chip')).toBeInTheDocument();
      expect(screen.getByTestId('lentille-focus-card-member-count')).toHaveTextContent('4');
    });

    it("ne rend AUCUN chip en conversation directe (l'avatar unique le dit déjà)", () => {
      render(<LentilleFocusCard {...baseProps} conversation={conv({ type: 'direct', memberCount: 2 })} />);
      expect(screen.queryByTestId('lentille-focus-card-type-chip')).not.toBeInTheDocument();
    });

    it("omet le compte quand il ne dit rien (memberCount ≤ 1)", () => {
      render(<LentilleFocusCard {...baseProps} conversation={conv({ type: 'channel', memberCount: 1 })} />);
      expect(screen.getByTestId('lentille-focus-card-type-chip')).toBeInTheDocument();
      expect(screen.queryByTestId('lentille-focus-card-member-count')).not.toBeInTheDocument();
    });

    it('teinte le chip à l\'accent du rang (`--row-accent`), jamais une couleur fixe', () => {
      render(<LentilleFocusCard {...baseProps} />);
      expect(screen.getByTestId('lentille-focus-card-type-chip').style.color).toBe('var(--row-accent)');
    });
  });
});
