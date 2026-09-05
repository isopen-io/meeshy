import {
  sendSuccess,
  sendPaginatedSuccess,
  sendError,
  sendBadRequest,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendConflict,
  sendInternalError,
  buildSuccessResponse,
  buildErrorResponse,
  createPaginationMeta,
} from '../response';
import type { FastifyReply } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types';

function makeReply(): FastifyReply & { _status: number; _body: unknown } {
  const reply = {
    _status: 200,
    _body: undefined as unknown,
    status(code: number) {
      this._status = code;
      return this;
    },
    send(body: unknown) {
      this._body = body;
      return this;
    },
  };
  return reply as unknown as FastifyReply & { _status: number; _body: unknown };
}

describe('sendSuccess', () => {
  it('sends 200 with data', () => {
    const reply = makeReply();
    sendSuccess(reply, { id: '1' });
    expect(reply._status).toBe(200);
    expect(reply._body).toMatchObject({ success: true, data: { id: '1' } });
  });

  it('sends custom status code when provided', () => {
    const reply = makeReply();
    sendSuccess(reply, null, { statusCode: 201 });
    expect(reply._status).toBe(201);
  });

  it('includes message and pagination when provided', () => {
    const reply = makeReply();
    const pagination = { total: 10, offset: 0, limit: 5, hasMore: true };
    sendSuccess(reply, [], { message: 'ok', pagination });
    const body = reply._body as Record<string, unknown>;
    expect(body.message).toBe('ok');
    expect(body.pagination).toEqual(pagination);
  });

  it('includes meta when provided', () => {
    const reply = makeReply();
    sendSuccess(reply, null, { meta: { processingTime: 5 } });
    expect((reply._body as Record<string, unknown>).meta).toMatchObject({ processingTime: 5 });
  });
});

describe('sendPaginatedSuccess', () => {
  it('sends 200 with data and pagination', () => {
    const reply = makeReply();
    const pagination = { total: 3, offset: 0, limit: 10, hasMore: false };
    sendPaginatedSuccess(reply, ['a', 'b', 'c'], pagination);
    expect(reply._status).toBe(200);
    expect((reply._body as Record<string, unknown>).pagination).toEqual(pagination);
  });
});

describe('sendError', () => {
  it('sends given status code and error shape', () => {
    const reply = makeReply();
    sendError(reply, 422, 'Validation failed', { code: 'INVALID', message: 'Bad data' });
    expect(reply._status).toBe(422);
    const body = reply._body as Record<string, unknown>;
    expect(body).toMatchObject({ success: false, error: 'Validation failed', code: 'INVALID', message: 'Bad data' });
  });

  it('defaults message to error string when not provided', () => {
    const reply = makeReply();
    sendError(reply, 400, 'Bad request');
    expect((reply._body as Record<string, unknown>).message).toBe('Bad request');
  });
});

/**
 * Le CLIQUET qui relie ce que `sendError` POSE à ce que `errorResponseSchema`
 * DÉCLARE (#4884). `sendError` est le producteur UNIQUE de toutes les erreurs
 * de la passerelle (1440 appels) ; `errorResponseSchema` est le schéma partagé
 * qui le documente. Les deux ont divergé une fois sans témoin pour le voir —
 * dix-neuf schémas de `calls.ts` déclaraient `error` comme un OBJET
 * `{ code, message, details }` là où `sendError` pose une CHAÎNE, et
 * `fast-json-stringify` a rendu `{"success":false,"error":{}}` sur toute la
 * surface de signalisation d'appel. `global-error-handler-field-closure-guard.test.ts`
 * tient déjà cette relation pour le gestionnaire global ; `sendError`, qui
 * sert lui seul 1440 refus, ne l'était pas.
 *
 * `details` est un ÉTALEMENT documenté à la racine, propre à chaque appelant
 * (`retryAfter`, `suggestedNickname`…) — il n'est délibérément PAS de ce
 * superset (voir le doc-comment de `errorResponseSchema`) et n'entre donc pas
 * dans cette comparaison.
 */
describe('sendError sert une forme ⊆ errorResponseSchema, et réciproquement (#4884)', () => {
  const clesDeErrorResponseSchema = Object.keys(errorResponseSchema.properties).sort();

  it('ne peut pas rester vide — sinon la garde compare tout à rien', () => {
    expect(clesDeErrorResponseSchema.length).toBeGreaterThan(0);
  });

  it('les clés que sendError pose (hors `details`, étalement propre à l’appelant) sont EXACTEMENT celles du schéma partagé', () => {
    const reply = makeReply();
    sendError(reply, 422, 'Validation failed', {
      message: 'Bad data',
      code: 'INVALID',
      violations: [{ path: 'x', message: 'y' }],
    });
    const clesServies = Object.keys(reply._body as Record<string, unknown>).sort();
    expect(clesServies).toEqual(clesDeErrorResponseSchema);
  });

  it('rougit si sendError pose une clé que le schéma ignore — preuve que la garde sait tomber', () => {
    const reply = makeReply();
    // `details` s'étale à la racine : une route qui en pose SANS le déclarer
    // en plus du superset reproduit exactement le défaut de #4884.
    sendError(reply, 409, 'Conflict', { details: { suggestedNickname: 'alice2' } });
    const clesServies = Object.keys(reply._body as Record<string, unknown>).sort();
    expect(clesServies).not.toEqual(clesDeErrorResponseSchema);
    expect(clesServies).toContain('suggestedNickname');
  });
});

describe('sendBadRequest', () => {
  it('sends 400', () => {
    const reply = makeReply();
    sendBadRequest(reply, 'Missing field');
    expect(reply._status).toBe(400);
  });
});

describe('sendUnauthorized', () => {
  it('sends 401 with default message', () => {
    const reply = makeReply();
    sendUnauthorized(reply);
    expect(reply._status).toBe(401);
    expect((reply._body as Record<string, unknown>).error).toBe('Authentication required');
  });
});

describe('sendForbidden', () => {
  it('sends 403 with default message', () => {
    const reply = makeReply();
    sendForbidden(reply);
    expect(reply._status).toBe(403);
    expect((reply._body as Record<string, unknown>).error).toBe('Access denied');
  });
});

describe('sendNotFound', () => {
  it('sends 404', () => {
    const reply = makeReply();
    sendNotFound(reply, 'User not found');
    expect(reply._status).toBe(404);
  });
});

describe('sendConflict', () => {
  it('sends 409', () => {
    const reply = makeReply();
    sendConflict(reply, 'Duplicate entry');
    expect(reply._status).toBe(409);
    expect((reply._body as Record<string, unknown>).error).toBe('Duplicate entry');
  });
});

describe('sendInternalError', () => {
  it('sends 500 with default message', () => {
    const reply = makeReply();
    sendInternalError(reply);
    expect(reply._status).toBe(500);
    expect((reply._body as Record<string, unknown>).error).toBe('Internal server error');
  });

  it('sends 500 with custom message', () => {
    const reply = makeReply();
    sendInternalError(reply, 'DB failure');
    expect((reply._body as Record<string, unknown>).error).toBe('DB failure');
  });
});

describe('buildSuccessResponse', () => {
  it('builds response object without sending', () => {
    const result = buildSuccessResponse({ id: '42' }, { message: 'Created' });
    expect(result).toMatchObject({ success: true, data: { id: '42' }, message: 'Created' });
  });

  it('includes pagination when provided', () => {
    const pagination = { total: 20, offset: 5, limit: 5, hasMore: true };
    const result = buildSuccessResponse([], { pagination });
    expect(result.pagination).toEqual(pagination);
  });

  it('includes meta when provided', () => {
    const result = buildSuccessResponse(null, { meta: { processingTime: 12 } });
    expect(result.meta).toMatchObject({ processingTime: 12 });
  });

  it('omits meta when not provided', () => {
    const result = buildSuccessResponse('value');
    expect(result.meta).toBeUndefined();
  });
});

describe('buildErrorResponse', () => {
  it('builds error response object without sending', () => {
    const result = buildErrorResponse('Not found', { code: 'NF', message: 'Resource missing' });
    expect(result).toMatchObject({
      success: false,
      error: 'Not found',
      code: 'NF',
      message: 'Resource missing',
    });
  });

  it('defaults message to error when not provided', () => {
    const result = buildErrorResponse('Oops');
    expect(result.message).toBe('Oops');
  });
});

describe('createPaginationMeta', () => {
  it('computes hasMore correctly when more items remain', () => {
    const meta = createPaginationMeta(100, 0, 10, 10);
    expect(meta).toEqual({ total: 100, offset: 0, limit: 10, hasMore: true });
  });

  it('sets hasMore to false when on last page', () => {
    const meta = createPaginationMeta(5, 0, 10, 5);
    expect(meta.hasMore).toBe(false);
  });

  it('handles mid-page correctly', () => {
    const meta = createPaginationMeta(50, 30, 10, 10);
    expect(meta.hasMore).toBe(true);
  });

  it('handles empty result set', () => {
    const meta = createPaginationMeta(0, 0, 10, 0);
    expect(meta.hasMore).toBe(false);
  });
});
