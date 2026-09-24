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

  /**
   * QUATRIÈME FORME REFUSÉE (revue #6027) — un segment `..` sort le chemin de
   * `public/`. Depuis #6027, ce chemin n'est plus seulement une URL : le hook
   * `scripts/shell-start-path-hook.mjs` en DÉRIVE un chemin de fichier
   * (`join(CAPACITOR_ROOT_DIR, IOS_NATIVE_WEB_DIR, startPath)`), que `join`
   * NORMALISE — `/c/../../../../tmp/x` posait le placeholder dans
   * `apps/web-v2/tmp/x`, hors de `public/`, pendant que le journal du hook
   * annonçait « placeholder posé » et que la coque sortait quand même au
   * lancement. La garde vit ICI, avec les trois autres gardes de FORME : elle
   * couvre les DEUX plateformes (sur Android le même chemin remonterait
   * au-dessus de la racine de la WebView) et refuse AVANT que quoi que ce soit
   * ne soit écrit, ce qu'aucune garde en aval ne peut faire.
   */
  test('un segment ".." lève — le hook en dériverait un fichier HORS de public/', () => {
    expect(() => resolveCapacitorConfig({ MEESHY_SHELL_START_PATH: '/c/../../../tmp/evade' })).toThrow(/\.\./);
    expect(() => resolveCapacitorConfig({ MEESHY_SHELL_START_PATH: '/..' })).toThrow(/\.\./);
  });

  test('un segment qui CONTIENT des points sans être ".." reste accepté', () => {
    const config = resolveCapacitorConfig({
      MEESHY_SHELL_START_PATH: '/c/salon..riviere/x',
      MEESHY_SHELL_SYNC_TARGET: 'ios',
    });
    expect(config.server?.appStartPath).toBe('/c/salon..riviere/x');
  });

  test('une autre surface que le fil est ACCEPTÉE — la garde porte sur la forme, pas sur la route', () => {
    const config = resolveCapacitorConfig({
      MEESHY_SHELL_START_PATH: '/settings',
      MEESHY_SHELL_SYNC_TARGET: 'android',
    });
    expect(config.server?.appStartPath).toBe('/settings');
  });

  /**
   * INVERSION #6027 — la garde qui levait TOUJOURS pour iOS (revue #5774)
   * cède la place au mécanisme : un hook Capacitor (`capacitor:copy:after` /
   * `capacitor:sync:after`, `scripts/shell-start-path-hook.mjs`) pose
   * désormais le placeholder que `CAPBridgeViewController.loadWebView()`
   * exige sous `public/`, APRÈS que `cap sync` a réécrit ce dossier — même
   * effet que sur Android (`Bridge.java` réécrit `appStartPath`), pas de
   * dérogation de plateforme dans `resolveCapacitorConfig` elle-même.
   * `resolveCapacitorConfig` reste pure : elle pose `server.appStartPath`
   * pour les DEUX cibles et se contente d'avertir (jamais lever) — c'est au
   * hook, exécuté par la CLI, de refuser AVANT toute écriture si la cible
   * déclarée ne correspond pas à la plateforme réellement synchronisée
   * (`scripts/shell-start-path-hook.test.ts`).
   */
  test('cible iOS + MEESHY_SHELL_START_PATH -> pose server.appStartPath, comme Android', () => {
    const config = resolveCapacitorConfig({
      MEESHY_SHELL_START_PATH: '/c/c-deploiement',
      MEESHY_SHELL_SYNC_TARGET: 'ios',
    });
    expect(config.server?.appStartPath).toBe('/c/c-deploiement');
  });

  test('les DEUX cibles rendent la MÊME forme de server pour un même chemin', () => {
    const android = resolveCapacitorConfig({
      MEESHY_SHELL_START_PATH: '/c/c-deploiement',
      MEESHY_SHELL_SYNC_TARGET: 'android',
    });
    const ios = resolveCapacitorConfig({
      MEESHY_SHELL_START_PATH: '/c/c-deploiement',
      MEESHY_SHELL_SYNC_TARGET: 'ios',
    });
    expect(ios.server).toEqual(android.server);
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
