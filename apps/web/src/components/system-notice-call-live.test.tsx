import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { conversationActiveCallQueryKey } from '@/lib/api/call-sessions';
import { FIXTURE_ACTIVE_CALL_KEY, FIXTURE_LIVE_CALL_ID } from '@/lib/api/fixtures-calls';
import { messagesQueryKey } from '@/lib/api/messages';
import { appQueryClient } from '@/lib/api/query-client';
import type { CallNoticeTarget } from '@/lib/calls/call-notice';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { SystemRow } from '@/lib/view/message-badges';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SystemNotice } from './system-notice';

/**
 * #19778 — LA CARTE D'UN APPEL TERMINÉ N'OFFRE PLUS « REJOINDRE ». Sa copie
 * `call-live` pouvait survivre à l'appel (édition terminale manquée, fil relu du
 * cache) : toucher « Rejoindre » répondait « appel terminé ». La carte demande
 * désormais à la passerelle (`GET …/active-call`, le même sondage que la
 * pastille de l'en-tête) : « Rejoindre » si elle nomme CET appel, rien tant
 * qu'elle n'a pas répondu, et la carte d'un appel fini sinon.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const CONVERSATION = 'c-kwame';

const liveRow: SystemRow = { kind: 'call', callType: 'video', text: 'Appel vidéo en cours' };

const liveTarget = (callId: string): CallNoticeTarget => ({ conversationId: CONVERSATION, callId, media: 'video', live: true, transcript: false, recording: null });

const mounted: Root[] = [];

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
  appQueryClient.removeQueries({ queryKey: conversationActiveCallQueryKey(CONVERSATION) });
  appQueryClient.removeQueries({ queryKey: messagesQueryKey(CONVERSATION) });
  localStorage.removeItem(FIXTURE_ACTIVE_CALL_KEY);
  document.body.innerHTML = '';
});

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 30))));

const mount = async (target: CallNoticeTarget) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => root.render(<SystemNotice row={liveRow} timeString="12:40" surface="bubble" callTarget={target} language="fr" />));
  await settle();
  return {
    action: () => host.querySelector('[data-call-notice-action]')?.getAttribute('data-call-notice-action') ?? null,
    title: () => host.querySelector('[data-call-card-title]')?.textContent ?? '',
  };
};

describe('la carte « en cours » se confirme auprès de la passerelle (#19778)', () => {
  test('la passerelle nomme CET appel vivant : « Rejoindre »', async () => {
    localStorage.setItem(FIXTURE_ACTIVE_CALL_KEY, FIXTURE_LIVE_CALL_ID);
    const card = await mount(liveTarget(FIXTURE_LIVE_CALL_ID));
    expect(card.action()).toBe('join');
    expect(card.title()).toBe('Appel vidéo en cours');
  });

  test('la passerelle ne voit aucun appel : la carte est celle d’un appel fini, « Rappeler »', async () => {
    const card = await mount(liveTarget(FIXTURE_LIVE_CALL_ID));
    expect(card.action()).toBe('call-back');
    expect(card.title()).toBe('Appel terminé');
  });

  test('la passerelle voit un AUTRE appel : celui de cette carte est fini', async () => {
    localStorage.setItem(FIXTURE_ACTIVE_CALL_KEY, FIXTURE_LIVE_CALL_ID);
    const card = await mount(liveTarget('call-kwame-ended'));
    expect(card.action()).toBe('call-back');
  });

  test('avant toute réponse, la carte reste neutre : ni « Rejoindre » ni « Rappeler »', () => {
    const html = renderToStaticMarkup(<SystemNotice row={liveRow} timeString="12:40" surface="bubble" callTarget={liveTarget(FIXTURE_LIVE_CALL_ID)} language="fr" />);
    expect(html).not.toContain('data-call-notice-action');
    expect(html).toContain('Appel vidéo en cours');
  });

  test('un cache qui nomme cet appel sert « Rejoindre » sans attendre (cache d’abord)', () => {
    appQueryClient.setQueryData(conversationActiveCallQueryKey(CONVERSATION), { callId: FIXTURE_LIVE_CALL_ID, media: 'video' });
    const html = renderToStaticMarkup(<SystemNotice row={liveRow} timeString="12:40" surface="bubble" callTarget={liveTarget(FIXTURE_LIVE_CALL_ID)} language="fr" />);
    expect(html).toContain('data-call-notice-action="join"');
  });
});
