import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import AgentHistoryTab from '@/components/admin/agent/AgentHistoryTab';

jest.mock('next/dynamic', () => {
  return function dynamic(
    loader: () => Promise<unknown>,
    opts?: { loading?: () => React.ReactNode }
  ) {
    loader().catch(() => {});
    return function DynamicComponent() {
      return opts?.loading ? <>{opts.loading()}</> : null;
    };
  };
});

describe('AgentHistoryTab', () => {
  it('renders three loading skeletons via dynamic imports', () => {
    const { container } = render(<AgentHistoryTab />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons).toHaveLength(3);
  });

  it('renders inside a space-y-6 wrapper', () => {
    const { container } = render(<AgentHistoryTab />);
    expect(container.firstChild).toHaveClass('space-y-6');
  });

  it('renders without throwing', () => {
    expect(() => render(<AgentHistoryTab />)).not.toThrow();
  });
});
