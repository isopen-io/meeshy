import { describe, expect, test } from 'bun:test';

import { resolveApiConfig } from './config';

/**
 * `resolveApiConfig` — LA SEULE source de la base d'API et de la source de
 * données (#5605, T1).
 *
 * Miroir de `MeeshyConfig.swift` : un défaut qui marche TOUJOURS (la
 * production, jamais une base cassée), une surcharge par l'environnement de
 * construction (`import.meta.env` côté appelant réel, un objet simple ici —
 * c'est ce qui rend la règle testable, motif `cors-origins.ts:70`), et un cas
 * que iOS n'a pas : la base RELATIVE du web nu, proxée en dev et déployée
 * derrière la même origine que le document.
 */
describe('resolveApiConfig — la base', () => {
  /**
   * **La base relative n'est valide QUE là où un proxy la rend valide (#5872).**
   *
   * En dev, `vite.config.ts` (§ `server.proxy`) relaie `/api/v1` vers la
   * passerelle : `''` y désigne bien l'API. En PRODUCTION il n'y a aucun
   * proxy — `nginx.conf` n'a pas de `location /api` — et `''` désigne le
   * serveur de fichiers statiques, qui répond **405** à un POST. Mesuré le
   * 2026-09-09 : plus personne ne pouvait se connecter depuis
   * `staging.meeshy.me`, et la console ne montrait que
   * `/api/v1/auth/login … 405`.
   *
   * Le défaut retombe donc sur l'origine de production — le même repli que la
   * branche coque, et pour la même raison qu'elle l'a déjà : une erreur de
   * configuration doit rendre un défaut qui FONCTIONNE, jamais une base
   * cassée. C'est `VITE_API_BASE` qui désigne un autre environnement.
   */
  test('défaut web en DEV : base relative — le proxy Vite la rend valide', () => {
    expect(resolveApiConfig({ DEV: true }, { shell: false }).base).toBe('');
  });

  test("défaut web en PRODUCTION : origine absolue, jamais '' — sans proxy, '' vise nginx (#5872)", () => {
    expect(resolveApiConfig({}, { shell: false }).base).toBe('https://gate.meeshy.me');
    expect(resolveApiConfig({ DEV: false }, { shell: false }).base).toBe('https://gate.meeshy.me');
  });

  test('surcharge explicite en DEV : elle gagne sur le relatif', () => {
    const config = resolveApiConfig({ DEV: true, VITE_API_BASE: 'https://gate.staging.meeshy.me' }, { shell: false });
    expect(config.base).toBe('https://gate.staging.meeshy.me');
  });

  test('surcharge web : origine normalisée, sans barre finale', () => {
    const config = resolveApiConfig({ VITE_API_BASE: 'https://gate.staging.meeshy.me/' }, { shell: false });
    expect(config.base).toBe('https://gate.staging.meeshy.me');
  });

  test('surcharge web : un `/api/v1` surnuméraire est retiré', () => {
    const config = resolveApiConfig({ VITE_API_BASE: 'https://gate.staging.meeshy.me/api/v1' }, { shell: false });
    expect(config.base).toBe('https://gate.staging.meeshy.me');
  });

  /**
   * Le mécanisme de surcharge ne doit pas réintroduire le défaut qu'il corrige :
   * `ARG VITE_API_BASE=""` non renseigné au `docker build` pose la chaîne VIDE,
   * que Vite expose telle quelle (#5872).
   */
  test('surcharge VIDE = ABSENTE, jamais une base relative', () => {
    expect(resolveApiConfig({ VITE_API_BASE: '' }, { shell: false }).base).toBe('https://gate.meeshy.me');
    expect(resolveApiConfig({ DEV: true, VITE_API_BASE: '' }, { shell: false }).base).toBe('');
    expect(resolveApiConfig({ VITE_API_BASE: '' }, { shell: true }).base).toBe('https://gate.meeshy.me');
  });

  test('surcharge BLANCHE = ABSENTE elle aussi', () => {
    expect(resolveApiConfig({ VITE_API_BASE: '   ' }, { shell: false }).base).toBe('https://gate.meeshy.me');
    expect(resolveApiConfig({ DEV: true, VITE_API_BASE: '   ' }, { shell: false }).base).toBe('');
    expect(resolveApiConfig({ VITE_API_BASE: '   ' }, { shell: true }).base).toBe('https://gate.meeshy.me');
  });

  test('coque Capacitor, défaut : base ABSOLUE de production — miroir de MeeshyConfig.swift:6', () => {
    expect(resolveApiConfig({}, { shell: true }).base).toBe('https://gate.meeshy.me');
  });

  test('coque + surcharge RELATIVE = ignorée (fail-closed, jamais une base cassée)', () => {
    const config = resolveApiConfig({ VITE_API_BASE: '/api/v1' }, { shell: true });
    expect(config.base).toBe('https://gate.meeshy.me');
  });

  test('coque + surcharge ABSOLUE : prise telle quelle (recette QEMU)', () => {
    const config = resolveApiConfig({ VITE_API_BASE: 'https://gate.staging.meeshy.me' }, { shell: true });
    expect(config.base).toBe('https://gate.staging.meeshy.me');
  });
});

describe('resolveApiConfig — la source de données', () => {
  test('défaut : fixtures', () => {
    expect(resolveApiConfig({}, { shell: false }).source).toBe('fixtures');
  });

  test('surcharge exacte "gateway" : gateway', () => {
    expect(resolveApiConfig({ VITE_DATA_SOURCE: 'gateway' }, { shell: false }).source).toBe('gateway');
  });

  test('toute autre valeur retombe sur fixtures — comparaison au mot près, fail-closed', () => {
    expect(resolveApiConfig({ VITE_DATA_SOURCE: 'Gateway' }, { shell: false }).source).toBe('fixtures');
    expect(resolveApiConfig({ VITE_DATA_SOURCE: 'network' }, { shell: false }).source).toBe('fixtures');
    expect(resolveApiConfig({ VITE_DATA_SOURCE: '' }, { shell: false }).source).toBe('fixtures');
  });
});

/**
 * `readingModesEnabled` — paramètre de CONSTRUCTION, miroir de
 * `MEESHY_FLAG_READING_MODES` (`LentilleFeatureFlag.swift:82-90`), consommé
 * par `resolveOrchestratorDecision` (`packages/shared/utils/reading-modes.ts`)
 * comme `isFlagEnabled`. La v3.1 n'a ni toggle utilisateur ni programme
 * bêta : `'off'` est la SEULE valeur qui désactive, tout le reste (absent,
 * `'on'`, ou toute autre chaîne) vaut ACTIVÉ ici — les valeurs inconnues sont
 * rejetées en amont, à la CONSTRUCTION, par la garde de `vite.config.ts`
 * (§ `VITE_READING_MODES`, calquée sur la garde `VITE_DATA_SOURCE` déjà en
 * place) : ce fichier ne revalide donc pas ce que la garde de construction a
 * déjà refusé de laisser passer.
 */
describe('resolveApiConfig — readingModesEnabled (paramètre de construction, D-20)', () => {
  test('défaut (variable absente) : activé — la Lentille est là par défaut', () => {
    expect(resolveApiConfig({}, { shell: false }).readingModesEnabled).toBe(true);
  });

  test('VITE_READING_MODES=on : activé', () => {
    expect(resolveApiConfig({ VITE_READING_MODES: 'on' }, { shell: false }).readingModesEnabled).toBe(true);
  });

  test('VITE_READING_MODES=off : désactivé', () => {
    expect(resolveApiConfig({ VITE_READING_MODES: 'off' }, { shell: false }).readingModesEnabled).toBe(false);
  });
});
