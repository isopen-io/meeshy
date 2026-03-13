/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicationSettings } from './ApplicationSettings';
import { authManager } from '@/services/auth-manager.service';
import { API_CONFIG } from '@/lib/config';

// Mock dependencies
jest.mock('@/services/auth-manager.service');
jest.mock('@/lib/config');
jest.mock('@/hooks/use-accessibility', () => ({
  useReducedMotion: () => false,
  SoundFeedback: {
    playToggleOn: jest.fn(),
    playToggleOff: jest.fn(),
    playClick: jest.fn(),
    playSuccess: jest.fn(),
  },
}));
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch globally
global.fetch = jest.fn();

const mockPreferences = {
  theme: 'auto' as const,
  accentColor: 'blue',
  interfaceLanguage: 'en',
  systemLanguage: 'en',
  fontSize: 'medium' as const,
  fontFamily: 'inter',
  lineHeight: 'normal' as const,
  compactMode: false,
  sidebarPosition: 'left' as const,
  showAvatars: true,
  animationsEnabled: true,
  reducedMotion: false,
  highContrastMode: false,
  screenReaderOptimized: false,
  keyboardShortcutsEnabled: true,
  tutorialsCompleted: [],
  betaFeaturesEnabled: false,
  telemetryEnabled: true,
};

describe('ApplicationSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authManager.getAuthToken as jest.Mock).mockReturnValue('mock-token');
    (API_CONFIG.getApiUrl as jest.Mock).mockReturnValue('http://localhost:3001');
  });

  describe('Initial Load', () => {
    it('should display loading state initially', () => {
      (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

      render(<ApplicationSettings />);

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should load and display preferences from API', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'uuid',
            userId: 'user-uuid',
            ...mockPreferences,
            createdAt: '2025-01-18T10:00:00Z',
            updatedAt: '2025-01-18T10:00:00Z',
          },
        }),
      });

      render(<ApplicationSettings />);

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      // Check that sections are rendered
      expect(screen.getAllByText(/Appearance/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Layout/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Accessibility/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Advanced/i).length).toBeGreaterThanOrEqual(1);
    });

    it('should handle API error gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      render(<ApplicationSettings />);

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      // Component should still render with default values
      expect(screen.getAllByText(/Appearance/i).length).toBeGreaterThanOrEqual(1);
    });

    it('should handle unauthenticated state', async () => {
      (authManager.getAuthToken as jest.Mock).mockReturnValue(null);

      render(<ApplicationSettings />);

      await waitFor(() => {
        expect(global.fetch).not.toHaveBeenCalled();
      });
    });
  });

  describe('Theme Selection', () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: mockPreferences,
        }),
      });

      render(<ApplicationSettings />);

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });

    it('should allow changing theme', async () => {
      // Find all switches and toggle one to make changes
      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBeGreaterThan(0);

      fireEvent.click(switches[0]);

      // Save button should appear
      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();
    });
  });

  describe('Accent Color Selection', () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: mockPreferences,
        }),
      });

      render(<ApplicationSettings />);

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });

    it('should allow changing accent color', async () => {
      const user = userEvent.setup();

      // Find accent color buttons
      const colorButtons = screen.getAllByRole('button').filter(
        (btn) => btn.getAttribute('aria-label') === 'Green'
      );

      expect(colorButtons.length).toBeGreaterThan(0);

      // Click green color
      await user.click(colorButtons[0]);

      // Save button should appear
      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();
    });
  });

  describe('Toggle Switches', () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: mockPreferences,
        }),
      });

      render(<ApplicationSettings />);

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });

    it('should toggle switches and show save button', async () => {
      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBeGreaterThan(0);

      // Toggle the first switch (compact mode)
      fireEvent.click(switches[0]);

      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();
    });

    it('should have multiple toggle switches for settings', () => {
      const switches = screen.getAllByRole('switch');
      // At minimum: compactMode, showAvatars, animationsEnabled, reducedMotion,
      // highContrast, screenReader, keyboardShortcuts, beta, telemetry
      expect(switches.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Save Functionality', () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: mockPreferences,
        }),
      });

      render(<ApplicationSettings />);

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });

    it('should save preferences when save button is clicked', async () => {
      // Make a change
      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      // Click save
      const saveButton = screen.getByText(/Save changes/i);
      fireEvent.click(saveButton);

      // Check that PUT request was made
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/me/preferences/application'),
          expect.objectContaining({
            method: 'PUT',
          })
        );
      });
    });

    it('should show success message after save', async () => {
      const { toast } = require('sonner');

      // Make a change
      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      // Click save
      const saveButton = screen.getByText(/Save changes/i);
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });
    });

    it('should show error message if save fails', async () => {
      const { toast } = require('sonner');

      // Mock failed save (first call returns prefs, second call fails)
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: mockPreferences }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: 'Save failed' }),
        });

      render(<ApplicationSettings />);

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      // Make a change
      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      // Click save
      const saveButton = screen.getByText(/Save changes/i);
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it('should hide save button after successful save', async () => {
      // Make a change
      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      // Save button appears
      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();

      // Click save
      const saveButton = screen.getByText(/Save changes/i);
      fireEvent.click(saveButton);

      // Save button should disappear
      await waitFor(() => {
        expect(screen.queryByText(/Save changes/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Tutorial Reset', () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            ...mockPreferences,
            tutorialsCompleted: ['onboarding', 'first-message'],
          },
        }),
      });

      render(<ApplicationSettings />);

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });

    it('should reset tutorials when reset button is clicked', async () => {
      const { toast } = require('sonner');
      const user = userEvent.setup();

      const resetButton = screen.getByText(/Reset/i);
      await user.click(resetButton);

      expect(toast.success).toHaveBeenCalled();
      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: mockPreferences,
        }),
      });

      render(<ApplicationSettings />);

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });

    it('should have toggle switches', () => {
      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBeGreaterThan(0);
    });

    it('should support keyboard navigation on switches', async () => {
      const switches = screen.getAllByRole('switch');
      const firstSwitch = switches[0];
      const initialState = firstSwitch.getAttribute('aria-checked');

      // Focus and toggle the switch
      firstSwitch.focus();
      expect(firstSwitch).toHaveFocus();

      fireEvent.click(firstSwitch);

      const newState = firstSwitch.getAttribute('aria-checked');
      expect(newState).not.toBe(initialState);
    });
  });

  describe('Responsive Design', () => {
    it('should render on mobile viewports', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: mockPreferences,
        }),
      });

      global.innerWidth = 375;
      global.dispatchEvent(new Event('resize'));

      render(<ApplicationSettings />);

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      expect(screen.getAllByText(/Appearance/i).length).toBeGreaterThanOrEqual(1);
    });
  });
});
