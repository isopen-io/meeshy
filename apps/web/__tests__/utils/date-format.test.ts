/**
 * Tests for date-format utility
 */

import {
  formatRelativeDate,
  formatConversationDate,
  formatFullDate,
} from '../../utils/date-format';

describe('date-format', () => {
  const mockT = (key: string, params?: Record<string, any>): string => {
    const translations: Record<string, string> = {
      justNow: "a l'instant",
      minutesAgo: `il y a ${params?.minutes}min`,
      hoursAgo: `il y a ${params?.hours}h`,
      yesterday: `Hier ${params?.time}`,
    };
    return translations[key] || key;
  };

  describe('formatRelativeDate', () => {
    it('should return justNow for less than 1 minute', () => {
      const now = new Date();
      const result = formatRelativeDate(now, { t: mockT });
      expect(result).toBe("a l'instant");
    });

    it('should return minutes ago for less than 60 minutes', () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const result = formatRelativeDate(thirtyMinutesAgo, { t: mockT });
      expect(result).toBe('il y a 30min');
    });

    it('should return hours ago for less than 24 hours on same day', () => {
      // Create a date 5 hours ago, but ensure it's the same day
      const now = new Date();
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);

      // If 5 hours ago would be yesterday, use a smaller offset
      if (fiveHoursAgo.getDate() !== now.getDate()) {
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        if (twoHoursAgo.getDate() === now.getDate()) {
          const result = formatRelativeDate(twoHoursAgo, { t: mockT });
          expect(result).toBe('il y a 2h');
        }
      } else {
        const result = formatRelativeDate(fiveHoursAgo, { t: mockT });
        expect(result).toBe('il y a 5h');
      }
    });

    it('should return yesterday with time for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(14, 30, 0, 0);

      const result = formatRelativeDate(yesterday, { t: mockT });
      expect(result).toContain('Hier');
    });

    it('should return day name with time for within a week', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const result = formatRelativeDate(threeDaysAgo, { t: mockT });
      // Should be a capitalized day name + time
      expect(result).toMatch(/^[A-Z][a-z]+\.? \d{2}:\d{2}$/);
    });

    it('should return full date for more than a week ago', () => {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const result = formatRelativeDate(twoWeeksAgo, { t: mockT });
      // Should contain day number, month, and year
      expect(result).toMatch(/\d+/); // Contains at least a number
    });

    it('should accept string date input', () => {
      const now = new Date();
      const result = formatRelativeDate(now.toISOString(), { t: mockT });
      expect(result).toBe("a l'instant");
    });

    it('should handle edge case of exactly 1 minute ago', () => {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const result = formatRelativeDate(oneMinuteAgo, { t: mockT });
      expect(result).toBe('il y a 1min');
    });

    it('should handle edge case of exactly 59 minutes ago', () => {
      const fiftyNineMinutesAgo = new Date(Date.now() - 59 * 60 * 1000);
      const result = formatRelativeDate(fiftyNineMinutesAgo, { t: mockT });
      expect(result).toBe('il y a 59min');
    });
  });

  describe('formatConversationDate', () => {
    it('should return time only for today', () => {
      const now = new Date();
      const result = formatConversationDate(now, { t: mockT });
      // Should be HH:MM format
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should return yesterday with time for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(10, 30, 0, 0);

      const result = formatConversationDate(yesterday, { t: mockT });
      expect(result).toContain('Hier');
    });

    it('should return day name with time for within a week', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const result = formatConversationDate(threeDaysAgo, { t: mockT });
      expect(result).toMatch(/^[A-Z][a-z]+\.? \d{2}:\d{2}$/);
    });

    it('should return full date for older than a week', () => {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const result = formatConversationDate(twoWeeksAgo, { t: mockT });
      expect(result).toMatch(/\d+/);
    });

    it('should accept string date input', () => {
      const now = new Date();
      const result = formatConversationDate(now.toISOString(), { t: mockT });
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('formatFullDate', () => {
    it('should return full formatted date', () => {
      const date = new Date(2025, 10, 4, 14, 30); // Nov 4, 2025 at 14:30
      const result = formatFullDate(date);

      // Should contain weekday, day, month, year, and time
      expect(result).toContain('14:30');
      expect(result).toContain('4');
      expect(result).toContain('2025');
    });

    it('should accept string date input', () => {
      const dateString = '2025-11-04T14:30:00';
      const result = formatFullDate(dateString);

      expect(result).toContain('14:30');
      expect(result).toContain('4');
      expect(result).toContain('2025');
    });

    it('should include the word "at" (a/à) before time in French', () => {
      const date = new Date(2025, 10, 4, 14, 30);
      const result = formatFullDate(date);

      // French locale uses "à" (with accent) before time
      expect(result).toContain(' à ');
    });

    it('should use French locale format', () => {
      const date = new Date(2025, 0, 15, 9, 5); // Jan 15, 2025 at 09:05
      const result = formatFullDate(date);

      // French weekdays are lowercase
      expect(result).toMatch(/^[a-z]/);
    });

    it('should handle midnight', () => {
      const midnight = new Date(2025, 5, 15, 0, 0);
      const result = formatFullDate(midnight);

      expect(result).toContain('00:00');
    });

    it('should handle noon', () => {
      const noon = new Date(2025, 5, 15, 12, 0);
      const result = formatFullDate(noon);

      expect(result).toContain('12:00');
    });
  });
});
