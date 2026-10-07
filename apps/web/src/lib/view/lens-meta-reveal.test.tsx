import { act, Profiler, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';

import { SCROLL_ACTIVITY_LINGER_MS } from '@meeshy/shared/utils/scroll-activity';
import type { ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { LensRow } from '@/components/lens-row';
import { RICH_TEXT_DIRECT } from '@/lib/api/fixtures-rich-text';
import type { ConversationFlags } from '@/lib/api/preferences';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { createDayPillRevealSubscriber, type DayPillRevealListener } from './day-pill-reveal';
import { useLensMetaReveal, type LensMetaTimers } from './lens-meta-reveal';

/**
 * #9570 — DANS LA LISTE, L'HEURE ET LES POINTS NE PARAISSENT QU'AU DÉFILEMENT.
 *
 * Au repos, la rangée ne montre que le nom, l'aperçu et le badge de non-lus.
 * Pendant que l'utilisateur fait défiler la liste — et une fenêtre après, la
 * MÊME que la pilule de jour d'une conversation — l'heure et les points
 * paraissent. Une fois à l'ouverture de la liste, brièvement. Le tout par UN
 * attribut posé sur le défileur, hors React : aucune rangée ne se re-rend à
 * la cadence du défilement. Ce qui s'efface est VISUEL : le lecteur d'écran
 * lit toujours l'heure et les points.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

type Clock = LensMetaTimers & { readonly now: () => number; readonly advance: (ms: number) => void };

const fakeClock = (): Clock => {
  const timers = new Map<number, { readonly at: number; readonly run: () => void }>();
  const cursor = { at: 0, nextId: 1 };
  return {
    now: () => cursor.at,
    advance: (ms) => {
      cursor.at += ms;
      [...timers.entries()]
        .filter(([, timer]) => timer.at <= cursor.at)
        .forEach(([id, timer]) => {
          timers.delete(id);
          timer.run();
        });
    },
    setTimer: (run, ms) => {
      const id = cursor.nextId;
      cursor.nextId += 1;
      timers.set(id, { at: cursor.at + ms, run });
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id);
    },
  };
};

const FLAGS: ConversationFlags = { isPinned: false, isMuted: false, isArchived: false };
const ENGAGEMENT: ConversationEngagementSnapshot = {
  conversationId: RICH_TEXT_DIRECT.id,
  totalPoints: 120,
  todayPoints: 12,
  streakDays: 4,
  day: '2026-09-30',
};
const NOON_SEPT_30 = new Date(2026, 8, 30, 12).getTime();
const NOW = () => NOON_SEPT_30;
const NO_ACTION = () => {};

const mounted: { root: Root; container: HTMLDivElement }[] = [];

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    act(() => root.unmount());
    container.remove();
  });
});

/**
 * Une rangée RÉELLE dans un défileur qui porte le crochet. Deux comptes : les
 * rendus de l'écran qui monte le crochet, et les validations de la rangée
 * elle-même (`Profiler`, qui n'appelle `onRender` que si son sous-arbre a été
 * rendu).
 */
function mountList(params: { readonly clock: Clock; readonly subscribe?: (listener: DayPillRevealListener) => () => void; readonly ready?: boolean }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const renders = { screen: 0, row: 0 };
  const captured: { listener: DayPillRevealListener | null } = { listener: null };
  const subscribe =
    params.subscribe ??
    ((listener: DayPillRevealListener) => {
      captured.listener = listener;
      return () => {
        captured.listener = null;
      };
    });

  function Screen() {
    renders.screen += 1;
    const frame = useRef<HTMLUListElement | null>(null);
    useLensMetaReveal(frame, { subscribe, ready: params.ready ?? true, timers: params.clock });
    return (
      <ul ref={frame} data-testid="frame">
        <Profiler
          id="row"
          onRender={() => {
            renders.row += 1;
          }}
        >
          <LensRow
            conversation={RICH_TEXT_DIRECT}
            languages={['fr']}
            viewerId="u-viewer"
            flags={FLAGS}
            unreadCount={0}
            onRowAction={NO_ACTION}
            engagement={ENGAGEMENT}
            now={NOW}
          />
        </Profiler>
      </ul>
    );
  }

  act(() => {
    root.render(<Screen />);
  });
  const frame = container.querySelector<HTMLUListElement>('[data-testid="frame"]');
  if (frame === null) throw new Error('défileur absent');
  return { frame, renders, captured };
}

describe('useLensMetaReveal — un attribut sur le défileur, hors React (#9570)', () => {
  test('à l’ouverture : montrés une fois, brièvement, puis effacés — la fenêtre de la pilule de jour', () => {
    const clock = fakeClock();
    const { frame } = mountList({ clock });
    expect(frame.dataset.rowMeta).toBe('revealed');
    act(() => clock.advance(SCROLL_ACTIVITY_LINGER_MS - 1));
    expect(frame.dataset.rowMeta).toBe('revealed');
    act(() => clock.advance(1));
    expect(frame.dataset.rowMeta).toBeUndefined();
  });

  test('tant que la liste n’est pas prête (cache vide, squelette), rien ne s’annonce', () => {
    const clock = fakeClock();
    const { frame } = mountList({ clock, ready: false });
    expect(frame.dataset.rowMeta).toBeUndefined();
  });

  test('le défilement les révèle, l’arrêt les efface — sans re-rendre ni l’écran ni la rangée', () => {
    const clock = fakeClock();
    const { frame, renders, captured } = mountList({ clock });
    act(() => clock.advance(SCROLL_ACTIVITY_LINGER_MS));
    expect(frame.dataset.rowMeta).toBeUndefined();
    const before = { ...renders };
    expect(before.row).toBeGreaterThan(0);

    act(() => captured.listener?.(true));
    expect(frame.dataset.rowMeta).toBe('revealed');
    act(() => captured.listener?.(false));
    expect(frame.dataset.rowMeta).toBeUndefined();

    expect(renders).toEqual(before);
  });

  test('un défilement pendant l’ouverture prolonge la révélation jusqu’à son propre arrêt', () => {
    const clock = fakeClock();
    const { frame, captured } = mountList({ clock });
    act(() => captured.listener?.(true));
    act(() => clock.advance(SCROLL_ACTIVITY_LINGER_MS * 3));
    expect(frame.dataset.rowMeta).toBe('revealed');
    act(() => captured.listener?.(false));
    expect(frame.dataset.rowMeta).toBeUndefined();
  });

  test('de bout en bout avec la loi partagée : molette + défilement, puis effacé une fenêtre après', () => {
    const clock = fakeClock();
    const frame: { current: HTMLUListElement | null } = { current: null };
    const subscribe = createDayPillRevealSubscriber(frame, { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    function Screen() {
      useLensMetaReveal(frame, { subscribe, ready: true, timers: clock });
      return <ul ref={frame} />;
    }
    act(() => root.render(<Screen />));
    const element = frame.current;
    if (element === null) throw new Error('défileur absent');
    act(() => clock.advance(SCROLL_ACTIVITY_LINGER_MS));
    expect(element.dataset.rowMeta).toBeUndefined();

    act(() => {
      element.dispatchEvent(new Event('scroll'));
    });
    expect(element.dataset.rowMeta).toBeUndefined();

    act(() => {
      element.dispatchEvent(new Event('wheel'));
      element.dispatchEvent(new Event('scroll'));
    });
    expect(element.dataset.rowMeta).toBe('revealed');
    act(() => clock.advance(SCROLL_ACTIVITY_LINGER_MS));
    expect(element.dataset.rowMeta).toBeUndefined();
  });

  test('démonté : l’attribut part avec lui', () => {
    const clock = fakeClock();
    const { frame } = mountList({ clock });
    const entry = mounted.pop();
    act(() => entry?.root.unmount());
    entry?.container.remove();
    expect(frame.dataset.rowMeta).toBeUndefined();
  });
});

describe('la rangée — ce qui s’efface est visuel, et rien ne se remet en page (#9570)', () => {
  const html = renderToStaticMarkup(
    <LensRow
      conversation={RICH_TEXT_DIRECT}
      languages={['fr']}
      viewerId="u-viewer"
      flags={FLAGS}
      unreadCount={2}
      onRowAction={NO_ACTION}
      engagement={ENGAGEMENT}
      now={NOW}
    />,
  );
  const meta = html.match(/<span[^>]*class="lens-row-meta[^"]*"[^>]*>[\s\S]*?<\/time><\/span><\/span>/)?.[0];

  test('l’heure et la marque de points vivent dans UNE feuille qui s’efface, l’une après l’autre', () => {
    expect(meta).toBeDefined();
    expect(meta).toContain('data-streak-mark');
    expect(meta).toContain('data-time');
    expect((meta ?? '').indexOf('data-streak-mark')).toBeLessThan((meta ?? '').indexOf('data-time'));
  });

  test('le nom, l’aperçu et le badge de non-lus n’y sont pas : ils restent au repos', () => {
    expect(meta).not.toContain('data-name');
    expect(meta).not.toContain('data-line2');
    expect(meta).not.toContain('data-unread');
  });

  test('le lecteur d’écran lit toujours l’heure et les points : rien n’est retiré de l’arbre', () => {
    const opening = meta?.match(/^<span[^>]*>/)?.[0] ?? '';
    expect(opening).not.toContain('aria-hidden');
    expect(meta).toContain('<span class="sr-only">Série de 4 jours, 120 points dont 12 aujourd’hui</span>');
    expect(meta).toMatch(/<time[^>]*data-time[^>]*>[^<]+<\/time>/);
  });
});

describe('la feuille de style — au repos invisible, révélée par l’attribut, le survol ou le focus (#9570)', () => {
  const css = readFileSync(new URL('../../styles/lens-row-meta.css', import.meta.url), 'utf8');
  const rule = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.match(new RegExp(`(?:^|\\n|,)\\s*${escaped}\\s*[,{][^}]*\\}`))?.[0] ?? '';
  };

  test('au repos : opacité nulle, en fondu — seule l’opacité bouge, la place reste réservée', () => {
    const rest = css.match(/\.lens-row-meta\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rest).toMatch(/opacity:\s*0\s*;/);
    expect(rest).toMatch(/transition:\s*opacity\s/);
    expect(css).not.toMatch(/\.lens-row-meta[^{]*\{[^}]*(display|visibility|width|height|margin|padding)\s*:/);
  });

  test('révélée par l’attribut du défileur', () => {
    expect(rule("[data-row-meta='revealed'] .lens-row-meta")).toMatch(/opacity:\s*1/);
  });

  test('le focus clavier d’une rangée révèle les siens ; le survol aussi, sur un appareil qui survole', () => {
    expect(rule('[data-row]:focus-within .lens-row-meta')).toMatch(/opacity:\s*1/);
    expect(css).toMatch(/@media \(hover: hover\)\s*\{\s*\[data-row\]:hover \.lens-row-meta\s*\{\s*opacity:\s*1;/);
  });

  test('animations réduites : même visibilité, sans fondu', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.lens-row-meta\s*\{\s*transition:\s*none;/);
  });

  test('la feuille est chargée avec la rangée', () => {
    const row = readFileSync(new URL('../../components/lens-row.tsx', import.meta.url), 'utf8');
    expect(row).toContain("import '@/styles/lens-row-meta.css';");
  });
});
