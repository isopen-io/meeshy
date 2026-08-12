/**
 * Tests for ConversationGroup section header
 * Focus: keyboard accessibility of the collapsible section header
 * (role/tabindex/aria-expanded + Enter/Space activation).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationGroup } from '../../../components/conversations/conversation-groups/ConversationGroup';

const t = (_key: string, fallback?: string) => fallback ?? _key;

const renderGroup = (overrides: Partial<React.ComponentProps<typeof ConversationGroup>> = {}) =>
  render(
    <ConversationGroup
      type="pinned"
      sectionId="pinned"
      isCollapsed={false}
      hasUnreadMessages={false}
      onToggleSection={jest.fn()}
      t={t}
      categoriesLength={0}
      conversations={[]}
      {...overrides}
    >
      <div data-testid="group-children">child</div>
    </ConversationGroup>
  );

describe('ConversationGroup section header', () => {
  it('exposes the collapsible header as a keyboard-focusable button', () => {
    renderGroup();

    const header = screen.getByRole('button', { name: /pinned/i });
    expect(header).toHaveAttribute('tabindex', '0');
  });

  it('reflects the expanded state via aria-expanded when open', () => {
    renderGroup({ isCollapsed: false });

    expect(screen.getByRole('button', { name: /pinned/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('reflects the collapsed state via aria-expanded when closed', () => {
    renderGroup({ isCollapsed: true });

    expect(screen.getByRole('button', { name: /pinned/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles the section on click', () => {
    const onToggleSection = jest.fn();
    renderGroup({ onToggleSection, sectionId: 'pinned' });

    fireEvent.click(screen.getByRole('button', { name: /pinned/i }));

    expect(onToggleSection).toHaveBeenCalledWith('pinned');
  });

  it('toggles the section on Enter', () => {
    const onToggleSection = jest.fn();
    renderGroup({ onToggleSection, sectionId: 'pinned' });

    fireEvent.keyDown(screen.getByRole('button', { name: /pinned/i }), { key: 'Enter' });

    expect(onToggleSection).toHaveBeenCalledWith('pinned');
  });

  it('toggles the section on Space and prevents page scroll', () => {
    const onToggleSection = jest.fn();
    renderGroup({ onToggleSection, sectionId: 'pinned' });

    const notPrevented = fireEvent.keyDown(screen.getByRole('button', { name: /pinned/i }), { key: ' ' });

    expect(onToggleSection).toHaveBeenCalledWith('pinned');
    expect(notPrevented).toBe(false);
  });

  it('does not toggle the section on unrelated keys', () => {
    const onToggleSection = jest.fn();
    renderGroup({ onToggleSection });

    const header = screen.getByRole('button', { name: /pinned/i });
    fireEvent.keyDown(header, { key: 'a' });
    fireEvent.keyDown(header, { key: 'Tab' });
    fireEvent.keyDown(header, { key: 'Escape' });

    expect(onToggleSection).not.toHaveBeenCalled();
  });
});
