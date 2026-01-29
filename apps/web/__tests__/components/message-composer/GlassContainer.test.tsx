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

  it('should apply blur when config.enableBlur is true', () => {
    (useAnimationConfig as jest.Mock).mockReturnValue({
      enableBlur: true,
      enableShimmer: false,
      blurAmount: 20,
    });

    const { container } = render(
      <GlassContainer blurAmount={16}>
        <div>Content</div>
      </GlassContainer>
    );

    const glassDiv = container.firstChild as HTMLElement;
    expect(glassDiv.style.getPropertyValue('--glass-blur')).toBe('16px');
    expect(glassDiv.className).not.toContain('blurDisabled');
  });

  it('should not apply blur when config.enableBlur is false', () => {
    (useAnimationConfig as jest.Mock).mockReturnValue({
      enableBlur: false,
      enableShimmer: false,
      blurAmount: 8,
    });

    const { container } = render(
      <GlassContainer>
        <div>Content</div>
      </GlassContainer>
    );

    const glassDiv = container.firstChild as HTMLElement;
    expect(glassDiv.style.getPropertyValue('--glass-blur')).toBe('');
    expect(glassDiv.className).toContain('blurDisabled');
  });

  it('should apply shimmer when enableShimmer prop and config.enableShimmer are true', () => {
    (useAnimationConfig as jest.Mock).mockReturnValue({
      enableBlur: true,
      enableShimmer: true,
      blurAmount: 20,
    });

    const { container } = render(
      <GlassContainer enableShimmer={true}>
        <div>Content</div>
      </GlassContainer>
    );

    const glassDiv = container.firstChild as HTMLElement;
    expect(glassDiv.className).toContain('shimmer');
  });

  it('should not apply shimmer when enableShimmer prop is false', () => {
    (useAnimationConfig as jest.Mock).mockReturnValue({
      enableBlur: true,
      enableShimmer: true,
      blurAmount: 20,
    });

    const { container } = render(
      <GlassContainer enableShimmer={false}>
        <div>Content</div>
      </GlassContainer>
    );

    const glassDiv = container.firstChild as HTMLElement;
    expect(glassDiv.className).not.toContain('shimmer');
  });

  it('should apply custom className', () => {
    (useAnimationConfig as jest.Mock).mockReturnValue({
      enableBlur: true,
      enableShimmer: false,
      blurAmount: 20,
    });

    const { container } = render(
      <GlassContainer className="custom-class">
        <div>Content</div>
      </GlassContainer>
    );

    const glassDiv = container.firstChild as HTMLElement;
    expect(glassDiv.className).toContain('custom-class');
  });
});
