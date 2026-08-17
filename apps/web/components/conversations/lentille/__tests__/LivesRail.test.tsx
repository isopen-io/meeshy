/**
 * WL-105 (LWS-10) — `LivesRail`.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LivesRail, type LentilleLiveEntry } from '../LivesRail';

const entry = (id: string, overrides: Partial<LentilleLiveEntry> = {}): LentilleLiveEntry => ({
  id,
  name: `User ${id}`,
  isLive: false,
  ...overrides,
});

describe('LivesRail', () => {
  it('masqué (rend null) si vide', () => {
    const { container } = render(<LivesRail entries={[]} label="En direct" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('plafonne à 6 entrées', () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry(String(i)));
    render(<LivesRail entries={entries} label="En direct" />);
    expect(screen.getAllByTestId('lentille-lives-rail-entry')).toHaveLength(6);
  });

  it('rend moins de 6 entrées telles quelles', () => {
    const entries = [entry('a'), entry('b')];
    render(<LivesRail entries={entries} label="En direct" />);
    expect(screen.getAllByTestId('lentille-lives-rail-entry')).toHaveLength(2);
  });
});
