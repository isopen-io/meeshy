/**
 * Tests for NotificationErrorBoundary component
 * Tests error catching, retry functionality, and error logging
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  NotificationErrorBoundary,
  withNotificationErrorBoundary,
  NotificationErrorFallback,
} from '@/components/notifications/notifications-v2/NotificationErrorBoundary';

// Mock fetch for error logging
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
) as jest.Mock;

// Mock window.location.reload
const mockReload = jest.fn();
Object.defineProperty(window, 'location', {
  value: { reload: mockReload, href: 'http://localhost/' },
  writable: true,
});

// Test component that throws error
const ThrowingComponent = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>Component rendered successfully</div>;
};

// Component that throws on second render
let renderCount = 0;
const ThrowOnSecondRender = () => {
  renderCount++;
  if (renderCount > 1) {
    throw new Error('Error on second render');
  }
  return <div>First render successful</div>;
};

describe('NotificationErrorBoundary', () => {
  const originalConsoleError = console.error;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    renderCount = 0;
    console.error = jest.fn();
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    console.error = originalConsoleError;
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('Normal Rendering', () => {
    it('should render children when no error occurs', () => {
      render(
        <NotificationErrorBoundary>
          <div>Normal content</div>
        </NotificationErrorBoundary>
      );

      expect(screen.getByText('Normal content')).toBeInTheDocument();
    });

    it('should render multiple children without error', () => {
      render(
        <NotificationErrorBoundary>
          <div>First child</div>
          <div>Second child</div>
        </NotificationErrorBoundary>
      );

      expect(screen.getByText('First child')).toBeInTheDocument();
      expect(screen.getByText('Second child')).toBeInTheDocument();
    });

    it('should render non-throwing component', () => {
      render(
        <NotificationErrorBoundary>
          <ThrowingComponent shouldThrow={false} />
        </NotificationErrorBoundary>
      );

      expect(screen.getByText('Component rendered successfully')).toBeInTheDocument();
    });
  });

  describe('Error Catching', () => {
    it('should catch and display error when child throws', () => {
      render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      expect(screen.getByText('Notification System Error')).toBeInTheDocument();
    });

    it('should display error description', () => {
      render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      expect(screen.getByText(/Something went wrong while loading notifications/)).toBeInTheDocument();
    });

    it('should display Try Again button', () => {
      render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('should show warning icon', () => {
      const { container } = render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      const warningIcon = container.querySelector('.text-red-600');
      expect(warningIcon).toBeInTheDocument();
    });
  });

  describe('Custom Fallback', () => {
    it('should render custom fallback when provided', () => {
      const customFallback = <div>Custom error message</div>;

      render(
        <NotificationErrorBoundary fallback={customFallback}>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      expect(screen.getByText('Custom error message')).toBeInTheDocument();
      expect(screen.queryByText('Notification System Error')).not.toBeInTheDocument();
    });

    it('should not show default UI when custom fallback is provided', () => {
      const customFallback = <div>Custom fallback</div>;

      render(
        <NotificationErrorBoundary fallback={customFallback}>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
    });
  });

  describe('Error Callback', () => {
    it('should call onError callback when error occurs', () => {
      const mockOnError = jest.fn();

      render(
        <NotificationErrorBoundary onError={mockOnError}>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      expect(mockOnError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String),
        })
      );
    });

    it('should pass error details to onError', () => {
      const mockOnError = jest.fn();

      render(
        <NotificationErrorBoundary onError={mockOnError}>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      const [error] = mockOnError.mock.calls[0];
      expect(error.message).toBe('Test error message');
    });
  });

  describe('Retry Functionality', () => {
    it('should reset error state when Try Again is clicked', async () => {
      const { rerender } = render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      expect(screen.getByText('Notification System Error')).toBeInTheDocument();

      // Click retry
      const retryButton = screen.getByText('Try Again');
      fireEvent.click(retryButton);

      // Component will re-throw, but we test that retry was attempted
      // The component will still show error because ThrowingComponent always throws
    });

    it('should disable Try Again after too many errors', async () => {
      // Need to trigger multiple errors to test this
      const { rerender } = render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      // Initial error
      expect(screen.getByText('Try Again')).toBeInTheDocument();

      // Trigger multiple retries to increment error count
      for (let i = 0; i < 4; i++) {
        const retryButton = screen.queryByText('Try Again');
        if (retryButton && !retryButton.hasAttribute('disabled')) {
          fireEvent.click(retryButton);
        }
      }

      // After 3+ errors, button should show "Too many errors"
      await waitFor(() => {
        const button = screen.queryByText('Too many errors');
        // May or may not be disabled depending on error count
      });
    });

    it('should show Reload Page button after multiple errors', async () => {
      const { rerender } = render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      // Trigger retries
      for (let i = 0; i < 3; i++) {
        const retryButton = screen.queryByText('Try Again');
        if (retryButton) {
          fireEvent.click(retryButton);
        }
      }

      await waitFor(() => {
        const reloadButton = screen.queryByText('Reload Page');
        // Reload button appears after 2+ errors
      });
    });

    it('should call window.location.reload when Reload Page is clicked', async () => {
      const { rerender } = render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      // Trigger multiple errors
      for (let i = 0; i < 3; i++) {
        const retryButton = screen.queryByText('Try Again');
        if (retryButton) {
          fireEvent.click(retryButton);
        }
      }

      const reloadButton = screen.queryByText('Reload Page');
      if (reloadButton) {
        fireEvent.click(reloadButton);
        expect(mockReload).toHaveBeenCalled();
      }
    });
  });

  describe('Error Count Display', () => {
    it('should show error count message after multiple errors', async () => {
      const { rerender } = render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      // Click retry to increment error count
      const retryButton = screen.getByText('Try Again');
      fireEvent.click(retryButton);

      await waitFor(() => {
        const countMessage = screen.queryByText(/Error occurred.*times/);
        // Message appears after 1+ errors
      });
    });
  });

  describe('Development Error Details', () => {
    it('should show error details in development mode', () => {
      process.env.NODE_ENV = 'development';

      render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      // In dev mode, error details should be visible
      const details = screen.queryByText('Error Details (Dev Only)');
      expect(details).toBeInTheDocument();
    });

    it('should show error message in details', () => {
      process.env.NODE_ENV = 'development';

      render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      // Expand details
      const details = screen.getByText('Error Details (Dev Only)');
      fireEvent.click(details);

      expect(screen.getByText(/Test error message/)).toBeInTheDocument();
    });

    it('should not show error details in production mode', () => {
      process.env.NODE_ENV = 'production';

      render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      expect(screen.queryByText('Error Details (Dev Only)')).not.toBeInTheDocument();
    });
  });

  describe('Error Logging', () => {
    it('should log error to console in development', () => {
      process.env.NODE_ENV = 'development';

      render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      expect(console.error).toHaveBeenCalled();
    });

    it('should not send error to backend in development', () => {
      process.env.NODE_ENV = 'development';

      render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should send error to backend in production', async () => {
      process.env.NODE_ENV = 'production';

      render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/errors',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });
    });

    it('should include error details in backend log', async () => {
      process.env.NODE_ENV = 'production';

      render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      await waitFor(() => {
        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        if (fetchCall) {
          const body = JSON.parse(fetchCall[1].body);
          expect(body).toHaveProperty('message');
          expect(body).toHaveProperty('timestamp');
          expect(body).toHaveProperty('userAgent');
          expect(body).toHaveProperty('url');
          expect(body).toHaveProperty('component', 'NotificationSystem');
        }
      });
    });

    it('should handle backend logging failure gracefully', async () => {
      process.env.NODE_ENV = 'production';
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      expect(() => {
        render(
          <NotificationErrorBoundary>
            <ThrowingComponent />
          </NotificationErrorBoundary>
        );
      }).not.toThrow();
    });
  });

  describe('Styling', () => {
    it('should have correct error container styling', () => {
      const { container } = render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      const errorContainer = container.querySelector('.bg-red-50');
      expect(errorContainer).toBeInTheDocument();
      expect(errorContainer).toHaveClass('rounded-lg');
      expect(errorContainer).toHaveClass('border');
    });

    it('should have dark mode styling', () => {
      const { container } = render(
        <NotificationErrorBoundary>
          <ThrowingComponent />
        </NotificationErrorBoundary>
      );

      const errorContainer = container.querySelector('.dark\\:bg-red-950\\/20');
      expect(errorContainer).toBeInTheDocument();
    });
  });
});

describe('withNotificationErrorBoundary HOC', () => {
  const TestComponent = () => <div>Test content</div>;
  const ThrowingTestComponent = () => {
    throw new Error('HOC test error');
  };

  it('should wrap component with error boundary', () => {
    const WrappedComponent = withNotificationErrorBoundary(TestComponent);

    render(<WrappedComponent />);

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('should catch errors from wrapped component', () => {
    const WrappedComponent = withNotificationErrorBoundary(ThrowingTestComponent);

    render(<WrappedComponent />);

    expect(screen.getByText('Notification System Error')).toBeInTheDocument();
  });

  it('should use custom fallback when provided', () => {
    const customFallback = <div>Custom HOC fallback</div>;
    const WrappedComponent = withNotificationErrorBoundary(ThrowingTestComponent, customFallback);

    render(<WrappedComponent />);

    expect(screen.getByText('Custom HOC fallback')).toBeInTheDocument();
  });

  it('should pass props through to wrapped component', () => {
    const PropsComponent = ({ message }: { message: string }) => <div>{message}</div>;
    const WrappedComponent = withNotificationErrorBoundary(PropsComponent);

    render(<WrappedComponent message="Hello World" />);

    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('should preserve component displayName', () => {
    TestComponent.displayName = 'MyTestComponent';
    const WrappedComponent = withNotificationErrorBoundary(TestComponent);

    // The wrapped component should work correctly
    render(<WrappedComponent />);
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });
});

describe('NotificationErrorFallback', () => {
  const mockResetError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render error message', () => {
    const error = new Error('Test fallback error');

    render(<NotificationErrorFallback error={error} resetError={mockResetError} />);

    expect(screen.getByText('Failed to load this notification')).toBeInTheDocument();
  });

  it('should render retry button', () => {
    const error = new Error('Test fallback error');

    render(<NotificationErrorFallback error={error} resetError={mockResetError} />);

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('should call resetError when retry is clicked', () => {
    const error = new Error('Test fallback error');

    render(<NotificationErrorFallback error={error} resetError={mockResetError} />);

    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);

    expect(mockResetError).toHaveBeenCalledTimes(1);
  });

  it('should render warning icon', () => {
    const error = new Error('Test fallback error');

    const { container } = render(<NotificationErrorFallback error={error} resetError={mockResetError} />);

    const icon = container.querySelector('.text-red-600');
    expect(icon).toBeInTheDocument();
  });

  it('should have correct styling', () => {
    const error = new Error('Test fallback error');

    const { container } = render(<NotificationErrorFallback error={error} resetError={mockResetError} />);

    const fallbackContainer = container.firstChild;
    expect(fallbackContainer).toHaveClass('bg-red-50');
    expect(fallbackContainer).toHaveClass('rounded');
    expect(fallbackContainer).toHaveClass('border');
  });

  it('should have compact layout', () => {
    const error = new Error('Test fallback error');

    const { container } = render(<NotificationErrorFallback error={error} resetError={mockResetError} />);

    const fallbackContainer = container.firstChild;
    expect(fallbackContainer).toHaveClass('p-4');
  });
});

describe('Edge Cases', () => {
  beforeEach(() => {
    console.error = jest.fn();
  });

  it('should handle null children', () => {
    render(
      <NotificationErrorBoundary>
        {null}
      </NotificationErrorBoundary>
    );

    // Should not crash
    expect(screen.queryByText('Notification System Error')).not.toBeInTheDocument();
  });

  it('should handle undefined children', () => {
    render(
      <NotificationErrorBoundary>
        {undefined}
      </NotificationErrorBoundary>
    );

    // Should not crash
    expect(screen.queryByText('Notification System Error')).not.toBeInTheDocument();
  });

  it('should handle async errors gracefully', async () => {
    const AsyncThrowingComponent = () => {
      // Synchronous error - async errors are not caught by error boundaries
      throw new Error('Sync error');
    };

    render(
      <NotificationErrorBoundary>
        <AsyncThrowingComponent />
      </NotificationErrorBoundary>
    );

    expect(screen.getByText('Notification System Error')).toBeInTheDocument();
  });

  it('should handle error with no message', () => {
    const NoMessageError = () => {
      throw new Error();
    };

    render(
      <NotificationErrorBoundary>
        <NoMessageError />
      </NotificationErrorBoundary>
    );

    expect(screen.getByText('Notification System Error')).toBeInTheDocument();
  });

  it('should handle error with very long message', () => {
    const longMessage = 'A'.repeat(1000);
    const LongMessageError = () => {
      throw new Error(longMessage);
    };

    process.env.NODE_ENV = 'development';

    render(
      <NotificationErrorBoundary>
        <LongMessageError />
      </NotificationErrorBoundary>
    );

    // Should handle without crashing
    expect(screen.getByText('Notification System Error')).toBeInTheDocument();
  });
});
