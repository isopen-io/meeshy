/**
 * `utils/deprecation.ts` — le site UNIQUE des trois en-têtes RFC 8594 (#4274).
 *
 * Huit issues (#4149, #4150, #4151, #4175, #4178, #4181, #4182, #4184) sont
 * bloquées PAR CONSTRUCTION tant que ce module n'existe pas : chacune devrait
 * sinon écrire sa propre formulation des trois en-têtes, produisant huit
 * jumelles d'une même règle. Ces témoins couvrent les DEUX fonctions pures —
 * le calcul de la date de retrait, et la pose des en-têtes — jamais un corps
 * de réponse : ce module COMPOSE avec `sendSuccess`/`sendError`
 * (`utils/response.ts`), il ne les remplace pas.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { FastifyReply } from 'fastify';
import {
  applyDeprecationHeaders,
  deprecationSunsetDate,
  DEPRECATION_WINDOW_DAYS,
} from '../deprecation';

const UN_JOUR_MS = 24 * 60 * 60 * 1000;

/**
 * Double minimal de `FastifyReply` : capture les en-têtes posés, et prouve
 * séparément que ni `status` ni `send` ne sont appelés — c'est la preuve que
 * le helper COMPOSE avec `sendSuccess`/`sendError` au lieu de fermer la
 * réponse à leur place (critère 1 de #4274).
 */
function fakeReply(): FastifyReply & { readonly _headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const reply = {
    header: (nom: string, valeur: string) => {
      headers[nom] = valeur;
      return reply;
    },
    status: (() => {
      throw new Error('applyDeprecationHeaders ne doit jamais fermer la réponse');
    }) as unknown as FastifyReply['status'],
    send: (() => {
      throw new Error('applyDeprecationHeaders ne doit jamais fermer la réponse');
    }) as unknown as FastifyReply['send'],
    _headers: headers,
  };
  return reply as unknown as FastifyReply & { readonly _headers: Record<string, string> };
}

describe('deprecationSunsetDate', () => {
  it('avec since et windowDays explicites, rend EXACTEMENT since + windowDays jours', () => {
    const depuis = new Date('2026-08-29T00:00:00.000Z');
    const rendu = deprecationSunsetDate({ since: depuis, windowDays: 10 });
    expect(rendu.toISOString()).toBe('2026-09-08T00:00:00.000Z');
  });

  it('sans argument, ancre sur maintenant et applique la fenêtre par défaut du dépôt', () => {
    const avant = Date.now();
    const rendu = deprecationSunsetDate();
    const apres = Date.now();
    // Bornes larges (± le temps d'exécution du test) plutôt qu'une égalité
    // stricte sur `Date.now()`, qui rendrait le témoin flaky par construction.
    expect(rendu.getTime()).toBeGreaterThanOrEqual(avant + DEPRECATION_WINDOW_DAYS * UN_JOUR_MS - 1000);
    expect(rendu.getTime()).toBeLessThanOrEqual(apres + DEPRECATION_WINDOW_DAYS * UN_JOUR_MS + 1000);
  });

  it('la fenêtre par défaut du dépôt est de 180 jours (6 mois) — la seule règle de retrait CHIFFRÉE documentée', () => {
    // docs/product/api-simplification/identity.md § "Ordre des étapes", pt.5 :
    // "Retrait des alias, six mois après le montage double". Un changement de
    // cette constante est une décision produit, jamais un ajustement muet —
    // ce témoin la rend visible s'il tombe.
    expect(DEPRECATION_WINDOW_DAYS).toBe(180);
  });

  it('windowDays seul (since omis) ancre quand même sur maintenant', () => {
    const rendu = deprecationSunsetDate({ windowDays: 1 });
    const attendu = Date.now() + UN_JOUR_MS;
    expect(Math.abs(rendu.getTime() - attendu)).toBeLessThan(2000);
  });
});

describe('applyDeprecationHeaders', () => {
  it('pose les trois en-têtes RFC 8594 avec les valeurs attendues', () => {
    const reply = fakeReply();
    const sunsetAt = new Date('2027-02-25T00:00:00.000Z');

    applyDeprecationHeaders(reply, {
      successorPath: '/api/v1/directory/people/abc123',
      sunsetAt,
    });

    expect(reply._headers['Deprecation']).toBe('true');
    expect(reply._headers['Sunset']).toBe('Thu, 25 Feb 2027 00:00:00 GMT');
    expect(reply._headers['Link']).toBe('</api/v1/directory/people/abc123>; rel="successor-version"');
  });

  it('sans sunsetAt, dérive la date par la règle de retrait du dépôt — jamais une valeur inventée au site d’appel', () => {
    const reply = fakeReply();
    applyDeprecationHeaders(reply, { successorPath: '/api/v1/reports' });

    const rendu = new Date(reply._headers['Sunset']);
    const attendu = deprecationSunsetDate();
    // Tolérance large : les deux appels à `Date.now()` (celui du test, celui
    // du helper) peuvent tomber sur des millisecondes différentes.
    expect(Math.abs(rendu.getTime() - attendu.getTime())).toBeLessThan(5000);
  });

  it('le Sunset est un HTTP-date RFC 7231 (le format qu’exige RFC 8594) — pas une ISO 8601', () => {
    const reply = fakeReply();
    applyDeprecationHeaders(reply, {
      successorPath: '/api/v1/reports',
      sunsetAt: new Date('2027-01-01T12:34:56.000Z'),
    });
    // toUTCString() rend exactement ce format ; toISOString() ne le rend jamais.
    expect(reply._headers['Sunset']).toMatch(
      /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/
    );
  });

  it('ne lit jamais status()/send() — il COMPOSE avec sendSuccess/sendError, il ne les remplace pas', () => {
    const reply = fakeReply();
    expect(() =>
      applyDeprecationHeaders(reply, { successorPath: '/api/v1/reports' })
    ).not.toThrow();
  });

  it('deux appels successifs (deux alias distincts sur la même réponse, cas d’école) écrasent proprement le précédent', () => {
    const reply = fakeReply();
    applyDeprecationHeaders(reply, { successorPath: '/api/v1/a', sunsetAt: new Date('2027-01-01T00:00:00.000Z') });
    applyDeprecationHeaders(reply, { successorPath: '/api/v1/b', sunsetAt: new Date('2027-06-01T00:00:00.000Z') });
    expect(reply._headers['Link']).toBe('</api/v1/b>; rel="successor-version"');
    expect(reply._headers['Sunset']).toBe('Tue, 01 Jun 2027 00:00:00 GMT');
  });
});
