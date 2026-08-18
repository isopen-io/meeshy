/**
 * Un refus de VALIDATION doit dire ce qui ne va pas.
 *
 * Le gestionnaire d'erreurs global reconnaît la `ValidationError` maison et
 * rend son message. Il ne reconnaissait PAS celle de Fastify — le rejet produit
 * par le schéma Ajv du `body`, avant même que le handler ne s'exécute. Ces
 * erreurs-là tombaient dans le repli générique et ressortaient en :
 *
 *     { "error": "Internal Server Error", "message": "An unexpected error occurred" }
 *
 * …avec un code 400. Le client apprenait donc qu'il avait tort, sans jamais
 * savoir sur quoi. C'est la moitié restante du défaut d'inscription du
 * 2026-08-18 : la borne de mot de passe est réparée, mais toute saisie
 * réellement invalide reste muette — et « une erreur inattendue » sur un
 * formulaire rempli est indiscernable d'une panne serveur.
 *
 * Fastify marque ces erreurs par `err.validation` (le tableau des violations)
 * et leur pose `statusCode: 400`. C'est ce marqueur qu'on lit : pas le message,
 * pas le code seul — un 400 peut venir d'ailleurs.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { schemaValidationErrorResponse } from '../../../utils/schema-validation-error';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });

  // Réplique du gestionnaire global : la branche testée, puis le repli.
  app.setErrorHandler(async (error, _request, reply) => {
    const shaped = schemaValidationErrorResponse(error);
    if (shaped) return reply.code(shaped.statusCode).send(shaped);

    return reply.code((error as { statusCode?: number }).statusCode ?? 500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  app.post('/probe', {
    schema: {
      body: {
        type: 'object',
        required: ['password'],
        properties: {
          password: { type: 'string', minLength: 6 },
        },
      },
    },
  }, async () => ({ ok: true }));

  await app.ready();
});

afterAll(async () => { await app.close(); });

const post = (payload: unknown) => app.inject({ method: 'POST', url: '/probe', payload: payload as never });

describe('refus de schéma — le client apprend CE QUI ne va pas', () => {
  it('répond 400, pas 500', async () => {
    const res = await post({ password: 'abc' });

    expect(res.statusCode).toBe(400);
  });

  it('ne se présente plus comme une panne serveur', async () => {
    const res = await post({ password: 'abc' });

    expect(res.json().error).not.toBe('Internal Server Error');
    expect(res.json().message).not.toBe('An unexpected error occurred');
  });

  it('nomme le CHAMP fautif — sans lui, le formulaire ne sait rien surligner', async () => {
    const res = await post({ password: 'abc' });

    expect(JSON.stringify(res.json())).toContain('password');
  });

  it('porte les violations en détail, pas seulement la première', async () => {
    const res = await post({});

    expect(Array.isArray(res.json().details)).toBe(true);
    expect(res.json().details.length).toBeGreaterThan(0);
  });

  it('expose un code machine — le client route sans lire le texte', async () => {
    const res = await post({ password: 'abc' });

    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});

describe('le lecteur ne se déclenche QUE sur une erreur de schéma', () => {
  it('laisse passer une erreur ordinaire au repli', () => {
    expect(schemaValidationErrorResponse(new Error('boom'))).toBeNull();
  });

  /**
   * Un 400 peut venir d'ailleurs (règle métier, garde d'accès). Se brancher
   * sur le seul code transformerait ces refus-là en « erreur de validation »,
   * avec un `details` vide qui promettrait une précision inexistante.
   */
  it('ne se déclenche pas sur un 400 SANS violations de schéma', () => {
    const businessError = Object.assign(new Error('Conversation fermée'), { statusCode: 400 });

    expect(schemaValidationErrorResponse(businessError)).toBeNull();
  });

  it('tolère une valeur qui n’est pas une Error', () => {
    expect(schemaValidationErrorResponse(null)).toBeNull();
    expect(schemaValidationErrorResponse('boom')).toBeNull();
  });
});
