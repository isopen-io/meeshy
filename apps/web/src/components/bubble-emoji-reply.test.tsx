import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';
import { Bubble } from './bubble';
import { FocalRow } from './focal-row';

/**
 * UN EMOJI SEUL EN RÉPONSE (#10628) — la carte citée en petit, puis l'emoji
 * en grand SANS bulle, aux tailles de l'emoji envoyé seul. iOS :
 * `BubbleStandardLayout+EmojiReply.swift` boîte la SEULE carte citée dans la
 * peau de la bulle et pose l'emoji dessous.
 */

const message = (partial: Partial<Message> = {}): Message => ({
  id: 'm-emoji-reply',
  conversationId: 'c-witness',
  senderId: 'u-amina',
  content: '👍',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  maxViewOnceCount: 1,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 2,
  readCount: 2,
  reactionCount: 0,
  isEncrypted: false,
  createdAt: new Date('2026-10-14T09:00:00.000Z'),
  updatedAt: new Date('2026-10-14T09:00:00.000Z'),
  timestamp: new Date('2026-10-14T09:00:00.000Z'),
  translations: [],
  ...partial,
});

const quoted = message({ id: 'm-quoted', content: 'On se voit demain ?', senderId: 'u-noa' });

const emojiReply = (partial: Partial<Message> = {}): Message => message({ replyTo: quoted, ...partial });

const placed = (m: Message): PlacedMessage => ({ message: m, head: true, tail: true, opensDay: null });

const parse = (html: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
};

const renderBubble = (m: Message) =>
  parse(
    renderToStaticMarkup(
      <Bubble
        place={placed(m)}
        languages={['fr', 'en']}
        isGrouped
        viewerId="u-viewer"
        ephemeralDeadline={{ state: 'none' }}
        onJumpToMessage={() => {}}
      />,
    ),
  );

const renderFocal = (m: Message, mode: 'focal' | 'script' = 'focal') =>
  parse(
    renderToStaticMarkup(
      <FocalRow
        mode={mode}
        place={placed(m)}
        languages={['fr', 'en']}
        viewerId="u-viewer"
        ephemeralDeadline={{ state: 'none' }}
        onJumpToMessage={() => {}}
      />,
    ),
  );

const precedes = (a: Element, b: Element) => (a.compareDocumentPosition(b) & 4) !== 0;

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

describe('Bulles — un emoji seul en réponse (#10628)', () => {
  test('ENVOYÉ : la carte citée est boîtée dans la peau de marque, l’emoji en grand dessous, hors de toute boîte', () => {
    const root = renderBubble(emojiReply({ senderId: 'u-viewer' }));
    const quote = root.querySelector('[data-quote-card]');
    const emoji = root.querySelector('[data-emoji-only]');
    expect(quote).not.toBeNull();
    expect(emoji).not.toBeNull();

    const quoteBox = quote!.closest('.rounded-bubble');
    expect(quoteBox).not.toBeNull();
    expect(quoteBox!.getAttribute('style') ?? '').toContain('var(--color-bubble-mine)');

    expect(emoji!.closest('.rounded-bubble')).toBeNull();
    expect((emoji as HTMLElement).style.fontSize).toBe('68px');
    expect(precedes(quote!, emoji!)).toBe(true);
  });

  test('ENVOYÉ : l’encre de marque de TOUT le contenu de la bulle suit l’accent personnel (#10734)', () => {
    const root = renderBubble(emojiReply({ senderId: 'u-viewer' }));
    const style = root.querySelector('[data-quote-card]')!.closest('.rounded-bubble')!.getAttribute('style') ?? '';
    expect(style).toContain('--color-ios-on-brand:var(--bubble-mine-personal-ink, var(--ios-on-brand))');
    expect(style).toContain('--color-meta-mine:var(--bubble-mine-personal-meta, var(--ios-bubble-meta-mine))');
  });

  test('REÇU : la carte citée est boîtée dans la peau reçue (teinte d’accent), jamais la peau de marque', () => {
    const root = renderBubble(emojiReply());
    const quoteBox = root.querySelector('[data-quote-card]')!.closest('.rounded-bubble');
    expect(quoteBox).not.toBeNull();
    const style = quoteBox!.getAttribute('style') ?? '';
    expect(style).toContain('var(--accent)');
    expect(style).not.toContain('var(--color-bubble-mine)');
    expect(style).toContain('var(--ios-surface)');
    expect(root.querySelector('[data-emoji-only]')!.closest('.rounded-bubble')).toBeNull();
  });

  test('la carte et l’emoji s’EMPILENT : le bloc qui les porte est une colonne, l’heure reste à côté de l’emoji', () => {
    const root = renderBubble(emojiReply({ content: '🎉🎉🎉' }));
    const quoteBox = root.querySelector('[data-quote-card]')!.closest('.rounded-bubble')!;
    const emoji = root.querySelector('[data-emoji-only]')!;
    const column = quoteBox.parentElement!.closest('.flex-col');
    expect(column).not.toBeNull();
    expect(column!.contains(emoji)).toBe(true);
    expect(column!.querySelector('time')).toBeNull();
    expect((emoji as HTMLElement).style.fontSize).toBe('51px');
  });

  test('un STICKER envoyé en réponse suit la même loi : carte boîtée en peau de marque, sticker dessous hors boîte', () => {
    const root = renderBubble(emojiReply({ senderId: 'u-viewer', content: '🔥', metadata: { sticker: { emoji: '🔥' } } }));
    const quote = root.querySelector('[data-quote-card]')!;
    const sticker = root.querySelector('[data-sticker-emoji]')!;
    expect(quote.closest('.rounded-bubble')!.getAttribute('style') ?? '').toContain('var(--color-bubble-mine)');
    expect(sticker.closest('.rounded-bubble')).toBeNull();
    expect(precedes(quote, sticker)).toBe(true);
  });

  test('sans citation, l’emoji seul ne sert toujours aucune boîte', () => {
    const root = renderBubble(message({ content: '🎉🎉🎉🎉' }));
    expect(root.querySelector('.rounded-bubble')).toBeNull();
    expect((root.querySelector('[data-emoji-only]') as HTMLElement).style.fontSize).toBe('34px');
  });
});

describe('Focal / Script — un emoji seul en réponse (#10628)', () => {
  for (const mode of ['focal', 'script'] as const) {
    test(`${mode} : la carte citée puis l’emoji en grand, aucune boîte`, () => {
      const root = renderFocal(emojiReply(), mode);
      const quote = root.querySelector('[data-quote-card]');
      const emoji = root.querySelector('[data-emoji-only]');
      expect(quote).not.toBeNull();
      expect(emoji).not.toBeNull();
      expect(precedes(quote!, emoji!)).toBe(true);
      expect(root.querySelector('.rounded-bubble')).toBeNull();
      expect((emoji as HTMLElement).style.fontSize).toBe('68px');
    });
  }
});
