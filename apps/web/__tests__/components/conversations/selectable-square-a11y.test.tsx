/**
 * Iter 69w — a11y clavier (WCAG 2.1.1 / 4.1.2) de `SelectableSquare`, le
 * substitut de case à cocher utilisé partout dans le modal de création de lien
 * (langues, permissions). Avant : `<div onClick>` souris-only sans `role`,
 * `tabIndex`, `onKeyDown` ni `aria-checked`. Après : `role="checkbox"`
 * focusable, état exposé via `aria-checked`, activable Enter/Space, et
 * neutralisé quand `disabled`.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { SelectableSquare } from '@/components/conversations/create-link-modal/components/SelectableSquare';

const buildProps = (overrides = {}) => ({
  checked: false,
  onChange: jest.fn(),
  label: 'Allow messages',
  description: 'Anonymous users can send messages',
  ...overrides,
});

describe('SelectableSquare — keyboard a11y', () => {
  it('exposes a focusable checkbox with accessible name and state', () => {
    render(<SelectableSquare {...buildProps({ checked: true })} />);
    const box = screen.getByRole('checkbox', { name: 'Allow messages' });
    expect(box).toHaveAttribute('tabindex', '0');
    expect(box).toHaveAttribute('aria-checked', 'true');
  });

  it('reflects unchecked state via aria-checked', () => {
    render(<SelectableSquare {...buildProps({ checked: false })} />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
  });

  it('toggles on Enter key', () => {
    const onChange = jest.fn();
    render(<SelectableSquare {...buildProps({ checked: false, onChange })} />);
    fireEvent.keyDown(screen.getByRole('checkbox'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles on Space key', () => {
    const onChange = jest.fn();
    render(<SelectableSquare {...buildProps({ checked: true, onChange })} />);
    fireEvent.keyDown(screen.getByRole('checkbox'), { key: ' ' });
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('ignores keyboard activation when disabled and is removed from tab order', () => {
    const onChange = jest.fn();
    render(<SelectableSquare {...buildProps({ disabled: true, onChange })} />);
    const box = screen.getByRole('checkbox');
    expect(box).toHaveAttribute('tabindex', '-1');
    expect(box).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('preserves mouse click toggle', () => {
    const onChange = jest.fn();
    render(<SelectableSquare {...buildProps({ checked: false, onChange })} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
