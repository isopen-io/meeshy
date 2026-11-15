import { describe, expect, test } from 'bun:test';

import { createHttpTransport } from './http';
import { loadSharedConversations, sharedConversationsQueryKey, SHARED_CONVERSATIONS_LIMIT } from './shared-conversations';

/**
 * **LES CONVERSATIONS EN COMMUN** (#7124) — miroir de
 * `ConversationService.listSharedWith` (`packages/MeeshySDK/Sources/MeeshySDK/
 * Services/ConversationService.swift:459`), que `UserProfileSheet` appelle
 * pour son onglet Conversations (`UserProfileSheet.swift:325`).
 *
 * `GET /api/v1/conversations?withUserId=<id>&limit=<n>` : la passerelle rend
 * les conversations dont le LECTEUR **et** le sujet sont tous deux membres
 * actifs (`routes/conversations/core-list.ts:193-210`). Aucun port de plus à
 * écrire côté serveur — le filtre existe depuis le premier jour d'iOS.
 */

const transportOf = (reply: { readonly status: number; readonly body: unknown }, calls: string[]) =>
  createHttpTransport({
    base: 'http://api.test',
    credential: () => null,
    fetchImpl: async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
    },
  });

const conversation = (id: string) => ({
  id,
  type: 'direct',
  isActive: true,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  participants: [],
});

describe('loadSharedConversations', () => {
  test('la question NOMME le sujet — jamais une page de liste qu’on filtrerait après coup', async () => {
    const calls: string[] = [];
    const result = await loadSharedConversations({
      source: 'gateway',
      transport: transportOf({ status: 200, body: { success: true, data: [conversation('c-1')] } }, calls),
      userId: 'u-kwame',
    });

    expect(result.ok).toBe(true);
    expect(calls[0]).toContain('withUserId=u-kwame');
    expect(calls[0]).toContain(`limit=${SHARED_CONVERSATIONS_LIMIT}`);
  });

  test('une charge illisible rend une liste VIDE, jamais une ligne inventée', async () => {
    const calls: string[] = [];
    const result = await loadSharedConversations({
      source: 'gateway',
      transport: transportOf({ status: 200, body: { success: true, data: [conversation('c-1'), { id: '' }] } }, calls),
      userId: 'u-kwame',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.map((c) => c.id)).toEqual(['c-1']);
  });

  test('un refus reste un refus — l’écran doit pouvoir le DIRE', async () => {
    const calls: string[] = [];
    const result = await loadSharedConversations({
      source: 'gateway',
      transport: transportOf({ status: 500, body: { success: false, error: 'panne' } }, calls),
      userId: 'u-kwame',
    });

    expect(result.ok).toBe(false);
  });
});

describe('sharedConversationsQueryKey', () => {
  test('elle est portée par le SUJET — deux fiches ne se recouvrent pas', () => {
    expect(sharedConversationsQueryKey('u-kwame')).not.toEqual(sharedConversationsQueryKey('u-amina'));
    expect(sharedConversationsQueryKey('u-kwame')).toEqual(sharedConversationsQueryKey('u-kwame'));
  });
});

describe('en fixtures', () => {
  test('les conversations rendues portent TOUTES le sujet, quel que soit leur type', async () => {
    const result = await loadSharedConversations({
      source: 'fixtures',
      transport: transportOf({ status: 200, body: {} }, []),
      userId: 'u-kwame',
    });

    expect(result.ok).toBe(true);
    const rows = result.ok ? result.data : [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((c) => c.participants.some((p) => p.userId === 'u-kwame'))).toBe(true);
  });

  test('quelqu’un avec qui rien n’est partagé rend une liste vide — un VIDE, pas un échec', async () => {
    const result = await loadSharedConversations({
      source: 'fixtures',
      transport: transportOf({ status: 200, body: {} }, []),
      userId: 'u-personne',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.data).toEqual([]);
  });
});
