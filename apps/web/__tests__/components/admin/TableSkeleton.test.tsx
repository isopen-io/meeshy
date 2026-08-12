import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TableSkeleton, StatCardSkeleton } from '@/components/admin/TableSkeleton';

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

describe('TableSkeleton', () => {
  it('renders 5 rows by default', () => {
    const { container } = render(<TableSkeleton />);
    // Each row is a grid div inside the outer div
    const rows = container.querySelectorAll('[class*="grid"]');
    expect(rows.length).toBe(5);
  });

  it('renders the specified number of rows', () => {
    const { container } = render(<TableSkeleton rows={3} />);
    const rows = container.querySelectorAll('[class*="grid"]');
    expect(rows.length).toBe(3);
  });

  it('applies the column count via gridTemplateColumns style', () => {
    const { container } = render(<TableSkeleton rows={1} columns={4} />);
    const row = container.querySelector('[style]') as HTMLElement;
    expect(row.style.gridTemplateColumns).toBe('repeat(4, 1fr)');
  });

  it('applies 3 columns when columns=3', () => {
    const { container } = render(<TableSkeleton rows={1} columns={3} />);
    const row = container.querySelector('[style]') as HTMLElement;
    expect(row.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
  });

  it('renders 6 columns by default in each row', () => {
    const { container } = render(<TableSkeleton rows={1} />);
    const row = container.querySelector('[style]') as HTMLElement;
    expect(row.style.gridTemplateColumns).toBe('repeat(6, 1fr)');
  });
});

describe('StatCardSkeleton', () => {
  it('renders without crashing', () => {
    expect(() => render(<StatCardSkeleton />)).not.toThrow();
  });

  it('renders skeleton lines', () => {
    const { container } = render(<StatCardSkeleton />);
    // Should have multiple skeleton divs with bg-gray-200
    const skeletons = container.querySelectorAll('[class*="bg-gray-200"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
