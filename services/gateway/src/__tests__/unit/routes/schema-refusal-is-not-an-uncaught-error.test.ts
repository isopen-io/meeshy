/**
 * Un refus de SCHÉMA est la faute du client, pas une panne (#8082).
 *
 * Constat de recette : `body/username must NOT have more than 16 characters`
 * sortait bien en 400 `VALIDATION_ERROR`, mais le gestionnaire global
 * l'avait d'abord journalisé en ERROR « Uncaught error in request handler » —
 * sa ligne `logger.error` précédait la branche qui reconnaît le refus. Le
 * journal de production accusait donc le serveur pour chaque formulaire mal
 * rempli, exactement le bruit que #6591 a retiré pour les refus CORS.
 *
 * Le gestionnaire vit dans `MeeshyServer` (monté avec Prisma, Redis, ZMQ) :
 * on lit son ORDRE dans la source — la seule propriété en jeu ici est
 * « la branche de refus précède la journalisation d'erreur ».
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { stripComments } from '../../../routes/__tests__/response-schema-sweep';

const source = stripComments(readFileSync(join(__dirname, '../../../server.ts'), 'utf8'));

const handlerStart = source.indexOf('this.server.setErrorHandler(');
const handler = source.slice(handlerStart, source.indexOf('await this.server.register(cors', handlerStart));

describe('refus de schéma — jamais journalisé comme une erreur non rattrapée', () => {
  it('voit bien le gestionnaire global', () => {
    expect(handlerStart).toBeGreaterThan(-1);
    expect(handler).toContain("'Uncaught error in request handler'");
    expect(handler).toContain('schemaValidationErrorResponse(error)');
  });

  it('reconnaît le refus de schéma AVANT de journaliser une erreur non rattrapée', () => {
    expect(handler.indexOf('schemaValidationErrorResponse(error)'))
      .toBeLessThan(handler.indexOf("'Uncaught error in request handler'"));
  });

  it('rend le refus de schéma sans passer par logger.error', () => {
    const refusalBranch = handler.slice(
      handler.indexOf('schemaValidationErrorResponse(error)'),
      handler.indexOf('return reply.code(refusStatus)'),
    );

    expect(refusalBranch).not.toContain('logger.error');
  });
});
