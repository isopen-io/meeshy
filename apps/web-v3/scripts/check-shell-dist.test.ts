import { describe, expect, test } from 'bun:test';

// @ts-expect-error — module .mjs sans déclaration de types ; ce témoin
// interroge son API publique exactement comme le pilote le fait.
import { auditDeepLinkPage, auditShellDist } from './check-shell-dist.mjs';
import { INSTITUTIONAL_ROUTES } from './lib/institutional-routes.mjs';

/**
 * LE TÉMOIN DU GATE DE COQUE (#5604, revue-correction).
 *
 * Le gate `check-shell-dist.mjs` garde quatre clauses du contrat de la
 * variante B. Sa LOGIQUE n'avait, elle, aucun témoin : une régression dans la
 * détection (une expression régulière trop permissive, une clause muette) se
 * serait signalée par un gate VERT — le pire des silences, puisque c'est
 * précisément un gate. Ce fichier oppose à `auditShellDist` un dist CONFORME
 * (zéro violation) et un dist FAUTIF par clause (une violation nommée).
 *
 * Il n'a été rendu possible qu'en gardant le pilote du gate derrière
 * `import.meta.url === argv[1]` : jusque-là, importer le module lançait une
 * construction complète, malgré un commentaire qui annonçait la pureté.
 */

const CONFORME =
  '<!doctype html><html><head>' +
  '<meta charset="utf-8" />' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />' +
  '<meta name="theme-color" content="#0b0c14" media="(prefers-color-scheme: dark)" />' +
  '<script type="module" crossorigin src="/assets/index-abc.js"></script>' +
  '<link rel="stylesheet" href="/assets/index-abc.css">' +
  '</head><body><div id="root"></div></body></html>';

const FICHIERS_CONFORMES = [
  'dist-capacitor/index.html',
  'dist-capacitor/assets/index-abc.js',
  'dist-capacitor/assets/index-abc.css',
  ...INSTITUTIONAL_ROUTES.map((route) => `dist-capacitor/${route}/index.html`),
];

describe('auditShellDist — les quatre clauses du contrat de la variante B', () => {
  test('un dist conforme ne rend aucune violation', () => {
    expect(auditShellDist(CONFORME, FICHIERS_CONFORMES)).toEqual([]);
  });

  test('une base RELATIVE est refusée — un lien profond résoudrait /c/assets/…', () => {
    const fautif = CONFORME.replace('/assets/index-abc.js', './assets/index-abc.js');
    const violations = auditShellDist(fautif, FICHIERS_CONFORMES);
    expect(violations.length).toBe(1);
    expect(violations[0].includes('RELATIFS')).toBe(true);
  });

  test('un service worker émis est refusé — deux caches sur le même bundle', () => {
    const violations = auditShellDist(CONFORME, [...FICHIERS_CONFORMES, 'dist-capacitor/sw.js']);
    expect(violations.length).toBe(1);
    expect(violations[0].includes('service worker')).toBe(true);
  });

  test('viewport-fit=cover absent est refusé — la safe-area ne serait pas exposée', () => {
    const fautif = CONFORME.replace(', viewport-fit=cover', '');
    const violations = auditShellDist(fautif, FICHIERS_CONFORMES);
    expect(violations.length).toBe(1);
    expect(violations[0].includes('viewport-fit=cover')).toBe(true);
  });

  test('theme-color #0b0c14 absent est refusé — un flash blanc au démarrage à froid', () => {
    const fautif = CONFORME.replace('#0b0c14', '#ffffff');
    const violations = auditShellDist(fautif, FICHIERS_CONFORMES);
    expect(violations.length).toBe(1);
    expect(violations[0].includes('theme-color')).toBe(true);
  });

  test('aucun actif root-absolu du tout est refusé — la base n’est pas la racine', () => {
    const fautif = CONFORME.replace('/assets/index-abc.js', 'https://cdn.example/index-abc.js').replace(
      'href="/assets/index-abc.css"',
      'href="https://cdn.example/index-abc.css"',
    );
    const violations = auditShellDist(fautif, FICHIERS_CONFORMES);
    expect(violations.length).toBe(1);
    expect(violations[0].includes('root-absolu')).toBe(true);
  });
});

/**
 * LES CINQ PAGES INSTITUTIONNELLES SONT DANS *CE* DIST (#5812, élargit
 * #5821) — un dist sans elles est celui qu'un `dist-capacitor/` recevait
 * réellement tant que `prerender-institutional.tsx` écrivait `../dist` en
 * dur : les quatre clauses ci-dessus, toutes bâties sur `index.html` seul,
 * ne pouvaient pas le voir.
 */
describe('auditShellDist — les cinq pages institutionnelles sont dans CE dist (#5812, élargit #5821)', () => {
  test('un dist SANS aucune page institutionnelle est refusé — ROUGE', () => {
    const sansInstitutionnel = FICHIERS_CONFORMES.filter((f) => !f.includes('/index.html') || f === 'dist-capacitor/index.html');
    const violations = auditShellDist(CONFORME, sansInstitutionnel);
    expect(violations.some((v: string) => v.includes('institutionnelle'))).toBe(true);
    for (const route of INSTITUTIONAL_ROUTES) {
      expect(violations.some((v: string) => v.includes(route))).toBe(true);
    }
  });

  test('un dist auquel il manque UNE seule page nomme précisément celle-là', () => {
    const amputee = FICHIERS_CONFORMES.filter((f) => f !== 'dist-capacitor/privacy/index.html');
    const violations = auditShellDist(CONFORME, amputee);
    expect(violations.length).toBe(1);
    expect(violations[0].includes('privacy')).toBe(true);
    expect(violations[0].includes('about')).toBe(false);
  });

  test('un dist complet (les cinq pages) ne rend aucune violation de cette clause', () => {
    const violations = auditShellDist(CONFORME, FICHIERS_CONFORMES);
    expect(violations.some((v: string) => v.includes('institutionnelle'))).toBe(false);
  });
});

/**
 * LE LIEN PROFOND (#5725, D-27 corrigée en revue #5812) — DEUX TÉMOINS QUI
 * ROUGISSENT SUR LES DEUX ÉCRITURES SUCCESSIVES DU MÊME DÉFAUT.
 *
 * Écriture 1, le défaut d'origine : `index.html` en chemins RELATIFS
 * (`./assets/…`). Les DEUX coques servent bien `index.html` en réponse à
 * `/c/<id>` (html5mode Android, routeur iOS), mais le NAVIGATEUR résout
 * alors `./assets/x.js` contre l'URL naviguée — `https://localhost/c/assets/x.js`,
 * qui n'existe pas. Le corps arrive, le script jamais.
 *
 * Écriture 2, le premier correctif : une balise `<base href="/">`. Elle
 * répare les actifs et casse tout le reste — `<base>` déplace la résolution
 * de TOUTE URL relative du document, fragments compris. Mesuré : depuis
 * `/c/<id>`, `<a href="#contenu">` (le lien d'évitement, sur CHAQUE écran)
 * résolvait vers `https://localhost/#contenu`, et l'activer quittait le fil.
 * Le correctif retenu est la `base` de Vite (`/`, la même que la variante A).
 */
describe('auditShellDist — le lien profond résout ses actifs SANS balise <base> (#5725, #5812)', () => {
  test('des actifs RELATIFS sont refusés — un lien profond les résoudrait sous /c/ — ROUGE', () => {
    const relatif = CONFORME.replace('/assets/index-abc.js', './assets/index-abc.js');
    const violations = auditShellDist(relatif, FICHIERS_CONFORMES);
    expect(violations.some((v: string) => v.includes('RELATIFS'))).toBe(true);
  });

  test('une balise <base href="/"> est refusée — elle casse les URL de fragment', () => {
    const avecBase = CONFORME.replace('<meta charset="utf-8" />', '<meta charset="utf-8" /><base href="/">');
    const violations = auditShellDist(avecBase, FICHIERS_CONFORMES);
    expect(violations.some((v: string) => v.includes('<base>'))).toBe(true);
  });

  test('un dist root-absolu et sans <base> ne rend aucune violation — VERT', () => {
    expect(auditShellDist(CONFORME, FICHIERS_CONFORMES)).toEqual([]);
  });
});

/**
 * `auditDeepLinkPage` — LE LIEN PROFOND MONTE LE FIL, PAS UNE COQUILLE (#5812).
 *
 * `auditDeepLink` (§ Étape 1 ci-dessus) ne prouvait, avant ce travail, que
 * `bodyLen > 0`, `#root.childElementCount > 0` et zéro `pageerror` — un seuil
 * qu'un écran REFUSÉ (403/404, D-6) ou un écran INTROUVABLE (`NotFound`)
 * franchissent tout autant qu'un fil réel. Les trois instantanés ci-dessous
 * sont ceux MESURÉS sur le dist capacitor de ce tour (§ 0.3 de la
 * spécification) — un corpus qui peut faire ÉCHOUER le test, pas seulement le
 * confirmer (« un corpus qui ne peut pas faire échouer un test ne peut pas le
 * valider »).
 */
const ICI = 'http://127.0.0.1:51082/c/c-deploiement';
const SUR_PLACE = `${ICI}#contenu`;
/* Ce que la balise <base href="/"> produisait, mesuré sur le dist de la coque
   (§ « écriture 2 » ci-dessus) : le lien d'évitement pointe la RACINE. */
const HORS_ECRAN = 'http://127.0.0.1:51082/#contenu';

const INSTANTANE_FIL = {
  bodyLen: 25_325,
  rootChildren: 1,
  hasThreadMain: true,
  hasComposer: true,
  documentUrl: ICI,
  skipLinkTarget: SUR_PLACE,
};
const INSTANTANE_REFUSE = {
  bodyLen: 1_627,
  rootChildren: 1,
  hasThreadMain: false,
  hasComposer: false,
  documentUrl: 'http://127.0.0.1:51082/c/zzz-inconnu',
  skipLinkTarget: 'http://127.0.0.1:51082/c/zzz-inconnu#contenu',
};
const INSTANTANE_INTROUVABLE = {
  bodyLen: 479,
  rootChildren: 1,
  hasThreadMain: false,
  hasComposer: false,
  documentUrl: 'http://127.0.0.1:51082/zzz',
  skipLinkTarget: 'http://127.0.0.1:51082/zzz#contenu',
};
const INSTANTANE_VIDE = {
  bodyLen: 0,
  rootChildren: -1,
  hasThreadMain: false,
  hasComposer: false,
  documentUrl: ICI,
  skipLinkTarget: null,
};

describe('auditDeepLinkPage — le lien profond monte LE FIL, pas une coquille (#5812)', () => {
  test('un instantané de FIL, attendu comme fil, ne rend aucune violation', () => {
    expect(auditDeepLinkPage(INSTANTANE_FIL, { expect: 'thread' })).toEqual([]);
  });

  test('un instantané REFUSÉ, attendu comme fil, rend une violation qui nomme « pas le fil »', () => {
    const violations = auditDeepLinkPage(INSTANTANE_REFUSE, { expect: 'thread' });
    expect(violations.length).toBe(1);
    expect(violations[0].includes('pas le fil')).toBe(true);
  });

  test('un instantané INTROUVABLE, attendu comme fil, rend une violation', () => {
    const violations = auditDeepLinkPage(INSTANTANE_INTROUVABLE, { expect: 'thread' });
    expect(violations.length).toBe(1);
  });

  test('un instantané VIDE (page blanche), attendu comme fil, rend une violation qui nomme « page blanche »', () => {
    const violations = auditDeepLinkPage(INSTANTANE_VIDE, { expect: 'thread' });
    expect(violations.length).toBe(1);
    expect(violations[0].includes('page blanche')).toBe(true);
  });

  test('le lien d’évitement qui QUITTE l’écran est refusé — le défaut de la balise <base>', () => {
    const fuite = { ...INSTANTANE_FIL, skipLinkTarget: HORS_ECRAN };
    const violations = auditDeepLinkPage(fuite, { expect: 'thread' });
    expect(violations.length).toBe(1);
    expect(violations[0].includes('QUITTE')).toBe(true);
  });

  test('un écran REFUSÉ dont le lien d’évitement fuit est refusé aussi — la clause est route-indépendante', () => {
    const fuite = { ...INSTANTANE_REFUSE, skipLinkTarget: HORS_ECRAN };
    const violations = auditDeepLinkPage(fuite, { expect: 'refused' });
    expect(violations.length).toBe(1);
    expect(violations[0].includes('QUITTE')).toBe(true);
  });

  test('un lien d’évitement DISPARU est refusé — sinon la clause serait muette', () => {
    const sansLien = { ...INSTANTANE_FIL, skipLinkTarget: null };
    const violations = auditDeepLinkPage(sansLien, { expect: 'thread' });
    expect(violations.length).toBe(1);
    expect(violations[0].includes('skip-link')).toBe(true);
  });

  test('un seuil a ses DEUX moitiés — l’audit sait aussi dire « pas le fil » attendu', () => {
    // Un id INCONNU : le refus est attendu, et un refus RÉEL ne viole rien.
    expect(auditDeepLinkPage(INSTANTANE_REFUSE, { expect: 'refused' })).toEqual([]);
    // … mais si le FIL avait quand même monté sur un id censé être refusé, ce
    // serait une fuite (D-6) — l’audit doit la refuser.
    const violations = auditDeepLinkPage(INSTANTANE_FIL, { expect: 'refused' });
    expect(violations.length).toBe(1);
  });
});
