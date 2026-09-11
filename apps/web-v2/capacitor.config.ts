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
 *
 * AUCUN `import.meta`, AUCUN `node:fs` / `node:path` / `node:url` dans ce
 * fichier (revue #5774, défaut bloquant 1). La CLI Capacitor charge
 * `capacitor.config.ts` en CJS via `require.extensions['.ts']`
 * (`@capacitor/cli/dist/util/node.js`) — jamais en ESM, quel que soit
 * `"type": "module"` du `package.json`. Un `import.meta` fait basculer Node
 * sur `loadESMFromCJS`, qui échoue immédiatement sur le `exports` du module
 * transpilé (« ReferenceError: exports is not defined ») : TOUTES les
 * commandes (`cap sync`, `cap ls`, `cap run`, `cap add`) meurent, sur les
 * deux plateformes. `bun test` ne le voit jamais (bun importe ce module en
 * ESM, un chargeur différent de celui de la CLI) — la preuve qui compte est
 * `scripts/check-capacitor-config.mjs`, qui rejoue le VRAI chargeur CJS.
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
 * Les deux gardes de FORME ne sont pas cosmétiques, et chacune vient d'une
 * source LUE :
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
 *
 * QUATRIÈME GARDE (revue #5774, défaut majeur 1) — `server.appStartPath`
 * NE FONCTIONNE PAS sur iOS, quelle que soit la forme du chemin : au premier
 * lancement, `WKWebView` charge le chemin de départ comme un FICHIER sous
 * `public/` (`App.app/public/` + `appStartPath`, d'où le `public//c/…` à
 * double barre observé) — seule la navigation QUI SUIT passe par
 * `CapacitorRouter.route(for:)`, qui aurait réécrit vers `index.html`. La
 * coque sort donc immédiatement après le lancement, SANS rapport de
 * plantage (`SpringBoard` ne journalise qu'une sortie volontaire) ; le seul
 * signe est `xcrun simctl launch --console-pty` : « Unable to load
 * …/public//c/… — This file is the root of your web app and must exist
 * before Capacitor can run ».
 *
 * CETTE GARDE PORTE SUR LA PLATEFORME VISÉE, JAMAIS SUR CE QUI EXISTE SUR LE
 * DISQUE (revue #5774, défaut majeur 2 — corrige la version qui sondait
 * `existsSync('ios/App/App.xcodeproj')` : la présence du dossier iOS n'a
 * aucun rapport avec la plateforme réellement synchronisée, et bloquait
 * `cap sync android` dès que `ios/` existait, y compris quand Android seul
 * était visé). `MEESHY_SHELL_START_PATH` exige donc `MEESHY_SHELL_SYNC_TARGET`
 * (`"android"` ou `"ios"`) : l'appelant DÉCLARE la plateforme qu'il
 * synchronise plutôt que ce module ne la DÉDUISE d'un fichier voisin — et la
 * déclaration explicite est aussi ce qui a permis de retirer `node:fs` /
 * `node:path` / `node:url`, source du défaut bloquant 1. Recette :
 *
 *   MEESHY_SHELL_START_PATH=/c/c-deploiement MEESHY_SHELL_SYNC_TARGET=android bunx cap sync android
 *   MEESHY_SHELL_START_PATH=/c/c-deploiement MEESHY_SHELL_SYNC_TARGET=ios     bunx cap sync ios
 *
 * `MEESHY_SHELL_SYNC_TARGET=ios` lève TOUJOURS (le chemin FICHIER ci-dessus) ;
 * `MEESHY_SHELL_SYNC_TARGET=android` est TOUJOURS accepté (`Bridge.java`
 * réécrit correctement) ; toute autre valeur (absente, mal orthographiée)
 * lève aussi — refuser tôt plutôt que deviner. Porter le paramètre sur iOS
 * (fragment d'URL lu par le routeur maison, ou un `WKURLSchemeHandler`
 * dédié) reste une issue compagnon, hors périmètre de #5774.
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
    const target = env.MEESHY_SHELL_SYNC_TARGET;
    if (target !== 'android' && target !== 'ios') {
      throw new Error(
        `MEESHY_SHELL_START_PATH exige MEESHY_SHELL_SYNC_TARGET="android" ou "ios" (reçu ` +
          `${JSON.stringify(target ?? null)}) — la garde iOS (chemin FICHIER, ci-dessous) porte sur la ` +
          'plateforme réellement synchronisée, jamais sur ce qui existe sur le disque : déclarer la ' +
          'cible plutôt que la faire deviner.',
      );
    }
    if (target === 'ios') {
      throw new Error(
        `MEESHY_SHELL_START_PATH="${startPath}" ne peut pas être posé sur une synchronisation iOS ` +
          "(MEESHY_SHELL_SYNC_TARGET=ios) : au premier lancement, iOS charge ce chemin comme un " +
          "FICHIER sous public/ (WKWebView), pas comme une route SPA — la coque sort immédiatement " +
          'après le lancement, sans rapport de plantage (« Unable to load …/public//… — This file is ' +
          'the root of your web app and must exist before Capacitor can run »). Retirer ' +
          'MEESHY_SHELL_START_PATH avant `cap sync ios`, ou recetter ce chemin sur Android seul ' +
          '(MEESHY_SHELL_SYNC_TARGET=android), où Bridge.java le réécrit correctement.',
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
