/**
 * Unit tests for clientMutationId middleware
 * Covers: CLIENT_MUTATION_ID_REGEX, registerClientMutationIdHook behaviour —
 * absent header (pass-through), valid cmid (attached to request), non-string
 * header (400), invalid format (400), idempotent decorator registration.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  CLIENT_MUTATION_ID_REGEX,
  registerClientMutationIdHook,
} from '../../../middleware/clientMutationId';

// ─── CLIENT_MUTATION_ID_REGEX ─────────────────────────────────────────────────

describe('CLIENT_MUTATION_ID_REGEX', () => {
  it('accepts a well-formed cmid', () => {
    expect(CLIENT_MUTATION_ID_REGEX.test('cmid_550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('accepts another valid uuid v4 format', () => {
    expect(CLIENT_MUTATION_ID_REGEX.test('cmid_a0b1c2d3-e4f5-4a6b-8c9d-0e1f2a3b4c5d')).toBe(true);
  });

  it('rejects missing cmid_ prefix', () => {
    expect(CLIENT_MUTATION_ID_REGEX.test('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('rejects uppercase UUID characters', () => {
    expect(CLIENT_MUTATION_ID_REGEX.test('cmid_550E8400-E29B-41D4-A716-446655440000')).toBe(false);
  });

  it('rejects wrong segment lengths', () => {
    expect(CLIENT_MUTATION_ID_REGEX.test('cmid_550e840-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(CLIENT_MUTATION_ID_REGEX.test('')).toBe(false);
  });

  it('rejects cmid with leading/trailing whitespace', () => {
    expect(CLIENT_MUTATION_ID_REGEX.test(' cmid_550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('rejects cmid with wrong separator', () => {
    expect(CLIENT_MUTATION_ID_REGEX.test('cmid_550e8400_e29b_41d4_a716_446655440000')).toBe(false);
  });
});

// ─── registerClientMutationIdHook ────────────────────────────────────────────

function makeApp() {
  let hookFn: ((req: any, reply: any) => Promise<void>) | null = null;
  return {
    hasRequestDecorator: jest.fn<any>().mockReturnValue(false),
    decorateRequest: jest.fn<any>(),
    addHook: jest.fn<any>((_event: string, fn: any) => {
      hookFn = fn;
    }),
    getHook: () => hookFn,
  };
}

/**
 * Le double doit exposer `status`, et pas seulement `code` : depuis #4434 le
 * refus passe par `sendError` (`utils/response.ts`), qui appelle
 * `reply.status(…).send(…)` — la porte UNIQUE de l'enveloppe d'erreur du
 * dépôt, à la place de la charge que ce hook écrivait à la main.
 *
 * Ces témoins-ci restent des témoins de HOOK : ils prouvent qu'un refus a
 * lieu et qu'aucun identifiant n'est attaché. Ce qui part sur le fil ne se
 * mesure PAS ici — un double ne sérialise rien, et c'est précisément ce qui a
 * laissé `error: { code, … }` passer pour correct pendant que le client
 * recevait « [object Object] ». La valeur SERVIE est gardée par
 * `clientMutationId-served-envelope.test.ts`, qui monte une vraie app avec le
 * schéma d'erreur de production.
 */
function makeReply() {
  const reply: any = {
    status: jest.fn<any>(() => reply),
    code: jest.fn<any>(() => reply),
    send: jest.fn<any>(() => reply),
  };
  return reply;
}

function makeReq(headerValue?: string | string[]) {
  const req: any = {
    headers: headerValue === undefined ? {} : { 'x-client-mutation-id': headerValue },
    clientMutationId: undefined,
  };
  return req;
}

describe('registerClientMutationIdHook', () => {
  it('registers the decorateRequest and addHook', () => {
    const app = makeApp();

    registerClientMutationIdHook(app as any);

    expect(app.decorateRequest).toHaveBeenCalledWith('clientMutationId', undefined);
    expect(app.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
  });

  it('does NOT re-register decorator when already exists', () => {
    const app = makeApp();
    app.hasRequestDecorator = jest.fn<any>().mockReturnValue(true);

    registerClientMutationIdHook(app as any);

    expect(app.decorateRequest).not.toHaveBeenCalled();
  });

  it('passes through when header is absent', async () => {
    const app = makeApp();
    registerClientMutationIdHook(app as any);

    const req = makeReq();
    const reply = makeReply();

    await app.getHook()!(req, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(req.clientMutationId).toBeUndefined();
  });

  it('attaches valid cmid to request', async () => {
    const app = makeApp();
    registerClientMutationIdHook(app as any);

    const cmid = 'cmid_550e8400-e29b-41d4-a716-446655440000';
    const req = makeReq(cmid);
    const reply = makeReply();

    await app.getHook()!(req, reply);

    expect(req.clientMutationId).toBe(cmid);
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('returns 400 when header is an array (non-string)', async () => {
    const app = makeApp();
    registerClientMutationIdHook(app as any);

    const req = makeReq(['cmid_550e8400-e29b-41d4-a716-446655440000', 'extra']);
    const reply = makeReply();

    await app.getHook()!(req, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'INVALID_MUTATION_ID' })
    );
  });

  it('returns 400 for malformed cmid string', async () => {
    const app = makeApp();
    registerClientMutationIdHook(app as any);

    const req = makeReq('bad-id-format');
    const reply = makeReply();

    await app.getHook()!(req, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'INVALID_MUTATION_ID' })
    );
  });

  it('returns 400 for cmid with uppercase UUID', async () => {
    const app = makeApp();
    registerClientMutationIdHook(app as any);

    const req = makeReq('cmid_550E8400-E29B-41D4-A716-446655440000');
    const reply = makeReply();

    await app.getHook()!(req, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
  });

  it('does not set clientMutationId on invalid input', async () => {
    const app = makeApp();
    registerClientMutationIdHook(app as any);

    const req = makeReq('not-a-cmid');
    const reply = makeReply();

    await app.getHook()!(req, reply);

    expect(req.clientMutationId).toBeUndefined();
  });
});
