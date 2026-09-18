import { describe, expect, test } from 'bun:test';

import {
  flattenMessagePages,
  nextMessagesCursor,
  pageOfMessages,
  threadWindowOf,
  type MessagesInfiniteData,
  type MessagesPage,
} from './messages-pages';
import { message } from './fixtures-base';
import type { Message } from './types';

/** Un message de témoin — `createdAt` CROISSANT avec l'index, comme le fil. */
const msg = (id: string, minute: number, extra: Partial<Message> = {}): Message =>
  message({
    id,
    conversationId: 'c-a',
    senderId: 'u1',
    content: `contenu ${id}`,
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date(Date.UTC(2026, 8, 18, 10, minute)),
    ...extra,
  });

const page = (messages: readonly Message[], extra: Partial<Omit<MessagesPage, 'messages'>> = {}): MessagesPage => ({
  messages,
  hasOlder: false,
  nextCursor: null,
  ...extra,
});

const data = (pages: readonly MessagesPage[], pageParams: readonly (string | undefined)[]): MessagesInfiniteData =>
  ({ pages: [...pages], pageParams: [...pageParams] }) as MessagesInfiniteData;

/**
 * **LE PIÈGE DE L'ORDRE À LA COUTURE** (#6972) — le défaut le plus facile à
 * livrer sans le voir, et le seul de ce lot qu'aucun test d'écran n'attrape.
 *
 * La passerelle sert `createdAt DESC` ; `loadMessages` RENVERSE en ASCENDANT
 * **par page**. Les pages, elles, arrivent de la plus RÉCENTE (page 1, sans
 * `before`) à la plus ANCIENNE. Concaténer `[...page1, ...page2]` place donc
 * les messages ANCIENS **après** les récents : le fil se lit à l'envers à
 * partir de la première couture, sans erreur, sans témoin rouge, sans rien
 * qui ait l'air cassé.
 *
 * L'aplatissement doit renverser l'ORDRE DES PAGES avant de concaténer.
 */
describe('flattenMessagePages — l’ordre à la couture', () => {
  test('page RÉCENTE d’abord, page ANCIENNE ensuite ⇒ liste globalement ASCENDANTE', () => {
    const recent = page([msg('m3', 3), msg('m4', 4), msg('m5', 5)], { hasOlder: true, nextCursor: 'm3' });
    const older = page([msg('m1', 1), msg('m2', 2)]);
    const flat = flattenMessagePages(data([recent, older], [undefined, 'm3']));
    expect(flat.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });

  test('l’ordre reste ASCENDANT sur TROIS pages', () => {
    const p1 = page([msg('m5', 5), msg('m6', 6)]);
    const p2 = page([msg('m3', 3), msg('m4', 4)]);
    const p3 = page([msg('m1', 1), msg('m2', 2)]);
    const flat = flattenMessagePages(data([p1, p2, p3], [undefined, 'm5', 'm3']));
    expect(flat.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  });

  test('une seule page ⇒ son ordre INTERNE, intact', () => {
    const flat = flattenMessagePages(data([page([msg('m1', 1), msg('m2', 2)])], [undefined]));
    expect(flat.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  test('deux pages partageant un id ⇒ UNE seule bulle (la couture ne double pas)', () => {
    const recent = page([msg('m2', 2), msg('m3', 3)]);
    const older = page([msg('m1', 1), msg('m2', 2)]);
    const flat = flattenMessagePages(data([recent, older], [undefined, 'm2']));
    expect(flat.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  test('DÉCODE les dates — `createdAt` ISO du cache revit en `Date`', () => {
    const raw = { ...msg('m1', 1), createdAt: '2026-09-08T09:00:00.000Z' } as unknown as Message;
    const flat = flattenMessagePages(data([page([raw])], [undefined]));
    expect(flat[0]?.createdAt).toBeInstanceOf(Date);
  });

  test('aucune page ⇒ liste vide (jamais une exception)', () => {
    expect(flattenMessagePages(data([], []))).toEqual([]);
  });
});

/**
 * `threadWindowOf` — **`hasOlder` ET « peut-on encore charger » SONT DEUX
 * QUESTIONS** (#6972). La première est celle du Résumé Vivant (« Sur les N
 * derniers messages ») ; elle se lit sur la page qui BORDE la fenêtre — la
 * plus ANCIENNE chargée, donc la dernière reçue.
 */
describe('threadWindowOf — la fenêtre servie à l’écran', () => {
  test('`hasOlder` vient de la page la plus ANCIENNE, jamais de la première', () => {
    const recent = page([msg('m3', 3)], { hasOlder: true, nextCursor: 'm3' });
    const older = page([msg('m1', 1)], { hasOlder: false, nextCursor: null });
    const w = threadWindowOf(data([recent, older], [undefined, 'm3']));
    expect(w.messages.map((m) => m.id)).toEqual(['m1', 'm3']);
    expect(w.hasOlder).toBe(false);
  });

  test('un fil déclaré PARTIEL le reste même sans curseur — la fiction des fixtures ne se falsifie pas', () => {
    const w = threadWindowOf(data([page([msg('m1', 1)], { hasOlder: true, nextCursor: null })], [undefined]));
    expect(w.hasOlder).toBe(true);
    /* … et la sentinelle reste DÉSARMÉE : deux questions, deux réponses. */
    expect(nextMessagesCursor(page([msg('m1', 1)], { hasOlder: true, nextCursor: null }), [], undefined)).toBeUndefined();
  });

  test('aucune page ⇒ fenêtre vide, hasOlder faux (fail-closed)', () => {
    const w = threadWindowOf(data([], []));
    expect(w.messages).toEqual([]);
    expect(w.hasOlder).toBe(false);
  });
});

/**
 * `nextMessagesCursor` — LES CINQ REFUS (#6972), copiés de
 * `nextConversationsCursor` (`conversations-pages.ts`) et valables TELS QUELS
 * ici : la passerelle ressert la page RÉCENTE en silence sur un `before`
 * qu'elle ne résout pas (`messages-list.ts:386-397` — `findFirst` ne trouve
 * rien, AUCUN filtre `lt` n'est posé, la page 1 revient). Sans le cinquième
 * refus, le fil se rechargerait à l'infini sur son propre début.
 */
describe('nextMessagesCursor — les cinq refus anti-boucle', () => {
  test('cas nominal ⇒ le curseur de la page', () => {
    const p = page([msg('m3', 3)], { hasOlder: true, nextCursor: 'm3' });
    expect(nextMessagesCursor(p, [p], undefined)).toBe('m3');
  });

  test('1 — `hasOlder` faux ⇒ undefined', () => {
    const p = page([msg('m3', 3)], { hasOlder: false, nextCursor: 'm3' });
    expect(nextMessagesCursor(p, [p], undefined)).toBeUndefined();
  });

  test('2 — `nextCursor` absent ⇒ undefined', () => {
    const p = page([msg('m3', 3)], { hasOlder: true, nextCursor: null });
    expect(nextMessagesCursor(p, [p], undefined)).toBeUndefined();
  });

  test('3 — curseur STAGNANT (identique au paramètre qui vient de servir) ⇒ undefined', () => {
    const p = page([msg('m3', 3)], { hasOlder: true, nextCursor: 'm9' });
    expect(nextMessagesCursor(p, [p], 'm9')).toBeUndefined();
  });

  test('4 — page VIDE ⇒ undefined', () => {
    const p = page([], { hasOlder: true, nextCursor: 'm3' });
    expect(nextMessagesCursor(p, [p], undefined)).toBeUndefined();
  });

  test('5 — AUCUN message neuf (la passerelle a resservi une page déjà vue) ⇒ undefined', () => {
    const first = page([msg('m2', 2), msg('m3', 3)], { hasOlder: true, nextCursor: 'm2' });
    const resserved = page([msg('m2', 2), msg('m3', 3)], { hasOlder: true, nextCursor: 'm2' });
    expect(nextMessagesCursor(resserved, [first, resserved], 'm2')).toBeUndefined();
  });

  test('5 bis — UN SEUL message neuf suffit à continuer', () => {
    const first = page([msg('m2', 2), msg('m3', 3)], { hasOlder: true, nextCursor: 'm2' });
    const next = page([msg('m1', 1), msg('m2', 2)], { hasOlder: true, nextCursor: 'm1' });
    expect(nextMessagesCursor(next, [first, next], 'm2')).toBe('m1');
  });
});

/**
 * `pageOfMessages` — LA LOI DE FENÊTRAGE, en fixtures, qui MIME
 * `messages-list.ts` : tri `createdAt DESC` puis renversement ASCENDANT dans
 * la page (`:534` `take: limit + 1` en mode `before`, `:747`
 * `hasMore = length === limit` en page 1), curseur = l'id du message le PLUS
 * ANCIEN de la page, `before` INCONNU ⇒ fenêtre INTACTE donc page 1
 * RESSERVIE (`:386-397`).
 *
 * PURE : le corpus est REÇU, jamais lu — même discipline que
 * `pageOfConversations` (`fixtures-pagination.ts`).
 */
describe('pageOfMessages — la loi de fenêtrage des fixtures', () => {
  const corpus = [msg('m1', 1), msg('m2', 2), msg('m3', 3), msg('m4', 4), msg('m5', 5)];

  test('page 1 ⇒ les N PLUS RÉCENTS, en ordre ASCENDANT', () => {
    const p = pageOfMessages(corpus, { limit: 3 });
    expect(p.messages.map((m) => m.id)).toEqual(['m3', 'm4', 'm5']);
    expect(p.hasOlder).toBe(true);
    expect(p.nextCursor).toBe('m3');
  });

  test('`before` = le curseur ⇒ la fenêtre des STRICTEMENT plus anciens', () => {
    const p = pageOfMessages(corpus, { before: 'm3', limit: 3 });
    expect(p.messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(p.hasOlder).toBe(false);
    expect(p.nextCursor).toBe(null);
  });

  test('corpus plus court que la limite ⇒ hasOlder faux, aucun curseur', () => {
    const p = pageOfMessages(corpus, { limit: 50 });
    expect(p.messages).toHaveLength(5);
    expect(p.hasOlder).toBe(false);
    expect(p.nextCursor).toBe(null);
  });

  test('`before` INCONNU ⇒ la page 1 est RESSERVIE (le défaut que le 5e refus arrête)', () => {
    const p = pageOfMessages(corpus, { before: 'm-inconnu', limit: 3 });
    expect(p.messages.map((m) => m.id)).toEqual(['m3', 'm4', 'm5']);
  });

  test('corpus vide ⇒ page vide, aucun curseur', () => {
    const p = pageOfMessages([], { limit: 50 });
    expect(p.messages).toEqual([]);
    expect(p.hasOlder).toBe(false);
    expect(p.nextCursor).toBe(null);
  });

  test('l’ENCHAÎNEMENT des pages rend le corpus ENTIER, une fois chacun, en ASC', () => {
    const p1 = pageOfMessages(corpus, { limit: 2 });
    const p2 = pageOfMessages(corpus, { before: p1.nextCursor ?? '', limit: 2 });
    const p3 = pageOfMessages(corpus, { before: p2.nextCursor ?? '', limit: 2 });
    const flat = flattenMessagePages(data([p1, p2, p3], [undefined, p1.nextCursor ?? undefined, p2.nextCursor ?? undefined]));
    expect(flat.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(p3.hasOlder).toBe(false);
  });
});
