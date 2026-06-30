/**
 * Tests for GroupCard
 * Focus: keyboard accessibility (WCAG 2.1.1 / 4.1.2) of the two mouse-only
 * controls — the group card itself (selection) and the identifier copy span.
 * Both must be exposed as focusable buttons activable via Enter/Space, with
 * the copy control stopping propagation so it never also selects the card.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GroupCard } from '../../../components/groups/GroupCard';
import type { Group } from '@meeshy/shared/types';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown> | string) => {
      if (typeof params === 'string') return params;
      const labels: Record<string, string> = {
        'card.openLabel': `Open ${params?.name ?? ''}`,
        'card.copyIdentifier': `Copy identifier ${params?.identifier ?? ''}`,
      };
      return labels[key] ?? key;
    },
  }),
}));

const makeGroup = (overrides: Partial<Group> = {}): Group =>
  ({
    id: 'g1',
    name: 'Designers',
    identifier: 'mshy_design-a1b2c3',
    description: 'A community',
    avatar: null,
    isPrivate: false,
    _count: { members: 3, conversations: 2 },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as unknown as Group;

const renderCard = (
  overrides: Partial<React.ComponentProps<typeof GroupCard>> = {}
) => {
  const onSelect = jest.fn();
  const onCopyIdentifier = jest.fn();
  render(
    <GroupCard
      group={makeGroup()}
      isSelected={false}
      onSelect={onSelect}
      onCopyIdentifier={onCopyIdentifier}
      copiedIdentifier={null}
      {...overrides}
    />
  );
  return { onSelect, onCopyIdentifier };
};

describe('GroupCard accessibility', () => {
  it('exposes the card as a focusable button with an accessible name', () => {
    renderCard();
    const card = screen.getByRole('button', { name: /open designers/i });
    expect(card).toHaveAttribute('tabindex', '0');
  });

  it('reflects selection through aria-pressed', () => {
    renderCard({ isSelected: true });
    expect(
      screen.getByRole('button', { name: /open designers/i })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects the group on Enter and Space', () => {
    const { onSelect } = renderCard();
    const card = screen.getByRole('button', { name: /open designers/i });
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('does not select the group on an unrelated key', () => {
    const { onSelect } = renderCard();
    const card = screen.getByRole('button', { name: /open designers/i });
    fireEvent.keyDown(card, { key: 'Tab' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('preserves mouse selection', () => {
    const { onSelect } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /open designers/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('exposes the identifier as a focusable copy button', () => {
    renderCard();
    const copy = screen.getByRole('button', { name: /copy identifier/i });
    expect(copy).toHaveAttribute('tabindex', '0');
    expect(copy).toHaveTextContent('design-a1b2c3');
  });

  it('copies the identifier on Enter without selecting the card', () => {
    const { onSelect, onCopyIdentifier } = renderCard();
    const copy = screen.getByRole('button', { name: /copy identifier/i });
    fireEvent.keyDown(copy, { key: 'Enter' });
    expect(onCopyIdentifier).toHaveBeenCalledWith(
      'mshy_design-a1b2c3',
      expect.anything()
    );
    expect(onSelect).not.toHaveBeenCalled();
  });
});
