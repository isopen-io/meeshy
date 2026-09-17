import { describe, expect, test } from 'bun:test';

// @ts-expect-error — module .mjs sans déclaration de types ; ce témoin
// interroge son API publique exactement comme le pilote le fait.
import { auditSeauApi, decoupePremierArgument, matcherDuSeau } from './check-sw-api-cache.mjs';

/**
 * LE GATE QUI JUGE L'ARTEFACT, ET SON PROPRE TÉMOIN (#6862).
 *
 * `check-sw-api-cache.mjs` est né d'un vert menteur : le témoin de la règle
 * lisait `vite.config.ts`, pendant que `dist/sw.js` portait un matcher qui ne
 * s'évaluait même pas. Ce fichier rejoue les TROIS formes qu'un service
 * worker construit a réellement portées, pour que le gate ne puisse pas
 * verdir sur la fautive.
 */

const AUTOUR = (matcher: string) =>
  `self.define(["./workbox"],function(s){s.precacheAndRoute([{url:"index.html"}]),` +
  `s.registerRoute(${matcher},new s.NetworkFirst({cacheName:"api",networkTimeoutSeconds:3,` +
  `plugins:[new s.ExpirationPlugin({maxEntries:200,maxAgeSeconds:604800})]}),"GET"),` +
  `s.registerRoute(({request:s})=>"image"===s.destination,new s.CacheFirst({cacheName:"medias"}),"GET")});`;

/** Le texte EXACT livré le 2026-09-17, avant correction. */
const MATCHER_LIVRE_FAUTIF = '({url:s})=>apiResponseMayBeCached(s.pathname)';
/** La forme de `dev` : autonome, et sans la règle d'administration. */
const MATCHER_DE_DEV = '({url:s})=>s.pathname.startsWith("/api/")';
/** La forme retenue : une valeur, sérialisée en littéral. */
const MATCHER_JUSTE = String.raw`/^https?:\/\/[^/]+\/api\/(?!v1\/admin(?:[/?#]|$))/`;

describe('le gate du seau `api` juge le service worker CONSTRUIT', () => {
  test('un matcher qui appelle un identifiant absent du bundle est dénoncé — le défaut livré', () => {
    const violations = auditSeauApi(AUTOUR(MATCHER_LIVRE_FAUTIF));

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('NON AUTONOME');
    expect(violations[0]).toContain('apiResponseMayBeCached');
  });

  test('un matcher autonome MAIS sans la règle laisse partir l’administration — et rougit', () => {
    const violations = auditSeauApi(AUTOUR(MATCHER_DE_DEV));

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.join('\n')).toContain('/api/v1/admin/conversations');
    expect(violations.join('\n')).toContain('DISQUE');
  });

  test('un matcher qui refuse TOUT rougit aussi — le hors-ligne de la v2 en dépend', () => {
    const violations = auditSeauApi(AUTOUR('()=>!1'));

    expect(violations.join('\n')).toContain('/api/v1/conversations');
    expect(violations.join('\n')).toContain('hors ligne');
  });

  test('la forme retenue ne laisse RIEN — ni fuite sur le disque, ni perte de hors-ligne', () => {
    expect(auditSeauApi(AUTOUR(MATCHER_JUSTE))).toEqual([]);
  });

  test('un service worker sans seau `api` est un manquement, pas un silence', () => {
    expect(auditSeauApi('self.define([],function(){})')).toEqual([
      'aucun seau `api` (`cacheName:"api"`) dans le service worker construit',
    ]);
  });

  /**
   * Le découpage est la partie fragile : le motif retenu porte `[^/]`, et un
   * scanner naïf y voit la fin du littéral — c'est exactement ce qui est
   * arrivé à la première version de ce gate, qui a rougi sur un artefact
   * JUSTE en annonçant « Invalid regular expression ».
   */
  test('le découpage traverse une classe de caractères contenant `/`', () => {
    expect(matcherDuSeau(AUTOUR(MATCHER_JUSTE), 'api')).toBe(MATCHER_JUSTE);
  });

  test('le découpage s’arrête à la virgule de PREMIER niveau, pas à celles du matcher', () => {
    expect(decoupePremierArgument('registerRoute(({url:u})=>f(u,1),new X())', 'registerRoute('.length)).toBe(
      '({url:u})=>f(u,1)',
    );
  });
});
