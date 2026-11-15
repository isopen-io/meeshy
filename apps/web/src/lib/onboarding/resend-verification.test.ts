import { describe, expect, test } from 'bun:test';

import type { HttpRequest } from '@/lib/api/http';
import { scriptedTransport } from '@/test-support/scripted-transport';

import { resendOwnVerification } from './resend-verification';

/**
 * RENVOYER LE LIEN DE VÉRIFICATION DEPUIS L'ONBOARDING (#7907) — par les deux
 * routes EXISTANTES : `GET /me` rend l'adresse du compte (la session ne la
 * garde pas, par construction), `POST /auth/resend-verification` l'envoie.
 * L'adresse traverse la fonction et n'est retenue nulle part.
 */

function gateway(me: { ok: boolean; data?: unknown }, resend: { ok: boolean }) {
  const { transport } = scriptedTransport({});
  const requests: HttpRequest[] = [];
  transport.request = (async (request: HttpRequest) => {
    requests.push(request);
    if (request.method === 'GET') return me.ok ? { ok: true, data: me.data } : { ok: false, status: 500, error: 'down' };
    return resend.ok ? { ok: true, data: { message: 'ok' } } : { ok: false, status: 429, error: 'trop' };
  }) as typeof transport.request;
  return { transport, requests };
}

describe('resendOwnVerification', () => {
  test('lit l’adresse du compte puis renvoie le lien à cette adresse', async () => {
    const { transport, requests } = gateway({ ok: true, data: { user: { id: 'u1', email: 'maya@example.com' } } }, { ok: true });
    expect(await resendOwnVerification(transport)).toBe(true);
    expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual(['GET /api/v1/me', 'POST /api/v1/auth/resend-verification']);
    expect(requests[1]?.body).toEqual({ email: 'maya@example.com' });
  });

  test('le profil illisible ou sans adresse : rien n’est envoyé', async () => {
    const noEmail = gateway({ ok: true, data: { user: { id: 'u1' } } }, { ok: true });
    expect(await resendOwnVerification(noEmail.transport)).toBe(false);
    expect(noEmail.requests).toHaveLength(1);
    const down = gateway({ ok: false }, { ok: true });
    expect(await resendOwnVerification(down.transport)).toBe(false);
  });

  test('le renvoi refusé (débit, panne) : échec dit', async () => {
    const { transport } = gateway({ ok: true, data: { user: { email: 'maya@example.com' } } }, { ok: false });
    expect(await resendOwnVerification(transport)).toBe(false);
  });
});
