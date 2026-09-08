import { formatPhrasedTimeAgo, formatCompactTimeAgo } from '@/utils/relative-time-format';

// `t` fake mirroring the agent dashboard i18n key sets. Phrased keys carry a
// literal `{count}` placeholder — UNE accolade, la forme réellement livrée par
// `apps/web/locales/*/admin.json`. Ce corpus écrivait la forme doublée, celle que
// le code attendait : il validait le helper contre lui-même. Compact
// keys are bare unit suffixes.
const KEYS: Record<string, string> = {
  'agent.overview.timeAgo.justNow': 'Just now',
  'agent.overview.timeAgo.minutes': '{count}min ago',
  'agent.overview.timeAgo.hours': '{count}h ago',
  'agent.overview.timeAgo.days': '{count}d ago',
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

/**
 * Le corpus ci-dessus fabrique ses chaînes à la forme que le helper ATTEND
 * (`{{count}}`) : il valide le code contre lui-même et ne peut donc pas tomber
 * quand le code et les catalogues divergent. C'est exactement ce qui est arrivé
 * — le dashboard agent affichait « il y a {count}j » dans les quatre langues
 * pendant que ces tests restaient verts.
 *
 * Ce bloc-ci sert le VRAI catalogue. Il est le seul à pouvoir échouer sur une
 * divergence de placeholder, et il vaut pour chaque langue livrée.
 */
describe('formatPhrasedTimeAgo — servi par les catalogues RÉELS', () => {
  const LOCALES = ['en', 'es', 'fr', 'pt'] as const;

  const catalogue = (locale: string): Record<string, unknown> =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require(`../../locales/${locale}/admin.json`) as Record<string, unknown>;

  const lookup = (locale: string): TranslateKeyFake => (key: string): string => {
    const value = key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], catalogue(locale));
    return typeof value === 'string' ? value : key;
  };

  type TranslateKeyFake = (key: string) => string;

  it.each(LOCALES)('n\'abandonne aucun placeholder non substitué (%s)', (locale) => {
    const tr = lookup(locale);
    const rendus = [
      formatPhrasedTimeAgo(ago(5 * MINUTE), NOW, tr, 'agent.overview.timeAgo'),
      formatPhrasedTimeAgo(ago(3 * HOUR), NOW, tr, 'agent.overview.timeAgo'),
      formatPhrasedTimeAgo(ago(2 * DAY), NOW, tr, 'agent.overview.timeAgo'),
    ];

    for (const rendu of rendus) {
      expect(rendu).not.toMatch(/\{+count\}+/);
    }
  });

  it.each(LOCALES)('substitue réellement la valeur (%s)', (locale) => {
    const tr = lookup(locale);

    expect(formatPhrasedTimeAgo(ago(5 * MINUTE), NOW, tr, 'agent.overview.timeAgo')).toContain('5');
    expect(formatPhrasedTimeAgo(ago(3 * HOUR), NOW, tr, 'agent.overview.timeAgo')).toContain('3');
    expect(formatPhrasedTimeAgo(ago(2 * DAY), NOW, tr, 'agent.overview.timeAgo')).toContain('2');
  });
});
