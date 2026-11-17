import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { createAccountCacheShelf, setDeviceFollower } from '@/lib/api/account-caches';
import { credentialFromSession } from '@/lib/api/client';
import { createHttpTransport, type ApiResult } from '@/lib/api/http';
import { createSessionStore, sessionIdentityKey, type SessionStorage, type SessionUser } from '@/lib/api/session';
import { followDeviceSession, watchDeviceSession } from '@/lib/api/session-follow';

import { createSendRun, type SendSheetPorts } from './send-sheet-run';
import type { SendPlanEntry } from './send-sheet-plan';

const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const ADA: SessionUser = { id: 'u-ada', username: 'ada' };
const BOB: SessionUser = { id: 'u-bob', username: 'bob' };

function fakeStorage(): SessionStorage {
  const raw = new Map<string, string>();
  return { getItem: (k) => raw.get(k) ?? null, setItem: (k, v) => void raw.set(k, v), removeItem: (k) => void raw.delete(k) };
}
type Listener = (event: { readonly key?: string | null }) => void;
function fakeWindow() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: (t: string, l: Listener) => void listeners.set(t, (listeners.get(t) ?? new Set()).add(l)),
    removeEventListener: (t: string, l: Listener) => void listeners.get(t)?.delete(l),
    dispatch: (t: string, e: { readonly key?: string | null } = {}) => listeners.get(t)?.forEach((l) => l(e)),
  };
}

describe('un envoi en plusieurs requêtes reste au compte qui l’a lancé (audit #19352, X1)', () => {
  beforeAll(() => setDeviceFollower(followDeviceSession));
  afterAll(() => setDeviceFollower(null));

  test('aucune requête de l’envoi d’Ada ne part avec le jeton de Bob', async () => {
    const storage = fakeStorage();
    const tabB = createSessionStore({ storage, now: () => NOW });
    tabB.getState().establish({ user: ADA, token: 'jwt-ada', sessionToken: 'sess-ada', expiresIn: 3600 });
    const windowB = fakeWindow();
    watchDeviceSession(tabB, { target: windowB, shelf: createAccountCacheShelf(storage) });

    const sent: Array<{ readonly path: string; readonly auth: string | undefined }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      sent.push({ path: url.replace('https://gate.test', ''), auth: headers.Authorization });
      const data = url.endsWith('/attachments') ? { attachmentIds: ['att-1'] } : { id: 'x-1' };
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    }) as unknown as typeof fetch;
    const transport = createHttpTransport({
      base: 'https://gate.test',
      credential: () => credentialFromSession(tabB.getState().session),
      identity: () => sessionIdentityKey(tabB.getState().session),
      fetchImpl,
      timeoutMs: 0,
    });
    const unused = async (): Promise<ApiResult<never>> => ({ ok: false, status: 0, error: 'non utilisé' });

    /* Le téléchargement du média (ou la préparation de la photo) prend un tour de boucle :
       pendant ce temps, dans l’onglet A, l’appareil passe à Bob. */
    const ports: SendSheetPorts = {
      online: () => true,
      openDirect: unused,
      openGroup: unused,
      forward: unused as unknown as SendSheetPorts['forward'],
      sendMessage: ({ conversationId, body }) => transport.request({ method: 'POST', path: `/conversations/${conversationId}/messages`, body }),
      uploadFiles: () => transport.request({ method: 'POST', path: '/attachments', body: {} }),
      fetchFile: () =>
        new Promise((resolve) =>
          setTimeout(() => {
            createSessionStore({ storage, now: () => NOW }).getState().establish({ user: BOB, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 });
            windowB.dispatch('storage', { key: 'meeshy.session' });
            resolve(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }));
          }, 0),
        ),
      uploadMedia: unused,
      publishMedia: unused,
      publishFromAttachment: unused,
      repost: unused,
      createTextPost: ({ type, content }) => transport.request({ method: 'POST', path: '/posts', body: { type, content } }),
      newClientMessageId: () => 'cm-1',
    };
    const entries: readonly SendPlanEntry[] = [
      { key: 'famille', target: { kind: 'conversation', conversationId: 'c-famille', label: 'Famille' }, steps: [{ kind: 'send-files', indexes: [0], content: 'La photo d’Ada' }] },
      { key: 'fil', target: { kind: 'publish', as: 'POST' }, steps: [{ kind: 'publish-text', format: 'POST', content: 'Le texte d’Ada' }] },
    ];

    await createSendRun({
      entries,
      payload: { kind: 'media', url: 'https://cdn.test/photo.jpg', mime: 'image/jpeg', name: 'photo.jpg', preview: { kind: 'image' } },
      language: 'fr',
      ports,
    }).start();

    expect(tabB.getState().session.status === 'authenticated' ? tabB.getState().session.user.id : null).toBe('u-bob');
    expect(sent).toEqual(sent.filter((request) => request.auth === 'Bearer jwt-ada'));
  });
});
