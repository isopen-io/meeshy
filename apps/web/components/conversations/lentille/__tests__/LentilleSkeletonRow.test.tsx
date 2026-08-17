/**
 * WL-105 (LWS-10) — `LentilleSkeletonRow`.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LentilleSkeletonRow } from '../LentilleSkeletonRow';

describe('LentilleSkeletonRow', () => {
  it('utilise la hauteur du rang réel (token, jamais un h-10 générique en dur)', () => {
    render(<LentilleSkeletonRow />);
    const row = screen.getByTestId('lentille-skeleton-row');
    expect(row.style.height).toBe('var(--lentille-list-row-height)');
  });

  it('est aria-hidden (décoratif — le conteneur porte role=status)', () => {
    render(<LentilleSkeletonRow />);
    expect(screen.getByTestId('lentille-skeleton-row')).toHaveAttribute('aria-hidden', 'true');
  });
});
