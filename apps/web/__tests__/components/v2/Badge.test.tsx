import { render } from '@testing-library/react';
import React from 'react';
import { Badge } from '@/components/v2/Badge';

/**
 * Badge variants must source their colors from the Meeshy design-system
 * CSS variables (--gp-*) so they adapt to light/dark mode. Hardcoded hex
 * values from the legacy v1 palette do not react to theme changes.
 */
describe('Badge design-system color tokens', () => {
  const cases: Array<{ variant: 'gold' | 'success' | 'warning' | 'error'; token: string }> = [
    { variant: 'gold', token: 'var(--gp-gold-accent)' },
    { variant: 'success', token: 'var(--gp-success)' },
    { variant: 'warning', token: 'var(--gp-warning)' },
    { variant: 'error', token: 'var(--gp-error)' },
  ];

  it.each(cases)('renders $variant variant using $token (no hardcoded hex)', ({ variant, token }) => {
    const { container } = render(<Badge variant={variant}>label</Badge>);
    const span = container.querySelector('span');

    expect(span).not.toBeNull();
    expect(span?.className).toContain(token);
    expect(span?.className).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });
});
