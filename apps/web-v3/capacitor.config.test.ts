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
 */
describe('resolveCapacitorConfig — le chemin de départ n’est qu’un paramètre de RECETTE', () => {
  test('un environnement vide ne pose PAS server.appStartPath', () => {
    const config = resolveCapacitorConfig({});
    expect(config.server).toEqual({ androidScheme: 'https' });
    expect(config.server?.appStartPath).toBeUndefined();
  });

  test('MEESHY_SHELL_START_PATH="/c/c-deploiement" pose server.appStartPath', () => {
    const config = resolveCapacitorConfig({ MEESHY_SHELL_START_PATH: '/c/c-deploiement' });
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
    const config = resolveCapacitorConfig({ MEESHY_SHELL_START_PATH: '/settings' });
    expect(config.server?.appStartPath).toBe('/settings');
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
