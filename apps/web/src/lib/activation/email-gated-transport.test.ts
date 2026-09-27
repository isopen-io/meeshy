import { describe, expect, test } from 'bun:test';

import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';
import * as invitationsEndpoints from '@meeshy/shared/api/endpoints/invitations';
import * as linksEndpoints from '@meeshy/shared/api/endpoints/links';
import * as postsEndpoints from '@meeshy/shared/api/endpoints/posts';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';

import type { EmailGateReason } from './email-gate';
import { emailGateReasonOf, withEmailGate } from './email-gated-transport';

/**
 * **UN REFUS `EMAIL_NOT_VERIFIED` MÈNE À LA VALIDATION, PUIS L'ACTION REPART**
 * (#8365). La garde serveur (#6437) reste : `POST /posts`,
 * `/posts/from-attachment`, `/invitations/email`, `/links`,
 * `/conversations/:id/new-link`. Le transport, seul site par lequel ces cinq
 * routes passent, ouvre la validation et REJOUE la requête refusée — même
 * corps, donc rien du brouillon n'est perdu.
 */

const REFUSED: ApiResult<never> = { ok: false, status: 403, error: 'Email verification required', code: 'EMAIL_NOT_VERIFIED' };
const CREATED: ApiResult<unknown> = { ok: true, data: { id: 'p-1' } };

function fakeTransport(responses: readonly ApiResult<unknown>[]) {
  const sent: HttpRequest[] = [];
  const queue = [...responses];
  const request = async <T,>(sentRequest: HttpRequest): Promise<ApiResult<T>> => {
    sent.push(sentRequest);
    return (queue.shift() ?? CREATED) as ApiResult<T>;
  };
  const transport = Object.assign((r: HttpRequest) => request(r), { request }) as HttpTransport;
  return { transport, sent };
}

function fakeGate(answer: boolean) {
  const asked: EmailGateReason[] = [];
  return {
    asked,
    ask: async (reason: EmailGateReason) => {
      asked.push(reason);
      return answer;
    },
  };
}

const post = (body: unknown): HttpRequest => ({ method: 'POST', path: postsEndpoints.root, body });

const GUARDED: readonly (readonly [HttpRequest, EmailGateReason])[] = [
  [post({ type: 'POST' }), 'publish'],
  [{ method: 'POST', path: postsEndpoints.fromAttachment }, 'publish'],
  [{ method: 'POST', path: invitationsEndpoints.email }, 'invite'],
  [{ method: 'POST', path: linksEndpoints.root }, 'link'],
  [{ method: 'POST', path: conversationsEndpoints.byIdNewLink('c-1') }, 'link'],
];

const UNGUARDED: readonly HttpRequest[] = [
  { method: 'GET', path: postsEndpoints.root },
  { method: 'POST', path: postsEndpoints.byPostIdLike('p-1') },
  { method: 'PATCH', path: linksEndpoints.byLinkId('l-1') },
  { method: 'POST', path: `${linksEndpoints.root}/extra` },
];

describe('emailGateReasonOf — les cinq routes gardées, et elles seules', () => {
  for (const [request, reason] of GUARDED) {
    test(`${request.method} ${request.path} ⇒ ${reason}`, () => {
      expect(emailGateReasonOf(request)).toBe(reason);
    });
  }

  for (const request of UNGUARDED) {
    test(`${request.method} ${request.path} ⇒ aucune garde`, () => {
      expect(emailGateReasonOf(request)).toBeNull();
    });
  }
});

describe('withEmailGate — le refus mène à la validation et la requête repart', () => {
  test('403 EMAIL_NOT_VERIFIED, code validé ⇒ la MÊME requête est rejouée et son succès rendu', async () => {
    const { transport, sent } = fakeTransport([REFUSED, CREATED]);
    const gate = fakeGate(true);
    const gated = withEmailGate(transport, { ask: gate.ask, emailUnproven: () => false });
    const request = post({ type: 'POST', content: 'Mon brouillon' });

    const result = await gated.request(request);

    expect(result).toEqual(CREATED);
    expect(gate.asked).toEqual(['publish']);
    expect(sent).toEqual([request, request]);
  });

  test('validation abandonnée ⇒ le refus d’origine est rendu, rien n’est rejoué', async () => {
    const { transport, sent } = fakeTransport([REFUSED]);
    const gate = fakeGate(false);
    const gated = withEmailGate(transport, { ask: gate.ask, emailUnproven: () => false });

    const result = await gated.request({ method: 'POST', path: invitationsEndpoints.email, body: { email: 'b@x.io' } });

    expect(result).toEqual(REFUSED);
    expect(gate.asked).toEqual(['invite']);
    expect(sent).toHaveLength(1);
  });

  test('un autre refus ne demande rien', async () => {
    const other: ApiResult<never> = { ok: false, status: 403, error: 'Forbidden', code: 'PERMISSION_DENIED' };
    const { transport } = fakeTransport([other]);
    const gate = fakeGate(true);
    const gated = withEmailGate(transport, { ask: gate.ask, emailUnproven: () => false });

    expect(await gated.request({ method: 'POST', path: linksEndpoints.root, body: {} })).toEqual(other);
    expect(gate.asked).toEqual([]);
  });
});

describe('withEmailGate — prévenir plutôt que guérir', () => {
  test('adresse connue non prouvée ⇒ la validation s’ouvre AVANT tout envoi, puis la requête part', async () => {
    const { transport, sent } = fakeTransport([CREATED]);
    const gate = fakeGate(true);
    const gated = withEmailGate(transport, { ask: gate.ask, emailUnproven: () => true });

    const result = await gated.request({ method: 'POST', path: linksEndpoints.root, body: { name: 'Mon lien' } });

    expect(result).toEqual(CREATED);
    expect(gate.asked).toEqual(['link']);
    expect(sent).toHaveLength(1);
  });

  test('validation abandonnée ⇒ AUCUN aller-retour réseau, refus local EMAIL_NOT_VERIFIED', async () => {
    const { transport, sent } = fakeTransport([]);
    const gate = fakeGate(false);
    const gated = withEmailGate(transport, { ask: gate.ask, emailUnproven: () => true });

    const result = await gated.request(post({ type: 'POST', content: 'x' }));

    expect(sent).toHaveLength(0);
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('une STORY n’est jamais retenue d’avance : la première est permise (#7907)', async () => {
    const { transport, sent } = fakeTransport([CREATED]);
    const gate = fakeGate(false);
    const gated = withEmailGate(transport, { ask: gate.ask, emailUnproven: () => true });

    const result = await gated.request(post({ type: 'STORY', mediaIds: ['m-1'] }));

    expect(result).toEqual(CREATED);
    expect(gate.asked).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  test('une route non gardée passe sans rien demander', async () => {
    const { transport, sent } = fakeTransport([CREATED]);
    const gate = fakeGate(false);
    const gated = withEmailGate(transport, { ask: gate.ask, emailUnproven: () => true });

    await gated.request({ method: 'POST', path: postsEndpoints.byPostIdLike('p-1') });

    expect(gate.asked).toEqual([]);
    expect(sent).toHaveLength(1);
  });
});
