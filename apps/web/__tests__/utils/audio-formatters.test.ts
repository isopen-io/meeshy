import { formatTime, formatDuration, snapPlaybackRate } from '@/utils/audio-formatters';

describe('formatTime', () => {
  it('returns 0:00.00 for NaN', () => {
    expect(formatTime(NaN)).toBe('0:00.00');
  });

  it('returns 0:00.00 for Infinity', () => {
    expect(formatTime(Infinity)).toBe('0:00.00');
  });

  it('returns 0:00.00 for -Infinity', () => {
    expect(formatTime(-Infinity)).toBe('0:00.00');
  });

  it('returns 0:00.00 for negative value', () => {
    expect(formatTime(-1)).toBe('0:00.00');
  });

  it('returns 0:00.00 for zero', () => {
    expect(formatTime(0)).toBe('0:00.00');
  });

  it('formats seconds without hours', () => {
    expect(formatTime(65.5)).toBe('1:05.50');
  });

  it('formats seconds below a minute', () => {
    expect(formatTime(9.09)).toBe('0:09.09');
  });

  it('formats exactly one minute', () => {
    expect(formatTime(60)).toBe('1:00.00');
  });

  it('formats hours when >= 3600 seconds', () => {
    expect(formatTime(3661)).toBe('1:01:01.00');
  });

  it('pads minutes and seconds with zeros in hour format', () => {
    expect(formatTime(3600)).toBe('1:00:00.00');
  });

  it('formats large value with hours', () => {
    expect(formatTime(7322.5)).toBe('2:02:02.50');
  });
});

describe('formatDuration', () => {
  it('returns 0:00 for zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('returns 0:00 for NaN', () => {
    expect(formatDuration(NaN)).toBe('0:00');
  });

  it('returns 0:00 for Infinity', () => {
    expect(formatDuration(Infinity)).toBe('0:00');
  });

  it('formats seconds without hours', () => {
    expect(formatDuration(90)).toBe('1:30');
  });

  it('formats below a minute', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats exactly one hour', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
  });

  it('formats hours with padding', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('formats large value with hours', () => {
    expect(formatDuration(7322)).toBe('2:02:02');
  });
});

describe('snapPlaybackRate', () => {
  it('snaps to 1.0 when close', () => {
    expect(snapPlaybackRate(1.03)).toBe(1.0);
  });

  it('snaps to 1.5 when close', () => {
    expect(snapPlaybackRate(1.48)).toBe(1.5);
  });

  it('snaps to 2.0 when close', () => {
    expect(snapPlaybackRate(2.04)).toBe(2.0);
  });

  it('snaps to 3.0 when close', () => {
    expect(snapPlaybackRate(2.97)).toBe(3.0);
  });

  it('returns original value when not near any snap point', () => {
    expect(snapPlaybackRate(1.2)).toBe(1.2);
  });

  it('does not snap at exact tolerance boundary', () => {
    // 0.05 is the threshold (exclusive), so 1.0 + 0.05 = 1.05 should NOT snap
    expect(snapPlaybackRate(1.05)).toBe(1.05);
  });

  it('snaps at just below tolerance boundary', () => {
    expect(snapPlaybackRate(1.049)).toBe(1.0);
  });

  it('handles value below all snap points', () => {
    expect(snapPlaybackRate(0.5)).toBe(0.5);
  });

  it('handles value above all snap points', () => {
    expect(snapPlaybackRate(4.0)).toBe(4.0);
  });

  it('snaps exactly at snap point', () => {
    expect(snapPlaybackRate(1.5)).toBe(1.5);
  });
});
