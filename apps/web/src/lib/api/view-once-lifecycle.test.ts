import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { resolveEphemeralDeadline } from '@/lib/view/ephemeral-reception';
import { messageMenuContextOf, messageMenuItems } from '@/lib/view/message-actions';
import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { createHttpTransport } from './http';
import { loadMessages, messagesQueryKey } from './messages';
import { applyMessageExpired } from './realtime-ephemeral';
import type { Message } from './types';

/**
 * LE CYCLE DE VIE D'UNE VUE UNIQUE « DÉJÀ OUVERTE » (#7580, règles porteur du
 * 2026-09-23) — ce que les témoins de la rangée ne voient pas : ce que le
 * CACHE garde, ce que le SERVEUR peut encore envoyer, et ce que le MENU offre.
 *
 * « (1) · Déjà ouvert est PERMANENT » : ni le balayage serveur, ni un
 * rechargement ne retirent la bulle ; seul l'éphémère part à son échéance.
 * « Après l'ouverture, le contenu est PURGÉ ».
 */
const viewOnce = (partial: Partial<Message> = {}): Message =>
  localMessage({ id: 'm-vu', conversationId: 'c-a', isViewOnce: true, viewOnceCount: 0, content: 'SECRET-VU', ...partial });

describe('la destruction serveur ne retire pas une vue unique « déjà ouverte »', () => {
  test('message:expired sur une vue unique NON éphémère : la bulle reste, purgée', () => {
    const client = new QueryClient();
    client.setQueryData(messagesQueryKey('c-a'), threadPages([viewOnce()]));
    const scheduled: (() => void)[] = [];

    applyMessageExpired(client, { messageId: 'm-vu', conversationId: 'c-a' }, (fn) => {
      scheduled.push(fn);
    });
    for (const fn of scheduled) fn();

    const row = threadOf(client, 'c-a')?.messages.find((m) => m.id === 'm-vu');
    expect(row).toBeDefined();
    expect(row?.consumedByMe).toBe(true);
    expect(row?.content).toBe('');
  });

  test('message:expired sur une vue unique AUSSI éphémère : elle part avec l’éphémère', () => {
    const client = new QueryClient();
    client.setQueryData(messagesQueryKey('c-a'), threadPages([viewOnce({ ephemeralDuration: 60 })]));
    const scheduled: (() => void)[] = [];

    applyMessageExpired(client, { messageId: 'm-vu', conversationId: 'c-a' }, (fn) => {
      scheduled.push(fn);
    });
    for (const fn of scheduled) fn();

    expect(threadOf(client, 'c-a')?.messages.some((m) => m.id === 'm-vu')).toBe(false);
  });

  test('l’échéance de destruction serveur n’est jamais un décompte montré au lecteur', () => {
    const deadline = resolveEphemeralDeadline({
      message: viewOnce({ expiresAt: new Date(Date.now() + 30_000) }),
      isMine: false,
      now: Date.now(),
    });
    expect(deadline).toEqual({ state: 'none' });
  });
});

describe('une page qui arrive déjà ouverte par moi est purgée avant le cache', () => {
  const served = (message: Message) =>
    createHttpTransport({
      base: '',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ success: true, data: [message] }), { status: 200 })) as typeof fetch,
    });

  test('consumedByMe: true (#7578) — ni texte ni pièce, même si la passerelle les sert encore', async () => {
    const result = await loadMessages({
      source: 'gateway',
      transport: served(viewOnce({ consumedByMe: true })),
      conversationId: 'c-a',
    });
    expect(result.ok).toBe(true);
    const row = result.ok ? result.data.messages[0] : undefined;
    expect(row?.content).toBe('');
    expect(row?.consumedByMe).toBe(true);
  });

  test('consumedByMe: false — encore à ouvrir chez moi, le contenu arrive intact', async () => {
    const result = await loadMessages({
      source: 'gateway',
      transport: served(viewOnce({ consumedByMe: false, viewOnceCount: 1 })),
      conversationId: 'c-a',
    });
    const row = result.ok ? result.data.messages[0] : undefined;
    expect(row?.content).toBe('SECRET-VU');
  });
});

describe('le menu d’une vue unique ne touche pas à son contenu', () => {
  test('ouverte ou non : « Plus… » (Infos) seul — ni copier, ni traduire, ni transférer, ni répondre', () => {
    for (const message of [viewOnce(), viewOnce({ consumedByMe: true, content: '' })]) {
      const items = messageMenuItems(messageMenuContextOf(message, { now: Date.now() }));
      expect(items.map((item) => item.id)).toEqual(['more']);
    }
  });
});
