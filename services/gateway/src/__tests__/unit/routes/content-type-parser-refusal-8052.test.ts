/**
 * Un corps vide, illisible, trop gros ou d'un type non pris en charge est une
 * faute du CLIENT, pas une panne (#8052).
 *
 * Constat de recette (2026-09-26) : `POST /api/v1/auth/login` sans
 * `Content-Type: application/json`, ou avec un corps JSON vide, ressortait en
 * « Internal Server Error / An unexpected error occurred » et laissait une ligne
 * `[ERROR] Uncaught error in request handler`. Les erreurs du parseur de corps
 * de Fastify (`FST_ERR_CTP_*`) portent pourtant leur statut (400, 413, 415) :
 * le gestionnaire global les faisait tomber dans son repli générique.
 *
 * Les erreurs sont produites par un VRAI Fastify (aucune erreur fabriquée à la
 * main) ; la traduction est celle que le gestionnaire global appelle, et un
 * témoin de source garde qu'il l'appelle AVANT de journaliser en ERROR.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contentTypeParserErrorResponse } from '../../../utils/content-type-parser-error';
import { stripComments } from '../../../routes/__tests__/response-schema-sweep';

async function buildApp() {
  const app = Fastify({ logger: false });
  app.setErrorHandler(async (error, _request, reply) => {
    const refus = contentTypeParserErrorResponse(error);
    if (refus) {
      return reply.code(refus.statusCode).send({
        success: false,
        error: refus.error,
        message: refus.message,
        code: refus.code,
      });
    }
    return reply.code(500).send({ success: false, error: 'Internal Server Error' });
  });
  app.post('/login', { bodyLimit: 64 }, async (request) => ({ success: true, data: request.body }));
  await app.ready();
  return app;
}

describe('#8052 — le parseur de corps refuse en 4xx, jamais en 500', () => {
  it('rend 415 UNSUPPORTED_MEDIA_TYPE pour un type de contenu non pris en charge', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/login', headers: { 'content-type': 'text/xml' }, payload: '<a/>' });
    await app.close();

    expect(res.statusCode).toBe(415);
    expect(res.json()).toEqual(expect.objectContaining({ success: false, code: 'UNSUPPORTED_MEDIA_TYPE' }));
  });

  it('rend 400 EMPTY_BODY pour un corps JSON vide', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/login', headers: { 'content-type': 'application/json' }, payload: '' });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(expect.objectContaining({ success: false, code: 'EMPTY_BODY' }));
  });

  it('rend 400 INVALID_JSON_BODY pour un corps JSON illisible', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/login', headers: { 'content-type': 'application/json' }, payload: '{"username":' });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(expect.objectContaining({ success: false, code: 'INVALID_JSON_BODY' }));
  });

  it('rend 413 PAYLOAD_TOO_LARGE pour un corps au-delà du bodyLimit de la route', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ username: 'x'.repeat(200) }),
    });
    await app.close();

    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual(expect.objectContaining({ success: false, code: 'PAYLOAD_TOO_LARGE' }));
  });

  it('ne reconnaît ni une erreur ordinaire ni une erreur de configuration du parseur (500 de Fastify)', () => {
    expect(contentTypeParserErrorResponse(new Error('boom'))).toBeNull();
    expect(contentTypeParserErrorResponse(Object.assign(new Error('x'), { code: 'FST_ERR_CTP_INVALID_TYPE', statusCode: 500 }))).toBeNull();
    expect(contentTypeParserErrorResponse(null)).toBeNull();
  });
});

describe('#8052 — le gestionnaire global traduit le refus du parseur AVANT de journaliser une erreur', () => {
  const source = stripComments(readFileSync(join(__dirname, '../../../server.ts'), 'utf8'));
  const start = source.indexOf('this.server.setErrorHandler(');
  const handler = source.slice(start, source.indexOf('await this.server.register(cors', start));

  it('appelle contentTypeParserErrorResponse avant « Uncaught error in request handler »', () => {
    expect(start).toBeGreaterThan(-1);
    expect(handler).toContain('contentTypeParserErrorResponse(error)');
    expect(handler.indexOf('contentTypeParserErrorResponse(error)'))
      .toBeLessThan(handler.indexOf("'Uncaught error in request handler'"));
  });

  it('ne passe pas par logger.error dans la branche du refus', () => {
    const branch = handler.slice(
      handler.indexOf('contentTypeParserErrorResponse(error)'),
      handler.indexOf('return reply.code(parserRefusal.statusCode)'),
    );
    expect(branch.length).toBeGreaterThan(0);
    expect(branch).not.toContain('logger.error');
  });
});
