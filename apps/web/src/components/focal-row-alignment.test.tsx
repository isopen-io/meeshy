import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { messagesOf } from '@/lib/api/fixtures';
import { MEDIA_CONVERSATION_ID } from '@/lib/api/fixtures-media';
import { RENDER_MATRIX_CONVERSATION_ID } from '@/lib/api/fixtures-render-matrix';
import type { Message } from '@/lib/api/types';
import * as metrics from '@/lib/reading-mode/metrics';
import { AVATAR_INSET } from '@/lib/reading-mode/metrics';

import { FocalRow } from './focal-row';

/**
 * L'ALIGNEMENT DE LA RANGÉE PLATE (#7995, directive porteur du 2026-09-26,
 * jumelle iOS dans le même lot) — en Script et en Focal, l'avatar occupe SEUL
 * sa marge gauche ; « auteur · heure », le CONTENU PROPRE (texte, médias,
 * réactions, méta, pastilles) ET toutes les citations (message, story, humeur,
 * pièce unique) partent de la MÊME origine : la colonne du nom. Une citation
 * se distingue par sa barre et son fond teinté, jamais par un retrait.
 *
 * Supplante la règle du 2026-09-25 (#7929 / #7928 : « le contenu sous
 * l'avatar, seules les citations décalées »), dont ce témoin gardait
 * l'inverse.
 *
 * Témoin de STRUCTURE, pas de pixels : happy-dom ne met rien en page. Il tient
 * que l'identité, le contenu et chaque citation vivent dans la MÊME colonne de
 * grille, sans aucune marge qui les en déplace, et que l'avatar vit seul dans
 * la sienne. La mesure de l'origine x au navigateur est la recette du lot.
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

/** La colonne de grille (enfant direct de la rangée) qui porte `el`. */
const gridColumnOf = (host: HTMLElement, el: Element | null): Element | null => {
  const row = host.querySelector('[data-message]');
  let node = el;
  while (node && node.parentElement !== row) node = node.parentElement;
  return node;
};

const CORPUS: readonly Message[] = [
  ...messagesOf('c-states'),
  ...messagesOf(MEDIA_CONVERSATION_ID),
  ...messagesOf(RENDER_MATRIX_CONVERSATION_ID),
];

describe('FocalRow — avatar seul dans sa marge, contenu et citations sur la colonne du nom (#7995)', () => {
  beforeAll(() => {
    ensureHappyDomRegistered();
  });
  afterAll(async () => {
    await releaseHappyDomIfRegistered();
  });

  test('aucune cote ne décale plus le contenu ni les citations : la seule origine est la colonne du nom', () => {
    expect('CONTENT_PULL' in metrics).toBe(false);
    expect('QUOTE_INDENT' in metrics).toBe(false);
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

  test('en mode SÉLECTION, la coche occupe la marge de l’avatar : contenu et citation restent sur la colonne du nom', () => {
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
    const checkbox = host.querySelector('[role="checkbox"]');
    expect(checkbox).not.toBeNull();
    const content = host.querySelector('[data-row-content]');
    expect(inlineStart(content)).toBe('');
    expect(inlineStart(host.querySelector('[data-row-quote]'))).toBe('');
    expect(gridColumnOf(host, checkbox)).not.toBe(gridColumnOf(host, content));
  });

  for (const mode of ['script', 'focal'] as const) {
    test(`${mode} : l’identité et le contenu partagent la colonne du nom, l’avatar est seul dans la sienne`, () => {
      const rows = CORPUS.map((message) => ({ message, host: renderRow(message, mode) })).filter(
        ({ host }) => host.querySelector('[data-identity]') !== null,
      );
      expect(rows.length).toBeGreaterThan(20);
      for (const { message, host } of rows) {
        const content = host.querySelector('[data-row-content]');
        const identity = host.querySelector('[data-identity]');
        const nameColumn = gridColumnOf(host, identity);
        expect({ id: message.id, pull: inlineStart(content) }).toEqual({ id: message.id, pull: '' });
        expect({ id: message.id, sameColumn: gridColumnOf(host, content) === nameColumn }).toEqual({ id: message.id, sameColumn: true });
        expect(content?.querySelector('[data-identity]')).toBeNull();
        const avatarColumn = nameColumn?.previousElementSibling ?? null;
        expect(avatarColumn?.querySelector('[data-row-content], [data-identity], [data-row-quote]') ?? null).toBeNull();
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

    test(`${mode} : chaque citation part de l’origine du contenu, sans retrait, distinguée par son filet`, () => {
      let citations = 0;
      for (const message of CORPUS) {
        const host = renderRow(message, mode);
        for (const citation of host.querySelectorAll(CITATION_SELECTOR)) {
          citations += 1;
          const frame = citation.closest('[data-row-quote]');
          expect({ id: message.id, framed: frame !== null, indent: inlineStart(frame) }).toEqual({ id: message.id, framed: true, indent: '' });
          expect(frame?.closest('[data-row-content]')).not.toBeNull();
          expect(frame?.querySelector('[data-quote-rail]')).not.toBeNull();
        }
        for (const frame of host.querySelectorAll('[data-row-quote]')) {
          expect(frame.querySelectorAll(CITATION_SELECTOR).length).toBe(1);
          expect(frame.querySelector('time, img[data-attachment-id], audio, video')).toBeNull();
        }
      }
      expect(citations).toBeGreaterThanOrEqual(9);
    });
  }
});
