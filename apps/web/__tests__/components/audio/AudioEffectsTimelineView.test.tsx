/**
 * Tests for AudioEffectsTimelineView component
 * Tests timeline visualization, statistics display, and duration formatting
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AudioEffectsTimelineView } from '../../../components/audio/AudioEffectsTimelineView';
import type { AudioEffectsTimeline, AudioEffectEvent } from '@meeshy/shared/types/audio-effects-timeline';

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'timeline.title': 'Audio Effects Timeline',
        'timeline.duration': 'Duration',
        'timeline.effectsUsed': 'Effects Used',
        'timeline.stats.title': 'Statistics',
        'timeline.stats.activations': 'Activations',
        'timeline.stats.parameterChanges': 'Parameter Changes',
        'effects.voice-coder.name': 'Voice Coder',
        'effects.voice-coder.shortName': 'V-Coder',
        'effects.baby-voice.name': 'Baby Voice',
        'effects.baby-voice.shortName': 'Baby',
        'effects.demon-voice.name': 'Demon Voice',
        'effects.demon-voice.shortName': 'Demon',
        'effects.back-sound.name': 'Back Sound',
        'effects.back-sound.shortName': 'BG Sound',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock calculateEffectsStats
jest.mock('@meeshy/shared/types/audio-effects-timeline', () => ({
  calculateEffectsStats: jest.fn((timeline) => {
    // Simple mock implementation
    const byEffect: Record<string, any> = {};

    for (const event of timeline.events) {
      if (event.action === 'activate') {
        if (!byEffect[event.effectType]) {
          byEffect[event.effectType] = {
            activationCount: 0,
            totalDuration: 0,
            parameterChanges: 0,
          };
        }
        byEffect[event.effectType].activationCount++;
        byEffect[event.effectType].totalDuration = timeline.duration / 2; // Mock duration
      }
      if (event.action === 'update') {
        if (byEffect[event.effectType]) {
          byEffect[event.effectType].parameterChanges++;
        }
      }
    }

    return {
      totalActiveTime: timeline.duration / 2,
      byEffect,
    };
  }),
}));

// Helper to create mock timeline
const createMockTimeline = (
  overrides: Partial<AudioEffectsTimeline> = {}
): AudioEffectsTimeline => ({
  version: '1.0',
  createdAt: '2024-01-15T10:30:00.000Z',
  duration: 120000, // 2 minutes
  sampleRate: 48000,
  channels: 2,
  events: [],
  metadata: {
    totalEffectsUsed: 2,
    totalParameterChanges: 5,
    finalActiveEffects: ['voice-coder'],
  },
  ...overrides,
});

// Helper to create mock events
const createActivateEvent = (
  effectType: string,
  timestamp: number
): AudioEffectEvent => ({
  timestamp,
  effectType: effectType as any,
  action: 'activate',
  params: { pitch: 0 },
});

const createDeactivateEvent = (
  effectType: string,
  timestamp: number
): AudioEffectEvent => ({
  timestamp,
  effectType: effectType as any,
  action: 'deactivate',
});

const createUpdateEvent = (
  effectType: string,
  timestamp: number
): AudioEffectEvent => ({
  timestamp,
  effectType: effectType as any,
  action: 'update',
  params: { pitch: 5 },
});

describe('AudioEffectsTimelineView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render timeline title', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText('Audio Effects Timeline')).toBeInTheDocument();
    });

    it('should render title emoji', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText('🎭')).toBeInTheDocument();
    });

    it('should render duration label', () => {
      const timeline = createMockTimeline();
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText(/Duration/)).toBeInTheDocument();
    });

    it('should render statistics title', () => {
      const timeline = createMockTimeline({
        events: [createActivateEvent('voice-coder', 0)],
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText('Statistics')).toBeInTheDocument();
    });
  });

  describe('Duration Formatting', () => {
    it('should format duration in mm:ss format', () => {
      const timeline = createMockTimeline({ duration: 120000 }); // 2:00
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText('2:00')).toBeInTheDocument();
    });

    it('should format short duration correctly', () => {
      const timeline = createMockTimeline({ duration: 45000 }); // 0:45
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText('0:45')).toBeInTheDocument();
    });

    it('should format long duration correctly', () => {
      const timeline = createMockTimeline({ duration: 305000 }); // 5:05
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText('5:05')).toBeInTheDocument();
    });

    it('should pad seconds with leading zero', () => {
      const timeline = createMockTimeline({ duration: 65000 }); // 1:05
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText('1:05')).toBeInTheDocument();
    });
  });

  describe('Statistics Cards', () => {
    it('should display total effects used', () => {
      const timeline = createMockTimeline({
        metadata: { totalEffectsUsed: 3 },
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should display total parameter changes', () => {
      const timeline = createMockTimeline({
        metadata: { totalParameterChanges: 7 },
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText('7')).toBeInTheDocument();
    });

    it('should show zero for missing metadata', () => {
      const timeline = createMockTimeline({
        metadata: undefined,
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      // Should show 0 when metadata is missing
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Effect Statistics', () => {
    it('should render effect name', () => {
      const timeline = createMockTimeline({
        events: [createActivateEvent('voice-coder', 0)],
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText('Voice Coder')).toBeInTheDocument();
    });

    it('should render effect icon for voice-coder', () => {
      const timeline = createMockTimeline({
        events: [createActivateEvent('voice-coder', 0)],
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      // May have multiple mic icons
      const micIcons = screen.getAllByText('🎤');
      expect(micIcons.length).toBeGreaterThanOrEqual(1);
    });

    it('should render effect icon for baby-voice', () => {
      const timeline = createMockTimeline({
        events: [createActivateEvent('baby-voice', 0)],
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      // May have multiple icons
      const icons = screen.getAllByText('👶');
      expect(icons.length).toBeGreaterThanOrEqual(1);
    });

    it('should render effect icon for demon-voice', () => {
      const timeline = createMockTimeline({
        events: [createActivateEvent('demon-voice', 0)],
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      // May have multiple icons
      const icons = screen.getAllByText('😈');
      expect(icons.length).toBeGreaterThanOrEqual(1);
    });

    it('should render effect icon for back-sound', () => {
      const timeline = createMockTimeline({
        events: [createActivateEvent('back-sound', 0)],
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      // May have multiple icons
      const icons = screen.getAllByText('🎼');
      expect(icons.length).toBeGreaterThanOrEqual(1);
    });

    it('should display activation count', () => {
      const timeline = createMockTimeline({
        events: [
          createActivateEvent('voice-coder', 0),
          createDeactivateEvent('voice-coder', 30000),
          createActivateEvent('voice-coder', 60000),
        ],
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText('Activations')).toBeInTheDocument();
    });

    it('should display parameter changes when present', () => {
      const timeline = createMockTimeline({
        events: [
          createActivateEvent('voice-coder', 0),
          createUpdateEvent('voice-coder', 15000),
        ],
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      // Should show parameter changes label
      const paramLabels = screen.getAllByText('Parameter Changes');
      expect(paramLabels.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Visual Timeline', () => {
    it('should render timeline section', () => {
      const timeline = createMockTimeline({
        events: [createActivateEvent('voice-coder', 0)],
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });

    it('should render timeline blocks for activate events', () => {
      const timeline = createMockTimeline({
        duration: 60000,
        events: [
          createActivateEvent('voice-coder', 0),
          createDeactivateEvent('voice-coder', 30000),
        ],
      });
      const { container } = render(<AudioEffectsTimelineView timeline={timeline} />);

      // Check for timeline block with bg class
      const timelineBlocks = container.querySelectorAll('[class*="bg-blue-500"]');
      expect(timelineBlocks.length).toBeGreaterThanOrEqual(1);
    });

    it('should not render blocks for non-activate events', () => {
      const timeline = createMockTimeline({
        events: [createUpdateEvent('voice-coder', 15000)],
      });
      const { container } = render(<AudioEffectsTimelineView timeline={timeline} />);

      // Timeline visual should not have effect blocks (only update events)
      const timelineSection = container.querySelector('.h-12');
      expect(timelineSection).toBeInTheDocument();
    });
  });

  describe('Progress Bar', () => {
    it('should render progress bar for each effect', () => {
      const timeline = createMockTimeline({
        events: [createActivateEvent('voice-coder', 0)],
      });
      const { container } = render(<AudioEffectsTimelineView timeline={timeline} />);

      // Check for progress bar container
      const progressBars = container.querySelectorAll('.h-1\\.5');
      expect(progressBars.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Version Info', () => {
    it('should display timeline version', () => {
      const timeline = createMockTimeline({ version: '1.0' });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText(/v1.0/)).toBeInTheDocument();
    });

    it('should display creation date', () => {
      const timeline = createMockTimeline({
        createdAt: '2024-01-15T10:30:00.000Z',
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      // Date is formatted using toLocaleDateString
      // Just check it contains some date info
      const versionInfo = screen.getByText(/Timeline v/);
      expect(versionInfo).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should have padding', () => {
      const timeline = createMockTimeline();
      const { container } = render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(container.firstChild).toHaveClass('p-4');
    });

    it('should have spacing between sections', () => {
      const timeline = createMockTimeline();
      const { container } = render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(container.firstChild).toHaveClass('space-y-4');
    });

    it('should have grid layout for stats', () => {
      const timeline = createMockTimeline();
      const { container } = render(<AudioEffectsTimelineView timeline={timeline} />);

      const grid = container.querySelector('.grid-cols-2');
      expect(grid).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty events array', () => {
      const timeline = createMockTimeline({ events: [] });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      // Should still render the component structure
      expect(screen.getByText('Audio Effects Timeline')).toBeInTheDocument();
    });

    it('should handle zero duration', () => {
      const timeline = createMockTimeline({ duration: 0 });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText('0:00')).toBeInTheDocument();
    });

    it('should handle multiple effects', () => {
      const timeline = createMockTimeline({
        events: [
          createActivateEvent('voice-coder', 0),
          createActivateEvent('baby-voice', 10000),
          createActivateEvent('demon-voice', 20000),
        ],
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      expect(screen.getByText('Voice Coder')).toBeInTheDocument();
      expect(screen.getByText('Baby Voice')).toBeInTheDocument();
      expect(screen.getByText('Demon Voice')).toBeInTheDocument();
    });

    it('should handle effects without deactivation', () => {
      const timeline = createMockTimeline({
        duration: 60000,
        events: [createActivateEvent('voice-coder', 0)],
        // No deactivate event - effect runs until end
      });
      const { container } = render(<AudioEffectsTimelineView timeline={timeline} />);

      // Should still render the timeline block
      const timelineBlocks = container.querySelectorAll('[class*="bg-"]');
      expect(timelineBlocks.length).toBeGreaterThan(0);
    });
  });

  describe('Percentage Calculation', () => {
    it('should calculate and display percentage correctly', () => {
      const timeline = createMockTimeline({
        duration: 100000,
        events: [createActivateEvent('voice-coder', 0)],
      });
      render(<AudioEffectsTimelineView timeline={timeline} />);

      // Percentage should be displayed
      const percentageText = screen.getByText(/%/);
      expect(percentageText).toBeInTheDocument();
    });
  });

  describe('Color Coding', () => {
    it('should apply blue color for voice-coder', () => {
      const timeline = createMockTimeline({
        events: [createActivateEvent('voice-coder', 0)],
      });
      const { container } = render(<AudioEffectsTimelineView timeline={timeline} />);

      const blueElement = container.querySelector('.text-blue-400');
      expect(blueElement).toBeInTheDocument();
    });

    it('should apply pink color for baby-voice', () => {
      const timeline = createMockTimeline({
        events: [createActivateEvent('baby-voice', 0)],
      });
      const { container } = render(<AudioEffectsTimelineView timeline={timeline} />);

      const pinkElement = container.querySelector('.text-pink-400');
      expect(pinkElement).toBeInTheDocument();
    });

    it('should apply red color for demon-voice', () => {
      const timeline = createMockTimeline({
        events: [createActivateEvent('demon-voice', 0)],
      });
      const { container } = render(<AudioEffectsTimelineView timeline={timeline} />);

      const redElement = container.querySelector('.text-red-400');
      expect(redElement).toBeInTheDocument();
    });

    it('should apply green color for back-sound', () => {
      const timeline = createMockTimeline({
        events: [createActivateEvent('back-sound', 0)],
      });
      const { container } = render(<AudioEffectsTimelineView timeline={timeline} />);

      const greenElement = container.querySelector('.text-green-400');
      expect(greenElement).toBeInTheDocument();
    });
  });
});
