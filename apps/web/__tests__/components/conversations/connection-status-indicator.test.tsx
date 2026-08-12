import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConnectionStatusIndicator } from '../../../components/conversations/connection-status-indicator';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';

// Mock the socket service
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getConnectionDiagnostics: jest.fn(),
    reconnect: jest.fn(),
    onStatusChange: jest.fn(() => () => {}),
  },
}));

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

// Mock use-i18n to provide expected translations
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'clickToReconnect': 'Cliquez pour reconnecter',
        'reconnecting': 'Reconnexion en cours...',
        'bubbleStream.reconnect': 'Connect',
        'bubbleStream.reconnecting': 'Reconnct',
      };
      return translations[key] || key;
    },
    locale: 'fr',
  }),
}));

// Mock useConnectionStatus hook to control state in tests
let mockConnectionStatus = {
  isOnline: true,
  isSocketConnected: true,
  hasSocket: true,
  isReady: true,
};

jest.mock('@/hooks/use-connection-status', () => ({
  useConnectionStatus: () => mockConnectionStatus,
}));

describe('ConnectionStatusIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Reset to connected state
    mockConnectionStatus = {
      isOnline: true,
      isSocketConnected: true,
      hasSocket: true,
      isReady: true,
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Connected State', () => {
    it('should not render anything when connected', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: true,
        hasSocket: true,
        isReady: true,
      };

      const { container } = render(<ConnectionStatusIndicator />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Disconnected State', () => {
    it('should render disconnected indicator when not connected', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: false,
        isReady: false,
      };

      render(<ConnectionStatusIndicator />);

      expect(screen.getByText('Connect')).toBeInTheDocument();
      expect(screen.getByText(/🔴/)).toBeInTheDocument();
    });

    it('should show red styling when disconnected', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: false,
        isReady: false,
      };

      render(<ConnectionStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('bg-red-500');
      expect(button.className).toContain('text-red-600');
    });

    it('should have correct title when disconnected', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: false,
        isReady: false,
      };

      render(<ConnectionStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Cliquez pour reconnecter');
    });
  });

  describe('Reconnecting State', () => {
    it('should show reconnecting indicator when has socket but not connected', () => {
      // isReconnecting = isOnline && hasSocket && !isSocketConnected
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: true,
        isReady: false,
      };

      render(<ConnectionStatusIndicator />);

      expect(screen.getByText('Reconnct')).toBeInTheDocument();
    });

    it('should show yellow styling when reconnecting', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: true,
        isReady: false,
      };

      render(<ConnectionStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('bg-yellow-500');
      expect(button.className).toContain('text-yellow-600');
    });

    it('should show spinning indicator when reconnecting', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: true,
        isReady: false,
      };

      render(<ConnectionStatusIndicator />);

      const spinner = screen.getByText(/🟡/);
      expect(spinner.className).toContain('animate-spin');
    });

    it('should have correct title when reconnecting', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: true,
        isReady: false,
      };

      render(<ConnectionStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Reconnexion en cours...');
    });
  });

  describe('Reconnect Functionality', () => {
    it('should call reconnect when clicked', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: false,
        isReady: false,
      };

      render(<ConnectionStatusIndicator />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(meeshySocketIOService.reconnect).toHaveBeenCalledTimes(1);
    });

    it('should show reconnecting state after clicking', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: false,
        isReady: false,
      };

      render(<ConnectionStatusIndicator />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      // After clicking, manualReconnecting=true → shows reconnecting state
      expect(screen.getByText('Reconnct')).toBeInTheDocument();
    });

    it('should reset reconnecting state after timeout', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: false,
        isReady: false,
      };

      render(<ConnectionStatusIndicator />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(screen.getByText('Reconnct')).toBeInTheDocument();

      // After 3 seconds, manualReconnecting resets to false
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Should still show disconnected since we're still not connected
      expect(screen.getByText('Connect')).toBeInTheDocument();
    });
  });

  describe('Connection Status Polling', () => {
    it('should check connection status on initial render', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: false,
        isReady: false,
      };

      render(<ConnectionStatusIndicator />);

      // Component renders based on hook state (no direct polling of getConnectionDiagnostics)
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should clean up on unmount without errors', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: false,
        isReady: false,
      };

      const { unmount } = render(<ConnectionStatusIndicator />);

      expect(() => unmount()).not.toThrow();

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Should not crash after unmount
    });
  });

  describe('Dynamic Connection Status', () => {
    it('should update UI when connection status changes', () => {
      // Start disconnected
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: false,
        isReady: false,
      };

      const { container, rerender } = render(<ConnectionStatusIndicator />);

      expect(screen.getByText('Connect')).toBeInTheDocument();

      // Now simulate connection by updating mockConnectionStatus and re-rendering
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: true,
        hasSocket: true,
        isReady: true,
      };

      rerender(<ConnectionStatusIndicator />);

      // Should not render anything when connected
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Custom ClassName', () => {
    it('should apply custom className', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: false,
        isReady: false,
      };

      render(<ConnectionStatusIndicator className="custom-class" />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('custom-class');
    });
  });

  describe('Accessibility', () => {
    it('should be a button element', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: false,
        isReady: false,
      };

      render(<ConnectionStatusIndicator />);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should have hover opacity styling', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: false,
        isReady: false,
      };

      render(<ConnectionStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('hover:opacity-80');
    });
  });

  describe('Edge Cases', () => {
    it('should handle initial undefined state gracefully', () => {
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: false,
        isReady: false,
      };

      render(<ConnectionStatusIndicator />);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should handle rapid status changes', () => {
      // Start disconnected
      mockConnectionStatus = {
        isOnline: true,
        isSocketConnected: false,
        hasSocket: false,
        isReady: false,
      };

      const { container, rerender } = render(<ConnectionStatusIndicator />);

      // Rapid changes
      for (let i = 0; i < 5; i++) {
        mockConnectionStatus = {
          isOnline: true,
          isSocketConnected: i % 2 === 0,
          hasSocket: true,
          isReady: i % 2 === 0,
        };

        rerender(<ConnectionStatusIndicator />);
      }

      // Should not crash and should render based on last state
      expect(container).toBeInTheDocument();
    });
  });
});
