import { describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';
import type { LocalMessage } from '@/lib/send/local-message';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { createWriteRestrictionStore, dropGlobalRefusals, servedWriteRestriction, writeRestrictionOf } from './write-restriction';

/**
 * LA RESTRICTION D'ÉCRITURE (#9928) — calculée par la passerelle
 * (`viewerWriteRestriction`, #9927), apprise par un refus `GLOBAL_ADULTS_ONLY`
 * quand l'état du client est périmé.
 */

const conversation = (extra: Record<string, unknown> = {}): Conversation =>
  ({
    id: 'c-global',
    identifier: 'meeshy',
    type: 'global',
    status: 'active',
    visibility: 'public',
    isActive: true,
    memberCount: 1000,
    participants: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...extra,
  }) as Conversation;

const message = (clientMessageId: string): LocalMessage =>
  ({ id: clientMessageId, clientMessageId, conversationId: 'c-global', content: 'salut' }) as unknown as LocalMessage;

describe('servedWriteRestriction — ce que la passerelle a calculé', () => {
  test('« minor-global » se lit ; null, absent ou inconnu ne restreignent rien', () => {
    expect(servedWriteRestriction(conversation({ viewerWriteRestriction: 'minor-global' }))).toBe('minor-global');
    expect(servedWriteRestriction(conversation({ viewerWriteRestriction: null }))).toBeNull();
    expect(servedWriteRestriction(conversation())).toBeNull();
    expect(servedWriteRestriction(conversation({ viewerWriteRestriction: 'autre' }))).toBeNull();
    expect(servedWriteRestriction(undefined)).toBeNull();
  });
});

describe('writeRestrictionOf — le servi, ou ce qu’un refus a appris pendant la session', () => {
  test('un refus appris verrouille la conversation même si le cache dit encore rien', () => {
    const store = createWriteRestrictionStore();
    expect(writeRestrictionOf(conversation(), store.getState().learned)).toBeNull();
    store.getState().learn('c-global');
    expect(writeRestrictionOf(conversation(), store.getState().learned)).toBe('minor-global');
    expect(writeRestrictionOf(conversation({ id: 'c-autre' }), store.getState().learned)).toBeNull();
  });
});

describe('dropGlobalRefusals — le message optimiste refusé quitte le fil', () => {
  test('seules les entrées refusées par GLOBAL_ADULTS_ONLY partent, sans compter de confirmation', () => {
    const outbox = createOutboxStore();
    const entry = (id: string) => ({ message: message(id), delivery: 'pending' as const, attempts: 1, startedAt: 0 });
    outbox.getState().enqueue('c-global', entry('m1'));
    outbox.getState().enqueue('c-global', entry('m2'));
    outbox.getState().markFailed('c-global', 'm1', { ok: false, status: 403, error: 'adultes', code: 'GLOBAL_ADULTS_ONLY' });
    outbox.getState().markFailed('c-global', 'm2', { ok: false, status: 503, error: 'indisponible' });

    expect(dropGlobalRefusals(outbox, 'c-global')).toBe(1);
    expect(outbox.getState().entries['c-global']?.map((e) => e.message.clientMessageId)).toEqual(['m2']);
    expect(outbox.getState().confirmed['c-global']).toBeUndefined();
    expect(dropGlobalRefusals(outbox, 'c-global')).toBe(0);
  });
});
