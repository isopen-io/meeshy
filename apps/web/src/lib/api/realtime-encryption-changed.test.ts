import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { canSendPlaintext, createEndToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, findCachedConversation } from './conversations';
import { applyEncryptionChanged, isEncryptionChanged } from './realtime-encryption-changed';
import { applyEncryptionAnnounced } from './realtime-encryption-regime';
import type { Conversation } from './types';

/**
 * #12949 — LE WEB ÉCOUTE LA BASCULE (`conversation:encryption-changed`) POUR
 * FERMER, JAMAIS POUR ROUVRIR. Une activation du bout en bout ferme tout de
 * suite le cache et le registre du compte ; une bascule à `null` (que la
 * passerelle ne produit plus pour une conversation e2ee) ne rouvre rien de ce
 * qui a été vu chiffré de bout en bout.
 */
const conv = (encryptionMode: string | null): Conversation =>
  ({ id: 'c-a', type: 'direct', status: 'active', isActive: true, participants: [], createdAt: new Date(), updatedAt: new Date(), unreadCount: 0, encryptionMode }) as unknown as Conversation;

const seeded = (row: Conversation): QueryClient => {
  const client = new QueryClient();
  client.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [{ conversations: [row], pagination: { limit: 30, offset: 0, total: 1, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } }],
    pageParams: [undefined],
  });
  client.setQueryData(conversationQueryKey(row.id), row);
  return client;
};

const change = (mode: 'e2ee' | 'server' | null, epoch: number) => ({
  conversationId: 'c-a',
  isEncrypted: mode !== null,
  mode,
  epoch,
  changedByUserId: 'u-bob',
  changedAt: '2026-10-25T12:00:00.000Z',
});

describe('la forme de l’évènement de bascule', () => {
  test('conversation, époque entière et mode connu ou nul : rien d’autre', () => {
    expect(isEncryptionChanged(change('e2ee', 1))).toBe(true);
    expect(isEncryptionChanged(change(null, 2))).toBe(true);
    expect(isEncryptionChanged({ ...change(null, 2), epoch: '2' })).toBe(false);
    expect(isEncryptionChanged({ ...change(null, 2), conversationId: 7 })).toBe(false);
    expect(isEncryptionChanged({ ...change(null, 2), mode: 'clair' })).toBe(false);
    expect(isEncryptionChanged(null)).toBe(false);
  });
});

describe('ce que la bascule fait au cache et au registre', () => {
  test('une activation du bout en bout ferme la liste, le détail ET le registre du compte', () => {
    const client = seeded(conv(null));
    const ledger = createEndToEndRegimeLedger({ storage: null });

    applyEncryptionChanged(client, ledger, change('e2ee', 3));

    expect(findCachedConversation(client, 'c-a')?.encryptionMode).toBe('e2ee');
    expect(client.getQueryData<Conversation>(conversationQueryKey('c-a'))?.encryptionMode).toBe('e2ee');
    expect(canSendPlaintext({ conversationId: 'c-a' }, ledger.getState())).toBe(false);
  });

  test('une bascule à null sur une conversation vue e2ee ne rouvre RIEN, ni le cache, ni le registre', () => {
    const client = seeded(conv('e2ee'));
    const ledger = createEndToEndRegimeLedger({ storage: null });
    ledger.getState().learnEndToEnd('c-a');

    applyEncryptionChanged(client, ledger, change(null, 4));

    expect(findCachedConversation(client, 'c-a')?.encryptionMode).toBe('e2ee');
    expect(client.getQueryData<Conversation>(conversationQueryKey('c-a'))?.encryptionMode).toBe('e2ee');
    expect(canSendPlaintext({ conversationId: 'c-a' }, ledger.getState())).toBe(false);
  });

  test('le chiffrement au repos (server) se pose comme avant, sans fermer au clair', () => {
    const client = seeded(conv(null));
    const ledger = createEndToEndRegimeLedger({ storage: null });

    applyEncryptionChanged(client, ledger, change('server', 1));

    expect(findCachedConversation(client, 'c-a')?.encryptionMode).toBe('server');
    expect(canSendPlaintext({ conversationId: 'c-a' }, ledger.getState())).toBe(true);
  });
});

describe('l’avis d’activation reçu en temps réel apprend aussi le bout en bout au registre', () => {
  test('annoncé e2ee : le registre du compte ferme la conversation', () => {
    const client = seeded(conv(null));
    const ledger = createEndToEndRegimeLedger({ storage: null });

    applyEncryptionAnnounced(client, 'c-a', 'e2ee', ledger);

    expect(canSendPlaintext({ conversationId: 'c-a' }, ledger.getState())).toBe(false);
  });
});
