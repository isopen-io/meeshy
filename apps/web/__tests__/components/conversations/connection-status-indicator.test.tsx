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
  },
}));

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

describe('ConnectionStatusIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Use real timers for async operations (promises, setTimeout, etc.)
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Connected State', () => {
    it('should not render anything when connected', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: true,
        hasSocket: true,
      });

      const { container } = render(<ConnectionStatusIndicator />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Disconnected State', () => {
    it('should render disconnected indicator when not connected', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: false,
      });

      render(<ConnectionStatusIndicator />);

      expect(screen.getByText('Connect')).toBeInTheDocument();
      expect(screen.getByText(/🔴/)).toBeInTheDocument();
    });

    it('should show red styling when disconnected', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: false,
      });

      render(<ConnectionStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('bg-red-500');
      expect(button.className).toContain('text-red-600');
    });

    it('should have correct title when disconnected', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: false,
      });

      render(<ConnectionStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Cliquez pour reconnecter');
    });
  });

  describe('Reconnecting State', () => {
    it('should show reconnecting indicator when has socket but not connected', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: true,
      });

      render(<ConnectionStatusIndicator />);

      // After initial render and interval check
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(screen.getByText('Reconnct')).toBeInTheDocument();
    });

    it('should show yellow styling when reconnecting', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: true,
      });

      render(<ConnectionStatusIndicator />);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      const button = screen.getByRole('button');
      expect(button.className).toContain('bg-yellow-500');
      expect(button.className).toContain('text-yellow-600');
    });

    it('should show spinning indicator when reconnecting', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: true,
      });

      render(<ConnectionStatusIndicator />);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      const spinner = screen.getByText(/🟡/);
      expect(spinner.className).toContain('animate-spin');
    });

    it('should have correct title when reconnecting', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: true,
      });

      render(<ConnectionStatusIndicator />);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Reconnexion en cours...');
    });
  });

  describe('Reconnect Functionality', () => {
    it('should call reconnect when clicked', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: false,
      });

      render(<ConnectionStatusIndicator />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(meeshySocketIOService.reconnect).toHaveBeenCalledTimes(1);
    });

    it('should show reconnecting state after clicking', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: false,
      });

      render(<ConnectionStatusIndicator />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(screen.getByText('Reconnct')).toBeInTheDocument();
    });

    it('should reset reconnecting state after timeout', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: false,
      });

      render(<ConnectionStatusIndicator />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(screen.getByText('Reconnct')).toBeInTheDocument();

      // After 3 seconds
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Should still show disconnected since we're still not connected
      expect(screen.getByText('Connect')).toBeInTheDocument();
    });
  });

  describe('Connection Status Polling', () => {
    it('should check connection status every second', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: false,
      });

      render(<ConnectionStatusIndicator />);

      expect(meeshySocketIOService.getConnectionDiagnostics).toHaveBeenCalledTimes(1);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(meeshySocketIOService.getConnectionDiagnostics).toHaveBeenCalledTimes(2);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(meeshySocketIOService.getConnectionDiagnostics).toHaveBeenCalledTimes(3);
    });

    it('should clean up interval on unmount', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: false,
      });

      const { unmount } = render(<ConnectionStatusIndicator />);

      unmount();

      const callsBefore = (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mock.calls.length;

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      const callsAfter = (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mock.calls.length;

      // Should not have made any additional calls
      expect(callsAfter).toBe(callsBefore);
    });
  });

  describe('Dynamic Connection Status', () => {
    it('should update UI when connection status changes', () => {
      // Start disconnected
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: false,
      });

      const { container } = render(<ConnectionStatusIndicator />);

      expect(screen.getByText('Connect')).toBeInTheDocument();

      // Now simulate connection
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: true,
        hasSocket: true,
      });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Should not render anything when connected
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Custom ClassName', () => {
    it('should apply custom className', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: false,
      });

      render(<ConnectionStatusIndicator className="custom-class" />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('custom-class');
    });
  });

  describe('Accessibility', () => {
    it('should be a button element', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: false,
      });

      render(<ConnectionStatusIndicator />);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should have hover opacity styling', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: false,
      });

      render(<ConnectionStatusIndicator />);

      const button = screen.getByRole('button');
      expect(button.className).toContain('hover:opacity-80');
    });
  });

  describe('Edge Cases', () => {
    it('should handle initial undefined state gracefully', () => {
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: undefined,
      });

      render(<ConnectionStatusIndicator />);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should handle rapid status changes', () => {
      // Start disconnected
      (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
        isConnected: false,
        hasSocket: false,
      });

      const { container } = render(<ConnectionStatusIndicator />);

      // Rapid changes
      for (let i = 0; i < 5; i++) {
        (meeshySocketIOService.getConnectionDiagnostics as jest.Mock).mockReturnValue({
          isConnected: i % 2 === 0,
          hasSocket: true,
        });

        act(() => {
          jest.advanceTimersByTime(1000);
        });
      }

      // Should not crash and should render based on last state
      expect(container).toBeInTheDocument();
    });
  });
});
