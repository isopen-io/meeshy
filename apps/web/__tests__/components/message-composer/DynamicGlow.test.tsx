import { render } from '@testing-library/react';
import { DynamicGlow } from '@/components/common/message-composer/DynamicGlow';
import { useTypingGlow } from '@/hooks/composer/useTypingGlow';

jest.mock('@/hooks/composer/useTypingGlow');

describe('DynamicGlow', () => {
  beforeEach(() => {
    (useTypingGlow as jest.Mock).mockReturnValue({
      glowColor: 'rgba(59, 130, 246, 0.4)',
      glowIntensity: 0.5,
      shouldGlow: true,
      isNearLimit: false,
    });
  });

  it('should render with active class when shouldGlow is true', () => {
    const { container } = render(
      <DynamicGlow
        currentLength={50}
        maxLength={100}
        isTyping={true}
      />
    );

    const glowDiv = container.firstChild as HTMLElement;
    expect(glowDiv.className).toContain('active');
  });

  it('should not have active class when shouldGlow is false', () => {
    (useTypingGlow as jest.Mock).mockReturnValue({
      glowColor: 'rgba(59, 130, 246, 0.4)',
      glowIntensity: 0,
      shouldGlow: false,
      isNearLimit: false,
    });

    const { container } = render(
      <DynamicGlow
        currentLength={0}
        maxLength={100}
        isTyping={false}
      />
    );

    const glowDiv = container.firstChild as HTMLElement;
    expect(glowDiv.className).not.toContain('active');
  });

  it('should set CSS variables for glow color and intensity', () => {
    (useTypingGlow as jest.Mock).mockReturnValue({
      glowColor: 'rgba(236, 72, 153, 0.4)',
      glowIntensity: 0.8,
      shouldGlow: true,
      isNearLimit: false,
    });

    const { container } = render(
      <DynamicGlow
        currentLength={80}
        maxLength={100}
        isTyping={true}
      />
    );

    const glowDiv = container.firstChild as HTMLElement;
    expect(glowDiv.style.getPropertyValue('--glow-color')).toBe('rgba(236, 72, 153, 0.4)');
    expect(glowDiv.style.getPropertyValue('--glow-intensity')).toBe('0.8');
  });

  it('should apply warning class when isNearLimit is true', () => {
    (useTypingGlow as jest.Mock).mockReturnValue({
      glowColor: 'rgba(236, 72, 153, 0.4)',
      glowIntensity: 0.95,
      shouldGlow: true,
      isNearLimit: true,
    });

    const { container } = render(
      <DynamicGlow
        currentLength={95}
        maxLength={100}
        isTyping={true}
      />
    );

    const glowDiv = container.firstChild as HTMLElement;
    expect(glowDiv.className).toContain('warning');
  });

  it('should apply custom className', () => {
    const { container } = render(
      <DynamicGlow
        currentLength={50}
        maxLength={100}
        isTyping={true}
        className="custom-glow"
      />
    );

    const glowDiv = container.firstChild as HTMLElement;
    expect(glowDiv.className).toContain('custom-glow');
  });

  it('should call useTypingGlow with correct props', () => {
    render(
      <DynamicGlow
        currentLength={75}
        maxLength={200}
        isTyping={true}
      />
    );

    expect(useTypingGlow).toHaveBeenCalledWith({
      currentLength: 75,
      maxLength: 200,
      isTyping: true,
    });
  });
});
