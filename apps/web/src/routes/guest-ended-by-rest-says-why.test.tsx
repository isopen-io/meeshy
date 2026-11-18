import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { GuestAccessEnd } from '@/lib/api/guest-access-end';
import { loadInviteCatalog } from '@/lib/i18n-invite-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { ChatJoinDeps } from './chat-join';

/**
 * UN INVITÉ SANS COMPTE DONT L'ACCÈS FINIT PAR LE REST APPREND POURQUOI (#10442, audit #19352, 4e tour).
 *
 * Gaston ouvre `/chat/mshy_lien`, rejoint sans compte et écrit. L'hôte le retire (410 `GUEST_ACCESS_REVOKED`) ou le
 * lien expire (403 `SHARE_LINK_EXPIRED`) ; la requête REST suivante le dit avant la relecture de la socket. Le
 * transport finit l'accès (`onTabGuestAccessEnded`) puis ramène l'invité à la page de son lien (`?ended=`). Cette page,
 * déjà chargée, se rend dans le rendu même de la navigation, une micro-tâche plus tard : si la session tient encore
 * l'invité, elle le prend pour un invité qui revient (`returning`) et le renvoie vers son fil, que la garde envoie à
 * la connexion — l'avis « Ton accès a été retiré » ne s'affiche jamais.
 *
 * Câblage de l'application : les rappels du transport de production (`currentCredential`, `currentIdentity`,
 * `onTabGuestAccessEnded`), le vrai `navigate`, le vrai magasin et la vraie page du lien. Seule la réponse de la
 * passerelle est injectée (`fetchImpl`) : le transport partagé capture `fetch` à son import, ce qu'un autre témoin a pu
 * faire avant celui-ci.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const LINK = 'mshy_lien';
const THREAD = '/c/c-1';
const GASTON = { participantId: 'p-1', nickname: 'Gaston', conversationId: 'c-1', link: LINK, mayWrite: true };

const ENDS: readonly { readonly end: GuestAccessEnd; readonly status: number; readonly body: Record<string, unknown> }[] = [
  { end: 'revoked', status: 410, body: { success: false, error: 'GUEST_ACCESS_REVOKED' } },
  { end: 'expired', status: 403, body: { success: false, error: 'This share link has expired', code: 'SHARE_LINK_EXPIRED' } },
];

type Wiring = {
  readonly client: typeof import('@/lib/api/client');
  readonly http: typeof import('@/lib/api/http');
  readonly session: typeof import('@/lib/api/session');
  readonly ended: typeof import('@/lib/api/guest-access-end');
  readonly router: typeof import('@/lib/router');
  readonly join: typeof import('./chat-join');
};

let wiring: Wiring | null = null;
const mounted: (() => void)[] = [];

beforeAll(async () => {
  ensureHappyDomRegistered({ url: `http://localhost${THREAD}` });
  await loadInviteCatalog('fr');
  wiring = {
    client: await import('@/lib/api/client'),
    http: await import('@/lib/api/http'),
    session: await import('@/lib/api/session'),
    ended: await import('@/lib/api/guest-access-end'),
    router: await import('@/lib/router'),
    join: await import('./chat-join'),
  };
});

afterEach(() => {
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  mounted.splice(0).forEach((unmount) => unmount());
  wiring?.session.sessionStore.getState().clearSession({ device: true });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

function wired(): Wiring {
  if (wiring === null) throw new Error('câblage non chargé');
  return wiring;
}

function recordingDeps(visits: string[]): ChatJoinDeps {
  const pending = new Promise<never>(() => undefined);
  return {
    load: () => pending,
    join: () => pending,
    joinGuest: () => pending,
    adoptGuest: () => undefined,
    adoptInterfaceLanguage: () => undefined,
    go: (url) => void visits.push(url),
    joined: () => undefined,
    expireSession: () => undefined,
    copyText: async () => 'copied',
    shareUrl: async () => 'partage',
    origin: () => 'http://localhost',
    now: () => new Date('2026-11-18T10:00:00.000Z'),
    handoff: () => ({ getItem: () => null, removeItem: () => undefined }),
    cachedCard: () => undefined,
    loadCard: async () => ({ ok: true, data: null }),
    leave: async () => ({ ok: true, data: null }),
    left: () => undefined,
  };
}

/** La page du lien, montée par la route `/chat/:link` dès que l'adresse y mène — son `?ended=` lu comme l'écran le lit. */
function mountLinkRoute(visits: string[]): HTMLElement {
  const { router, join, ended } = wired();
  const deps = recordingDeps(visits);
  function LinkRoute() {
    const onLinkPage = router.useIsCurrentPath(`/chat/${LINK}`);
    if (!onLinkPage) return null;
    return <join.ChatJoin link={LINK} ended={ended.guestAccessEndedOf(new URLSearchParams(window.location.search).get('ended'))} deps={deps} />;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  act(() => root.render(<LinkRoute />));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

function gatewaySaying(status: number, body: Record<string, unknown>): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

describe('un invité sans compte dont l’accès finit par le REST apprend pourquoi sur la page de son lien', () => {
  for (const { end, status, body } of ENDS) {
    test(`${status} ${end} : la page du lien dit pourquoi et ne le renvoie ni vers son fil ni vers la connexion`, async () => {
      const { client, http, session } = wired();
      window.history.replaceState(null, '', THREAD);
      session.sessionStore.getState().establishGuest({ sessionToken: `gst-${end}`, guest: GASTON });
      const visits: string[] = [];
      const page = mountLinkRoute(visits);
      const transport = http.createHttpTransport({
        base: '',
        credential: client.currentCredential,
        identity: client.currentIdentity,
        fetchImpl: gatewaySaying(status, body),
        timeoutMs: 0,
        onGuestAccessEnded: client.onTabGuestAccessEnded,
      });

      globals.IS_REACT_ACT_ENVIRONMENT = false;
      await transport.request({ method: 'GET', path: '/api/v1/conversations/c-1/messages' });
      await settle();

      expect(window.location.pathname + window.location.search).toBe(`/chat/${LINK}?ended=${end}`);
      expect(visits).toEqual([]);
      expect(page.querySelector('[data-guest-access-ended]')?.getAttribute('data-guest-access-ended')).toBe(end);
      expect(session.sessionStore.getState().session.status).toBe('anonymous');
      expect(session.sessionStore.getState().deviceSession().status).toBe('anonymous');
    });
  }
});
