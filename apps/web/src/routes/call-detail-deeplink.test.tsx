import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { callSessionQueryKey, type CallSession } from '@/lib/api/call-sessions';
import { appQueryClient } from '@/lib/api/query-client';
import { callActions } from '@/lib/calls/call-actions';
import type { JoinCallRequest } from '@/lib/calls/engine';
import { createRouter } from '@/lib/router';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * `/call/<id d'un appel VIVANT>` — UNE ADRESSE NE REJOINT PAS SANS GESTE (#18907, web-systeme-1).
 * Qui partage une conversation avec un appel en cours peut forger ce lien : l'ouvrir ne doit
 * jamais acquérir caméra et micro ni émettre `call:join`. La page DEMANDE « Rejoindre l'appel
 * avec … » ; seul le toucher « Rejoindre » rejoint, « Annuler » ramène au journal sans rien émettre.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 40; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  });
};

const liveSession = (callId: string): CallSession => ({
  callId,
  conversationId: 'c-shared',
  media: 'video',
  live: true,
  initiatorId: 'u-caller',
  answered: false,
  startedAt: new Date().toISOString(),
  durationSec: 0,
  reactionCounts: {},
  participants: [{ userId: 'u-caller', name: 'Kwame Mensah', avatar: null }],
});

type Opened = { readonly joined: readonly JoinCallRequest[]; readonly container: HTMLElement; readonly close: () => void };

const openDeepLink = async (callId: string): Promise<Opened> => {
  const joined: JoinCallRequest[] = [];
  const original = callActions.join;
  callActions.join = (request) => void joined.push(request);
  appQueryClient.setQueryData(callSessionQueryKey(callId), liveSession(callId));
  const { Router, navigate: go } = createRouter({ call: { pattern: '/call/$callId', screen: () => import('@/routes/call-detail') } }, () => null);
  act(() => go(`/call/${callId}`, true));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => root.render(<Router wrap={(screen) => screen} skeleton={null} />));
  await settle();
  return {
    joined,
    container,
    close: () => {
      act(() => root.unmount());
      container.remove();
      callActions.join = original;
      appQueryClient.removeQueries({ queryKey: callSessionQueryKey(callId) });
    },
  };
};

const tap = (container: HTMLElement, action: 'join' | 'cancel') => {
  const button = container.querySelector<HTMLButtonElement>(`[data-call-join-prompt-action="${action}"]`);
  if (button === null) throw new Error(`aucun bouton « ${action} »`);
  act(() => button.click());
};

describe('/call/<appel vivant> ouvert depuis un lien', () => {
  test('sans geste, l’appel n’est pas rejoint : la page demande « Rejoindre l’appel avec Kwame Mensah »', async () => {
    const opened = await openDeepLink('call-forged');
    try {
      expect(opened.joined).toEqual([]);
      const prompt = opened.container.querySelector('[data-call-join-prompt]');
      expect(prompt?.getAttribute('aria-label')).toBe('Rejoindre l’appel avec Kwame Mensah');
      expect(location.pathname).toBe('/call/call-forged');
    } finally {
      opened.close();
    }
  });

  test('le toucher « Rejoindre » rejoint cet appel, une fois, et ouvre le fil de sa conversation', async () => {
    const opened = await openDeepLink('call-tapped');
    try {
      tap(opened.container, 'join');
      expect(opened.joined.map((request) => [request.callId, request.conversationId, request.media])).toEqual([['call-tapped', 'c-shared', 'video']]);
      expect(location.pathname).toBe('/c/c-shared');
    } finally {
      opened.close();
    }
  });

  test('« Annuler » ne rejoint rien et ramène au journal des appels', async () => {
    const opened = await openDeepLink('call-declined');
    try {
      tap(opened.container, 'cancel');
      expect(opened.joined).toEqual([]);
      expect(location.pathname).toBe('/calls');
    } finally {
      opened.close();
    }
  });
});
