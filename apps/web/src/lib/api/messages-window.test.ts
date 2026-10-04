import { describe, expect, test } from 'bun:test';

import { message } from './fixtures-base';
import type { Message } from './types';
import {
  joinThreadWindows,
  newerWindowParam,
  olderWindowParam,
  windowPageOf,
  type WindowPage,
} from './messages-window';

/**
 * #7420 — LA FENÊTRE AUTOUR D'UN MESSAGE. Un message plus ancien que les pages
 * chargées s'atteint en UNE requête (`?around=`), et la fenêtre s'étend dans
 * les deux sens jusqu'à rejoindre le présent, sans trou ni doublon.
 */
const at = (minute: number): Date => new Date(Date.UTC(2026, 9, 1, 8, minute));

const corpus = (count: number): readonly Message[] =>
  Array.from({ length: count }, (_, i) =>
    message({ id: `a${i}`, senderId: 'u-2', content: `n°${i}`, originalLanguage: 'fr', translations: [], createdAt: at(i) }),
  );

const ids = (messages: readonly Message[]): readonly string[] => messages.map((m) => m.id);

describe('windowPageOf — la loi de la passerelle, pour les fixtures', () => {
  test('around : la moitié avant, la cible, la moitié après — ascendant', () => {
    const page = windowPageOf(corpus(100), { around: 'a40' }, 10);
    expect(ids(page.messages)).toEqual(['a35', 'a36', 'a37', 'a38', 'a39', 'a40', 'a41', 'a42', 'a43', 'a44', 'a45']);
    expect(page.hasOlder).toBe(true);
    expect(page.hasNewer).toBe(true);
    expect(page.nextCursor).toBe('a35');
  });

  test('around près du bord : rien d’inventé au-delà du corpus', () => {
    const page = windowPageOf(corpus(8), { around: 'a1' }, 10);
    expect(ids(page.messages)).toEqual(['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
    expect(page.hasOlder).toBe(false);
    expect(page.hasNewer).toBe(true);
    expect(page.nextCursor).toBeNull();
  });

  test('around inconnu : la page récente, sans plus récent — la cible n’y est pas', () => {
    const page = windowPageOf(corpus(30), { around: 'fantome' }, 10);
    expect(ids(page.messages)).toEqual(ids(corpus(30).slice(-10)));
    expect(page.hasNewer).toBe(false);
  });

  test('after : les messages strictement plus récents, ascendants, bornés', () => {
    const page = windowPageOf(corpus(100), { after: at(45).toISOString() }, 10);
    expect(ids(page.messages)).toEqual(['a46', 'a47', 'a48', 'a49', 'a50', 'a51', 'a52', 'a53', 'a54', 'a55']);
    expect(page.hasNewer).toBe(true);
    const last = windowPageOf(corpus(100), { after: at(95).toISOString() }, 10);
    expect(ids(last.messages)).toEqual(['a96', 'a97', 'a98', 'a99']);
    expect(last.hasNewer).toBe(false);
  });

  test('before : les messages strictement plus anciens, ascendants, bornés', () => {
    const page = windowPageOf(corpus(100), { before: 'a35' }, 10);
    expect(ids(page.messages)).toEqual(['a25', 'a26', 'a27', 'a28', 'a29', 'a30', 'a31', 'a32', 'a33', 'a34']);
    expect(page.hasOlder).toBe(true);
    expect(page.nextCursor).toBe('a25');
  });
});

describe('les curseurs de la fenêtre', () => {
  const page = (partial: Partial<WindowPage> & { readonly messages: readonly Message[] }): WindowPage => ({
    hasOlder: false,
    hasNewer: false,
    nextCursor: null,
    ...partial,
  });

  test('vers le présent : `after` = l’instant du message le plus récent de la première page', () => {
    const first = page({ messages: corpus(5), hasNewer: true });
    expect(newerWindowParam(first, [first], { around: 'a2' })).toEqual({ after: at(4).toISOString() });
  });

  test('vers le présent : rien quand le présent est atteint, quand la page est vide, ou quand le curseur stagne', () => {
    expect(newerWindowParam(page({ messages: corpus(5) }), [], { around: 'a2' })).toBeUndefined();
    expect(newerWindowParam(page({ messages: [], hasNewer: true }), [], { around: 'a2' })).toBeUndefined();
    const stuck = page({ messages: corpus(5), hasNewer: true });
    expect(newerWindowParam(stuck, [stuck], { after: at(4).toISOString() })).toBeUndefined();
  });

  test('vers le passé : `before` = le curseur servi par la dernière page', () => {
    const last = page({ messages: corpus(5), hasOlder: true, nextCursor: 'a0' });
    expect(olderWindowParam(last, [last], { around: 'a2' })).toEqual({ before: 'a0' });
    expect(olderWindowParam(page({ messages: corpus(5) }), [], { around: 'a2' })).toBeUndefined();
  });
});

describe('joinThreadWindows — la fenêtre ancrée et le présent', () => {
  const all = corpus(120);
  const present = all.slice(70);

  test('sans fenêtre ancrée : le présent, tel quel (même identité)', () => {
    const joined = joinThreadWindows(present, undefined);
    expect(joined.messages).toBe(present);
    expect(joined.detached).toBe(false);
  });

  test('une fenêtre qui ne touche pas le présent est DÉTACHÉE : elle seule est servie', () => {
    const anchored = { messages: all.slice(10, 40), hasOlder: true, hasNewer: true };
    const joined = joinThreadWindows(present, anchored);
    expect(ids(joined.messages)).toEqual(ids(all.slice(10, 40)));
    expect(joined.detached).toBe(true);
  });

  test('une fenêtre qui chevauche le présent le REJOINT : un fil continu, sans doublon', () => {
    const anchored = { messages: all.slice(10, 75), hasOlder: true, hasNewer: true };
    const joined = joinThreadWindows(present, anchored);
    expect(ids(joined.messages)).toEqual(ids(all.slice(10)));
    expect(joined.detached).toBe(false);
  });

  test('une fenêtre qui a atteint le présent n’est plus détachée, même sans chevauchement', () => {
    const anchored = { messages: all.slice(10, 70), hasOlder: true, hasNewer: false };
    const joined = joinThreadWindows(present, anchored);
    expect(ids(joined.messages)).toEqual(ids(all.slice(10)));
    expect(joined.detached).toBe(false);
  });
});
