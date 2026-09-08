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
  test('défaut web : base relative', () => {
    expect(resolveApiConfig({}, { shell: false }).base).toBe('');
  });

  test('surcharge web : origine normalisée, sans barre finale', () => {
    const config = resolveApiConfig({ VITE_API_BASE: 'https://gate.staging.meeshy.me/' }, { shell: false });
    expect(config.base).toBe('https://gate.staging.meeshy.me');
  });

  test('surcharge web : un `/api/v1` surnuméraire est retiré', () => {
    const config = resolveApiConfig({ VITE_API_BASE: 'https://gate.staging.meeshy.me/api/v1' }, { shell: false });
    expect(config.base).toBe('https://gate.staging.meeshy.me');
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
