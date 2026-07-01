import { formatAgentTimeAgo, formatAgentTimeAgoShort } from '../agent-time-format';

const NOW = new Date('2026-07-01T12:00:00.000Z').getTime();

const t = (key: string): string => key;

const isoAgo = (ms: number): string => new Date(NOW - ms).toISOString();

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatAgentTimeAgo (verbose)', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the never label when the date is missing', () => {
    expect(formatAgentTimeAgo(null, t)).toBe('agent.overview.timeAgo.never');
    expect(formatAgentTimeAgo(undefined, t)).toBe('agent.overview.timeAgo.never');
    expect(formatAgentTimeAgo('', t)).toBe('agent.overview.timeAgo.never');
  });

  it('honours a custom null label', () => {
    expect(formatAgentTimeAgo(null, t, { nullLabel: '-' })).toBe('-');
  });

  it('renders "just now" under a minute', () => {
    expect(formatAgentTimeAgo(isoAgo(30_000), t)).toBe('agent.overview.timeAgo.justNow');
  });

  it('renders minutes with the {{count}} placeholder substituted', () => {
    const minutesLabel = (key: string) =>
      key === 'agent.overview.timeAgo.minutes' ? 'il y a {{count}} min' : key;
    expect(formatAgentTimeAgo(isoAgo(5 * MIN), minutesLabel)).toBe('il y a 5 min');
  });

  it('renders hours below 24h', () => {
    const label = (key: string) =>
      key === 'agent.overview.timeAgo.hours' ? '{{count}}' : key;
    expect(formatAgentTimeAgo(isoAgo(3 * HOUR), label)).toBe('3');
  });

  it('renders days beyond 24h and never rolls over to an absolute date', () => {
    const label = (key: string) =>
      key === 'agent.overview.timeAgo.days' ? '{{count}}' : key;
    expect(formatAgentTimeAgo(isoAgo(10 * DAY), label)).toBe('10');
    expect(formatAgentTimeAgo(isoAgo(365 * DAY), label)).toBe('365');
  });

  it('matches the previous manual bucketing at the hour boundary', () => {
    const label = (key: string) =>
      key === 'agent.overview.timeAgo.minutes' || key === 'agent.overview.timeAgo.hours'
        ? key.split('.').pop() + ':{{count}}'
        : key;
    expect(formatAgentTimeAgo(isoAgo(59 * MIN), label)).toBe('minutes:59');
    expect(formatAgentTimeAgo(isoAgo(60 * MIN), label)).toBe('hours:1');
  });
});

describe('formatAgentTimeAgoShort (compact)', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the never label when the date is missing', () => {
    expect(formatAgentTimeAgoShort(null, t)).toBe('agent.overview.timeAgo.never');
  });

  it('renders "now" under a minute', () => {
    expect(formatAgentTimeAgoShort(isoAgo(10_000), t)).toBe('timeAgo.now');
  });

  it('concatenates the value with the unit label', () => {
    const label = (key: string) => {
      if (key === 'timeAgo.minutes') return 'min';
      if (key === 'timeAgo.hours') return 'h';
      if (key === 'timeAgo.days') return 'd';
      return key;
    };
    expect(formatAgentTimeAgoShort(isoAgo(5 * MIN), label)).toBe('5min');
    expect(formatAgentTimeAgoShort(isoAgo(3 * HOUR), label)).toBe('3h');
    expect(formatAgentTimeAgoShort(isoAgo(2 * DAY), label)).toBe('2d');
  });
});
