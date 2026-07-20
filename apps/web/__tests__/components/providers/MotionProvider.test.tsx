import { render, screen } from '@testing-library/react';
import { MotionProvider } from '@/components/providers/MotionProvider';

jest.mock('framer-motion', () => ({
  MotionConfig: ({
    reducedMotion,
    children,
  }: {
    reducedMotion?: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="motion-config" data-reduced-motion={reducedMotion}>
      {children}
    </div>
  ),
}));

describe('MotionProvider', () => {
  it('renders its children', () => {
    render(
      <MotionProvider>
        <span>child content</span>
      </MotionProvider>
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('drives Framer Motion from the user\'s prefers-reduced-motion setting', () => {
    render(
      <MotionProvider>
        <span>child</span>
      </MotionProvider>
    );

    expect(screen.getByTestId('motion-config')).toHaveAttribute(
      'data-reduced-motion',
      'user'
    );
  });
});
