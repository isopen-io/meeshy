import type { CapacitorConfig } from '@capacitor/cli';

/**
 * VARIANTE B — la coque native.
 *
 * Le contrat de cette variante : le MEME `dist/` que le web, empaquete. Aucune
 * ligne de code applicatif ne connait Capacitor ; c'est la condition pour que
 * la promesse « transformable sans friction » soit vraie plutot qu'annoncee.
 * La construction ne differe que par MEESHY_TARGET=capacitor, qui bascule la
 * base en chemins relatifs et retire le service worker (la coque gere son
 * propre cycle de vie — deux caches sur le meme bundle se marcheraient dessus).
 */

/**
 * `MEESHY_SHELL_START_PATH` — UN PARAMÈTRE DE RECETTE, JAMAIS DE LIVRAISON
 * (#5812).
 *
 * `server.appStartPath` (Capacitor ≥ 7.3) fait démarrer la coque sur un
 * chemin autre que `/index.html` — ce qui permet de PROUVER, sur un
 * simulateur/AVD réel, qu'un lien profond monte le fil, sans attendre
 * l'entrée système (Universal Links / App Links, compagnons séparés de
 * #5812). Une coque SYNCHRONISÉE avec ce paramètre posé démarrerait TOUJOURS
 * sur ce chemin — d'où l'avertissement : c'est une commande de recette,
 * jamais un `cap sync` livré.
 *
 * Les deux gardes ne sont pas cosmétiques, et chacune vient d'une source
 * LUE :
 *
 *   · `/` initial — Android (`Bridge.java`) concatène `appUrl += appUrlPath`
 *     SANS séparateur pour le schéma `https` : sans lui, la valeur
 *     fusionnerait avec l'hôte (`https://localhostc/…`) ;
 *   · AUCUNE extension de fichier — iOS ne réécrit vers `index.html` que les
 *     chemins SANS extension (`CapacitorRouter.route(for:)`,
 *     `@capacitor/ios` 8.5.1 `Router.swift` : `if pathUrl.pathExtension.isEmpty`).
 *     Un `/c/x.json` serait servi littéralement, donc 404.
 *
 * La garde porte sur la FORME, jamais sur une route particulière : les 40+
 * surfaces à porter emploieront la même recette sur leur propre chemin, et
 * aucune ne doit avoir à modifier ce fichier — qui est, lui, LIVRÉ.
 */
export function resolveCapacitorConfig(env: Readonly<Record<string, string | undefined>>): CapacitorConfig {
  const startPath = env.MEESHY_SHELL_START_PATH;

  const server: CapacitorConfig['server'] = { androidScheme: 'https' };
  if (startPath !== undefined) {
    if (!startPath.startsWith('/') || startPath.startsWith('//')) {
      throw new Error(
        `MEESHY_SHELL_START_PATH doit commencer par un seul "/" ("${startPath}" donné) — Android ` +
          '(Bridge.java) concatène le chemin de démarrage sans séparateur, sans "/" initial il ' +
          "fusionnerait avec l'hôte.",
      );
    }
    if (/\.[a-z0-9]+$/i.test(startPath)) {
      throw new Error(
        `MEESHY_SHELL_START_PATH ne doit porter aucune extension de fichier ("${startPath}" ` +
          'donné) — iOS ne réécrit vers index.html que les chemins SANS extension ' +
          '(CapacitorRouter.route(for:)) ; celui-ci serait servi littéralement, donc 404.',
      );
    }
    console.warn(
      `  MEESHY_SHELL_START_PATH="${startPath}" — chemin de RECETTE : ne jamais synchroniser ` +
        'une coque livrée avec ce paramètre posé.',
    );
    server.appStartPath = startPath;
  }

  return {
    appId: 'me.meeshy.app',
    appName: 'Meeshy',
    webDir: 'dist',
    android: {
      // Le fond de la WebView pendant le chargement : sans lui, un flash blanc
      // precede l'application en schema sombre, sur l'appareil lent qui est
      // precisement la cible.
      backgroundColor: '#0b0c14',
    },
    ios: {
      backgroundColor: '#0b0c14',
      contentInset: 'never',
    },
    server,
  };
}

const config: CapacitorConfig = resolveCapacitorConfig(process.env);

export default config;
