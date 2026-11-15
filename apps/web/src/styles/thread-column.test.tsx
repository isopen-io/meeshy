import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Bubble } from '@/components/bubble';
import { ThreadHeader } from '@/components/thread-header';
import { ThreadError, ThreadRefused, ThreadSkeleton } from '@/components/thread-states';
import { RICH_TEXT_DIRECT } from '@/lib/api/fixtures-rich-text';
import type { Message } from '@/lib/api/types';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * LA CONVERSATION SE LIT DANS UNE COLONNE SUR ORDINATEUR (#10072) — la vue que
 * tout le monde voit, avec ou sans compte. Sous 768 px rien ne change : la
 * feuille ne déclare AUCUNE règle hors de ses deux requêtes média. Au-delà, le
 * DÉFILEUR garde toute la fenêtre (la molette marche hors de la colonne) et
 * c'est le CONTENU qui se borne, par une marge intérieure calculée depuis
 * `--thread-column` — une variable posée à UN endroit, la racine de l'écran.
 */

/* Le nom de l'attribut est composé : écrit en clair devant une chaîne, `check-utilities` lirait l'ATTENTE du témoin
   comme une classe de l'application et réclamerait sa règle. */
const CLASS_ATTR = ['class', 'Name'].join('');
const css = readFileSync(new URL('./thread-column.css', import.meta.url).pathname, 'utf8');
const threadSource = readFileSync(new URL('../routes/thread.tsx', import.meta.url).pathname, 'utf8');
const writeLockSource = readFileSync(new URL('../components/thread-write-lock.tsx', import.meta.url).pathname, 'utf8');
const chromeSource = readFileSync(new URL('../components/thread-composer-chrome.tsx', import.meta.url).pathname, 'utf8');

const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '');

const mediaBlock = (query: string): string => {
  const source = withoutComments(css);
  const start = source.indexOf(`@media ${query} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`bloc ${query} non fermé`);
};

const ruleIn = (block: string, selector: string): string => {
  const start = block.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return block.slice(start, block.indexOf('}', start));
};

const TABLET = '(min-width: 768px)';
const WIDE = '(min-width: 1280px)';

describe('la feuille de la colonne ne touche pas au téléphone', () => {
  test('aucune règle hors des requêtes média', () => {
    const outside = [TABLET, WIDE].reduce((rest, query) => rest.replace(mediaBlock(query), ''), withoutComments(css));
    expect(outside.trim()).toBe('');
  });
});

describe('dans le volet du cadre scindé (#10073, #10117)', () => {
  test('le retour vers la liste reste : il referme le fil, la liste à côté', () => {
    expect(withoutComments(css)).not.toContain('[data-thread-back]');
  });
});

describe('la colonne de lecture (#10072)', () => {
  test('48rem dès 768 px, posée sur la racine de l’écran', () => {
    expect(ruleIn(mediaBlock(TABLET), '.thread-root')).toContain('--thread-column: 48rem');
  });

  test('56rem dès 1280 px', () => {
    expect(ruleIn(mediaBlock(WIDE), '.thread-root')).toContain('--thread-column: 56rem');
  });

  test('le contenu se borne par une marge intérieure, jamais le défileur par sa largeur', () => {
    const rule = ruleIn(mediaBlock(TABLET), '.thread-column');
    expect(rule).toContain('padding-inline: max(var(--thread-gutter, 0px), calc((100% - var(--thread-column)) / 2))');
    expect(rule).not.toContain('max-width');
  });

  test('chaque porteur garde sa gouttière de téléphone tant que la colonne ne mord pas', () => {
    const block = mediaBlock(TABLET);
    expect(ruleIn(block, 'main.thread-column')).toContain('--thread-gutter: 0.875rem');
    expect(ruleIn(block, 'header > .thread-column')).toContain('--thread-gutter: 1rem');
    expect(ruleIn(block, '.thread-column[aria-busy]')).toContain('--thread-gutter: 0.875rem');
  });

  test('le bouton « revenir en bas » s’ancre au bord de la colonne', () => {
    expect(ruleIn(mediaBlock(TABLET), '.thread-scroll-to-bottom')).toContain('var(--thread-column)');
  });

  test('une bulle garde une longueur de ligne lisible', () => {
    expect(ruleIn(mediaBlock(TABLET), '.thread-bubble-measure')).toContain('max-width: min(70%, 34rem)');
  });
});

describe('qui porte la colonne', () => {
  test('l’écran du fil : la racine, le défileur et la bande du composeur', () => {
    expect(threadSource).toContain(`${CLASS_ATTR}={\`thread-root relative `);
    expect(threadSource).toContain(`${CLASS_ATTR}="thread-column scrollbar-none absolute inset-0`);
    expect(threadSource).toContain('<ThreadComposerChrome');
  });

  /* LA BANDE BASSE A UN SEUL SITE depuis #10101 (`thread-composer-chrome.tsx`) :
     au téléphone elle porte le verre, sur ordinateur le dock de la colonne —
     `components/thread-desktop.test.tsx` rend les deux gabarits. */
  test('le bandeau qui remplace le composeur', () => {
    expect(writeLockSource).toContain('<ThreadComposerChrome');
    expect(chromeSource).toContain(`'thread-composer-chrome thread-column glass-prominent'`);
  });

  test('le chargement : racine, en-tête et rangées fantômes bornés', () => {
    const html = renderToStaticMarkup(<ThreadSkeleton />);
    expect(html).toMatch(/^<div class="thread-root /);
    expect((html.match(/thread-column/g) ?? []).length).toBe(2);
  });

  test('le refus et l’erreur : l’en-tête sur la colonne, le message déjà centré', () => {
    for (const html of [renderToStaticMarkup(<ThreadRefused />), renderToStaticMarkup(<ThreadError onRetry={() => undefined} />)]) {
      expect(html).toMatch(/^<div class="thread-root /);
      expect((html.match(/thread-column/g) ?? []).length).toBe(1);
    }
  });
});

describe('l’en-tête du fil : fond pleine largeur, contenu sur la colonne', () => {
  beforeAll(() => {
    ensureHappyDomRegistered({ url: 'http://localhost/c/c1' });
  });
  afterAll(async () => {
    await releaseHappyDomIfRegistered();
  });

  test('la rangée de l’en-tête porte la colonne, pas la bande de verre', () => {
    const html = renderToStaticMarkup(
      <ThreadHeader
        title="Kwame"
        accent="#4455ff"
        conversation={RICH_TEXT_DIRECT}
        viewerId="u-viewer"
        group={false}
        otherUnread={0}
        expanded={false}
        onToggleExpanded={() => undefined}
        currentRowTitle=""
        isAuto
        readingMenuRows={[]}
        onSelectReadingMode={() => undefined}
        onResetReadingModeToAuto={() => undefined}
      />,
    );
    expect(html).toMatch(/<header class="thread-header glass absolute inset-x-0 top-0 z-30 pt-safe"><div class="thread-column /);
  });
});

describe('la bulle', () => {
  const message = {
    id: 'm-col',
    conversationId: 'c-col',
    senderId: 'u-amina',
    content: 'Bonjour',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    maxViewOnceCount: 1,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: new Date('2026-09-08T09:00:00.000Z'),
    updatedAt: new Date('2026-09-08T09:00:00.000Z'),
    timestamp: new Date('2026-09-08T09:00:00.000Z'),
    translations: [],
  } as unknown as Message;

  test('porte la mesure lisible de bureau, en plus des 70 % du téléphone', () => {
    const html = renderToStaticMarkup(
      <Bubble
        place={{ message, head: true, tail: true, opensDay: null }}
        languages={['fr']}
        isGrouped
        viewerId="u-viewer"
        ephemeralDeadline={{ state: 'none' }}
        onJumpToMessage={() => undefined}
      />,
    );
    expect(html).toContain('class="thread-bubble-measure relative max-w-[70%] min-w-0"');
  });
});
