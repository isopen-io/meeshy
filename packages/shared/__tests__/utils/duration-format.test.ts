import { describe, it, expect } from 'vitest';
import { formatClock } from '../../utils/duration-format';

describe('formatClock', () => {
  describe('default (M:SS, no padding, no centiseconds)', () => {
    it('formats sub-minute durations as M:SS with unpadded minutes', () => {
      expect(formatClock(0)).toBe('0:00');
      expect(formatClock(5)).toBe('0:05');
      expect(formatClock(59)).toBe('0:59');
    });

    it('formats minute-range durations with unpadded minutes', () => {
      expect(formatClock(60)).toBe('1:00');
      expect(formatClock(165)).toBe('2:45');
      expect(formatClock(599)).toBe('9:59');
    });

    it('switches to H:MM:SS past an hour with padded minutes/seconds', () => {
      expect(formatClock(3600)).toBe('1:00:00');
      expect(formatClock(3661)).toBe('1:01:01');
      expect(formatClock(7384)).toBe('2:03:04');
    });

    it('floors fractional seconds', () => {
      expect(formatClock(59.99)).toBe('0:59');
      expect(formatClock(4.9)).toBe('0:04');
    });
  });

  describe('padMinutes', () => {
    it('zero-pads the leading minutes below an hour', () => {
      expect(formatClock(272, { padMinutes: true })).toBe('04:32');
      expect(formatClock(5, { padMinutes: true })).toBe('00:05');
      expect(formatClock(0, { padMinutes: true })).toBe('00:00');
    });

    it('still uses H:MM:SS past an hour', () => {
      expect(formatClock(3661, { padMinutes: true })).toBe('1:01:01');
    });
  });

  describe('includeCentiseconds', () => {
    it('appends two-digit centiseconds', () => {
      expect(formatClock(83.456, { includeCentiseconds: true })).toBe('1:23.45');
      expect(formatClock(0, { includeCentiseconds: true })).toBe('0:00.00');
      expect(formatClock(5.07, { includeCentiseconds: true })).toBe('0:05.07');
    });

    it('combines with hours', () => {
      expect(formatClock(3661.5, { includeCentiseconds: true })).toBe('1:01:01.50');
    });
  });

  describe('invalid / out-of-range inputs clamp to zero', () => {
    it('clamps negative values', () => {
      expect(formatClock(-1)).toBe('0:00');
      expect(formatClock(-100, { padMinutes: true })).toBe('00:00');
    });

    it('clamps non-finite values', () => {
      expect(formatClock(Number.NaN)).toBe('0:00');
      expect(formatClock(Number.POSITIVE_INFINITY)).toBe('0:00');
      expect(formatClock(Number.NaN, { includeCentiseconds: true })).toBe('0:00.00');
    });
  });
});
