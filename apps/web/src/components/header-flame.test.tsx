import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { RICH_TEXT_DIRECT } from '@/lib/api/fixtures-rich-text';
import type { Conversation } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadNotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';
import type { StorageLike } from '@/lib/reading-mode/store';
import { compactCount } from '@/lib/view/compact-count';
import { localDayOf } from '@/lib/view/engagement-pill';
import {
  afterFlameDismissed,
  afterHeaderToggle,
  createHeaderMemory,
  headerFlameShown,
  type HeaderMemory,
} from '@/lib/view/header-memory';
import type { ActiveMember } from '@/lib/view/top-active-members';
import { useHeaderMemory } from '@/lib/view/use-header-memory';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { HeaderFlame } from './header-flame';
import { ThreadHeader } from './thread-header';

/**
 * **LA FLAMME DU JOUR SOUS L'AVATAR, ET CE QUE L'EN-TÊTE RETIENT** (#9031) —
 * demande porteur du 2026-10-01 : une flamme sous l'avatar de l'en-tête
 * replié, avec les points du jour ; une lueur et un tour à chaque message
 * envoyé ; le toucher la masque, elle revient après un dépliement ; l'état
 * déplié et le masquage sont retenus par conversation. Et dans l'aperçu tiré
 * d'une notification : la pile des plus actifs, avec leur point.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/c' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadInterfaceCatalog('fr'), loadNotificationRowCatalog('fr')]);
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const snapshot = (overrides: Partial<ConversationEngagementSnapshot> = {}): ConversationEngagementSnapshot => ({
  conversationId: RICH_TEXT_DIRECT.id,
  totalPoints: 120,
  todayPoints: 12,
  streakDays: 4,
  day: localDayOf(Date.now()),
  ...overrides,
});

const fakeStorage = (): StorageLike & { readonly entries: Map<string, string> } => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
  };
};

describe('la loi de la flamme', () => {
  test('elle vit sous l’avatar REPLIÉ, hors aperçu, tant qu’il y a des points et qu’on ne l’a pas touchée', () => {
    const base = { expanded: false, preview: false, dismissed: false, hasEngagement: true };
    expect(headerFlameShown(base)).toBe(true);
    expect(headerFlameShown({ ...base, expanded: true })).toBe(false);
    expect(headerFlameShown({ ...base, preview: true })).toBe(false);
    expect(headerFlameShown({ ...base, dismissed: true })).toBe(false);
    expect(headerFlameShown({ ...base, hasEngagement: false })).toBe(false);
  });

  test('déplier ramène la flamme touchée ; replier la laisse où elle est', () => {
    const dismissed = afterFlameDismissed({ expanded: false, flameDismissed: false });
    expect(dismissed).toEqual({ expanded: false, flameDismissed: true });
    expect(afterHeaderToggle(dismissed, true)).toEqual({ expanded: true, flameDismissed: false });
    expect(afterHeaderToggle(dismissed, false)).toEqual({ expanded: false, flameDismissed: true });
  });
});

describe('la mémoire de l’en-tête, par lecteur et par conversation', () => {
  test('elle relit ce qu’elle a écrit, sans mélanger les conversations ni les comptes', () => {
    const storage = fakeStorage();
    createHeaderMemory(storage).write('u1', 'c1', { expanded: true, flameDismissed: true });
    const reopened = createHeaderMemory(storage);
    expect(reopened.read('u1', 'c1')).toEqual({ expanded: true, flameDismissed: true });
    expect(reopened.read('u1', 'c2')).toEqual({ expanded: false, flameDismissed: false });
    expect(reopened.read('u2', 'c1')).toEqual({ expanded: false, flameDismissed: false });
  });

  test('revenir à l’état neutre efface la clé', () => {
    const storage = fakeStorage();
    const memory = createHeaderMemory(storage);
    memory.write('u1', 'c1', { expanded: true, flameDismissed: false });
    memory.write('u1', 'c1', { expanded: false, flameDismissed: false });
    expect(storage.entries.size).toBe(0);
  });

  test('un stockage qui lance ou une valeur corrompue ne casse rien : la session garde la valeur', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('quota');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('quota');
      },
    };
    const memory = createHeaderMemory(throwing);
    expect(memory.read('u1', 'c1')).toEqual({ expanded: false, flameDismissed: false });
    memory.write('u1', 'c1', { expanded: true, flameDismissed: false });
    expect(memory.read('u1', 'c1')).toEqual({ expanded: true, flameDismissed: false });

    const corrupt = fakeStorage();
    corrupt.entries.set('meeshy.conversation-header.u1.c1', '{pas du json');
    expect(createHeaderMemory(corrupt).read('u1', 'c1')).toEqual({ expanded: false, flameDismissed: false });
  });
});

function HeaderMemoryProbe({ memory, preview = false }: { readonly memory: HeaderMemory; readonly preview?: boolean }) {
  const header = useHeaderMemory({ scope: 'u1', conversationId: 'c1', preview, memory });
  return (
    <div data-expanded={String(header.expanded)} data-dismissed={String(header.flameDismissed)}>
      <button type="button" data-toggle onClick={header.toggleExpanded} />
      <button type="button" data-dismiss onClick={header.dismissFlame} />
    </div>
  );
}

describe('useHeaderMemory — le geste du lecteur est retenu', () => {
  test('l’en-tête déplié et la flamme masquée survivent à la réouverture', async () => {
    const memory = createHeaderMemory(fakeStorage());
    const host = await mounter.mount(<HeaderMemoryProbe memory={memory} />);
    await mounter.click(host.querySelector<HTMLElement>('[data-dismiss]'));
    expect(memory.read('u1', 'c1')).toEqual({ expanded: false, flameDismissed: true });

    await mounter.click(host.querySelector<HTMLElement>('[data-toggle]'));
    expect(memory.read('u1', 'c1')).toEqual({ expanded: true, flameDismissed: false });

    const reopened = await mounter.mount(<HeaderMemoryProbe memory={memory} />);
    expect(reopened.firstElementChild?.getAttribute('data-expanded')).toBe('true');
  });

  test('l’aperçu ne lit ni n’écrit rien', async () => {
    const memory = createHeaderMemory(fakeStorage());
    memory.write('u1', 'c1', { expanded: true, flameDismissed: true });
    const host = await mounter.mount(<HeaderMemoryProbe memory={memory} preview />);
    expect(host.firstElementChild?.getAttribute('data-expanded')).toBe('false');
    await mounter.click(host.querySelector<HTMLElement>('[data-toggle]'));
    expect(memory.read('u1', 'c1')).toEqual({ expanded: true, flameDismissed: true });
  });
});

describe('HeaderFlame — « 🔥 M » et son effet', () => {
  test('elle dit les points du jour, en mots pour le lecteur d’écran', () => {
    const html = renderToStaticMarkup(<HeaderFlame snapshot={snapshot()} replay={0} onDismiss={() => undefined} />);
    expect(html).toContain('data-header-flame="12"');
    expect(html).toContain('aria-label="12 points aujourd’hui — toucher pour masquer la flamme"');
  });

  test('un snapshot d’hier se relit au jour du lecteur : 0 aujourd’hui', () => {
    const html = renderToStaticMarkup(
      <HeaderFlame snapshot={snapshot({ day: localDayOf(Date.now() - 86_400_000) })} replay={0} onDismiss={() => undefined} />,
    );
    expect(html).toContain('data-header-flame="0"');
  });

  test('rien quand la conversation n’a rapporté aucun point', () => {
    expect(renderToStaticMarkup(<HeaderFlame snapshot={snapshot({ totalPoints: 0, todayPoints: 0 })} replay={0} onDismiss={() => undefined} />)).toBe('');
    expect(renderToStaticMarkup(<HeaderFlame snapshot={undefined} replay={0} onDismiss={() => undefined} />)).toBe('');
  });

  test('l’effet ne joue pas à l’ouverture, il joue à chaque envoi', () => {
    expect(renderToStaticMarkup(<HeaderFlame snapshot={snapshot()} replay={0} onDismiss={() => undefined} />)).not.toContain('header-flame-playing');
    expect(renderToStaticMarkup(<HeaderFlame snapshot={snapshot()} replay={3} onDismiss={() => undefined} />)).toContain('header-flame-playing');
  });

  test('le toucher la masque', async () => {
    const touched: string[] = [];
    const host = await mounter.mount(<HeaderFlame snapshot={snapshot()} replay={1} onDismiss={() => touched.push('x')} />);
    await mounter.click(host.querySelector<HTMLElement>('[data-header-flame] button'));
    expect(touched).toEqual(['x']);
  });

  test('sans série en cours, aucune flamme ni aucun point (#9044)', () => {
    expect(renderToStaticMarkup(<HeaderFlame snapshot={snapshot({ streakDays: 0 })} replay={0} onDismiss={() => undefined} />)).toBe('');
  });

  test('la flamme sans capsule, des mèches pour brûler, et un compte abrégé (#9044)', () => {
    const html = renderToStaticMarkup(
      <HeaderFlame snapshot={snapshot({ todayPoints: 1_234 })} replay={1} onDismiss={() => undefined} language="fr" />,
    );
    expect(html.match(/data-flame-tongue/g)?.length).toBe(3);
    expect(html).toContain(`>${compactCount(1_234, 'fr')}<`);
    const css = readFileSync(new URL('../styles/header-flame.css', import.meta.url), 'utf8');
    const mark = css.match(/\.header-flame-mark\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(mark).not.toMatch(/background|box-shadow|border-radius/);
  });

  test('le compteur est rouge, cerclé de 1 px blanc, quel que soit le thème (#9044)', () => {
    const css = readFileSync(new URL('../styles/header-flame.css', import.meta.url), 'utf8');
    const digits = css.match(/\.header-flame-count-digits\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(digits).toContain('color: var(--ios-error)');
    expect(digits).toContain('-webkit-text-stroke: 2px #fff');
    expect(digits).toContain('paint-order: stroke fill');
    expect(css).not.toMatch(/:root\.(dark|light)/);
  });

  test('la valeur d’avant l’envoi tient jusqu’à ce que la lueur rejoigne la flamme, puis monte (#9044)', async () => {
    const at = (today: number, replay: number) => (
      <HeaderFlame snapshot={snapshot({ todayPoints: today })} replay={replay} releaseAfterMs={30} onDismiss={() => undefined} />
    );
    const host = await mounter.mount(at(12, 0));
    await mounter.rerender(host, at(12, 1));
    await mounter.rerender(host, at(15, 1));
    expect(host.querySelector('[data-header-flame]')?.getAttribute('data-header-flame')).toBe('12');
    await new Promise((resolve) => setTimeout(resolve, 60));
    await mounter.settle();
    expect(host.querySelector('[data-header-flame]')?.getAttribute('data-header-flame')).toBe('15');
  });

  test('la flamme se pose JUSTE SOUS le cercle, jamais par-dessus, et ne tourne pas (#9044)', () => {
    const css = readFileSync(new URL('../styles/header-flame.css', import.meta.url), 'utf8');
    const seat = css.match(/\.header-flame-seat\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(seat).toMatch(/top:\s*calc\(100% \+ \d+px\)/);
    expect(seat).not.toContain('-50%, -50%');
    expect(css).not.toContain('header-flame-orbit');
  });

  test('l’effet n’anime que transform et opacity, et se calme en mouvement réduit', () => {
    const css = readFileSync(new URL('../styles/header-flame.css', import.meta.url), 'utf8');
    const keyframes = [...css.matchAll(/@keyframes[^{]+\{([\s\S]*?)\n\}/g)].map((match) => match[1] ?? '');
    expect(keyframes.length).toBeGreaterThan(0);
    const animated = keyframes.flatMap((body) => [...body.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]));
    expect(new Set(animated)).toEqual(new Set(['transform', 'opacity']));
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

describe('ThreadHeader — la flamme sous l’avatar replié', () => {
  const conversation = (): Conversation => ({ ...RICH_TEXT_DIRECT, viewerEngagement: snapshot() }) as Conversation;
  const header = (options: { readonly expanded?: boolean; readonly preview?: boolean; readonly dismissed?: boolean } = {}) =>
    renderToStaticMarkup(
      <ThreadHeader
        title="Kwame"
        accent="#4455ff"
        conversation={conversation()}
        viewerId="u-viewer"
        group={false}
        otherUnread={0}
        expanded={options.expanded ?? false}
        onToggleExpanded={() => undefined}
        currentRowTitle=""
        isAuto
        readingMenuRows={[]}
        onSelectReadingMode={() => undefined}
        onResetReadingModeToAuto={() => undefined}
        flameDismissed={options.dismissed ?? false}
        onDismissFlame={() => undefined}
        {...(options.preview === true ? { preview: true } : {})}
      />,
    );

  test('repliée : la flamme du jour est là', () => {
    expect(header()).toContain('data-header-flame="12"');
  });

  test('dépliée, en aperçu, ou touchée : pas de flamme', () => {
    expect(header({ expanded: true })).not.toContain('data-header-flame');
    expect(header({ preview: true })).not.toContain('data-header-flame');
    expect(header({ dismissed: true })).not.toContain('data-header-flame');
  });
});

describe('l’aperçu d’un groupe — les plus actifs, chacun avec son point', () => {
  const MEMBERS: readonly ActiveMember[] = [
    { id: 'u-nour', name: 'Nour Haddad', username: 'nour', avatar: undefined, count: 5 },
    { id: 'u-ali', name: 'Ali Ben', username: 'ali', avatar: undefined, count: 3 },
  ];
  const group = (): Conversation =>
    ({
      ...RICH_TEXT_DIRECT,
      id: 'c-groupe',
      type: 'group',
      memberCount: 3,
      participants: [
        { id: 'p-nour', userId: 'u-nour', displayName: 'Nour Haddad', isOnline: true, lastActiveAt: new Date() },
        { id: 'p-ali', userId: 'u-ali', displayName: 'Ali Ben', isOnline: false },
      ],
    }) as unknown as Conversation;
  const header = (preview: boolean) =>
    renderToStaticMarkup(
      <ThreadHeader
        title="Équipe Lyon"
        accent="#6366f1"
        conversation={group()}
        viewerId="u-viewer"
        group
        activeMembers={MEMBERS}
        otherUnread={0}
        expanded={false}
        onToggleExpanded={() => undefined}
        currentRowTitle=""
        isAuto
        readingMenuRows={[]}
        onSelectReadingMode={() => undefined}
        onResetReadingModeToAuto={() => undefined}
        {...(preview ? { preview: true } : {})}
      />,
    );

  test('en aperçu, la pile est là, et la présence servie colore le point', () => {
    const html = header(true);
    expect(html).toContain('data-active-members');
    expect(html).toContain('data-active-member="u-nour"');
    expect(html).toContain('data-presence="online"');
  });

  test('dans le fil replié, toujours aucune pile', () => {
    expect(header(false)).not.toContain('data-active-members');
  });
});
