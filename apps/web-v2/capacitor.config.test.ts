import { describe, expect, test } from 'bun:test';

import { resolveCapacitorConfig } from './capacitor.config';

/**
 * `resolveCapacitorConfig` — LE CHEMIN DE DÉPART N'EST QU'UN PARAMÈTRE DE
 * RECETTE (#5812).
 *
 * `server.appStartPath` (Capacitor ≥ 7.3, `@capacitor/cli/dist/declarations.d.ts:617`)
 * append un chemin à l'URL de démarrage de la coque — exactement ce qu'il
 * faut pour PROUVER, sur le simulateur iOS dédié, qu'un lien profond monte
 * le fil sans dépendre d'une entrée système qui n'existe pas encore
 * (Universal Links / App Links, compagnons séparés). Une valeur mal formée
 * romprait une coque EN SILENCE, chacune à sa façon : `Bridge.java` concatène
 * `appUrl += appUrlPath` sans séparateur pour le schéma `https` — sans `/`
 * initial, `appStartPath` fusionnerait avec l'hôte (`https://localhostc/…`) ;
 * et iOS ne réécrit vers `index.html` que les chemins SANS extension
 * (`CapacitorRouter.route(for:)`), donc un chemin qui en porte une serait
 * servi littéralement (404). Les gardes portent sur la FORME, jamais sur une
 * route particulière : les 40+ surfaces à porter emploieront la même recette
 * sur leur propre chemin sans modifier ce fichier LIVRÉ.
 *
 * `resolveCapacitorConfig` est une fonction PURE de `env` (revue #5774,
 * défauts bloquant 1 et majeur 2) : plus aucune injection de dépendance ni
 * sondage du disque — la plateforme visée se DÉCLARE par
 * `MEESHY_SHELL_SYNC_TARGET`, jamais déduite de `ios/App/App.xcodeproj`.
 */
describe('resolveCapacitorConfig — le chemin de départ n’est qu’un paramètre de RECETTE', () => {
  test('un environnement vide ne pose PAS server.appStartPath', () => {
    const config = resolveCapacitorConfig({});
    expect(config.server).toEqual({ androidScheme: 'https' });
    expect(config.server?.appStartPath).toBeUndefined();
  });

  test('MEESHY_SHELL_START_PATH="/c/c-deploiement" + cible android pose server.appStartPath', () => {
    const config = resolveCapacitorConfig({
      MEESHY_SHELL_START_PATH: '/c/c-deploiement',
      MEESHY_SHELL_SYNC_TARGET: 'android',
    });
    expect(config.server?.appStartPath).toBe('/c/c-deploiement');
  });

  test('une valeur SANS "/" initial lève — Bridge.java la fusionnerait avec l’hôte', () => {
    expect(() => resolveCapacitorConfig({ MEESHY_SHELL_START_PATH: 'c/c-deploiement' })).toThrow();
  });

  test('une valeur qui porte une EXTENSION lève — iOS la servirait littéralement', () => {
    expect(() => resolveCapacitorConfig({ MEESHY_SHELL_START_PATH: '/c/c-deploiement.json' })).toThrow();
  });

  test('une double barre initiale lève — elle serait lue comme une autre ORIGINE', () => {
    expect(() => resolveCapacitorConfig({ MEESHY_SHELL_START_PATH: '//evil.example/c/x' })).toThrow();
  });

  test('une autre surface que le fil est ACCEPTÉE — la garde porte sur la forme, pas sur la route', () => {
    const config = resolveCapacitorConfig({
      MEESHY_SHELL_START_PATH: '/settings',
      MEESHY_SHELL_SYNC_TARGET: 'android',
    });
    expect(config.server?.appStartPath).toBe('/settings');
  });

  /**
   * RÉGRESSION revue #5774, défaut majeur 1 — `server.appStartPath` charge
   * un FICHIER sous `public/` au premier lancement iOS (`WKWebView`),
   * jamais une route SPA : une synchronisation iOS avec ce paramètre posé
   * sort au lancement, sans rapport de plantage. La garde lève dès que la
   * cible DÉCLARÉE est iOS — jamais en sondant le disque (revue #5774,
   * défaut majeur 2 : la version précédente bloquait `cap sync android` dès
   * que `ios/App/App.xcodeproj` existait, quelle que soit la plateforme
   * réellement synchronisée).
   */
  test('cible iOS + MEESHY_SHELL_START_PATH -> lève, avec l’explication du chemin FICHIER', () => {
    expect(() =>
      resolveCapacitorConfig({
        MEESHY_SHELL_START_PATH: '/c/c-deploiement',
        MEESHY_SHELL_SYNC_TARGET: 'ios',
      }),
    ).toThrow(/iOS/);
  });

  test('cible Android + MEESHY_SHELL_START_PATH -> accepté, INDÉPENDAMMENT de ios/App/App.xcodeproj', () => {
    const config = resolveCapacitorConfig({
      MEESHY_SHELL_START_PATH: '/c/c-deploiement',
      MEESHY_SHELL_SYNC_TARGET: 'android',
    });
    expect(config.server?.appStartPath).toBe('/c/c-deploiement');
  });

  test('MEESHY_SHELL_START_PATH SANS MEESHY_SHELL_SYNC_TARGET -> lève (la cible se déclare, ne se devine pas)', () => {
    expect(() => resolveCapacitorConfig({ MEESHY_SHELL_START_PATH: '/c/c-deploiement' })).toThrow(
      /MEESHY_SHELL_SYNC_TARGET/,
    );
  });

  test('MEESHY_SHELL_START_PATH + cible invalide -> lève', () => {
    expect(() =>
      resolveCapacitorConfig({
        MEESHY_SHELL_START_PATH: '/c/c-deploiement',
        MEESHY_SHELL_SYNC_TARGET: 'windows',
      }),
    ).toThrow(/MEESHY_SHELL_SYNC_TARGET/);
  });

  test('aucun paramètre -> aucune garde ne s’arme', () => {
    const config = resolveCapacitorConfig({});
    expect(config.server?.appStartPath).toBeUndefined();
  });

  test('la forme SANS paramètre reste identique à celle livrée jusqu’ici', () => {
    const config = resolveCapacitorConfig({});
    expect(config).toEqual({
      appId: 'me.meeshy.app',
      appName: 'Meeshy',
      webDir: 'dist',
      android: { backgroundColor: '#0b0c14' },
      ios: { backgroundColor: '#0b0c14', contentInset: 'never' },
      server: { androidScheme: 'https' },
    });
  });
});
