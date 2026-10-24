import { beforeAll, describe, expect, test } from 'bun:test';

import { message, translation } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog, translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { menuScope } from '@/test-support/menu-viewer';

import { messageMenuContextOf, messageMenuGroups, messageMenuItems, type MessageMenuContext, type MessageMenuItem } from './message-actions';

/**
 * #12632 — UN ENVOI EN ÉCHEC S'ABANDONNE. La loi partagée range `discard`
 * dans le groupe destructif de tout message en échec ; le menu le sert, en
 * rouge, quand l'hôte sait retirer l'envoi de l'outbox (`canDiscard`).
 */

const LANGUAGES: readonly InterfaceLanguage[] = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'];

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), ...LANGUAGES.map((language) => loadMessagePiecesCatalog(language))]);
});

const NOW = Date.parse('2026-10-24T12:00:00.000Z');

const row = (overrides: Partial<Message> = {}): Message =>
  message({
    id: 'cid_1',
    conversationId: 'c-a',
    senderId: 'u-viewer',
    content: 'Bonjour à tous',
    originalLanguage: 'fr',
    translations: [translation('cid_1', 'en', 'Hello all')],
    createdAt: new Date(NOW - 60 * 1000),
    ...overrides,
  });

const ctxOf = (subject: Message, input: { readonly failed: boolean; readonly host?: Partial<MessageMenuContext> }): MessageMenuContext => ({
  ...messageMenuContextOf(subject, { now: NOW, scope: menuScope(), failed: input.failed }),
  piecesLabels: true,
  canDiscard: true,
  ...input.host,
});

const ids = (items: readonly MessageMenuItem[]): readonly string[] => items.map((item) => item.id);

describe('« Abandonner » un envoi en échec', () => {
  test('un message cid_ en échec offre « Abandonner » dans le groupe destructif, et rien d’autre n’y est', () => {
    const groups = messageMenuGroups(ctxOf(row(), { failed: true }));
    expect(ids(groups.destructive)).toEqual(['discard']);
    expect(groups.destructive[0]?.group).toBe('destructive');
  });

  test('il se dit dans le catalogue du fil, sous sa propre clé, dans les sept langues', () => {
    const item = messageMenuGroups(ctxOf(row(), { failed: true })).destructive[0];
    expect(item?.catalog).toBe('pieces');
    expect(item?.labelKey).toBe('message.menu.discard');
    expect(translateMessagePieces('fr', 'message.menu.discard')).toBe('Abandonner');
    const labels = LANGUAGES.map((language) => translateMessagePieces(language, 'message.menu.discard'));
    expect(labels.every((label) => label.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBeGreaterThan(1);
  });

  test('un envoi encore en vol ne l’offre pas', () => {
    expect(ids(messageMenuItems(ctxOf(row(), { failed: false })))).not.toContain('discard');
  });

  test('un message confirmé ne l’offre pas : il se supprime', () => {
    const confirmed = messageMenuGroups(ctxOf(row({ id: 'm-1' }), { failed: false }));
    expect(ids(confirmed.destructive)).toEqual(['delete']);
  });

  test('sans un hôte qui sait l’abandonner, rien ne s’offre', () => {
    expect(ids(messageMenuItems(ctxOf(row(), { failed: true, host: { canDiscard: false } })))).not.toContain('discard');
  });

  test('tant que le catalogue du fil n’est pas chargé, aucune entrée sans libellé', () => {
    expect(ids(messageMenuItems(ctxOf(row(), { failed: true, host: { piecesLabels: false } })))).not.toContain('discard');
  });

  test('en bout en bout aussi : abandonner ne fait rien partir', () => {
    const e2ee = { ...messageMenuContextOf(row(), { now: NOW, scope: menuScope({}, { encryptionMode: 'e2ee' }), failed: true }), piecesLabels: true, canDiscard: true };
    expect(ids(messageMenuGroups(e2ee).destructive)).toEqual(['discard']);
  });
});
