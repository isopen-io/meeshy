import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { messagesOf } from '@/lib/api/fixtures';
import { MEDIA_CONVERSATION_ID } from '@/lib/api/fixtures-media';
import { RENDER_MATRIX_CONVERSATION_ID } from '@/lib/api/fixtures-render-matrix';
import type { Message } from '@/lib/api/types';
import { AVATAR_INSET, AVATAR_SIZE, CONTENT_PULL, QUOTE_INDENT, TEXT_INDENT } from '@/lib/reading-mode/metrics';

import { FocalRow } from './focal-row';

/**
 * L'ALIGNEMENT DE LA RANGÉE PLATE (#7929, jumelle iOS #7928) — règle porteur
 * du 2026-09-25, en Script et en Focal : le CONTENU PROPRE d'un message part
 * SOUS l'avatar, sur son bord gauche ; SEULES les citations sont décalées, d'un
 * retrait et d'un filet identiques pour tous les types.
 *
 * Témoin de STRUCTURE, pas de pixels : happy-dom ne met rien en page. La mesure
 * de l'origine x au navigateur est la recette Playwright du lot ; ce témoin
 * tient les deux cotes qu'elle vérifie et le fait que chaque citation, et elle
 * seule, porte le retrait commun.
 */

const CITATION_SELECTOR = '[data-story-citation], [data-mood-citation], button[aria-label^="Aller au message"]';

const renderRow = (message: Message, mode: 'script' | 'focal'): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <FocalRow
      mode={mode}
      place={{ message, head: true, tail: true, opensDay: null }}
      languages={['fr', 'en']}
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
    />,
  );
  return host;
};

const inlineStart = (el: Element | null): string =>
  (el as HTMLElement | null)?.style.getPropertyValue('margin-inline-start') ?? '';

const CORPUS: readonly Message[] = [
  ...messagesOf('c-states'),
  ...messagesOf(MEDIA_CONVERSATION_ID),
  ...messagesOf(RENDER_MATRIX_CONVERSATION_ID),
];

describe('FocalRow — le contenu sous l’avatar, les citations en retrait (#7929)', () => {
  beforeAll(() => {
    ensureHappyDomRegistered();
  });
  afterAll(async () => {
    await releaseHappyDomIfRegistered();
  });

  test('les cotes : le contenu remonte de la colonne du nom au bord gauche de la pastille, la citation y retourne', () => {
    const avatarLeftInColumn = (TEXT_INDENT - AVATAR_SIZE) / 2;
    expect(TEXT_INDENT - CONTENT_PULL).toBe(avatarLeftInColumn);
    expect(QUOTE_INDENT).toBe(CONTENT_PULL);
  });

  test('le corpus porte bien chaque type de citation (story, story disparue, humeur, message, pièce)', () => {
    const kinds = new Set<string>();
    for (const message of CORPUS) {
      const host = renderRow(message, 'script');
      if (host.querySelector('[data-story-citation] [data-story-scene]')) kinds.add('story');
      if (host.querySelector('[data-story-unavailable]')) kinds.add('story-gone');
      if (host.querySelector('[data-mood-citation]')) kinds.add('mood');
      if (host.querySelector('button[aria-label^="Aller au message"]:not([data-quote-media])')) kinds.add('message');
      if (host.querySelector('button[data-quote-media="image"]')) kinds.add('image');
      if (host.querySelector('button[data-quote-media="audio"]')) kinds.add('audio');
      if (host.querySelector('button[data-quote-media="video"]')) kinds.add('video');
    }
    expect([...kinds].sort()).toEqual(['audio', 'image', 'message', 'mood', 'story', 'story-gone', 'video']);
  });

  test('en mode SÉLECTION, la coche occupe la place de l’avatar : le contenu reste dans la colonne du nom, sans retrait de citation', () => {
    const reply = CORPUS.find((m) => m.replyTo !== undefined && m.replyTo !== null);
    expect(reply).toBeDefined();
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      <FocalRow
        mode="script"
        place={{ message: reply!, head: false, tail: true, opensDay: null }}
        languages={['fr', 'en']}
        viewerId="u-viewer"
        ephemeralDeadline={{ state: 'none' }}
        onJumpToMessage={() => {}}
        onPickLanguage={() => {}}
        selected={false}
        onToggleSelect={() => {}}
      />,
    );
    expect(host.querySelector('[role="checkbox"]')).not.toBeNull();
    for (const content of host.querySelectorAll('[data-row-content]')) expect(inlineStart(content)).toBe('');
    expect(inlineStart(host.querySelector('[data-quote-indent]'))).toBe('');
  });

  for (const mode of ['script', 'focal'] as const) {
    test(`${mode} : chaque rangée ordinaire porte son contenu à l’origine de l’avatar`, () => {
      const rows = CORPUS.map((message) => ({ message, host: renderRow(message, mode) })).filter(
        ({ host }) => host.querySelector('[data-identity]') !== null,
      );
      expect(rows.length).toBeGreaterThan(20);
      for (const { message, host } of rows) {
        const content = host.querySelector('[data-row-content]');
        expect({ id: message.id, pull: inlineStart(content) }).toEqual({ id: message.id, pull: `-${CONTENT_PULL}px` });
        expect(content?.querySelector('[data-identity]')).toBeNull();
      }
    });

    test(`${mode} : la bande de tête (transféré, épinglé, protection) part du bord de la pastille, AU-DESSUS d’elle`, () => {
      const forwarded = CORPUS.filter((m) => renderRow(m, mode).textContent?.includes('Transféré'));
      expect(forwarded.length).toBeGreaterThan(0);
      for (const message of forwarded) {
        const band = renderRow(message, mode).querySelector<HTMLElement>('[data-row-band]');
        expect(band?.style.gridColumn).toBe('1 / -1');
        expect(band?.style.paddingInlineStart).toBe(`${AVATAR_INSET}px`);
        expect(band?.textContent).toContain('Transféré');
        expect(band?.querySelector('[data-identity]')).toBeNull();
      }
    });

    test(`${mode} : la ligne basse commence à l’origine — aucune bande de drapeaux VIDE ne décale les réactions`, () => {
      const withReactions = CORPUS.filter((m) => Object.keys(m.reactionSummary ?? {}).length > 0);
      expect(withReactions.length).toBeGreaterThan(0);
      for (const message of withReactions) {
        const host = renderRow(message, mode);
        const empties = [...host.querySelectorAll('[data-row-content] .pt-1 > *')].filter((el) => el.childElementCount === 0 && el.textContent === '');
        expect({ id: message.id, empties: empties.length }).toEqual({ id: message.id, empties: 0 });
      }
    });

    test(`${mode} : chaque citation, et elle seule, porte le retrait commun et son filet`, () => {
      let citations = 0;
      for (const message of CORPUS) {
        const host = renderRow(message, mode);
        for (const citation of host.querySelectorAll(CITATION_SELECTOR)) {
          citations += 1;
          const indent = citation.closest('[data-quote-indent]');
          expect({ id: message.id, indent: inlineStart(indent) }).toEqual({ id: message.id, indent: `${QUOTE_INDENT}px` });
          expect(indent?.querySelector('[data-quote-rail]')).not.toBeNull();
        }
        for (const indent of host.querySelectorAll('[data-quote-indent]')) {
          expect(indent.querySelectorAll(CITATION_SELECTOR).length).toBe(1);
          expect(indent.querySelector('time, img[data-attachment-id], audio, video')).toBeNull();
        }
      }
      expect(citations).toBeGreaterThanOrEqual(9);
    });
  }
});
