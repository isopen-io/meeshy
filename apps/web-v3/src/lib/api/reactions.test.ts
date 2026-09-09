import { QueryClient } from '@tanstack/react-query';
import { MAX_REACTIONS_PER_OBJECT, REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';
import { beforeEach, describe, expect, test } from 'bun:test';

import { resetFixtureReactionsForTests } from './fixtures-reactions';
import { reactionStore } from './reaction-store';
import { messagesQueryKey } from './messages';
import {
  applyReactionDelta,
  performReaction,
  reactionOutcome,
  toggleReactionPlan,
  REACTION_PENDING_MESSAGE,
  type PerformReactionDeps,
} from './reactions';
import type { ApiResult, HttpTransport } from './http';
import type { Message } from './types';

beforeEach(() => {
  resetFixtureReactionsForTests();
  reactionStore.setState({ mine: {} });
});

const message = (overrides: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    conversationId: 'c1',
    senderId: 'u1',
    content: 'salut',
    reactionSummary: {},
    ...overrides,
  }) as unknown as Message;

describe('applyReactionDelta — immuable, +1 crée la clé, −1 la retire à 0', () => {
  test('+1 sur un message SANS l’emoji crée l’entrée', () => {
    const result = applyReactionDelta([message()], { messageId: 'm1', emoji: '👍', delta: 1 });
    expect(result[0]?.reactionSummary).toEqual({ '👍': 1 });
  });

  test('−1 retire la clé quand le compte tombe à 0', () => {
    const result = applyReactionDelta([message({ reactionSummary: { '👍': 1 } })], {
      messageId: 'm1',
      emoji: '👍',
      delta: -1,
    });
    expect(result[0]?.reactionSummary).toEqual({});
  });

  test('les AUTRES messages restent `toBe`-identiques (zéro re-rendu)', () => {
    const other = message({ id: 'm2' });
    const messages = [message(), other];
    const result = applyReactionDelta(messages, { messageId: 'm1', emoji: '👍', delta: 1 });
    expect(result[1]).toBe(other);
    expect(result[0]).not.toBe(messages[0]);
  });
});

describe('toggleReactionPlan — add / remove / refused (plafond partagé)', () => {
  test('emoji absent de « mien » ⇒ add', () => {
    expect(toggleReactionPlan({ mine: [], emoji: '👍' })).toBe('add');
  });

  test('emoji déjà « mien » ⇒ remove', () => {
    expect(toggleReactionPlan({ mine: ['👍'], emoji: '👍' })).toBe('remove');
  });

  test(`le ${MAX_REACTIONS_PER_OBJECT + 1}ᵉ emoji DIFFÉRENT ⇒ refused (isReactionAllowed de @meeshy/shared)`, () => {
    const mine = Array.from({ length: MAX_REACTIONS_PER_OBJECT }, (_, i) => `e${i}`);
    expect(toggleReactionPlan({ mine, emoji: 'over' })).toBe('refused');
  });
});

describe('reactionOutcome — 201 confirmed, 200 unchanged, 4xx rolledBack, réseau/5xx kept', () => {
  test('201 ⇒ confirmed', () => {
    expect(reactionOutcome({ ok: true, data: {}, status: 201 })).toBe('confirmed');
  });
  test('200 ⇒ unchanged', () => {
    expect(reactionOutcome({ ok: true, data: {}, status: 200 })).toBe('unchanged');
  });
  test('409 ⇒ rolledBack', () => {
    expect(reactionOutcome({ ok: false, status: 409, error: 'x' })).toBe('rolledBack');
  });
  test('0 (réseau) ⇒ kept', () => {
    expect(reactionOutcome({ ok: false, status: 0, error: 'x' })).toBe('kept');
  });
  test('500 ⇒ kept (transitoire)', () => {
    expect(reactionOutcome({ ok: false, status: 500, error: 'x' })).toBe('kept');
  });
});

describe('performReaction — plan → optimiste → appel → issue (source fixtures)', () => {
  const depsOf = (queryClient: QueryClient): PerformReactionDeps => ({
    source: 'fixtures',
    transport: {} as HttpTransport,
    queryClient,
  });

  test('réaction optimiste IMMÉDIATE, avant tout `await` — capsule +1', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(messagesQueryKey('c1'), { messages: [message()], hasOlder: false });
    const promise = performReaction({ conversationId: 'c1', messageId: 'm1', emoji: '👍', deps: depsOf(queryClient) });
    // Synchronement après l'appel (avant la résolution de la promesse), le
    // cache porte déjà le +1 — c'est l'optimiste que T15/G1 vérifient.
    const page = queryClient.getQueryData<{ messages: readonly Message[] }>(messagesQueryKey('c1'));
    expect(page?.messages[0]?.reactionSummary).toEqual({ '👍': 1 });
    await promise;
  });

  test('confirmé (201) : le magasin « mien » retient l’emoji, le compte tient à 1', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(messagesQueryKey('c1'), { messages: [message()], hasOlder: false });
    const result = await performReaction({ conversationId: 'c1', messageId: 'm1', emoji: '👍', deps: depsOf(queryClient) });
    expect(result.ok).toBe(true);
    expect(reactionStore.getState().mine.m1).toEqual(['👍']);
    const page = queryClient.getQueryData<{ messages: readonly Message[] }>(messagesQueryKey('c1'));
    expect(page?.messages[0]?.reactionSummary).toEqual({ '👍': 1 });
  });

  test('un second appel sur le MÊME emoji RETIRE (toggle)', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(messagesQueryKey('c1'), { messages: [message()], hasOlder: false });
    await performReaction({ conversationId: 'c1', messageId: 'm1', emoji: '👍', deps: depsOf(queryClient) });
    await performReaction({ conversationId: 'c1', messageId: 'm1', emoji: '👍', deps: depsOf(queryClient) });
    expect(reactionStore.getState().mine.m1 ?? []).toEqual([]);
    const page = queryClient.getQueryData<{ messages: readonly Message[] }>(messagesQueryKey('c1'));
    expect(page?.messages[0]?.reactionSummary).toEqual({});
  });

  test('refusé au plafond : AUCUNE écriture optimiste, message du dépôt partagé', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(messagesQueryKey('c1'), { messages: [message()], hasOlder: false });
    reactionStore.setState({ mine: { m1: Array.from({ length: MAX_REACTIONS_PER_OBJECT }, (_, i) => `e${i}`) } });
    const result = await performReaction({ conversationId: 'c1', messageId: 'm1', emoji: 'over', deps: depsOf(queryClient) });
    expect(result).toEqual({ ok: false, message: REACTION_LIMIT_REACHED_MESSAGE });
    const page = queryClient.getQueryData<{ messages: readonly Message[] }>(messagesQueryKey('c1'));
    expect(page?.messages[0]?.reactionSummary).toEqual({});
  });
});

/**
 * UNE RÉACTION POSÉE HORS LIGNE EST ANNONCÉE, JAMAIS AVALÉE (revue #5814,
 * défaut majeur 3) — avant ce correctif, une panne réseau (le `catch`) ou un
 * 5xx retryable (`kept`) rendaient `{ ok: true }` STRICTEMENT identique à une
 * confirmation : l'optimiste restait affiché SANS AUCUN indice que la
 * réaction n'avait pas atteint la passerelle. `notice` porte cette
 * différence — le SEUL champ qui change, l'optimiste (compte + « mien »)
 * reste posé dans les DEUX cas (`kept`, D-26 F4, jamais réécrit ici).
 */
describe('performReaction — une réaction hors ligne est ANNONCÉE (revue #5814, défaut majeur 3)', () => {
  const gatewayDepsOf = (queryClient: QueryClient, transport: HttpTransport): PerformReactionDeps => ({
    source: 'gateway',
    transport,
    queryClient,
  });

  test('panne réseau (`transport.request` qui REJETTE) ⇒ `{ ok: true, notice }`, l’optimiste RESTE posé', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(messagesQueryKey('c1'), { messages: [message()], hasOlder: false });
    const transport = { request: () => Promise.reject(new Error('offline')) } as unknown as HttpTransport;

    const result = await performReaction({ conversationId: 'c1', messageId: 'm1', emoji: '👍', deps: gatewayDepsOf(queryClient, transport) });

    expect(result).toEqual({ ok: true, notice: REACTION_PENDING_MESSAGE });
    expect(reactionStore.getState().mine.m1).toEqual(['👍']);
    const page = queryClient.getQueryData<{ messages: readonly Message[] }>(messagesQueryKey('c1'));
    expect(page?.messages[0]?.reactionSummary).toEqual({ '👍': 1 });
  });

  test('5xx retryable (`kept`, sans lever) ⇒ `{ ok: true, notice }` — MÊME annonce que la panne réseau', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(messagesQueryKey('c1'), { messages: [message()], hasOlder: false });
    const transport = {
      request: () => Promise.resolve<ApiResult<unknown>>({ ok: false, status: 503, error: 'indisponible' }),
    } as unknown as HttpTransport;

    const result = await performReaction({ conversationId: 'c1', messageId: 'm1', emoji: '👍', deps: gatewayDepsOf(queryClient, transport) });

    expect(result).toEqual({ ok: true, notice: REACTION_PENDING_MESSAGE });
  });

  test('confirmé (201) ⇒ AUCUN `notice` — le succès reste silencieux', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(messagesQueryKey('c1'), { messages: [message()], hasOlder: false });
    const transport = {
      request: () => Promise.resolve<ApiResult<unknown>>({ ok: true, data: {}, status: 201 }),
    } as unknown as HttpTransport;

    const result = await performReaction({ conversationId: 'c1', messageId: 'm1', emoji: '👍', deps: gatewayDepsOf(queryClient, transport) });

    expect(result).toEqual({ ok: true });
  });
});

/**
 * LE FANTÔME NE REVIENT PAS (revue-correction #5814, défaut majeur 1) —
 * `reactionStore.mine` survit désormais au rechargement (correctif 5) : une
 * réaction posée hors ligne, jamais confirmée, laisse « mien » posé alors
 * que le serveur ne l'a jamais comptée. Au tap suivant (retrait), le DELETE
 * rend 404 — la passerelle dit qu'elle n'existe pas. Sans ce correctif,
 * `outcomeOf` classe 404 `permanent` ⇒ `rolledBack` ⇒ le rollack RESTAURE le
 * `+1` et repose « mien » : le retrait est INERTE (loi 4), le fantôme
 * increvable.
 */
describe('performReaction — un retrait refusé en 404 RÉCONCILIE au lieu de restaurer (revue-correction #5814, défaut majeur 1)', () => {
  const gatewayDepsOf = (queryClient: QueryClient, transport: HttpTransport): PerformReactionDeps => ({
    source: 'gateway',
    transport,
    queryClient,
  });

  test('emoji « mien » (fantôme d’une réaction jamais confirmée) : le retrait rend `{ ok: true }`, sans restauration', async () => {
    const queryClient = new QueryClient();
    // Le fantôme : le compte serveur ne porte PAS l'emoji (jamais confirmé),
    // mais `reactionStore.mine` le croit posé (persisté par le correctif 5).
    queryClient.setQueryData(messagesQueryKey('c1'), { messages: [message({ reactionSummary: {} })], hasOlder: false });
    reactionStore.setState({ mine: { m1: ['👍'] } });
    const transport = {
      request: () => Promise.resolve<ApiResult<unknown>>({ ok: false, status: 404, error: 'not found' }),
    } as unknown as HttpTransport;

    const result = await performReaction({ conversationId: 'c1', messageId: 'm1', emoji: '👍', deps: gatewayDepsOf(queryClient, transport) });

    expect(result).toEqual({ ok: true });
    // « mien » reste RETIRÉ — pas re-posé par un rollback.
    expect(reactionStore.getState().mine.m1 ?? []).toEqual([]);
    // Le compte SERVEUR (déjà à 0 après l'optimiste) n'est pas re-gonflé.
    const page = queryClient.getQueryData<{ messages: readonly Message[] }>(messagesQueryKey('c1'));
    expect(page?.messages[0]?.reactionSummary).toEqual({});
  });

  test('un SECOND tap après la réconciliation n’ajoute plus de fantôme (le retrait n’est plus inerte)', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(messagesQueryKey('c1'), { messages: [message({ reactionSummary: {} })], hasOlder: false });
    reactionStore.setState({ mine: { m1: ['👍'] } });
    const transport = {
      request: () => Promise.resolve<ApiResult<unknown>>({ ok: false, status: 404, error: 'not found' }),
    } as unknown as HttpTransport;

    await performReaction({ conversationId: 'c1', messageId: 'm1', emoji: '👍', deps: gatewayDepsOf(queryClient, transport) });
    // Après réconciliation, « mien » est vide ⇒ le plan repasse à `add` :
    // un tap suivant relance une addition normale, plus un retrait fantôme.
    expect(reactionStore.getState().mine.m1 ?? []).toEqual([]);
  });

  test('un retrait refusé en 409 (vrai conflit, pas 404) reste `rolledBack` — restauration inchangée', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(messagesQueryKey('c1'), { messages: [message({ reactionSummary: { '👍': 1 } })], hasOlder: false });
    reactionStore.setState({ mine: { m1: ['👍'] } });
    const transport = {
      request: () => Promise.resolve<ApiResult<unknown>>({ ok: false, status: 409, error: 'conflit' }),
    } as unknown as HttpTransport;

    const result = await performReaction({ conversationId: 'c1', messageId: 'm1', emoji: '👍', deps: gatewayDepsOf(queryClient, transport) });

    expect(result).toEqual({ ok: false, message: 'Réaction impossible' });
    // Restauration NORMALE — la garde 404 ne s'applique pas à un 409.
    expect(reactionStore.getState().mine.m1).toEqual(['👍']);
    const page = queryClient.getQueryData<{ messages: readonly Message[] }>(messagesQueryKey('c1'));
    expect(page?.messages[0]?.reactionSummary).toEqual({ '👍': 1 });
  });

  test('un AJOUT refusé en 404 (cas théorique) reste `rolledBack` — la garde ne vise que `remove`', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(messagesQueryKey('c1'), { messages: [message()], hasOlder: false });
    const transport = {
      request: () => Promise.resolve<ApiResult<unknown>>({ ok: false, status: 404, error: 'not found' }),
    } as unknown as HttpTransport;

    const result = await performReaction({ conversationId: 'c1', messageId: 'm1', emoji: '👍', deps: gatewayDepsOf(queryClient, transport) });

    expect(result).toEqual({ ok: false, message: 'Réaction impossible' });
    expect(reactionStore.getState().mine.m1 ?? []).toEqual([]);
  });
});

describe('REACTION_PENDING_MESSAGE — ne promet plus un rejeu que le code ne fait pas (revue-correction #5814, défaut majeur 1)', () => {
  test('le libellé ne mentionne aucune reconnexion ni renvoi', () => {
    expect(REACTION_PENDING_MESSAGE).not.toMatch(/reconnexion|renvoy/i);
    expect(REACTION_PENDING_MESSAGE).toBe('Réaction non confirmée — hors ligne');
  });
});
