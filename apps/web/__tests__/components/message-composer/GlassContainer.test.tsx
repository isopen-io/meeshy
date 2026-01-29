import { render, screen } from '@testing-library/react';
import { GlassContainer } from '@/components/common/message-composer/GlassContainer';
import { useAnimationConfig } from '@/hooks/composer/useAnimationConfig';

jest.mock('@/hooks/composer/useAnimationConfig');

describe('GlassContainer', () => {
  beforeEach(() => {
    (useAnimationConfig as jest.Mock).mockReturnValue({
      enableBlur: true,
      enableShimmer: true,
      blurAmount: 20,
    });
  });

  it('should render children correctly', () => {
    render(
      <GlassContainer>
        <div>Test Content</div>
      </GlassContainer>
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('should apply high performance by default', () => {
    const { container } = render(
      <GlassContainer>
        <div>Content</div>
      </GlassContainer>
    );

    const glassDiv = container.firstChild as HTMLElement;
    expect(glassDiv.getAttribute('data-performance')).toBe('high');
  });

  it('should apply dark theme when theme prop is dark', () => {
    const { container } = render(
      <GlassContainer theme="dark">
        <div>Content</div>
      </GlassContainer>
    );

    const glassDiv = container.firstChild as HTMLElement;
    expect(glassDiv.getAttribute('data-theme')).toBe('dark');
  });

  it('should apply medium performance when specified', () => {
    const { container } = render(
      <GlassContainer performanceProfile="medium">
        <div>Content</div>
      </GlassContainer>
    );

    const glassDiv = container.firstChild as HTMLElement;
    expect(glassDiv.getAttribute('data-performance')).toBe('medium');
  });

  it('should apply low performance when specified', () => {
    const { container } = render(
      <GlassContainer performanceProfile="low">
        <div>Content</div>
      </GlassContainer>
    );

    const glassDiv = container.firstChild as HTMLElement;
    expect(glassDiv.getAttribute('data-performance')).toBe('low');
  });

  it('should forward className prop', () => {
    const { container } = render(
      <GlassContainer className="custom-class">
        <div>Content</div>
      </GlassContainer>
    );

    const glassDiv = container.firstChild as HTMLElement;
    expect(glassDiv.className).toContain('custom-class');
  });
});
