import { describe, expect, test } from 'bun:test';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import { menuScope } from '@/test-support/menu-viewer';

import { messagePinAction, reportOffered } from './message-actions';

/**
 * #7558 — ÉPINGLER ET SIGNALER, LA RÈGLE DU SERVEUR LUE AVANT LE GESTE.
 *
 * L'épingle : `PUT`/`DELETE …/messages/:id/pin` exigent un COMPTE
 * (`allowAnonymous: false`), un message que le serveur connaît et qui n'est pas
 * supprimé, et refusent un avis de capture. Le signalement : `POST /reports`
 * exige un compte ; on ne se signale pas soi-même.
 */

const NOW = Date.parse('2026-10-14T10:00:00.000Z');
const ME = menuScope({ id: 'u-me' });

const row = (overrides: Partial<Message> = {}): Message =>
  message({
    id: 'm-1',
    conversationId: 'c-a',
    senderId: 'u-other',
    content: 'bonjour',
    originalLanguage: 'fr',
    translations: [],
    createdAt: minutesAgo(5),
    ...overrides,
  });

describe('messagePinAction — l’épingle offerte est celle que le serveur admettrait', () => {
  test('un message non épinglé ⇒ « Épingler », qu’il soit de moi ou d’un autre', () => {
    expect(messagePinAction(row(), ME, { now: NOW })).toBe('pin');
    expect(messagePinAction(row({ senderId: 'u-me' }), ME, { now: NOW })).toBe('pin');
  });

  test('un message épinglé ⇒ « Détacher »', () => {
    expect(messagePinAction(row({ pinnedAt: new Date(NOW - 1000), pinnedBy: 'u-other' }), ME, { now: NOW })).toBe('unpin');
  });

  test('sans compte ⇒ rien (la route refuse la session anonyme)', () => {
    expect(messagePinAction(row(), menuScope({ id: 'u-me', hasAccount: false }), { now: NOW })).toBeNull();
  });

  test('un message encore optimiste, supprimé, échu, à vue unique ou système ⇒ rien', () => {
    expect(messagePinAction(row({ id: 'cid_123' }), ME, { now: NOW })).toBeNull();
    expect(messagePinAction(row({ deletedAt: new Date(NOW - 1000) }), ME, { now: NOW })).toBeNull();
    expect(messagePinAction(row({ expiresAt: new Date(NOW - 1000) }), ME, { now: NOW })).toBeNull();
    expect(messagePinAction(row({ isViewOnce: true }), ME, { now: NOW })).toBeNull();
    expect(messagePinAction(row({ messageType: 'system' }), ME, { now: NOW })).toBeNull();
  });

  test('un éphémère encore vivant s’épingle', () => {
    expect(messagePinAction(row({ expiresAt: new Date(NOW + 60_000) }), ME, { now: NOW })).toBe('pin');
  });
});

describe('reportOffered — on signale le message d’un autre, jamais le sien', () => {
  test('le message d’un autre ⇒ offert', () => {
    expect(reportOffered(row(), ME)).toBe(true);
  });

  test('mon propre message ⇒ jamais', () => {
    expect(reportOffered(row({ senderId: 'u-me' }), ME)).toBe(false);
  });

  test('sans compte, message optimiste, supprimé, système ou à vue unique ⇒ jamais', () => {
    expect(reportOffered(row({ isViewOnce: true }), ME)).toBe(false);
    expect(reportOffered(row(), menuScope({ id: 'u-me', hasAccount: false }))).toBe(false);
    expect(reportOffered(row({ id: 'cid_9' }), ME)).toBe(false);
    expect(reportOffered(row({ deletedAt: new Date(NOW) }), ME)).toBe(false);
    expect(reportOffered(row({ messageType: 'system' }), ME)).toBe(false);
  });
});
