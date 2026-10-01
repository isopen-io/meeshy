import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { RICH_TEXT_DIRECT } from '@/lib/api/fixtures-rich-text';
import type { ConversationFlags } from '@/lib/api/preferences';
import type { Conversation } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { engagementPillModel, localDayOf } from '@/lib/view/engagement-pill';

import { EngagementPill } from './engagement-pill';
import { LensRow } from './lens-row';
import { ThreadHeader } from './thread-header';

/**
 * « 🔥 4 · 120 (12) » (#8906) — la pastille d'engagement d'une conversation :
 * ce qu'elle montre, quand elle se tait, ce qu'elle dit à l'oreille, et où
 * elle se pose (en-tête du fil, rangée élue de la liste).
 */

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en'), loadInterfaceCatalog('ar')]);
});

const snapshot = (overrides: Partial<ConversationEngagementSnapshot> = {}): ConversationEngagementSnapshot => ({
  conversationId: RICH_TEXT_DIRECT.id,
  totalPoints: 120,
  todayPoints: 12,
  streakDays: 4,
  day: '2026-09-30',
  ...overrides,
});

/** 2026-09-30 à midi, heure LOCALE — jamais un instant UTC qui changerait de jour selon le fuseau. */
const NOON_SEPT_30 = new Date(2026, 8, 30, 12).getTime();
const NOON_OCT_1 = new Date(2026, 9, 1, 12).getTime();
const NOON_OCT_2 = new Date(2026, 9, 2, 12).getTime();

describe('le modèle de la pastille', () => {
  test('le jour est le jour LOCAL du lecteur', () => {
    expect(localDayOf(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
    expect(localDayOf(new Date(2026, 0, 6, 0, 1).getTime())).toBe('2026-01-06');
  });

  test('« N (M) » et la série, avec la phrase entière pour le lecteur d’écran', () => {
    expect(engagementPillModel(snapshot(), '2026-09-30', 'fr')).toEqual({
      streakDays: 4,
      points: '120 (12)',
      label: 'Série de 4 jours, 120 points dont 12 aujourd’hui',
    });
  });

  test('le singulier se dit au singulier', () => {
    expect(engagementPillModel(snapshot({ totalPoints: 1, todayPoints: 1, streakDays: 1 }), '2026-09-30', 'fr')?.label).toBe(
      'Série de 1 jour, 1 point dont 1 aujourd’hui',
    );
  });

  test('sans série, la phrase ne parle que des points', () => {
    expect(engagementPillModel(snapshot({ streakDays: 0 }), '2026-09-30', 'fr')?.label).toBe('120 points dont 12 aujourd’hui');
  });

  test('la phrase suit la langue d’interface', () => {
    expect(engagementPillModel(snapshot(), '2026-09-30', 'en')?.label).toBe('4-day streak, 120 points, 12 today');
    expect(engagementPillModel(snapshot(), '2026-09-30', 'ar')?.label).toBe('سلسلة 4 أيام، 120 نقاط، منها 12 اليوم');
  });

  test('aucun instantané, ou zéro point depuis toujours ⇒ rien', () => {
    expect(engagementPillModel(undefined, '2026-09-30', 'fr')).toBeNull();
    expect(engagementPillModel(snapshot({ totalPoints: 0, todayPoints: 0, streakDays: 0, day: null }), '2026-09-30', 'fr')).toBeNull();
  });

  test('passé minuit : M retombe à 0, la série tient encore un jour', () => {
    expect(engagementPillModel(snapshot(), '2026-10-01', 'fr')).toMatchObject({ points: '120 (0)', streakDays: 4 });
  });

  test('un jour manqué : la série tombe, le total reste', () => {
    expect(engagementPillModel(snapshot(), '2026-10-02', 'fr')).toMatchObject({ points: '120 (0)', streakDays: 0 });
  });
});

describe('le rendu de la pastille', () => {
  test('la flamme et la série quand elle court ; le texte visible est muet, la phrase est lue', () => {
    const html = renderToStaticMarkup(<EngagementPill snapshot={snapshot()} language="fr" now={() => NOON_SEPT_30} />);
    expect(html).toContain('data-engagement-streak');
    expect(html).toContain('>4<');
    expect(html).toContain('120 (12)');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<span class="sr-only">Série de 4 jours, 120 points dont 12 aujourd’hui</span>');
  });

  test('sans série, ni flamme ni chiffre de série', () => {
    const html = renderToStaticMarkup(<EngagementPill snapshot={snapshot({ streakDays: 0 })} language="fr" now={() => NOON_SEPT_30} />);
    expect(html).not.toContain('data-engagement-streak');
    expect(html).toContain('120 (12)');
  });

  test('rien à montrer ⇒ aucun nœud', () => {
    expect(renderToStaticMarkup(<EngagementPill snapshot={undefined} language="fr" now={() => NOON_SEPT_30} />)).toBe('');
    expect(
      renderToStaticMarkup(<EngagementPill snapshot={snapshot({ totalPoints: 0, todayPoints: 0 })} language="fr" now={() => NOON_SEPT_30} />),
    ).toBe('');
  });

  test('un instantané d’hier affiche 0 aujourd’hui', () => {
    expect(renderToStaticMarkup(<EngagementPill snapshot={snapshot()} language="fr" now={() => NOON_OCT_1} />)).toContain('120 (0)');
    expect(renderToStaticMarkup(<EngagementPill snapshot={snapshot()} language="fr" now={() => NOON_OCT_2} />)).not.toContain(
      'data-engagement-streak',
    );
  });

  test('dans l’en-tête, elle mène à la Progression', () => {
    const html = renderToStaticMarkup(<EngagementPill snapshot={snapshot()} opensProgression language="fr" now={() => NOON_SEPT_30} />);
    expect(html).toContain('href="/me/progression"');
  });
});

const FLAGS: ConversationFlags = { isPinned: false, isMuted: false, isArchived: false };
const LANGUAGES: readonly string[] = ['fr'];

describe('la rangée ÉLUE de la liste porte la pastille', () => {
  const row = (magnified: boolean, engagement: ConversationEngagementSnapshot | undefined) =>
    renderToStaticMarkup(
      <LensRow
        conversation={RICH_TEXT_DIRECT}
        languages={LANGUAGES}
        viewerId="u-viewer"
        flags={FLAGS}
        unreadCount={0}
        onRowAction={() => {}}
        status={{ magnified, alpha: 1, scale: 1, breathing: 0 }}
        engagement={engagement}
        now={() => NOON_SEPT_30}
      />,
    );

  test('élue : la pastille est dans le supplément, sans lien propre (la rangée en est déjà un)', () => {
    const html = row(true, snapshot());
    expect(html).toContain('data-engagement-pill');
    expect(html).toContain('120 (12)');
    expect(html).not.toContain('href="/me/progression"');
  });

  test('au repos : aucune pastille', () => {
    expect(row(false, snapshot())).not.toContain('data-engagement-pill');
  });

  test('élue sans point : aucune pastille', () => {
    expect(row(true, undefined)).not.toContain('data-engagement-pill');
  });
});

describe('l’en-tête du fil porte la pastille', () => {
  const header = (conversation: Conversation, expanded: boolean) =>
    renderToStaticMarkup(
      <ThreadHeader
        title="Amina Diallo"
        accent="#4455ff"
        conversation={conversation}
        viewerId="u-viewer"
        group={false}
        otherUnread={0}
        expanded={expanded}
        onToggleExpanded={() => {}}
        currentRowTitle=""
        isAuto
        readingMenuRows={[]}
        onSelectReadingMode={() => {}}
        onResetReadingModeToAuto={() => {}}
      />,
    );
  const withPoints: Conversation = Object.assign({}, RICH_TEXT_DIRECT, {
    viewerEngagement: snapshot({ day: localDayOf(Date.now()) }),
  });

  test('replié comme déplié, UNE pastille, qui mène à la Progression', () => {
    for (const expanded of [false, true]) {
      const html = header(withPoints, expanded);
      expect(html.match(/data-engagement-pill/g)?.length).toBe(1);
      expect(html).toContain('href="/me/progression"');
      expect(html).toContain('120 (12)');
    }
  });

  test('sans point servi : aucune pastille', () => {
    expect(header(RICH_TEXT_DIRECT, false)).not.toContain('data-engagement-pill');
  });
});
