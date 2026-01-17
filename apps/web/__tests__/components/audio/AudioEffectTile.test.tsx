/**
 * Tests for AudioEffectTile component
 * Tests interactive tile rendering, toggle functionality, and configuration dialog
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AudioEffectTile } from '../../../components/audio/AudioEffectTile';
import type { AudioEffectType } from '@meeshy/shared/types/video-call';

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'effects.voice-coder.name': 'Voice Coder',
        'effects.voice-coder.description': 'Auto-tune your voice',
        'effects.voice-coder.icon': '🎤',
        'effects.baby-voice.name': 'Baby Voice',
        'effects.baby-voice.description': 'High pitched voice',
        'effects.baby-voice.icon': '👶',
        'effects.demon-voice.name': 'Demon Voice',
        'effects.demon-voice.description': 'Deep and scary voice',
        'effects.demon-voice.icon': '😈',
        'effects.back-sound.name': 'Back Sound',
        'effects.back-sound.description': 'Background audio',
        'effects.back-sound.icon': '🎼',
        'status.on': 'ON',
        'status.off': 'OFF',
        'configure': 'Configure',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  ChevronRight: ({ className }: { className?: string }) => (
    <span data-testid="chevron-right-icon" className={className}>→</span>
  ),
  Sparkles: ({ className }: { className?: string }) => (
    <span data-testid="sparkles-icon" className={className}>✨</span>
  ),
}));

// Mock radix-ui dialog
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    open ? <div data-testid="dialog">{children}</div> : null
  ),
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 data-testid="dialog-title" className={className}>{children}</h2>
  ),
}));

// Mock Switch component
jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, className }: {
    checked: boolean;
    onCheckedChange: () => void;
    className?: string;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onCheckedChange}
      className={className}
      data-testid="switch"
    >
      {checked ? 'ON' : 'OFF'}
    </button>
  ),
}));

describe('AudioEffectTile', () => {
  const defaultProps = {
    effectType: 'voice-coder' as AudioEffectType,
    enabled: false,
    onToggle: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render tile with effect name', () => {
      render(<AudioEffectTile {...defaultProps} />);

      expect(screen.getByText('Voice Coder')).toBeInTheDocument();
    });

    it('should render tile with effect description', () => {
      render(<AudioEffectTile {...defaultProps} />);

      expect(screen.getByText('Auto-tune your voice')).toBeInTheDocument();
    });

    it('should render tile with effect icon', () => {
      render(<AudioEffectTile {...defaultProps} />);

      expect(screen.getByText('🎤')).toBeInTheDocument();
    });

    it('should render configure button', () => {
      render(<AudioEffectTile {...defaultProps} />);

      expect(screen.getByText('Configure')).toBeInTheDocument();
    });

    it('should render toggle switch', () => {
      render(<AudioEffectTile {...defaultProps} />);

      expect(screen.getByRole('switch')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <AudioEffectTile {...defaultProps} className="my-custom-class" />
      );

      // The Card component should receive the className
      const card = container.firstChild;
      expect(card).toHaveClass('my-custom-class');
    });
  });

  describe('Effect Types', () => {
    it('should render voice-coder effect correctly', () => {
      render(<AudioEffectTile {...defaultProps} effectType="voice-coder" />);

      expect(screen.getByText('Voice Coder')).toBeInTheDocument();
      expect(screen.getByText('🎤')).toBeInTheDocument();
    });

    it('should render baby-voice effect correctly', () => {
      render(<AudioEffectTile {...defaultProps} effectType="baby-voice" />);

      expect(screen.getByText('Baby Voice')).toBeInTheDocument();
      expect(screen.getByText('👶')).toBeInTheDocument();
    });

    it('should render demon-voice effect correctly', () => {
      render(<AudioEffectTile {...defaultProps} effectType="demon-voice" />);

      expect(screen.getByText('Demon Voice')).toBeInTheDocument();
      expect(screen.getByText('😈')).toBeInTheDocument();
    });

    it('should render back-sound effect correctly', () => {
      render(<AudioEffectTile {...defaultProps} effectType="back-sound" />);

      expect(screen.getByText('Back Sound')).toBeInTheDocument();
      expect(screen.getByText('🎼')).toBeInTheDocument();
    });
  });

  describe('Enabled State', () => {
    it('should display OFF status when disabled', () => {
      render(<AudioEffectTile {...defaultProps} enabled={false} />);

      // May have multiple OFF elements (status badge + switch)
      const offElements = screen.getAllByText('OFF');
      expect(offElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should display ON status when enabled', () => {
      render(<AudioEffectTile {...defaultProps} enabled={true} />);

      // Both the status text and switch show ON
      const onElements = screen.getAllByText('ON');
      expect(onElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should show sparkles indicator when enabled', () => {
      render(<AudioEffectTile {...defaultProps} enabled={true} />);

      expect(screen.getByTestId('sparkles-icon')).toBeInTheDocument();
    });

    it('should not show sparkles indicator when disabled', () => {
      render(<AudioEffectTile {...defaultProps} enabled={false} />);

      expect(screen.queryByTestId('sparkles-icon')).not.toBeInTheDocument();
    });

    it('should set switch to checked when enabled', () => {
      render(<AudioEffectTile {...defaultProps} enabled={true} />);

      const toggle = screen.getByRole('switch');
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });

    it('should set switch to unchecked when disabled', () => {
      render(<AudioEffectTile {...defaultProps} enabled={false} />);

      const toggle = screen.getByRole('switch');
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('Toggle Functionality', () => {
    it('should call onToggle when switch is clicked', () => {
      const onToggle = jest.fn();
      render(<AudioEffectTile {...defaultProps} onToggle={onToggle} />);

      const toggle = screen.getByRole('switch');
      fireEvent.click(toggle);

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('should not open config when clicking switch', () => {
      render(<AudioEffectTile {...defaultProps} />);

      const toggle = screen.getByRole('switch');
      fireEvent.click(toggle);

      // Dialog should not be open
      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Configuration Dialog', () => {
    it('should open dialog when tile is clicked', () => {
      render(
        <AudioEffectTile
          {...defaultProps}
          configurationComponent={<div>Config Content</div>}
        />
      );

      // Click on the card (not the switch)
      const card = screen.getByText('Voice Coder').closest('[class*="cursor-pointer"]');
      if (card) {
        fireEvent.click(card);
      }

      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });

    it('should display configuration component in dialog', async () => {
      render(
        <AudioEffectTile
          {...defaultProps}
          configurationComponent={<div data-testid="config-content">My Config</div>}
        />
      );

      // Click to open dialog
      const configureButton = screen.getByText('Configure');
      fireEvent.click(configureButton);

      await waitFor(() => {
        expect(screen.getByTestId('config-content')).toBeInTheDocument();
      });
    });

    it('should show effect name in dialog title', async () => {
      render(
        <AudioEffectTile
          {...defaultProps}
          configurationComponent={<div>Config</div>}
        />
      );

      const configureButton = screen.getByText('Configure');
      fireEvent.click(configureButton);

      await waitFor(() => {
        expect(screen.getByTestId('dialog-title')).toHaveTextContent('Voice Coder');
      });
    });

    it('should show effect icon in dialog title', async () => {
      render(
        <AudioEffectTile
          {...defaultProps}
          configurationComponent={<div>Config</div>}
        />
      );

      const configureButton = screen.getByText('Configure');
      fireEvent.click(configureButton);

      await waitFor(() => {
        const dialogTitle = screen.getByTestId('dialog-title');
        expect(dialogTitle).toHaveTextContent('🎤');
      });
    });

    it('should not render dialog when no configurationComponent provided', () => {
      render(<AudioEffectTile {...defaultProps} />);

      const configureButton = screen.getByText('Configure');
      fireEvent.click(configureButton);

      // Dialog should not appear without configurationComponent
      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Visual Styling', () => {
    it('should have cursor-pointer class', () => {
      const { container } = render(<AudioEffectTile {...defaultProps} />);

      const card = container.firstChild;
      expect(card).toHaveClass('cursor-pointer');
    });

    it('should have hover effect class', () => {
      const { container } = render(<AudioEffectTile {...defaultProps} />);

      const card = container.firstChild;
      expect(card).toHaveClass('hover:scale-[1.02]');
    });

    it('should have transition class', () => {
      const { container } = render(<AudioEffectTile {...defaultProps} />);

      const card = container.firstChild;
      expect(card).toHaveClass('transition-all');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible switch control', () => {
      render(<AudioEffectTile {...defaultProps} />);

      const toggle = screen.getByRole('switch');
      expect(toggle).toBeInTheDocument();
    });

    it('should have accessible button for configure', () => {
      render(<AudioEffectTile {...defaultProps} />);

      const configButton = screen.getByRole('button', { name: /configure/i });
      expect(configButton).toBeInTheDocument();
    });
  });
});
