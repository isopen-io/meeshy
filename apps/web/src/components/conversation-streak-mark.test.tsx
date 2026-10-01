import { beforeAll, describe, expect, test } from 'bun:test';
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

describe('le modèle de la série', () => {
  test('la série et le total des points, avec la phrase entière', () => {
    expect(streakMarkModel(snapshot(), '2026-09-30', 'fr')).toEqual({
      streakDays: 4,
      totalPoints: 120,
      label: 'Série de 4 jours, 120 points dont 12 aujourd’hui',
    });
  });

  test('pas de série en cours ⇒ rien', () => {
    expect(streakMarkModel(snapshot({ streakDays: 0 }), '2026-09-30', 'fr')).toBeNull();
    expect(streakMarkModel(snapshot(), '2026-10-02', 'fr')).toBeNull();
    expect(streakMarkModel(undefined, '2026-09-30', 'fr')).toBeNull();
  });
});

describe('la rangée de liste', () => {
  test('au repos : « 🔥4 · 120 » en rouge, juste avant l’heure, sans chip', () => {
    const html = row(false, snapshot());
    const mark = markOf(html);
    expect(mark).toBeDefined();
    expect(mark).toContain('var(--ios-error)');
    expect(mark).toMatch(/>4<[\s\S]*·[\s\S]*>120</);
    expect(mark).not.toContain('rounded-chip');
    expect(mark).not.toContain('background');
    expect(html.indexOf('data-streak-mark')).toBeLessThan(html.indexOf('data-time'));
    expect(html).toContain('<span class="sr-only">Série de 4 jours, 120 points dont 12 aujourd’hui</span>');
  });

  test('série tombée ou absente : rien à côté de l’heure', () => {
    expect(row(false, snapshot(), NOON_OCT_2)).not.toContain('data-streak-mark');
    expect(row(false, undefined)).not.toContain('data-streak-mark');
  });

  test('en focus : ni la série, ni la pastille', () => {
    const html = row(true, snapshot());
    expect(html).not.toContain('data-streak-mark');
    expect(html).not.toContain('data-engagement-pill');
  });
});
