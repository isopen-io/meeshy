import { expect, test } from 'bun:test';

import type { Message } from './api/types';
import { continues, dayLabel, place } from './grouping';

/**
 * Un `Message` du domaine porte une quinzaine de champs d'état dont le
 * groupage ne lit RIEN — il ne regarde que l'expéditeur et l'horloge. Les
 * poser ici garde les cas lisibles sans mentir sur la forme : c'est bien la
 * charge que la passerelle rend.
 */
const msg = (id: string, senderId: string, createdAt: string): Message => ({
  id,
  conversationId: 'c1',
  senderId,
  content: id,
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 0,
  readCount: 0,
  reactionCount: 0,
  isEncrypted: false,
  translations: [],
  createdAt: new Date(createdAt),
  timestamp: new Date(createdAt),
});

test('deux messages du meme auteur le meme jour se groupent, meme a six heures d ecart', () => {
  // Le temoin qui compte : une fenetre temporelle (absente de la loi) les
  // separerait. C'est le cas NOMINAL d'un reseau qui coupe.
  const a = msg('a', 'u1', '2026-09-06T02:00:00');
  const b = msg('b', 'u1', '2026-09-06T08:00:00');
  expect(continues(a, b)).toBe(true);
});

test('le passage de minuit rompt le groupe', () => {
  expect(continues(msg('a', 'u1', '2026-09-05T23:59:00'), msg('b', 'u1', '2026-09-06T00:01:00'))).toBe(false);
});

test('un auteur different rompt le groupe', () => {
  expect(continues(msg('a', 'u1', '2026-09-06T08:00:00'), msg('b', 'u2', '2026-09-06T08:01:00'))).toBe(false);
});

test("c'est le DERNIER d'une suite qui porte l'identite, pas le premier", () => {
  const placed = place(
    [
      msg('a', 'u1', '2026-09-06T08:00:00'),
      msg('b', 'u1', '2026-09-06T08:01:00'),
      msg('c', 'u1', '2026-09-06T08:02:00'),
    ],
    { locale: 'fr' },
  );
  expect(placed.map((p) => p.head)).toEqual([true, false, false]);
  expect(placed.map((p) => p.tail)).toEqual([false, false, true]);
});

test('le separateur de jour ne se pose que sur le premier message du jour', () => {
  const placed = place(
    [
      msg('a', 'u1', '2026-09-05T08:00:00'),
      msg('b', 'u1', '2026-09-06T08:00:00'),
      msg('c', 'u2', '2026-09-06T09:00:00'),
    ],
    { locale: 'fr' },
  );
  expect(placed.map((p) => p.opensDay !== null)).toEqual([true, true, false]);
});

/**
 * `dayLabel` — miroir de `MessageDayLabel.label` (§4.9 de la spécification
 * #5695). `now` est FIGÉ dans chaque cas (UTC) — jamais l'horloge réelle.
 */
const NOW = new Date('2026-03-10T12:00:00Z');
const opts = (overrides: Partial<Parameters<typeof dayLabel>[1]> = {}) => ({
  now: NOW,
  locale: 'fr',
  timeZone: 'UTC',
  ...overrides,
});

test('J0 => Aujourd’hui', () => {
  expect(dayLabel('2026-03-10T09:00:00Z', opts())).toBe("Aujourd'hui");
});

test('J-1 => Hier', () => {
  expect(dayLabel('2026-03-09T09:00:00Z', opts())).toBe('Hier');
});

test('J-2 => Avant-hier', () => {
  expect(dayLabel('2026-03-08T09:00:00Z', opts())).toBe('Avant-hier');
});

test('J-3 => nom de jour capitalisé', () => {
  // 2026-03-07 est un samedi.
  expect(dayLabel('2026-03-07T09:00:00Z', opts())).toBe('Samedi');
});

test('J-7, même année => jour de semaine + jour + mois', () => {
  // 2026-03-03 est un mardi.
  expect(dayLabel('2026-03-03T09:00:00Z', opts())).toBe('Mardi 3 mars');
});

test('année différente => + année', () => {
  expect(dayLabel('2025-12-20T09:00:00Z', opts())).toBe('Samedi 20 décembre 2025');
});

test('date future le même jour calendaire => Aujourd’hui', () => {
  expect(dayLabel('2026-03-10T23:00:00Z', opts())).toBe("Aujourd'hui");
});

test('témoin à deux locales — J-3', () => {
  const expected = new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date('2026-03-07T09:00:00Z'),
  );
  expect(dayLabel('2026-03-07T09:00:00Z', opts({ locale: 'en' }))).toBe(expected);
  expect(dayLabel('2026-03-07T09:00:00Z', opts({ locale: 'en' }))).not.toBe('Samedi');
});

test('témoin à deux locales — J-8', () => {
  const target = '2026-03-02T09:00:00Z';
  const fr = dayLabel(target, opts({ locale: 'fr' }));
  const en = dayLabel(target, opts({ locale: 'en' }));
  expect(fr).not.toBe(en);
  expect(en).toMatch(/Monday/);
});

test('labels injectables => un catalogue peut remplacer « Aujourd’hui »', () => {
  expect(
    dayLabel('2026-03-10T09:00:00Z', opts({ labels: { today: 'Today', yesterday: 'Hier', dayBeforeYesterday: 'Avant-hier' } })),
  ).toBe('Today');
});
