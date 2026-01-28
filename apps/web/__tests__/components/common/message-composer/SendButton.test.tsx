// apps/web/__tests__/components/common/message-composer/SendButton.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { SendButton } from '@/components/common/message-composer/SendButton';
import styles from '@/components/common/message-composer/SendButton.module.css';

describe('SendButton', () => {
  it('should not render when not visible', () => {
    const { container } = render(
      <SendButton
        isVisible={false}
        canSend={false}
        onClick={jest.fn()}
        performanceProfile="high"
        animConfig={{
          sendButtonDuration: 400,
          enableRotation: true,
          enableGradient: true,
        }}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render with gradient when visible and high performance', () => {
    render(
      <SendButton
        isVisible={true}
        canSend={true}
        onClick={jest.fn()}
        performanceProfile="high"
        animConfig={{
          sendButtonDuration: 400,
          enableRotation: true,
          enableGradient: true,
        }}
      />
    );

    const button = screen.getByRole('button', { name: /envoyer/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass(styles.withGradient);
  });

  it('should call onClick when clicked', () => {
    const handleClick = jest.fn();
    render(
      <SendButton
        isVisible={true}
        canSend={true}
        onClick={handleClick}
        performanceProfile="high"
        animConfig={{
          sendButtonDuration: 400,
          enableRotation: true,
          enableGradient: true,
        }}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when canSend is false', () => {
    render(
      <SendButton
        isVisible={true}
        canSend={false}
        onClick={jest.fn()}
        performanceProfile="high"
        animConfig={{
          sendButtonDuration: 400,
          enableRotation: true,
          enableGradient: true,
        }}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should use simple scale animation when rotation disabled', () => {
    render(
      <SendButton
        isVisible={true}
        canSend={true}
        onClick={jest.fn()}
        performanceProfile="low"
        animConfig={{
          sendButtonDuration: 200,
          enableRotation: false,
          enableGradient: false,
        }}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveClass('simpleScale');
    expect(button).not.toHaveClass('withRotation');
  });
});
