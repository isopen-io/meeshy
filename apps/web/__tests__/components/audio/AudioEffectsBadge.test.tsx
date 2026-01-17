/**
 * Tests for AudioEffectsBadge component
 * Tests badge rendering, effects count display, and popover interaction
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AudioEffectsBadge } from '../../../components/audio/AudioEffectsBadge';
import type { AudioEffectsTimeline } from '@meeshy/shared/types/audio-effects-timeline';

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'badge.clickToView': 'Click to view effects',
        'timeline.effectsUsed': 'effects',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Sparkles: ({ className }: { className?: string }) => (
    <span data-testid="sparkles-icon" className={className}>✨</span>
  ),
}));

// Mock Popover components
jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    <div data-testid="popover" data-open={open}>{children}</div>
  ),
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
  PopoverContent: ({
    children,
    className,
    side,
    align,
  }: {
    children: React.ReactNode;
    className?: string;
    side?: string;
    align?: string;
  }) => (
    <div
      data-testid="popover-content"
      className={className}
      data-side={side}
      data-align={align}
    >
      {children}
    </div>
  ),
}));

// Mock AudioEffectsTimelineView component
jest.mock('../../../components/audio/AudioEffectsTimelineView', () => ({
  AudioEffectsTimelineView: ({ timeline }: { timeline: AudioEffectsTimeline }) => (
    <div data-testid="timeline-view">
      Timeline View - Duration: {timeline.duration}ms
    </div>
  ),
}));

// Helper to create mock timeline
const createMockTimeline = (
  overrides: Partial<AudioEffectsTimeline> = {}
): AudioEffectsTimeline => ({
  version: '1.0',
  createdAt: new Date().toISOString(),
  duration: 60000, // 60 seconds
  sampleRate: 48000,
  channels: 2,
  events: [
    {
      timestamp: 0,
      effectType: 'voice-coder',
      action: 'activate',
      params: { pitch: 0, harmonization: false, strength: 50, retuneSpeed: 50, scale: 'chromatic', key: 'C', naturalVibrato: 50 },
    },
  ],
  metadata: {
    totalEffectsUsed: 2,
    totalParameterChanges: 5,
    finalActiveEffects: ['voice-coder'],
  },
  ...overrides,
});

describe('AudioEffectsBadge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render badge when effects are used', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      expect(screen.getByTestId('popover-trigger')).toBeInTheDocument();
    });

    it('should display effects count', () => {
      const timeline = createMockTimeline({
        metadata: { totalEffectsUsed: 3 },
      });
      render(<AudioEffectsBadge timeline={timeline} />);

      expect(screen.getByText(/3/)).toBeInTheDocument();
      expect(screen.getByText(/effects/)).toBeInTheDocument();
    });

    it('should render sparkles icon', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      expect(screen.getByTestId('sparkles-icon')).toBeInTheDocument();
    });

    it('should not render when no effects used', () => {
      const timeline = createMockTimeline({
        metadata: { totalEffectsUsed: 0 },
      });
      const { container } = render(<AudioEffectsBadge timeline={timeline} />);

      // Component returns null, so container should be empty
      expect(container.firstChild).toBeNull();
    });

    it('should not render when metadata is missing', () => {
      const timeline = createMockTimeline({
        metadata: undefined,
      });
      const { container } = render(<AudioEffectsBadge timeline={timeline} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Custom Styling', () => {
    it('should apply custom className', () => {
      const timeline = createMockTimeline();
      render(
        <AudioEffectsBadge timeline={timeline} className="my-custom-badge" />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveClass('my-custom-badge');
    });

    it('should have gradient background styling', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-gradient-to-r');
    });

    it('should have rounded-full class', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('rounded-full');
    });

    it('should have border styling', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('border');
    });
  });

  describe('Tooltip', () => {
    it('should have title attribute for tooltip', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'Click to view effects');
    });
  });

  describe('Popover Interaction', () => {
    it('should render popover structure', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      expect(screen.getByTestId('popover')).toBeInTheDocument();
      expect(screen.getByTestId('popover-trigger')).toBeInTheDocument();
    });

    it('should render timeline view in popover content', () => {
      const timeline = createMockTimeline({ duration: 90000 });
      render(<AudioEffectsBadge timeline={timeline} />);

      expect(screen.getByTestId('timeline-view')).toBeInTheDocument();
      expect(screen.getByText(/90000ms/)).toBeInTheDocument();
    });

    it('should pass timeline to AudioEffectsTimelineView', () => {
      const timeline = createMockTimeline({ duration: 120000 });
      render(<AudioEffectsBadge timeline={timeline} />);

      expect(screen.getByText(/Duration: 120000ms/)).toBeInTheDocument();
    });
  });

  describe('Popover Content Positioning', () => {
    it('should position popover on top', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      const popoverContent = screen.getByTestId('popover-content');
      expect(popoverContent).toHaveAttribute('data-side', 'top');
    });

    it('should align popover to start', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      const popoverContent = screen.getByTestId('popover-content');
      expect(popoverContent).toHaveAttribute('data-align', 'start');
    });
  });

  describe('Effects Count Display', () => {
    it('should display single effect count', () => {
      const timeline = createMockTimeline({
        metadata: { totalEffectsUsed: 1 },
      });
      render(<AudioEffectsBadge timeline={timeline} />);

      expect(screen.getByText(/1/)).toBeInTheDocument();
    });

    it('should display multiple effects count', () => {
      const timeline = createMockTimeline({
        metadata: { totalEffectsUsed: 4 },
      });
      render(<AudioEffectsBadge timeline={timeline} />);

      expect(screen.getByText(/4/)).toBeInTheDocument();
    });
  });

  describe('Hover States', () => {
    it('should have hover background classes', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('hover:from-purple-500/30');
      expect(button).toHaveClass('hover:to-pink-500/30');
    });

    it('should have transition class', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('transition-all');
    });

    it('should have group class for nested hover', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('group');
    });
  });

  describe('Text Styling', () => {
    it('should have small text size', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      // Check for the span with effects text
      const textSpan = screen.getByText(/effects/);
      expect(textSpan).toHaveClass('text-[10px]');
    });

    it('should have medium font weight', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      const textSpan = screen.getByText(/effects/);
      expect(textSpan).toHaveClass('font-medium');
    });
  });

  describe('Accessibility', () => {
    it('should render as a button', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should be clickable', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsBadge timeline={timeline} />);

      const button = screen.getByRole('button');
      expect(() => fireEvent.click(button)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle timeline with empty events array', () => {
      const timeline = createMockTimeline({
        events: [],
        metadata: { totalEffectsUsed: 0 },
      });
      const { container } = render(<AudioEffectsBadge timeline={timeline} />);

      expect(container.firstChild).toBeNull();
    });

    it('should handle timeline with zero duration', () => {
      const timeline = createMockTimeline({
        duration: 0,
        metadata: { totalEffectsUsed: 1 },
      });
      render(<AudioEffectsBadge timeline={timeline} />);

      expect(screen.getByTestId('timeline-view')).toBeInTheDocument();
    });
  });
});
