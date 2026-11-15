import { describe, expect, test } from 'bun:test';

import { createHttpTransport, type Credential } from './http';

/**
 * UNE RÉPONSE PART À L'IDENTITÉ QUI L'A DEMANDÉE, JAMAIS À LA SUIVANTE (#8674).
 *
 * Le compte A demande sa liste ; pendant le trajet, l'appareil passe au compte
 * B. La réponse d'A arrive : si elle se résolvait, son `queryFn` l'écrirait
 * dans le cache désormais tenu par B, et le rollback d'une mutation d'A y
 * recopierait l'instantané d'A. Elle ne se résout donc JAMAIS — ni succès, ni
 * échec : rien de ce qui en dépend ne s'exécute sous B.
 */

type Session = { identity: string | null; credential: Credential | null };

function deferredFetch(response: { readonly status: number; readonly body?: unknown }) {
  const pending: Array<() => void> = [];
  const impl = ((_input: RequestInfo | URL, _init?: RequestInit) =>
    new Promise<Response>((resolve) => {
      pending.push(() =>
        resolve(new Response(response.body === undefined ? null : JSON.stringify(response.body), { status: response.status })),
      );
    })) as typeof fetch;
  return { impl, release: () => pending.splice(0).forEach((go) => go()) };
}

function transportFor(session: Session, fetchImpl: typeof fetch, onUnauthorized: () => void = () => undefined) {
  return createHttpTransport({
    base: '',
    fetchImpl,
    timeoutMs: 0,
    credential: () => session.credential,
    identity: () => session.identity,
    onUnauthorized,
  });
}

const settles = async (promise: Promise<unknown>): Promise<boolean> => {
  const marker = Symbol('pending');
  const outcome = await Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(marker), 20))]);
  return outcome !== marker;
};

describe('une requête en vol de A ne se résout pas sous B', () => {
  test('A → B pendant le trajet ⇒ la réponse d’A ne se résout jamais', async () => {
    const session: Session = { identity: 'u:a', credential: { kind: 'registered', token: 'jwt-a' } };
    const { impl, release } = deferredFetch({ status: 200, body: { success: true, data: { title: 'secret de A' } } });
    const request = transportFor(session, impl).request({ method: 'GET', path: '/api/v1/conversations' });

    session.identity = 'u:b';
    session.credential = { kind: 'registered', token: 'jwt-b' };
    release();

    expect(await settles(request)).toBe(false);
  });

  test('même identité, jeton renouvelé ⇒ la réponse est servie', async () => {
    const session: Session = { identity: 'u:a', credential: { kind: 'registered', token: 'jwt-a' } };
    const { impl, release } = deferredFetch({ status: 200, body: { success: true, data: { title: 'à moi' } } });
    const request = transportFor(session, impl).request<{ title: string }>({ method: 'GET', path: '/api/v1/conversations' });

    session.credential = { kind: 'registered', token: 'jwt-a-2' };
    release();

    const result = await request;
    expect(result.ok && result.data.title).toBe('à moi');
  });

  test('un 401 d’A arrivé sous B ne déconnecte PAS B', async () => {
    const session: Session = { identity: 'u:a', credential: { kind: 'registered', token: 'jwt-a' } };
    const { impl, release } = deferredFetch({ status: 401, body: { success: false, error: 'Invalid JWT token' } });
    let unauthorized = 0;
    const request = transportFor(session, impl, () => {
      unauthorized += 1;
    }).request({ method: 'GET', path: '/api/v1/conversations' });

    session.identity = 'u:b';
    session.credential = { kind: 'registered', token: 'jwt-b' };
    release();

    expect(await settles(request)).toBe(false);
    expect(unauthorized).toBe(0);
  });

  test('le 401 de l’identité COURANTE la déconnecte toujours', async () => {
    const session: Session = { identity: 'u:a', credential: { kind: 'registered', token: 'jwt-a' } };
    const { impl, release } = deferredFetch({ status: 401, body: { success: false, error: 'Invalid JWT token' } });
    let unauthorized = 0;
    const request = transportFor(session, impl, () => {
      unauthorized += 1;
    }).request({ method: 'GET', path: '/api/v1/conversations' });

    release();

    const result = await request;
    expect(result.ok).toBe(false);
    expect(unauthorized).toBe(1);
  });

  test('la déconnexion d’A (en-têtes explicites, magasin déjà vidé) ne déconnecte pas B connecté entre-temps', async () => {
    const session: Session = { identity: null, credential: null };
    const { impl, release } = deferredFetch({ status: 401, body: { success: false, error: 'Session expired' } });
    let unauthorized = 0;
    const request = transportFor(session, impl, () => {
      unauthorized += 1;
    }).request({ method: 'POST', path: '/api/v1/auth/logout', headers: { Authorization: 'Bearer jwt-a' } });

    session.identity = 'u:b';
    session.credential = { kind: 'registered', token: 'jwt-b' };
    release();

    await request;
    expect(unauthorized).toBe(0);
  });

  test('une requête SANS crédential (publique) reste servie après un changement d’identité', async () => {
    const session: Session = { identity: null, credential: null };
    const { impl, release } = deferredFetch({ status: 200, body: { success: true, data: { ok: true } } });
    const request = transportFor(session, impl).request<{ ok: boolean }>({ method: 'GET', path: '/api/v1/public' });

    session.identity = 'u:b';
    session.credential = { kind: 'registered', token: 'jwt-b' };
    release();

    const result = await request;
    expect(result.ok).toBe(true);
  });

  test('une panne réseau d’A arrivée sous B ne se résout pas non plus (aucun rollback d’A sous B)', async () => {
    const session: Session = { identity: 'u:a', credential: { kind: 'registered', token: 'jwt-a' } };
    const pending: Array<() => void> = [];
    const impl = (() =>
      new Promise<Response>((_resolve, reject) => {
        pending.push(() => reject(new TypeError('Failed to fetch')));
      })) as unknown as typeof fetch;
    const request = transportFor(session, impl).request({ method: 'POST', path: '/api/v1/conversations/c1/messages' });

    session.identity = 'u:b';
    session.credential = { kind: 'registered', token: 'jwt-b' };
    pending.splice(0).forEach((go) => go());

    expect(await settles(request)).toBe(false);
  });
});
