/**
 * `trustProxy` — le gateway doit voir l'adresse de son APPELANT.
 *
 * Contexte (#4137) : sans cette option, `request.ip` vaut l'adresse du
 * conteneur Traefik pour tout le monde, ce qui réduit toute limitation « par
 * IP » à un seau unique partagé par la plateforme entière.
 *
 * Deux niveaux sont testés séparément, et la séparation est le point :
 *
 *   `resolveTrustedHops` rend le NOMBRE de maillons — une valeur qui se compare,
 *   donc sur laquelle un témoin peut tomber. C'est là que vivent le défaut, le
 *   plafond et le refus de `true`.
 *
 *   `resolveTrustProxy` rend ce que Fastify accepte : une FONCTION de confiance.
 *   Une fonction ne se compare pas ; on ne peut l'attester qu'en l'appelant, et
 *   c'est ce que fait le dernier bloc.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { resolveTrustProxy, resolveTrustedHops, NO_PROXY } from '../../../config/trust-proxy';

describe('resolveTrustedHops — combien de maillons méritent confiance', () => {
  it('fait confiance à UN mandataire par défaut — Traefik, et lui seul', () => {
    expect(resolveTrustedHops(undefined)).toBe(1);
    expect(resolveTrustedHops('')).toBe(1);
    expect(resolveTrustedHops('   ')).toBe(1);
  });

  it('accepte un nombre de maillons explicite', () => {
    expect(resolveTrustedHops('1')).toBe(1);
    expect(resolveTrustedHops('2')).toBe(2);
    expect(resolveTrustedHops(' 3 ')).toBe(3);
  });

  it('sait qu’il n’y a aucun mandataire', () => {
    expect(resolveTrustedHops('0')).toBe(0);
    expect(resolveTrustedHops('false')).toBe(0);
    expect(resolveTrustedHops('none')).toBe(0);
  });

  it('retombe sur le défaut STRICT devant une entrée illisible', () => {
    // Se tromper vers « moins de maillons » rend la limitation plus stricte ;
    // l'inverse la rendrait contournable par un en-tête.
    expect(resolveTrustedHops('abc')).toBe(1);
    expect(resolveTrustedHops('-2')).toBe(1);
    expect(resolveTrustedHops('1.5')).toBe(1);
    expect(resolveTrustedHops('true')).toBe(1);
  });

  it('plafonne une chaîne déraisonnable plutôt que de la suivre', () => {
    expect(resolveTrustedHops('99')).toBe(4);
    expect(resolveTrustedHops('1000')).toBe(4);
  });
});

describe('resolveTrustProxy — ce qui est remis à Fastify', () => {
  it('ne rend JAMAIS `true` — l’appelant ne doit pas choisir son adresse', () => {
    for (const entree of ['true', 'yes', 'all', 'oui', '-1', 'abc', '1.5', 'NaN', '99']) {
      expect(resolveTrustProxy(entree)).not.toBe(true);
    }
  });

  it('rend `false` quand il n’y a aucun mandataire', () => {
    expect(resolveTrustProxy('0')).toBe(NO_PROXY);
    expect(resolveTrustProxy('none')).toBe(false);
  });

  it('rend une fonction de confiance bornée au nombre de maillons', () => {
    const trust = resolveTrustProxy('2');

    expect(typeof trust).toBe('function');
    const f = trust as (address: string, hop: number) => boolean;
    // `hop` compte depuis le serveur : 0 est notre propre proxy.
    expect(f('10.0.0.1', 0)).toBe(true);
    expect(f('10.0.0.2', 1)).toBe(true);
    // Au-delà, c'est la partie de `X-Forwarded-For` que l'appelant écrit.
    expect(f('203.0.113.9', 2)).toBe(false);
    expect(f('203.0.113.9', 7)).toBe(false);
  });

  it('par défaut, ne fait confiance qu’au maillon le plus proche', () => {
    const f = resolveTrustProxy(undefined) as (address: string, hop: number) => boolean;

    expect(f('172.18.0.5', 0)).toBe(true);
    expect(f('203.0.113.9', 1)).toBe(false);
  });
});
