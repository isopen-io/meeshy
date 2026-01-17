/**
 * Tests for AudioWaveform component
 * Tests animated waveform visualization for audio recording
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AudioWaveform } from '../../../components/audio/AudioWaveform';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, animate, transition, ...props }: any) => (
      <div
        className={className}
        data-testid="motion-bar"
        data-animate={JSON.stringify(animate)}
        data-transition={JSON.stringify(transition)}
        {...props}
      >
        {children}
      </div>
    ),
  },
}));

describe('AudioWaveform', () => {
  describe('Basic Rendering', () => {
    it('should render the component', () => {
      const { container } = render(<AudioWaveform isRecording={false} />);

      expect(container.firstChild).toBeInTheDocument();
    });

    it('should render 20 bars by default', () => {
      render(<AudioWaveform isRecording={false} />);

      const bars = screen.getAllByTestId('motion-bar');
      expect(bars).toHaveLength(20);
    });

    it('should have flex container layout', () => {
      const { container } = render(<AudioWaveform isRecording={false} />);

      expect(container.firstChild).toHaveClass('flex');
      expect(container.firstChild).toHaveClass('items-center');
      expect(container.firstChild).toHaveClass('justify-center');
    });

    it('should have gap between bars', () => {
      const { container } = render(<AudioWaveform isRecording={false} />);

      expect(container.firstChild).toHaveClass('gap-0.5');
    });

    it('should have fixed height', () => {
      const { container } = render(<AudioWaveform isRecording={false} />);

      expect(container.firstChild).toHaveClass('h-10');
    });
  });

  describe('Custom ClassName', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <AudioWaveform isRecording={false} className="my-custom-class" />
      );

      expect(container.firstChild).toHaveClass('my-custom-class');
    });

    it('should preserve default classes with custom className', () => {
      const { container } = render(
        <AudioWaveform isRecording={false} className="my-class" />
      );

      expect(container.firstChild).toHaveClass('flex');
      expect(container.firstChild).toHaveClass('my-class');
    });
  });

  describe('Bar Styling', () => {
    it('should have width-1 for each bar', () => {
      render(<AudioWaveform isRecording={false} />);

      const bars = screen.getAllByTestId('motion-bar');
      bars.forEach((bar) => {
        expect(bar).toHaveClass('w-1');
      });
    });

    it('should have rounded bars', () => {
      render(<AudioWaveform isRecording={false} />);

      const bars = screen.getAllByTestId('motion-bar');
      bars.forEach((bar) => {
        expect(bar).toHaveClass('rounded-full');
      });
    });
  });

  describe('Recording State', () => {
    it('should apply red gradient when recording', () => {
      render(<AudioWaveform isRecording={true} />);

      const bars = screen.getAllByTestId('motion-bar');
      bars.forEach((bar) => {
        expect(bar).toHaveClass('bg-gradient-to-t');
        expect(bar).toHaveClass('from-red-500');
        expect(bar).toHaveClass('to-red-300');
      });
    });

    it('should apply gray color when not recording', () => {
      render(<AudioWaveform isRecording={false} />);

      const bars = screen.getAllByTestId('motion-bar');
      bars.forEach((bar) => {
        expect(bar).toHaveClass('bg-gray-300');
      });
    });

    it('should have dark mode gray when not recording', () => {
      render(<AudioWaveform isRecording={false} />);

      const bars = screen.getAllByTestId('motion-bar');
      bars.forEach((bar) => {
        expect(bar).toHaveClass('dark:bg-gray-600');
      });
    });
  });

  describe('Animation Properties', () => {
    it('should animate height when recording', () => {
      render(<AudioWaveform isRecording={true} audioLevel={0.7} />);

      const bars = screen.getAllByTestId('motion-bar');
      const firstBarAnimate = JSON.parse(bars[0].dataset.animate || '{}');

      expect(firstBarAnimate).toHaveProperty('height');
      expect(Array.isArray(firstBarAnimate.height)).toBe(true);
    });

    it('should have static height when not recording', () => {
      render(<AudioWaveform isRecording={false} />);

      const bars = screen.getAllByTestId('motion-bar');
      const firstBarAnimate = JSON.parse(bars[0].dataset.animate || '{}');

      // When not recording, height should be just the base height (3)
      expect(firstBarAnimate).toHaveProperty('height');
      expect(firstBarAnimate.height).toBe(3);
    });

    it('should have transition properties', () => {
      render(<AudioWaveform isRecording={true} />);

      const bars = screen.getAllByTestId('motion-bar');
      const firstBarTransition = JSON.parse(bars[0].dataset.transition || '{}');

      expect(firstBarTransition).toHaveProperty('duration');
      expect(firstBarTransition.duration).toBe(1.2);
    });

    it('should have infinite repeat when recording', () => {
      render(<AudioWaveform isRecording={true} />);

      const bars = screen.getAllByTestId('motion-bar');
      const firstBarTransition = JSON.parse(bars[0].dataset.transition || '{}');

      expect(firstBarTransition).toHaveProperty('repeat');
      // Infinity becomes null when JSON stringified, so check for truthy or Infinity
      expect(firstBarTransition.repeat === Infinity || firstBarTransition.repeat === null).toBe(true);
    });

    it('should not repeat when not recording', () => {
      render(<AudioWaveform isRecording={false} />);

      const bars = screen.getAllByTestId('motion-bar');
      const firstBarTransition = JSON.parse(bars[0].dataset.transition || '{}');

      expect(firstBarTransition).toHaveProperty('repeat');
      expect(firstBarTransition.repeat).toBe(0);
    });

    it('should have easeInOut easing', () => {
      render(<AudioWaveform isRecording={true} />);

      const bars = screen.getAllByTestId('motion-bar');
      const firstBarTransition = JSON.parse(bars[0].dataset.transition || '{}');

      expect(firstBarTransition).toHaveProperty('ease');
      expect(firstBarTransition.ease).toBe('easeInOut');
    });
  });

  describe('Progressive Delay', () => {
    it('should have progressive delay for each bar when recording', () => {
      render(<AudioWaveform isRecording={true} />);

      const bars = screen.getAllByTestId('motion-bar');

      // Check that delays increase progressively
      const delays: number[] = [];
      bars.forEach((bar) => {
        const transition = JSON.parse(bar.dataset.transition || '{}');
        delays.push(transition.delay || 0);
      });

      // Each subsequent delay should be greater than or equal to the previous
      for (let i = 1; i < delays.length; i++) {
        expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
      }
    });

    it('should have delay of 0.05 seconds increment per bar', () => {
      render(<AudioWaveform isRecording={true} />);

      const bars = screen.getAllByTestId('motion-bar');
      const firstBarTransition = JSON.parse(bars[0].dataset.transition || '{}');
      const secondBarTransition = JSON.parse(bars[1].dataset.transition || '{}');

      const delayDifference = secondBarTransition.delay - firstBarTransition.delay;
      expect(delayDifference).toBeCloseTo(0.05, 2);
    });

    it('should have no delay when not recording', () => {
      render(<AudioWaveform isRecording={false} />);

      const bars = screen.getAllByTestId('motion-bar');
      bars.forEach((bar) => {
        const transition = JSON.parse(bar.dataset.transition || '{}');
        expect(transition.delay).toBe(0);
      });
    });
  });

  describe('Audio Level', () => {
    it('should use default audioLevel of 0.7', () => {
      render(<AudioWaveform isRecording={true} />);

      const bars = screen.getAllByTestId('motion-bar');
      const firstBarAnimate = JSON.parse(bars[0].dataset.animate || '{}');

      // With default audioLevel of 0.7, max height should be around:
      // baseHeight + (maxHeight - baseHeight) * audioLevel = 3 + (32 - 3) * 0.7 = ~23.3
      const heights = firstBarAnimate.height;
      if (Array.isArray(heights)) {
        const maxAnimatedHeight = Math.max(...heights);
        expect(maxAnimatedHeight).toBeGreaterThan(20);
        expect(maxAnimatedHeight).toBeLessThan(30);
      }
    });

    it('should respond to different audioLevel values', () => {
      const { rerender } = render(
        <AudioWaveform isRecording={true} audioLevel={0.3} />
      );

      const bars = screen.getAllByTestId('motion-bar');
      const lowLevelAnimate = JSON.parse(bars[0].dataset.animate || '{}');

      rerender(<AudioWaveform isRecording={true} audioLevel={1.0} />);

      const highLevelAnimate = JSON.parse(bars[0].dataset.animate || '{}');

      // Higher audio level should result in higher max height
      if (Array.isArray(lowLevelAnimate.height) && Array.isArray(highLevelAnimate.height)) {
        const lowMax = Math.max(...lowLevelAnimate.height);
        const highMax = Math.max(...highLevelAnimate.height);
        expect(highMax).toBeGreaterThan(lowMax);
      }
    });

    it('should handle zero audioLevel', () => {
      render(<AudioWaveform isRecording={true} audioLevel={0} />);

      const bars = screen.getAllByTestId('motion-bar');
      const firstBarAnimate = JSON.parse(bars[0].dataset.animate || '{}');

      // With audioLevel of 0, all heights should be baseHeight (3)
      if (Array.isArray(firstBarAnimate.height)) {
        firstBarAnimate.height.forEach((height: number) => {
          expect(height).toBe(3);
        });
      }
    });

    it('should handle audioLevel of 1.0 (max)', () => {
      render(<AudioWaveform isRecording={true} audioLevel={1.0} />);

      const bars = screen.getAllByTestId('motion-bar');
      const firstBarAnimate = JSON.parse(bars[0].dataset.animate || '{}');

      // With audioLevel of 1.0, max height should be 32
      if (Array.isArray(firstBarAnimate.height)) {
        const maxHeight = Math.max(...firstBarAnimate.height);
        expect(maxHeight).toBe(32);
      }
    });
  });

  describe('Height Animation Keyframes', () => {
    it('should have 5 keyframes for height animation', () => {
      render(<AudioWaveform isRecording={true} audioLevel={0.7} />);

      const bars = screen.getAllByTestId('motion-bar');
      const firstBarAnimate = JSON.parse(bars[0].dataset.animate || '{}');

      expect(Array.isArray(firstBarAnimate.height)).toBe(true);
      expect(firstBarAnimate.height).toHaveLength(5);
    });

    it('should start and end at base height', () => {
      render(<AudioWaveform isRecording={true} audioLevel={0.7} />);

      const bars = screen.getAllByTestId('motion-bar');
      const firstBarAnimate = JSON.parse(bars[0].dataset.animate || '{}');

      const heights = firstBarAnimate.height;
      if (Array.isArray(heights)) {
        expect(heights[0]).toBe(3); // Start at baseHeight
        expect(heights[heights.length - 1]).toBe(3); // End at baseHeight
      }
    });

    it('should peak at middle keyframe', () => {
      render(<AudioWaveform isRecording={true} audioLevel={0.7} />);

      const bars = screen.getAllByTestId('motion-bar');
      const firstBarAnimate = JSON.parse(bars[0].dataset.animate || '{}');

      const heights = firstBarAnimate.height;
      if (Array.isArray(heights)) {
        // Middle keyframe (index 2) should be the peak
        const middleIndex = Math.floor(heights.length / 2);
        expect(heights[middleIndex]).toBe(Math.max(...heights));
      }
    });
  });

  describe('Component Props', () => {
    it('should accept isRecording prop', () => {
      const { rerender } = render(<AudioWaveform isRecording={false} />);

      const bars = screen.getAllByTestId('motion-bar');
      expect(bars[0]).toHaveClass('bg-gray-300');

      rerender(<AudioWaveform isRecording={true} />);

      expect(bars[0]).toHaveClass('from-red-500');
    });

    it('should accept audioLevel prop', () => {
      render(<AudioWaveform isRecording={true} audioLevel={0.5} />);

      const bars = screen.getAllByTestId('motion-bar');
      expect(bars).toHaveLength(20);
    });

    it('should accept className prop', () => {
      const { container } = render(
        <AudioWaveform isRecording={false} className="test-class" />
      );

      expect(container.firstChild).toHaveClass('test-class');
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid isRecording changes', () => {
      const { rerender } = render(<AudioWaveform isRecording={false} />);

      // Rapidly toggle recording state
      for (let i = 0; i < 10; i++) {
        rerender(<AudioWaveform isRecording={i % 2 === 0} />);
      }

      // Should still render without errors
      const bars = screen.getAllByTestId('motion-bar');
      expect(bars).toHaveLength(20);
    });

    it('should handle audioLevel above 1.0', () => {
      render(<AudioWaveform isRecording={true} audioLevel={1.5} />);

      // Should not throw, though behavior might be unexpected
      const bars = screen.getAllByTestId('motion-bar');
      expect(bars).toHaveLength(20);
    });

    it('should handle negative audioLevel', () => {
      render(<AudioWaveform isRecording={true} audioLevel={-0.5} />);

      // Should not throw, though behavior might be unexpected
      const bars = screen.getAllByTestId('motion-bar');
      expect(bars).toHaveLength(20);
    });

    it('should render correctly with empty className', () => {
      const { container } = render(
        <AudioWaveform isRecording={false} className="" />
      );

      expect(container.firstChild).toHaveClass('flex');
    });
  });
});
