// apps/web/__tests__/components/common/message-composer/SendButton.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { SendButton } from '@/components/common/message-composer/SendButton';
import { useAnimationConfig } from '@/hooks/composer/useAnimationConfig';

jest.mock('@/hooks/composer/useAnimationConfig');

describe('SendButton', () => {
  beforeEach(() => {
    (useAnimationConfig as jest.Mock).mockReturnValue({
      duration: 0.4,
      enableRotation: true,
      spring: { type: 'spring', stiffness: 400, damping: 25 },
    });
  });

  it('should render with send icon by default', () => {
    const handleClick = jest.fn();
    render(<SendButton onClick={handleClick} />);

    // Chercher le bouton avec aria-label
    const button = screen.getByLabelText('Send message');
    expect(button).toBeInTheDocument();

    // Vérifier que l'icône est présente (SVG)
    const icon = button.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('should show loading spinner when isLoading is true', () => {
    const handleClick = jest.fn();
    render(<SendButton onClick={handleClick} isLoading={true} />);

    const button = screen.getByLabelText('Send message');
    expect(button).toHaveAttribute('aria-busy', 'true');

    // Vérifier que le spinner est présent (div avec classe spinner)
    const spinner = button.querySelector('div');
    expect(spinner).toBeInTheDocument();

    // Vérifier que l'icône n'est PAS présente
    const icon = button.querySelector('svg');
    expect(icon).not.toBeInTheDocument();
  });

  it('should not call onClick when disabled', () => {
    const handleClick = jest.fn();
    render(<SendButton onClick={handleClick} disabled={true} />);

    const button = screen.getByLabelText('Send message');
    fireEvent.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should not call onClick when loading', () => {
    const handleClick = jest.fn();
    render(<SendButton onClick={handleClick} isLoading={true} />);

    const button = screen.getByLabelText('Send message');
    fireEvent.click(button);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('should call onClick when clicked and not disabled/loading', () => {
    const handleClick = jest.fn();
    render(<SendButton onClick={handleClick} />);

    const button = screen.getByLabelText('Send message');
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should apply custom className', () => {
    const handleClick = jest.fn();
    render(<SendButton onClick={handleClick} className="custom-send" />);

    const button = screen.getByLabelText('Send message');
    expect(button.className).toContain('custom-send');
  });

  it('should use custom aria-label', () => {
    const handleClick = jest.fn();
    render(<SendButton onClick={handleClick} aria-label="Envoyer" />);

    const button = screen.getByLabelText('Envoyer');
    expect(button).toBeInTheDocument();
  });
});
