import {
  formatTime,
  formatDuration,
  budgetColor,
  budgetGlow,
} from '@/components/admin/agent/schedule-format';

describe('schedule-format', () => {
  describe('formatTime', () => {
    it('renders a two-digit hour:minute clock for a 24h locale', () => {
      expect(formatTime(0, 'fr-FR')).toMatch(/^\d{2}:\d{2}$/);
      expect(formatTime(1_700_000_000_000, 'fr-FR')).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('formatDuration', () => {
    it('clamps a non-positive duration to 0min', () => {
      expect(formatDuration(0)).toBe('0min');
      expect(formatDuration(-5_000)).toBe('0min');
      expect(formatDuration(-90_000)).toBe('0min');
    });

    it('renders sub-hour durations in rounded minutes', () => {
      expect(formatDuration(300_000)).toBe('5min');
      expect(formatDuration(90_000)).toBe('2min');
    });

    it('renders whole hours without a minutes suffix', () => {
      expect(formatDuration(3_600_000)).toBe('1h');
    });

    it('renders hours and zero-padded minutes', () => {
      expect(formatDuration(3_900_000)).toBe('1h05');
      expect(formatDuration(9_000_000)).toBe('2h30');
    });
  });

  describe('budgetColor', () => {
    it('maps ratio bands to background classes', () => {
      expect(budgetColor(0.7)).toBe('bg-emerald-500');
      expect(budgetColor(0.6)).toBe('bg-amber-400');
      expect(budgetColor(0.5)).toBe('bg-amber-400');
      expect(budgetColor(0.3)).toBe('bg-red-500');
      expect(budgetColor(0.1)).toBe('bg-red-500');
    });
  });

  describe('budgetGlow', () => {
    it('maps ratio bands to shadow classes', () => {
      expect(budgetGlow(0.7)).toBe('shadow-emerald-500/30');
      expect(budgetGlow(0.6)).toBe('shadow-amber-400/30');
      expect(budgetGlow(0.5)).toBe('shadow-amber-400/30');
      expect(budgetGlow(0.3)).toBe('shadow-red-500/30');
      expect(budgetGlow(0.1)).toBe('shadow-red-500/30');
    });
  });
});
