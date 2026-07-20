import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InfoIcon } from '@/components/admin/agent/InfoIcon';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

describe('InfoIcon', () => {
  it('renders the HelpCircle icon', () => {
    render(<InfoIcon content="Some help text" />);
    expect(screen.getByTestId('helpcircle-icon')).toBeInTheDocument();
  });

  it('displays content inside the tooltip', () => {
    render(<InfoIcon content="This is helpful" />);
    expect(screen.getByTestId('tooltip-content')).toHaveTextContent('This is helpful');
  });

  it('has an aria-label from the i18n key', () => {
    render(<InfoIcon content="x" />);
    expect(screen.getByRole('img', { name: 'navigation.help' })).toBeInTheDocument();
  });
});
