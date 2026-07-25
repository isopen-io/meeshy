import { formatPhrasedTimeAgo, formatCompactTimeAgo } from '@/utils/relative-time-format';

// `t` fake mirroring the agent dashboard i18n key sets. Phrased keys carry a
// literal `{{count}}` placeholder (interpolated manually by the helper); compact
// keys are bare unit suffixes.
const KEYS: Record<string, string> = {
  'agent.overview.timeAgo.justNow': 'Just now',
  'agent.overview.timeAgo.minutes': '{{count}}min ago',
  'agent.overview.timeAgo.hours': '{{count}}h ago',
  'agent.overview.timeAgo.days': '{{count}}d ago',
  'timeAgo.now': 'just now',
  'timeAgo.minutes': 'min',
  'timeAgo.hours': 'h',
  'timeAgo.days': 'd',
};
const t = (key: string): string => KEYS[key] ?? key;

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const ago = (ms: number): number => NOW - ms;

describe('formatPhrasedTimeAgo', () => {
  const fmt = (targetMs: number) =>
    formatPhrasedTimeAgo(targetMs, NOW, t, 'agent.overview.timeAgo');

  it('renders "just now" under a minute', () => {
    expect(fmt(ago(30_000))).toBe('Just now');
  });

  it('renders minutes with interpolated count', () => {
    expect(fmt(ago(5 * MINUTE))).toBe('5min ago');
  });

  it('renders hours with interpolated count', () => {
    expect(fmt(ago(3 * HOUR))).toBe('3h ago');
  });

  it('renders days with interpolated count', () => {
    expect(fmt(ago(2 * DAY))).toBe('2d ago');
  });

  it('never overflows to an absolute date — old dates stay in days', () => {
    expect(fmt(ago(400 * DAY))).toBe('400d ago');
  });

  it('treats a future target as "just now" (negative diff)', () => {
    expect(fmt(NOW + 5 * MINUTE)).toBe('Just now');
  });

  it('crosses the 60-minute boundary into hours', () => {
    expect(fmt(ago(60 * MINUTE))).toBe('1h ago');
    expect(fmt(ago(59 * MINUTE))).toBe('59min ago');
  });
});

describe('formatCompactTimeAgo', () => {
  const fmt = (targetMs: number) => formatCompactTimeAgo(targetMs, NOW, t, 'timeAgo');

  it('renders "just now" under a minute', () => {
    expect(fmt(ago(30_000))).toBe('just now');
  });

  it('renders a compact minutes suffix', () => {
    expect(fmt(ago(5 * MINUTE))).toBe('5min');
  });

  it('renders a compact hours suffix', () => {
    expect(fmt(ago(3 * HOUR))).toBe('3h');
  });

  it('renders a compact days suffix', () => {
    expect(fmt(ago(2 * DAY))).toBe('2d');
  });

  it('never overflows to an absolute date — old dates stay in days', () => {
    expect(fmt(ago(400 * DAY))).toBe('400d');
  });

  it('crosses the 24-hour boundary into days', () => {
    expect(fmt(ago(24 * HOUR))).toBe('1d');
    expect(fmt(ago(23 * HOUR))).toBe('23h');
  });
});
