import { describe, expect, test } from 'bun:test';

import {
  auditRoutage,
  auditSeauApi,
  auditSeauMedias,
  decoupePremierArgument,
  matcherDuSeau,
  seauxDansLOrdre,
  // @ts-expect-error — module .mjs sans déclaration de types ; ce témoin
  // interroge son API publique exactement comme le pilote le fait.
} from './check-sw-api-cache.mjs';

/**
 * LE GATE QUI JUGE L'ARTEFACT, ET SON PROPRE TÉMOIN (#6862, étendu #6973).
 *
 * `check-sw-api-cache.mjs` est né d'un vert menteur : le témoin de la règle
 * lisait `vite.config.ts`, pendant que `dist/sw.js` portait un matcher qui ne
 * s'évaluait même pas. Ce fichier rejoue les formes qu'un service worker
 * construit a réellement portées, pour que le gate ne puisse pas verdir sur
 * une fautive.
 *
 * #6973 y ajoute le ROUTAGE : la règle du seau `api` peut être juste et la
 * v2 perdre quand même sa lecture hors ligne, parce qu'un défilement de fil
 * remplit les 200 entrées du seau avec des images. Ce que le gate mesure
 * désormais n'est plus « ce matcher décide-t-il bien ? » mais « QUEL SEAU
 * gagne cette requête ? » — la question que le routeur de Workbox pose, et la
 * seule dont la réponse soit observable par l'utilisateur.
 */

/** Le seau `api`, tel que Workbox le sérialise. */
const SEAU_API = (matcher: string) =>
  `s.registerRoute(${matcher},new s.NetworkFirst({cacheName:"api",networkTimeoutSeconds:3,` +
  `plugins:[new s.ExpirationPlugin({maxEntries:200,maxAgeSeconds:604800})]}),"GET")`;

/** Le seau `medias`, avec ou sans sa garde de réponse cachable. */
const SEAU_MEDIAS = ({ cachable = true, matcher = '({request:s})=>"image"===s.destination' } = {}) =>
  `s.registerRoute(${matcher},new s.CacheFirst({cacheName:"medias",plugins:[` +
  `new s.ExpirationPlugin({maxEntries:300,maxAgeSeconds:2592e3,purgeOnQuotaError:!0})` +
  (cachable ? ',new s.CacheableResponsePlugin({statuses:[0,200]})' : '') +
  `]}),"GET")`;

const AUTOUR = (...routes: string[]) =>
  `self.define(["./workbox"],function(s){s.precacheAndRoute([{url:"index.html"}]),` +
  `${routes.join(',')}});`;

/** Le texte EXACT livré le 2026-09-17, avant correction. */
const MATCHER_LIVRE_FAUTIF = '({url:s})=>apiResponseMayBeCached(s.pathname)';
/** La forme de `dev` : autonome, et sans la règle d'administration. */
const MATCHER_DE_DEV = '({url:s})=>s.pathname.startsWith("/api/")';
/** La forme LIVRÉE le 2026-09-18 : l'administration exclue, les médias PAS. */
const MATCHER_API_SANS_MEDIAS = String.raw`/^https?:\/\/[^/]+\/api\/(?!v1\/admin(?:[/?#]|$))/`;
/** La forme retenue par #6973 : l'administration ET les médias exclus. */
const MATCHER_JUSTE = String.raw`/^https?:\/\/[^/]+\/api\/(?!v1\/admin(?:[/?#]|$))(?!(?:v1\/)?attachments\/)/`;

/** L'artefact CONFORME, sur lequel toutes les fonctions doivent se taire. */
const CONFORME = AUTOUR(SEAU_MEDIAS(), SEAU_API(MATCHER_JUSTE));

describe('le gate du seau `api` juge le service worker CONSTRUIT', () => {
  test('un matcher qui appelle un identifiant absent du bundle est dénoncé — le défaut livré', () => {
    const violations = auditSeauApi(AUTOUR(SEAU_API(MATCHER_LIVRE_FAUTIF), SEAU_MEDIAS()));

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('NON AUTONOME');
    expect(violations[0]).toContain('apiResponseMayBeCached');
  });

  test('un matcher autonome MAIS sans la règle laisse partir l’administration — et rougit', () => {
    const violations = auditSeauApi(AUTOUR(SEAU_API(MATCHER_DE_DEV), SEAU_MEDIAS()));

    expect(violations.join('\n')).toContain('/api/v1/admin/conversations');
    expect(violations.join('\n')).toContain('DISQUE');
  });

  test('un matcher qui refuse TOUT rougit aussi — le hors-ligne de la v2 en dépend', () => {
    const violations = auditSeauApi(AUTOUR(SEAU_API('()=>!1'), SEAU_MEDIAS()));

    expect(violations.join('\n')).toContain('/api/v1/conversations');
    expect(violations.join('\n')).toContain('hors ligne');
  });

  test('la forme retenue ne laisse RIEN — ni fuite sur le disque, ni perte de hors-ligne', () => {
    expect(auditSeauApi(CONFORME)).toEqual([]);
  });

  test('un service worker sans seau `api` est un manquement, pas un silence', () => {
    expect(auditSeauApi('self.define([],function(){})')).toEqual([
      'aucun seau `api` (`cacheName:"api"`) dans le service worker construit',
    ]);
  });

  /**
   * LE DÉFAUT DE #6973, MESURÉ SUR LE MATCHER LIVRÉ LE 2026-09-18 : il est
   * juste sur l'administration, autonome, bien branché — et il avale les
   * médias, parce qu'il n'est ancré sur aucune origine et que TOUTE URL de
   * média passe par `/api/v1/attachments/…`.
   */
  test('le motif LIVRÉ — juste sur l’administration — avale les médias, et rougit maintenant', () => {
    const violations = auditSeauApi(AUTOUR(SEAU_MEDIAS(), SEAU_API(MATCHER_API_SANS_MEDIAS)));

    expect(violations.join('\n')).toContain('/api/v1/attachments/file/');
    expect(violations.join('\n')).toContain('200 entrées');
  });
});

/**
 * LE SEAU DES MÉDIAS, ET SA MOITIÉ INDISSOCIABLE.
 *
 * Sortir les médias du seau du JSON ne change RIEN sans
 * `cacheableResponse: { statuses: [0, 200] }` : une `<img>` sans `crossOrigin`
 * rend une réponse OPAQUE (status 0), que `CacheFirst` rejette en silence. Le
 * seau resterait vide, et le gate — s'il ne regardait que le routage —
 * verdirait sur un correctif sans effet.
 */
describe('le seau des médias, et sa garde de réponse cachable', () => {
  test('l’artefact conforme ne laisse rien à dire', () => {
    expect(auditSeauMedias(CONFORME)).toEqual([]);
  });

  test('un seau des médias SANS `CacheableResponsePlugin` rougit — l’opaque y est rejetée en silence', () => {
    const violations = auditSeauMedias(AUTOUR(SEAU_MEDIAS({ cachable: false }), SEAU_API(MATCHER_JUSTE)));

    expect(violations.join('\n')).toContain('CacheableResponsePlugin');
    expect(violations.join('\n')).toContain('opaque');
  });

  test('un seau des médias enregistré APRÈS celui de l’API rougit — la première route gagne', () => {
    const violations = auditSeauMedias(AUTOUR(SEAU_API(MATCHER_JUSTE), SEAU_MEDIAS()));

    expect(violations.join('\n')).toContain('AVANT');
  });

  test('un matcher de médias non autonome rougit — le même piège que le seau `api`', () => {
    const violations = auditSeauMedias(
      AUTOUR(SEAU_MEDIAS({ matcher: '({url:s})=>mediaResponseMayBeCached(s.pathname)' }), SEAU_API(MATCHER_JUSTE)),
    );

    expect(violations.join('\n')).toContain('NON AUTONOME');
  });

  test('un service worker sans seau des médias est un manquement', () => {
    expect(auditSeauMedias(AUTOUR(SEAU_API(MATCHER_JUSTE))).join('\n')).toContain('aucun seau `medias`');
  });

  test('l’ordre d’enregistrement se LIT dans l’artefact, il ne se déduit pas de la configuration', () => {
    expect(seauxDansLOrdre(CONFORME).map((s: { seau: string }) => s.seau)).toEqual(['medias', 'api']);
  });
});

/**
 * LE ROUTAGE — CE QUE LE ROUTEUR DE WORKBOX DÉCIDE, SEAU PAR REQUÊTE.
 *
 * Les deux audits ci-dessus jugent chacun un seau. Aucun des deux ne dit où
 * TOMBE une requête donnée : c'est l'ordre d'enregistrement qui en décide, et
 * c'est la seule chose que l'utilisateur observe. `auditRoutage` rejoue donc
 * `Router.findMatchingRoute` — première route qui matche, gagné — sur une
 * table (URL, `destination`) attendue.
 *
 * AUDIO ET VIDÉO Y FIGURENT EXPLICITEMENT COMME NON CACHÉS, et ce n'est pas un
 * oubli : c'est la décision de #6973 point 5, inscrite dans le gate pour
 * qu'elle ne puisse pas devenir un oubli. Une règle qui les avalerait
 * (« CacheFirst sur toute la route de flux ») stockerait des réponses `206`
 * qu'elle ne peut ni garder ni resservir sans `RangeRequestsPlugin`, et un
 * `RangeRequestsPlugin` exige d'avoir la réponse ENTIÈRE en cache — donc de
 * télécharger une vidéo de fil entière avant de la jouer. Hors cache, la
 * lecture progressive reste intacte.
 */
describe('le routage : QUEL seau gagne cette requête', () => {
  test('l’artefact conforme route tout au bon endroit', () => {
    expect(auditRoutage(CONFORME)).toEqual([]);
  });

  /**
   * L'ARTEFACT LIVRÉ LE 2026-09-18, à l'octet près : le seau `api` enregistré
   * le PREMIER, avec un motif juste sur l'administration et aveugle aux
   * médias. Tout part dans le seau du JSON — c'est la mesure de l'issue.
   */
  test('l’artefact LIVRÉ route TOUS les médias vers le seau du JSON', () => {
    const violations = auditRoutage(AUTOUR(SEAU_API(MATCHER_API_SANS_MEDIAS), SEAU_MEDIAS()));

    expect(violations.join('\n')).toContain('attendu `medias`');
    expect(violations.join('\n')).toContain('obtenu `api`');
    expect(violations.join('\n')).toContain('avatar.png');
  });

  /**
   * CHACUNE DES DEUX MOITIÉS DE ROUTAGE EST NÉCESSAIRE, et ces deux témoins le
   * prouvent séparément — c'est pour ça que le correctif pose les DEUX (l'ordre
   * ET l'exclusion du motif) plutôt que de choisir.
   *
   * Ici l'ORDRE seul : les images sont sauvées, mais la vidéo et le vocal —
   * qu'aucun seau ne réclame par destination — retombent dans le seau du JSON.
   */
  test('l’ORDRE seul ne suffit pas : vidéo et vocal retombent dans le seau du JSON', () => {
    const violations = auditRoutage(AUTOUR(SEAU_MEDIAS(), SEAU_API(MATCHER_API_SANS_MEDIAS)));

    expect(violations.join('\n')).toContain('.mp4');
    expect(violations.join('\n')).toContain('.m4a');
    expect(violations.join('\n')).toContain('obtenu `api`');
    expect(violations.join('\n')).not.toContain('avatar.png');
  });

  test('l’EXCLUSION seule ne suffit pas non plus : sans l’ordre, rien ne change pour les images', () => {
    // Le motif juste, mais le seau des médias derrière : `medias` reste
    // atteignable (le motif `api` refuse les médias) — donc l'ordre est la
    // CEINTURE, et l'exclusion les bretelles. Aucune des deux n'est décorative.
    expect(auditRoutage(AUTOUR(SEAU_API(MATCHER_JUSTE), SEAU_MEDIAS()))).toEqual([]);
    expect(auditSeauMedias(AUTOUR(SEAU_API(MATCHER_JUSTE), SEAU_MEDIAS())).join('\n')).toContain('AVANT');
  });

  test('une vidéo ou un vocal qui RETOMBE dans un seau rougit — la décision est « hors cache »', () => {
    const avaleTout = SEAU_MEDIAS({ matcher: String.raw`/\/api\/(?:v1\/)?attachments\//` });
    const violations = auditRoutage(AUTOUR(avaleTout, SEAU_API(MATCHER_JUSTE)));

    expect(violations.join('\n')).toContain('.mp4');
    expect(violations.join('\n')).toContain('aucun seau');
  });

  test('le JSON reste au seau `api` — le sortir casserait la lecture hors ligne', () => {
    const violations = auditRoutage(AUTOUR(SEAU_MEDIAS(), SEAU_API('()=>!1')));

    expect(violations.join('\n')).toContain('/api/v1/conversations');
    expect(violations.join('\n')).toContain('attendu `api`');
  });
});

describe('le découpage du premier argument', () => {
  /**
   * Le découpage est la partie fragile : le motif retenu porte `[^/]`, et un
   * scanner naïf y voit la fin du littéral — c'est exactement ce qui est
   * arrivé à la première version de ce gate, qui a rougi sur un artefact
   * JUSTE en annonçant « Invalid regular expression ».
   */
  test('le découpage traverse une classe de caractères contenant `/`', () => {
    expect(matcherDuSeau(CONFORME, 'api')).toBe(MATCHER_JUSTE);
  });

  test('le découpage s’arrête à la virgule de PREMIER niveau, pas à celles du matcher', () => {
    expect(decoupePremierArgument('registerRoute(({url:u})=>f(u,1),new X())', 'registerRoute('.length)).toBe(
      '({url:u})=>f(u,1)',
    );
  });
});
