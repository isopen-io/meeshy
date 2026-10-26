import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { canSendPlaintext, createEndToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey } from './conversations';
import { CONVERSATIONS_KEY_ROOT, watchEndToEndConversations } from './end-to-end-cache-watch';

/**
 * #12949 — UNE CONVERSATION SERVIE e2ee DANS LA LISTE EST VUE, même jamais
 * ouverte : le registre du compte l'apprend depuis le cache des conversations
 * (liste et détail), et une relecture servie sans mode ne la rouvre plus.
 */
const row = (id: string, encryptionMode: string | null) => ({ id, type: 'direct', encryptionMode, participants: [] });
const page = (rows: readonly unknown[]) => ({
  pages: [{ conversations: rows, pagination: { limit: 30, offset: 0, total: rows.length, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } }],
  pageParams: [undefined],
});

describe('le registre apprend le bout en bout depuis le cache des conversations', () => {
  test('la liste déjà en cache, puis la liste qui arrive, puis le détail', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    client.setQueryData(CONVERSATIONS_QUERY_KEY, page([row('c-1', 'e2ee'), row('c-2', null)]));

    const unwatch = watchEndToEndConversations(client, ledger);
    client.setQueryData(CONVERSATIONS_QUERY_KEY, page([row('c-1', 'e2ee'), row('c-3', 'E2EE'), row('c-2', 'server')]));
    client.setQueryData(conversationQueryKey('c-4'), row('c-4', 'e2ee'));

    expect(['c-1', 'c-2', 'c-3', 'c-4'].map((id) => canSendPlaintext({ conversationId: id }, ledger.getState()))).toEqual([false, true, false, false]);
    unwatch();
  });

  test('servie ensuite sans mode : toujours fermée', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    const unwatch = watchEndToEndConversations(client, ledger);
    client.setQueryData(conversationQueryKey('c-1'), row('c-1', 'e2ee'));
    client.setQueryData(conversationQueryKey('c-1'), row('c-1', null));

    expect(canSendPlaintext({ conversationId: 'c-1' }, ledger.getState())).toBe(false);
    unwatch();
  });

  test('une donnée d’une autre forme ne casse rien et n’apprend rien', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    const unwatch = watchEndToEndConversations(client, ledger);
    client.setQueryData(['conversations', 'c-x', 'members'], { members: [{ id: 'u', encryptionMode: 'e2ee' }] });
    client.setQueryData(['conversations', 'categories'], [{ id: 'k', encryptionMode: 'e2ee' }]);

    expect(ledger.getState().sealed).toEqual({});
    unwatch();
  });
});

/**
 * #12986 (option 2) — UN FIL CHARGÉ QUI PORTE UN MESSAGE CHIFFRÉ DE BOUT EN
 * BOUT scelle la conversation pour le compte, même servie sans mode : la
 * feuille d'envoi, le transfert et le partage le lisent sans ouvrir le fil.
 */
const thread = (messages: readonly unknown[]) => ({ pages: [{ messages, hasOlder: false, nextCursor: null }], pageParams: [undefined] });
const sealedRow = (conversationId: string) => ({ id: `e-${conversationId}`, conversationId, messageType: 'text', content: '', isEncrypted: true, encryptionMode: 'e2ee' });
const plainRow = (conversationId: string) => ({ id: `p-${conversationId}`, conversationId, messageType: 'text', content: 'salut', isEncrypted: false });

describe('le registre apprend le bout en bout depuis le cache des fils (#12986)', () => {
  test('le fil d’une conversation servie sans mode porte un message e2ee : fermée', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    client.setQueryData(['conversations', 'c-1', 'messages'], thread([plainRow('c-1'), sealedRow('c-1')]));

    const unwatch = watchEndToEndConversations(client, ledger);
    client.setQueryData(['conversations', 'c-2', 'messages'], thread([plainRow('c-2')]));
    client.setQueryData(['conversations', 'c-3', 'messages', 'around', 'm-9'], thread([sealedRow('c-3')]));

    expect(['c-1', 'c-2', 'c-3'].map((id) => canSendPlaintext({ conversationId: id }, ledger.getState()))).toEqual([false, true, false]);
    unwatch();
  });

  test('un fil qui ne porte que du clair ou un chiffré supprimé, ou une donnée d’une autre forme, n’apprend rien', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    const unwatch = watchEndToEndConversations(client, ledger);
    client.setQueryData(['conversations', 'c-4', 'messages'], thread([plainRow('c-4')]));
    client.setQueryData(['conversations', 'c-5', 'messages'], { messages: 'pas une liste' });
    client.setQueryData(['conversations', 'c-6', 'media'], thread([sealedRow('c-6')]));
    client.setQueryData(['conversations', 'c-7', 'messages'], thread([{ ...sealedRow('c-7'), deletedAt: '2026-10-25T02:07:01.630Z' }]));

    expect(ledger.getState().sealed).toEqual({});
    unwatch();
  });
});

describe('les clés que la surveillance écrit à la main', () => {
  test('la racine des conversations est celle du module des conversations', () => {
    expect(CONVERSATIONS_KEY_ROOT).toBe(CONVERSATIONS_QUERY_KEY[0]);
  });
});

/**
 * #13099 — UN FIL EN CACHE QUI MONTRE UN CHIFFRÉ SANS MODE RETIENT L'ENVOI EN
 * COURS, sans rien inscrire au registre du compte ; dans un GROUPE, un message
 * e2ee retient sans s'apprendre. Le fil relu sans lui relâche la retenue.
 */
const noModeRow = (conversationId: string) => ({ id: `n-${conversationId}`, conversationId, messageType: 'text', messageSource: 'user', content: '[Encrypted]', isEncrypted: true });

describe('la retenue de l’envoi depuis le cache des fils (#13099)', () => {
  test('un chiffré sans mode affiché : rien ne part, le registre n’apprend rien ; relu sans lui, le clair repart', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    const unwatch = watchEndToEndConversations(client, ledger);
    client.setQueryData(conversationQueryKey('c-1'), row('c-1', null));

    client.setQueryData(['conversations', 'c-1', 'messages'], thread([plainRow('c-1'), noModeRow('c-1')]));
    expect(canSendPlaintext({ conversationId: 'c-1' }, ledger.getState())).toBe(false);
    expect(ledger.getState().sealed).toEqual({});

    client.setQueryData(['conversations', 'c-1', 'messages'], thread([plainRow('c-1')]));
    expect(canSendPlaintext({ conversationId: 'c-1' }, ledger.getState())).toBe(true);
    unwatch();
  });

  test('dans un groupe, un message e2ee retient sans s’apprendre ; dans un tête-à-tête, il s’apprend avec son ère', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    const unwatch = watchEndToEndConversations(client, ledger);
    client.setQueryData(conversationQueryKey('g-1'), { ...row('g-1', null), type: 'group' });
    client.setQueryData(conversationQueryKey('d-1'), row('d-1', null));

    client.setQueryData(['conversations', 'g-1', 'messages'], thread([sealedRow('g-1')]));
    client.setQueryData(['conversations', 'd-1', 'messages'], thread([{ ...sealedRow('d-1'), createdAt: '2026-10-20T08:00:00.000Z' }]));

    expect(canSendPlaintext({ conversationId: 'g-1' }, ledger.getState())).toBe(false);
    expect(ledger.getState().sealed).toEqual({ 'd-1': true });
    expect(ledger.getState().since['d-1']).toBe(Date.parse('2026-10-20T08:00:00.000Z'));
    unwatch();
  });

  test('une conversation servie e2ee s’inscrit avec la date d’activation servie', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    const unwatch = watchEndToEndConversations(client, ledger);
    client.setQueryData(conversationQueryKey('c-9'), { ...row('c-9', 'e2ee'), encryptionEnabledAt: '2026-10-01T00:00:00.000Z' });

    expect(ledger.getState().since['c-9']).toBe(Date.parse('2026-10-01T00:00:00.000Z'));
    unwatch();
  });
});

/**
 * Revue #12992 — À L'INSTANT où la conversation est apprise e2ee, les clairs du
 * cache sont photographiés : un clair servi ensuite, même antidaté, n'y entre pas.
 */
describe('la photographie des clairs d’avant l’apprentissage', () => {
  const dated = (id: string, createdAt: string) => ({ ...plainRow('c-p'), id, createdAt });

  test('les clairs déjà en cache y entrent ; un clair arrivé après, même antidaté, jamais', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    const unwatch = watchEndToEndConversations(client, ledger);
    client.setQueryData(['conversations', 'c-p', 'messages'], thread([dated('p-avant', '2026-09-01T00:00:00.000Z')]));

    client.setQueryData(conversationQueryKey('c-p'), { ...row('c-p', 'e2ee'), encryptionEnabledAt: '2026-10-01T00:00:00.000Z' });
    client.setQueryData(['conversations', 'c-p', 'messages'], thread([dated('p-avant', '2026-09-01T00:00:00.000Z'), dated('p-antidate', '2026-09-02T00:00:00.000Z')]));

    expect(ledger.getState().clearKnown['c-p']).toEqual(['p-avant']);
    unwatch();
  });

  test('déjà connue chiffrée au démarrage (registre restauré) : photographiée sur le cache restauré, avant toute écriture', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    ledger.getState().learnEndToEnd('c-s', Date.parse('2026-10-01T00:00:00.000Z'));
    client.setQueryData(['conversations', 'c-s', 'messages'], thread([{ ...plainRow('c-s'), createdAt: '2026-09-01T00:00:00.000Z' }]));
    const unwatch = watchEndToEndConversations(client, ledger);

    client.setQueryData(['conversations', 'c-s', 'messages'], thread([
      { ...plainRow('c-s'), createdAt: '2026-09-01T00:00:00.000Z' },
      { ...plainRow('c-s'), id: 'forge', createdAt: '2026-09-02T00:00:00.000Z' },
    ]));

    expect(ledger.getState().clearKnown['c-s']).toEqual(['p-c-s']);
    unwatch();
  });

  test('apprise par le temps réel (sans écriture de cache) : photographiée aussitôt', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    client.setQueryData(['conversations', 'c-r', 'messages'], thread([{ ...plainRow('c-r'), createdAt: '2026-09-01T00:00:00.000Z' }]));
    const unwatch = watchEndToEndConversations(client, ledger);

    ledger.getState().learnEndToEnd('c-r');

    expect(ledger.getState().clearKnown['c-r']).toEqual(['p-c-r']);
    unwatch();
  });
});

/** Deuxième revue — la retenue est photographiée aussi, et la charge qui révèle l'e2ee n'entre jamais dans la photographie. */
describe('la photographie, deuxième revue', () => {
  test('une conversation RETENUE (chiffré sans mode) a sa photographie', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    const unwatch = watchEndToEndConversations(client, ledger);
    client.setQueryData(['conversations', 'c-h', 'messages'], thread([{ ...plainRow('c-h'), createdAt: '2026-09-01T00:00:00.000Z' }]));
    client.setQueryData(['conversations', 'c-h', 'messages'], thread([{ ...plainRow('c-h'), createdAt: '2026-09-01T00:00:00.000Z' }, noModeRow('c-h')]));

    expect(ledger.getState().clearKnown['c-h']).toEqual(['p-c-h']);
    unwatch();
  });

  test('les clairs de la charge même qui montre l’e2ee n’entrent pas dans la photographie (TOCTOU)', () => {
    const client = new QueryClient();
    const ledger = createEndToEndRegimeLedger({ storage: null });
    const unwatch = watchEndToEndConversations(client, ledger);
    client.setQueryData(conversationQueryKey('c-t'), row('c-t', null));
    client.setQueryData(['conversations', 'c-t', 'messages'], thread([{ ...plainRow('c-t'), id: 'vu-avant', createdAt: '2026-09-01T00:00:00.000Z' }]));

    client.setQueryData(['conversations', 'c-t', 'messages'], thread([
      { ...plainRow('c-t'), id: 'vu-avant', createdAt: '2026-09-01T00:00:00.000Z' },
      { ...plainRow('c-t'), id: 'forge-antidate', createdAt: '2026-09-02T00:00:00.000Z' },
      { ...sealedRow('c-t'), createdAt: '2026-10-01T00:00:00.000Z' },
    ]));

    expect(ledger.getState().sealed['c-t']).toBe(true);
    expect(ledger.getState().clearKnown['c-t']).toEqual(['vu-avant']);
    unwatch();
  });
});
