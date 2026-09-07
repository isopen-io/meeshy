import { expect, test } from 'bun:test';

import type { Message } from './api/modele';
import { continue_, place } from './groupage';

const auteur = (id: string) => ({ id, nom: id, initiales: 'XX', teinte: 1 as const, presence: 'en-ligne' as const });
const msg = (id: string, auteurId: string, envoyeA: string): Message => ({
  id,
  auteur: auteur(auteurId),
  deMoi: false,
  contenu: id,
  langueOriginale: 'fr',
  traductions: [],
  envoyeA,
  etat: 'lu',
});

test('deux messages du meme auteur le meme jour se groupent, meme a six heures d ecart', () => {
  // Le temoin qui compte : une fenetre temporelle (absente de la loi) les
  // separerait. C'est le cas NOMINAL d'un reseau qui coupe.
  const a = msg('a', 'u1', '2026-09-06T02:00:00');
  const b = msg('b', 'u1', '2026-09-06T08:00:00');
  expect(continue_(a, b)).toBe(true);
});

test('le passage de minuit rompt le groupe', () => {
  expect(continue_(msg('a', 'u1', '2026-09-05T23:59:00'), msg('b', 'u1', '2026-09-06T00:01:00'))).toBe(false);
});

test('un auteur different rompt le groupe', () => {
  expect(continue_(msg('a', 'u1', '2026-09-06T08:00:00'), msg('b', 'u2', '2026-09-06T08:01:00'))).toBe(false);
});

test("c'est le DERNIER d'une suite qui porte l'identite, pas le premier", () => {
  const places = place([
    msg('a', 'u1', '2026-09-06T08:00:00'),
    msg('b', 'u1', '2026-09-06T08:01:00'),
    msg('c', 'u1', '2026-09-06T08:02:00'),
  ]);
  expect(places.map((p) => p.tete)).toEqual([true, false, false]);
  expect(places.map((p) => p.queue)).toEqual([false, false, true]);
});

test('le separateur de jour ne se pose que sur le premier message du jour', () => {
  const places = place([
    msg('a', 'u1', '2026-09-05T08:00:00'),
    msg('b', 'u1', '2026-09-06T08:00:00'),
    msg('c', 'u2', '2026-09-06T09:00:00'),
  ]);
  expect(places.map((p) => p.ouvreLeJour !== null)).toEqual([true, true, false]);
});
