import { expect, test } from 'bun:test';

import type { Message } from './api/model';
import { continues, place } from './grouping';

const author = (id: string) => ({ id, name: id, initials: 'XX', tint: 1 as const, presence: 'online' as const });
const msg = (id: string, authorId: string, sentAt: string): Message => ({
  id,
  author: author(authorId),
  isMine: false,
  content: id,
  originalLanguage: 'fr',
  translations: [],
  sentAt,
  status: 'read',
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
  const placed = place([
    msg('a', 'u1', '2026-09-06T08:00:00'),
    msg('b', 'u1', '2026-09-06T08:01:00'),
    msg('c', 'u1', '2026-09-06T08:02:00'),
  ]);
  expect(placed.map((p) => p.head)).toEqual([true, false, false]);
  expect(placed.map((p) => p.tail)).toEqual([false, false, true]);
});

test('le separateur de jour ne se pose que sur le premier message du jour', () => {
  const placed = place([
    msg('a', 'u1', '2026-09-05T08:00:00'),
    msg('b', 'u1', '2026-09-06T08:00:00'),
    msg('c', 'u2', '2026-09-06T09:00:00'),
  ]);
  expect(placed.map((p) => p.opensDay !== null)).toEqual([true, true, false]);
});
