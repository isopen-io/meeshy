import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TranslationStats } from '../../../services/message-translation/TranslationStats';

describe('TranslationStats', () => {
  let stats: TranslationStats;

  beforeEach(() => {
    jest.useFakeTimers();
    stats = new TranslationStats();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with zero stats', () => {
      const initialStats = stats.getStats();

      expect(initialStats.messages_saved).toBe(0);
      expect(initialStats.translation_requests_sent).toBe(0);
      expect(initialStats.translations_received).toBe(0);
      expect(initialStats.errors).toBe(0);
      expect(initialStats.pool_full_rejections).toBe(0);
      expect(initialStats.avg_processing_time).toBe(0);
    });

    it('should initialize with current timestamp', () => {
      const initialStats = stats.getStats();

      expect(initialStats.uptime_seconds).toBeGreaterThanOrEqual(0);
      expect(initialStats.uptime_seconds).toBeLessThan(1);
    });

    it('should track memory usage', () => {
      const initialStats = stats.getStats();

      expect(initialStats.memory_usage_mb).toBeGreaterThan(0);
      expect(typeof initialStats.memory_usage_mb).toBe('number');
    });
  });

  describe('incrementMessagesSaved', () => {
    it('should increment messages saved counter', () => {
      stats.incrementMessagesSaved();
      expect(stats.getStats().messages_saved).toBe(1);

      stats.incrementMessagesSaved();
      expect(stats.getStats().messages_saved).toBe(2);
    });

    it('should handle multiple increments', () => {
      for (let i = 0; i < 100; i++) {
        stats.incrementMessagesSaved();
      }
      expect(stats.getStats().messages_saved).toBe(100);
    });
  });

  describe('incrementRequestsSent', () => {
    it('should increment requests sent counter', () => {
      stats.incrementRequestsSent();
      expect(stats.getStats().translation_requests_sent).toBe(1);

      stats.incrementRequestsSent();
      expect(stats.getStats().translation_requests_sent).toBe(2);
    });

    it('should handle multiple increments', () => {
      for (let i = 0; i < 50; i++) {
        stats.incrementRequestsSent();
      }
      expect(stats.getStats().translation_requests_sent).toBe(50);
    });
  });

  describe('incrementTranslationsReceived', () => {
    it('should increment translations received counter', () => {
      stats.incrementTranslationsReceived();
      expect(stats.getStats().translations_received).toBe(1);

      stats.incrementTranslationsReceived();
      expect(stats.getStats().translations_received).toBe(2);
    });

    it('should handle multiple increments', () => {
      for (let i = 0; i < 75; i++) {
        stats.incrementTranslationsReceived();
      }
      expect(stats.getStats().translations_received).toBe(75);
    });
  });

  describe('incrementErrors', () => {
    it('should increment errors counter', () => {
      stats.incrementErrors();
      expect(stats.getStats().errors).toBe(1);

      stats.incrementErrors();
      expect(stats.getStats().errors).toBe(2);
    });

    it('should handle multiple error increments', () => {
      for (let i = 0; i < 10; i++) {
        stats.incrementErrors();
      }
      expect(stats.getStats().errors).toBe(10);
    });
  });

  describe('incrementPoolFullRejections', () => {
    it('should increment pool full rejections counter', () => {
      stats.incrementPoolFullRejections();
      expect(stats.getStats().pool_full_rejections).toBe(1);

      stats.incrementPoolFullRejections();
      expect(stats.getStats().pool_full_rejections).toBe(2);
    });

    it('should handle multiple rejection increments', () => {
      for (let i = 0; i < 15; i++) {
        stats.incrementPoolFullRejections();
      }
      expect(stats.getStats().pool_full_rejections).toBe(15);
    });
  });

  describe('updateAvgProcessingTime', () => {
    it('should set processing time on first translation', () => {
      stats.incrementTranslationsReceived();
      stats.updateAvgProcessingTime(100);

      expect(stats.getStats().avg_processing_time).toBe(100);
    });

    it('should calculate average processing time correctly', () => {
      // First translation: 100ms
      stats.incrementTranslationsReceived();
      stats.updateAvgProcessingTime(100);
      expect(stats.getStats().avg_processing_time).toBe(100);

      // Second translation: 200ms
      stats.incrementTranslationsReceived();
      stats.updateAvgProcessingTime(200);
      expect(stats.getStats().avg_processing_time).toBe(150); // (100 + 200) / 2

      // Third translation: 300ms
      stats.incrementTranslationsReceived();
      stats.updateAvgProcessingTime(300);
      expect(stats.getStats().avg_processing_time).toBe(200); // (100 + 200 + 300) / 3
    });

    it('should handle zero processing time', () => {
      stats.incrementTranslationsReceived();
      stats.updateAvgProcessingTime(0);

      expect(stats.getStats().avg_processing_time).toBe(0);
    });

    it('should handle very large processing times', () => {
      stats.incrementTranslationsReceived();
      stats.updateAvgProcessingTime(10000);

      expect(stats.getStats().avg_processing_time).toBe(10000);
    });

    it('should handle fractional processing times', () => {
      stats.incrementTranslationsReceived();
      stats.updateAvgProcessingTime(100.5);

      stats.incrementTranslationsReceived();
      stats.updateAvgProcessingTime(200.5);

      expect(stats.getStats().avg_processing_time).toBe(150.5);
    });

    it('should update average with multiple varied times', () => {
      const times = [50, 100, 150, 200, 250];

      times.forEach(time => {
        stats.incrementTranslationsReceived();
        stats.updateAvgProcessingTime(time);
      });

      // Average of 50, 100, 150, 200, 250 = 150
      expect(stats.getStats().avg_processing_time).toBe(150);
    });

    it('should handle calling updateAvgProcessingTime without incrementing translations', () => {
      // This tests the edge case where translations_received is 0
      stats.updateAvgProcessingTime(100);
      expect(stats.getStats().avg_processing_time).toBe(100);
    });
  });

  describe('getStats', () => {
    it('should return complete stats object', () => {
      const statsData = stats.getStats();

      expect(statsData).toHaveProperty('messages_saved');
      expect(statsData).toHaveProperty('translation_requests_sent');
      expect(statsData).toHaveProperty('translations_received');
      expect(statsData).toHaveProperty('errors');
      expect(statsData).toHaveProperty('pool_full_rejections');
      expect(statsData).toHaveProperty('avg_processing_time');
      expect(statsData).toHaveProperty('uptime_seconds');
      expect(statsData).toHaveProperty('memory_usage_mb');
    });

    it('should return updated stats after operations', () => {
      stats.incrementMessagesSaved();
      stats.incrementRequestsSent();
      stats.incrementTranslationsReceived();
      stats.incrementErrors();
      stats.incrementPoolFullRejections();
      stats.updateAvgProcessingTime(100);

      const statsData = stats.getStats();

      expect(statsData.messages_saved).toBe(1);
      expect(statsData.translation_requests_sent).toBe(1);
      expect(statsData.translations_received).toBe(1);
      expect(statsData.errors).toBe(1);
      expect(statsData.pool_full_rejections).toBe(1);
      expect(statsData.avg_processing_time).toBe(100);
    });

    it('should calculate uptime correctly', () => {
      // Advance time by 10 seconds
      jest.advanceTimersByTime(10000);

      const statsData = stats.getStats();
      expect(statsData.uptime_seconds).toBeCloseTo(10, 0);
    });

    it('should update uptime on each call', () => {
      jest.advanceTimersByTime(5000);
      const stats1 = stats.getStats();
      expect(stats1.uptime_seconds).toBeCloseTo(5, 0);

      jest.advanceTimersByTime(5000);
      const stats2 = stats.getStats();
      expect(stats2.uptime_seconds).toBeCloseTo(10, 0);
    });

    it('should return current memory usage', () => {
      const statsData = stats.getStats();

      expect(statsData.memory_usage_mb).toBeGreaterThan(0);
      expect(Number.isFinite(statsData.memory_usage_mb)).toBe(true);
    });

    it('should not mutate internal state when getting stats', () => {
      stats.incrementMessagesSaved();
      const stats1 = stats.getStats();
      const stats2 = stats.getStats();

      expect(stats1.messages_saved).toBe(stats2.messages_saved);
    });
  });

  describe('reset', () => {
    it('should reset all counters to zero', () => {
      stats.incrementMessagesSaved();
      stats.incrementRequestsSent();
      stats.incrementTranslationsReceived();
      stats.incrementErrors();
      stats.incrementPoolFullRejections();
      stats.updateAvgProcessingTime(100);

      stats.reset();

      const statsData = stats.getStats();
      expect(statsData.messages_saved).toBe(0);
      expect(statsData.translation_requests_sent).toBe(0);
      expect(statsData.translations_received).toBe(0);
      expect(statsData.errors).toBe(0);
      expect(statsData.pool_full_rejections).toBe(0);
      expect(statsData.avg_processing_time).toBe(0);
    });

    it('should allow incrementing after reset', () => {
      stats.incrementMessagesSaved();
      stats.reset();

      stats.incrementMessagesSaved();
      expect(stats.getStats().messages_saved).toBe(1);
    });

    it('should not reset start time', () => {
      jest.advanceTimersByTime(10000);
      stats.reset();

      // Uptime should still reflect time since construction, not reset
      const statsData = stats.getStats();
      expect(statsData.uptime_seconds).toBeGreaterThan(9);
    });

    it('should handle multiple resets', () => {
      stats.incrementMessagesSaved();
      stats.reset();
      stats.reset();
      stats.reset();

      const statsData = stats.getStats();
      expect(statsData.messages_saved).toBe(0);
    });
  });

  describe('uptimeSeconds getter', () => {
    it('should return uptime in seconds', () => {
      jest.advanceTimersByTime(5000);
      expect(stats.uptimeSeconds).toBeCloseTo(5, 0);
    });

    it('should update with time', () => {
      jest.advanceTimersByTime(3000);
      const uptime1 = stats.uptimeSeconds;

      jest.advanceTimersByTime(2000);
      const uptime2 = stats.uptimeSeconds;

      expect(uptime2).toBeGreaterThan(uptime1);
      expect(uptime2).toBeCloseTo(5, 0);
    });

    it('should be consistent with getStats().uptime_seconds', () => {
      jest.advanceTimersByTime(7000);

      const uptimeGetter = stats.uptimeSeconds;
      const uptimeStats = stats.getStats().uptime_seconds;

      expect(uptimeGetter).toBeCloseTo(uptimeStats, 2);
    });
  });

  describe('integration scenarios', () => {
    it('should track complete translation workflow', () => {
      // Simulate translation workflow
      stats.incrementMessagesSaved(); // Message saved
      stats.incrementRequestsSent(); // Request sent to translation service

      jest.advanceTimersByTime(150); // Simulate processing time

      stats.incrementTranslationsReceived(); // Translation received
      stats.updateAvgProcessingTime(150);

      const statsData = stats.getStats();
      expect(statsData.messages_saved).toBe(1);
      expect(statsData.translation_requests_sent).toBe(1);
      expect(statsData.translations_received).toBe(1);
      expect(statsData.avg_processing_time).toBe(150);
    });

    it('should track error scenarios', () => {
      stats.incrementMessagesSaved();
      stats.incrementRequestsSent();
      stats.incrementErrors(); // Translation failed

      const statsData = stats.getStats();
      expect(statsData.errors).toBe(1);
      expect(statsData.translations_received).toBe(0);
    });

    it('should track pool full rejections', () => {
      stats.incrementPoolFullRejections();
      stats.incrementPoolFullRejections();

      const statsData = stats.getStats();
      expect(statsData.pool_full_rejections).toBe(2);
    });

    it('should handle mixed success and error scenarios', () => {
      // Successful translations
      for (let i = 0; i < 10; i++) {
        stats.incrementMessagesSaved();
        stats.incrementRequestsSent();
        stats.incrementTranslationsReceived();
        stats.updateAvgProcessingTime(100 + i * 10);
      }

      // Failed translations
      for (let i = 0; i < 3; i++) {
        stats.incrementMessagesSaved();
        stats.incrementRequestsSent();
        stats.incrementErrors();
      }

      // Pool rejections
      for (let i = 0; i < 2; i++) {
        stats.incrementPoolFullRejections();
      }

      const statsData = stats.getStats();
      expect(statsData.messages_saved).toBe(13);
      expect(statsData.translation_requests_sent).toBe(13);
      expect(statsData.translations_received).toBe(10);
      expect(statsData.errors).toBe(3);
      expect(statsData.pool_full_rejections).toBe(2);
    });

    it('should maintain accuracy over long running time', () => {
      // Simulate 1 hour of operation
      jest.advanceTimersByTime(60 * 60 * 1000);

      // Simulate ongoing translations
      for (let i = 0; i < 1000; i++) {
        stats.incrementMessagesSaved();
        stats.incrementRequestsSent();
        stats.incrementTranslationsReceived();
        stats.updateAvgProcessingTime(100);
      }

      const statsData = stats.getStats();
      expect(statsData.messages_saved).toBe(1000);
      expect(statsData.uptime_seconds).toBeCloseTo(3600, 0);
      expect(statsData.avg_processing_time).toBe(100);
    });
  });

  describe('edge cases', () => {
    it('should handle very high counter values', () => {
      for (let i = 0; i < 1000000; i++) {
        stats.incrementMessagesSaved();
      }

      expect(stats.getStats().messages_saved).toBe(1000000);
    });

    it('should handle rapid increments', () => {
      for (let i = 0; i < 1000; i++) {
        stats.incrementMessagesSaved();
        stats.incrementRequestsSent();
        stats.incrementTranslationsReceived();
        stats.incrementErrors();
        stats.incrementPoolFullRejections();
      }

      const statsData = stats.getStats();
      expect(statsData.messages_saved).toBe(1000);
      expect(statsData.translation_requests_sent).toBe(1000);
      expect(statsData.translations_received).toBe(1000);
      expect(statsData.errors).toBe(1000);
      expect(statsData.pool_full_rejections).toBe(1000);
    });

    it('should handle extreme processing times', () => {
      stats.incrementTranslationsReceived();
      stats.updateAvgProcessingTime(0.001);

      stats.incrementTranslationsReceived();
      stats.updateAvgProcessingTime(999999);

      const avgTime = stats.getStats().avg_processing_time;
      expect(avgTime).toBeGreaterThan(0);
      expect(avgTime).toBeLessThan(1000000);
    });
  });
});
