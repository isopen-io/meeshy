import { describe, expect, test } from 'bun:test';

// @ts-expect-error — module .mjs sans déclaration de types ; ce témoin
// interroge son API publique exactement comme le pilote le fait.
import { auditShellDist } from './check-shell-dist.mjs';

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
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />' +
  '<meta name="theme-color" content="#0b0c14" media="(prefers-color-scheme: dark)" />' +
  '<script type="module" crossorigin src="./assets/index-abc.js"></script>' +
  '<link rel="stylesheet" href="./assets/index-abc.css">' +
  '</head><body><div id="root"></div></body></html>';

const FICHIERS_CONFORMES = [
  'dist-capacitor/index.html',
  'dist-capacitor/assets/index-abc.js',
  'dist-capacitor/assets/index-abc.css',
];

describe('auditShellDist — les quatre clauses du contrat de la variante B', () => {
  test('un dist conforme ne rend aucune violation', () => {
    expect(auditShellDist(CONFORME, FICHIERS_CONFORMES)).toEqual([]);
  });

  test('une base ABSOLUE est refusée — la coque charge depuis le système de fichiers', () => {
    const fautif = CONFORME.replace('./assets/index-abc.js', '/assets/index-abc.js');
    const violations = auditShellDist(fautif, FICHIERS_CONFORMES);
    expect(violations.length).toBe(1);
    expect(violations[0].includes('base ABSOLUE')).toBe(true);
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

  test('une URL protocole-relative (//cdn) n’est PAS lue comme une base absolue', () => {
    const relatif = CONFORME.replace('./assets/index-abc.js', '//cdn.example/index-abc.js');
    expect(auditShellDist(relatif, FICHIERS_CONFORMES)).toEqual([]);
  });
});
