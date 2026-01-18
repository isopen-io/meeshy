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
      expect(screen.getByText(/Appearance/i)).toBeInTheDocument();
      expect(screen.getByText(/Languages/i)).toBeInTheDocument();
      expect(screen.getByText(/Layout/i)).toBeInTheDocument();
      expect(screen.getByText(/Accessibility/i)).toBeInTheDocument();
      expect(screen.getByText(/Advanced/i)).toBeInTheDocument();
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
      expect(screen.getByText(/Appearance/i)).toBeInTheDocument();
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
      const user = userEvent.setup();

      // Find and click the theme select
      const themeSelect = screen.getByRole('combobox', { name: /theme/i });
      await user.click(themeSelect);

      // Select dark theme
      const darkOption = screen.getByText(/Dark/i);
      await user.click(darkOption);

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

    it('should toggle compact mode', async () => {
      const user = userEvent.setup();

      const compactSwitch = screen.getByRole('switch', { name: /Compact Mode/i });
      expect(compactSwitch).toHaveAttribute('aria-checked', 'false');

      await user.click(compactSwitch);

      expect(compactSwitch).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();
    });

    it('should toggle animations', async () => {
      const user = userEvent.setup();

      const animationsSwitch = screen.getByRole('switch', { name: /Animations/i });
      await user.click(animationsSwitch);

      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();
    });

    it('should toggle reduced motion', async () => {
      const user = userEvent.setup();

      const reducedMotionSwitch = screen.getByRole('switch', { name: /Reduced Motion/i });
      await user.click(reducedMotionSwitch);

      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();
    });

    it('should toggle high contrast', async () => {
      const user = userEvent.setup();

      const highContrastSwitch = screen.getByRole('switch', { name: /High Contrast/i });
      await user.click(highContrastSwitch);

      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();
    });

    it('should toggle screen reader optimization', async () => {
      const user = userEvent.setup();

      const screenReaderSwitch = screen.getByRole('switch', { name: /Screen Reader/i });
      await user.click(screenReaderSwitch);

      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();
    });

    it('should toggle keyboard shortcuts', async () => {
      const user = userEvent.setup();

      const keyboardSwitch = screen.getByRole('switch', { name: /Keyboard Shortcuts/i });
      await user.click(keyboardSwitch);

      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();
    });

    it('should toggle beta features', async () => {
      const user = userEvent.setup();

      const betaSwitch = screen.getByRole('switch', { name: /Beta Features/i });
      await user.click(betaSwitch);

      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();
    });

    it('should toggle telemetry', async () => {
      const user = userEvent.setup();

      const telemetrySwitch = screen.getByRole('switch', { name: /Telemetry/i });
      await user.click(telemetrySwitch);

      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();
    });
  });

  describe('Language Selection', () => {
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

    it('should allow changing interface language', async () => {
      const user = userEvent.setup();

      const languageSelect = screen.getByRole('combobox', { name: /Interface Language/i });
      await user.click(languageSelect);

      // Select French
      const frenchOption = screen.getByText(/Français/i);
      await user.click(frenchOption);

      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();
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
      const user = userEvent.setup();

      // Make a change
      const compactSwitch = screen.getByRole('switch', { name: /Compact Mode/i });
      await user.click(compactSwitch);

      // Click save
      const saveButton = screen.getByText(/Save changes/i);
      await user.click(saveButton);

      // Check that PUT request was made
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:3001/user-preferences/application',
          expect.objectContaining({
            method: 'PUT',
            headers: expect.objectContaining({
              'Authorization': 'Bearer mock-token',
              'Content-Type': 'application/json',
            }),
          })
        );
      });
    });

    it('should show success message after save', async () => {
      const { toast } = require('sonner');
      const user = userEvent.setup();

      // Make a change
      const compactSwitch = screen.getByRole('switch', { name: /Compact Mode/i });
      await user.click(compactSwitch);

      // Click save
      const saveButton = screen.getByText(/Save changes/i);
      await user.click(saveButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });
    });

    it('should show error message if save fails', async () => {
      const { toast } = require('sonner');
      const user = userEvent.setup();

      // Mock failed save
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockPreferences }),
      }).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Save failed' }),
      });

      render(<ApplicationSettings />);

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      // Make a change
      const compactSwitch = screen.getByRole('switch', { name: /Compact Mode/i });
      await user.click(compactSwitch);

      // Click save
      const saveButton = screen.getByText(/Save changes/i);
      await user.click(saveButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it('should hide save button after successful save', async () => {
      const user = userEvent.setup();

      // Make a change
      const compactSwitch = screen.getByRole('switch', { name: /Compact Mode/i });
      await user.click(compactSwitch);

      // Save button appears
      expect(screen.getByText(/Save changes/i)).toBeInTheDocument();

      // Click save
      const saveButton = screen.getByText(/Save changes/i);
      await user.click(saveButton);

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

    it('should have proper ARIA labels', () => {
      expect(screen.getByLabelText(/Compact Mode/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Animations/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Reduced Motion/i)).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();

      const compactSwitch = screen.getByRole('switch', { name: /Compact Mode/i });

      // Focus the switch
      compactSwitch.focus();
      expect(compactSwitch).toHaveFocus();

      // Press Space to toggle
      await user.keyboard(' ');

      expect(compactSwitch).toHaveAttribute('aria-checked', 'true');
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

      expect(screen.getByText(/Appearance/i)).toBeInTheDocument();
    });
  });
});
