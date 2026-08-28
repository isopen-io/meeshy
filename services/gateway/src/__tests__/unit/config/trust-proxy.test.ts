/**
 * `trustProxy` — le gateway doit voir l'adresse de son APPELANT.
 *
 * Contexte (#4137) : sans cette option, `request.ip` vaut l'adresse du
 * conteneur Traefik pour tout le monde, ce qui réduit toute limitation « par
 * IP » à un seau unique partagé par la plateforme entière.
 *
 * Ces témoins gardent la RÉSOLUTION de l'option. Le sens des replis est le
 * point : une entrée illisible doit rendre la limitation plus STRICTE, jamais
 * contournable — c'est-à-dire retomber sur un nombre de maillons, jamais sur
 * `true`, qui laisserait l'appelant choisir l'adresse qu'on lui attribue.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { resolveTrustProxy, NO_PROXY } from '../../../config/trust-proxy';

describe('resolveTrustProxy', () => {
  it('fait confiance à UN mandataire par défaut — Traefik, et lui seul', () => {
    expect(resolveTrustProxy(undefined)).toBe(1);
    expect(resolveTrustProxy('')).toBe(1);
    expect(resolveTrustProxy('   ')).toBe(1);
  });

  it('accepte un nombre de maillons explicite', () => {
    expect(resolveTrustProxy('1')).toBe(1);
    expect(resolveTrustProxy('2')).toBe(2);
    expect(resolveTrustProxy(' 3 ')).toBe(3);
  });

  it('sait qu\'il n\'y a aucun mandataire', () => {
    expect(resolveTrustProxy('0')).toBe(NO_PROXY);
    expect(resolveTrustProxy('false')).toBe(NO_PROXY);
    expect(resolveTrustProxy('none')).toBe(NO_PROXY);
  });

  it('ne rend JAMAIS `true` — l\'appelant ne doit pas choisir son adresse', () => {
    for (const entree of ['true', 'yes', 'all', 'oui', '-1', 'abc', '1.5', 'NaN']) {
      const resolu = resolveTrustProxy(entree);

      expect(resolu).not.toBe(true);
      expect(typeof resolu === 'number' || resolu === NO_PROXY).toBe(true);
    }
  });

  it('retombe sur le défaut STRICT devant une entrée illisible', () => {
    expect(resolveTrustProxy('abc')).toBe(1);
    expect(resolveTrustProxy('-2')).toBe(1);
    expect(resolveTrustProxy('1.5')).toBe(1);
  });

  it('plafonne une chaîne déraisonnable plutôt que de la suivre', () => {
    expect(resolveTrustProxy('99')).toBe(4);
    expect(resolveTrustProxy('1000')).toBe(4);
  });
});
