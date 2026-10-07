import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { RICH_TEXT_DIRECT } from '@/lib/api/fixtures-rich-text';
import type { ConversationFlags } from '@/lib/api/preferences';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { streakMarkModel } from '@/lib/view/engagement-pill';

import { LensRow } from './lens-row';

/**
 * LA SÉRIE DANS LA LISTE — « 🔥4 · 120 » en rouge, à côté de l'heure du
 * dernier message, sans chip (directive porteur 2026-10-01). Masquée sur la
 * rangée en focus, pour le moment, où la pastille ne se pose plus non plus.
 *
 * Sans série en cours, le cumul SEUL (« 120 »), sans flamme, à l'encre
 * tertiaire ; cumul nul ⇒ rien (#9570, directive porteur 2026-10-07).
 */

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

const snapshot = (overrides: Partial<ConversationEngagementSnapshot> = {}): ConversationEngagementSnapshot => ({
  conversationId: RICH_TEXT_DIRECT.id,
  totalPoints: 120,
  todayPoints: 12,
  streakDays: 4,
  day: '2026-09-30',
  ...overrides,
});

const NOON_SEPT_30 = new Date(2026, 8, 30, 12).getTime();
const NOON_OCT_2 = new Date(2026, 9, 2, 12).getTime();
const FLAGS: ConversationFlags = { isPinned: false, isMuted: false, isArchived: false };

const row = (magnified: boolean, engagement: ConversationEngagementSnapshot | undefined, now = NOON_SEPT_30) =>
  renderToStaticMarkup(
    <LensRow
      conversation={RICH_TEXT_DIRECT}
      languages={['fr']}
      viewerId="u-viewer"
      flags={FLAGS}
      unreadCount={0}
      onRowAction={() => {}}
      status={{ magnified, alpha: 1, scale: 1, breathing: 0 }}
      engagement={engagement}
      now={() => now}
    />,
  );

const markOf = (html: string): string | undefined => html.match(/<span[^>]*data-streak-mark[^>]*>[\s\S]*?<\/span><\/span>/)?.[0];
const totalMarkOf = (html: string): string | undefined => html.match(/<span[^>]*data-points-mark[^>]*>[\s\S]*?<\/span><\/span>/)?.[0];

describe('le modèle de la série', () => {
  test('la série et le total des points, avec la phrase entière', () => {
    expect(streakMarkModel(snapshot(), '2026-09-30', 'fr')).toEqual({
      kind: 'streak',
      streakDays: 4,
      totalText: '120',
      label: 'Série de 4 jours, 120 points dont 12 aujourd’hui',
    });
  });

  test('pas de série en cours ⇒ le cumul seul (#9570)', () => {
    expect(streakMarkModel(snapshot({ streakDays: 0 }), '2026-09-30', 'fr')).toMatchObject({ kind: 'total', totalText: '120' });
    expect(streakMarkModel(snapshot(), '2026-10-02', 'fr')).toMatchObject({ kind: 'total', totalText: '120' });
  });

  test('cumul nul ou aucun instantané ⇒ rien', () => {
    expect(streakMarkModel(undefined, '2026-09-30', 'fr')).toBeNull();
    expect(streakMarkModel(snapshot({ totalPoints: 0, todayPoints: 0, streakDays: 0, day: null }), '2026-09-30', 'fr')).toBeNull();
  });
});

describe('la rangée de liste', () => {
  test('au repos : « 🔥4 · 120 » en rouge, juste avant l’heure, sans chip', () => {
    const html = row(false, snapshot());
    const mark = markOf(html);
    expect(mark).toBeDefined();
    expect(mark).toContain('var(--streak-ink)');
    expect(mark).toContain(`d="M173.79,51.48`);
    expect(mark).toMatch(/>4<[\s\S]*·[\s\S]*>120</);
    expect(mark).not.toContain('rounded-chip');
    expect(mark).not.toContain('background');
    expect(html.indexOf('data-streak-mark')).toBeLessThan(html.indexOf('data-time'));
    expect(html).toContain('<span class="sr-only">Série de 4 jours, 120 points dont 12 aujourd’hui</span>');
  });

  test('série tombée : le cumul seul, sans flamme, à l’encre tertiaire, juste avant l’heure (#9570)', () => {
    const html = row(false, snapshot(), NOON_OCT_2);
    expect(html).not.toContain('data-streak-mark');
    const mark = totalMarkOf(html);
    expect(mark).toBeDefined();
    expect(mark).toContain('>120<');
    expect(mark).toContain('var(--color-ios-ink-3)');
    expect(mark).not.toContain('var(--streak-ink)');
    expect(mark).not.toContain(`d="M173.79`);
    expect(mark).not.toContain('·');
    expect(html.indexOf('data-points-mark')).toBeLessThan(html.indexOf('data-time'));
    expect(html).toContain('<span class="sr-only">120 points gagnés dans cette conversation</span>');
  });

  test('aucun point : rien à côté de l’heure', () => {
    expect(row(false, undefined)).not.toContain('data-streak-mark');
    expect(row(false, undefined)).not.toContain('data-points-mark');
    const nothing = snapshot({ totalPoints: 0, todayPoints: 0, streakDays: 0, day: null });
    expect(row(false, nothing)).not.toContain('data-points-mark');
  });

  test('en focus : ni la série, ni le cumul, ni la pastille', () => {
    const html = row(true, snapshot());
    expect(html).not.toContain('data-streak-mark');
    expect(html).not.toContain('data-engagement-pill');
    expect(row(true, snapshot(), NOON_OCT_2)).not.toContain('data-points-mark');
  });
});

describe('l’encre de série se lit sur téléphone (#9221)', () => {
  const appCss = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  const tokens = readFileSync(new URL('../../../../packages/design-tokens/ios.css', import.meta.url), 'utf8');
  const hex = (name: string) => {
    const value = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
    if (value === undefined) throw new Error(`jeton --${name} introuvable`);
    return [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16));
  };
  const luminance = (rgb: readonly number[]) => {
    const [r, g, b] = rgb.map((c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  };
  const block = (selector: string) =>
    appCss.match(new RegExp(`${selector}\\s*\\{[^}]*--streak-ink:\\s*([^;]+);`))?.[1]?.trim();

  test('en sombre, le rouge iOS ; en clair, un rouge profond à ≥ 4,5:1 sur blanc', () => {
    expect(block(':root,\\s*:root\\.dark')).toBe('var(--ios-error)');
    const light = block(':root\\.light');
    const mix = light?.match(/color-mix\(in srgb, var\(--([\w-]+)\) (\d+)%, var\(--([\w-]+)\)\)/);
    expect(mix).toBeTruthy();
    const [, first, share, second] = mix ?? [];
    const weight = Number(share) / 100;
    const a = hex(first ?? '');
    const b = hex(second ?? '');
    const ink = a.map((c, i) => Math.round(c * weight + (b[i] ?? 0) * (1 - weight)));
    expect(1.05 / (luminance(ink) + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(1.05 / (luminance(hex('ios-error')) + 0.05)).toBeLessThan(4.5);
  });
});
