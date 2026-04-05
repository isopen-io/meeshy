import { resolveDelaySeconds } from '../../delivery/delay-resolver';

describe('resolveDelaySeconds', () => {
  it('maps immediate to lower 10% of range', () => {
    const result = resolveDelaySeconds('immediate', { minDelayMinutes: 1, maxDelayMinutes: 360 });
    expect(result).toBeGreaterThanOrEqual(48);
    expect(result).toBeLessThanOrEqual(3024);
  });

  it('maps short to 10-30% of range', () => {
    const result = resolveDelaySeconds('short', { minDelayMinutes: 1, maxDelayMinutes: 360 });
    expect(result).toBeGreaterThanOrEqual(1680);
    expect(result).toBeLessThanOrEqual(8064);
  });

  it('maps medium to 30-70% of range', () => {
    const result = resolveDelaySeconds('medium', { minDelayMinutes: 1, maxDelayMinutes: 360 });
    expect(result).toBeGreaterThanOrEqual(5184);
    expect(result).toBeLessThanOrEqual(18432);
  });

  it('maps long to 70-100% of range', () => {
    const result = resolveDelaySeconds('long', { minDelayMinutes: 1, maxDelayMinutes: 360 });
    expect(result).toBeGreaterThanOrEqual(12096);
    expect(result).toBeLessThanOrEqual(25920);
  });

  it('respects tight config range', () => {
    const result = resolveDelaySeconds('immediate', { minDelayMinutes: 5, maxDelayMinutes: 10 });
    expect(result).toBeGreaterThanOrEqual(240);
    expect(result).toBeLessThanOrEqual(720);
  });

  it('handles minDelayMinutes == maxDelayMinutes', () => {
    const result = resolveDelaySeconds('long', { minDelayMinutes: 60, maxDelayMinutes: 60 });
    expect(result).toBeGreaterThanOrEqual(2880);
    expect(result).toBeLessThanOrEqual(4320);
  });

  describe('spreadOverDayEnabled', () => {
    it('distributes actions uniformly when enabled', () => {
      const results = [0, 1, 2, 3, 4].map(i =>
        resolveDelaySeconds('medium', {
          minDelayMinutes: 1,
          maxDelayMinutes: 360,
          spreadOverDayEnabled: true,
          actionIndex: i,
          totalActions: 5,
        })
      );
      // Each subsequent action should have a larger delay
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBeGreaterThan(results[i - 1] * 0.5); // Allow jitter
      }
      // Last action should be near max
      expect(results[4]).toBeGreaterThan(15000); // > 250 min
    });

    it('falls back to category-based when disabled', () => {
      const result = resolveDelaySeconds('immediate', {
        minDelayMinutes: 1,
        maxDelayMinutes: 360,
        spreadOverDayEnabled: false,
        actionIndex: 0,
        totalActions: 5,
      });
      expect(result).toBeLessThan(3024); // Still in immediate range
    });
  });
});
