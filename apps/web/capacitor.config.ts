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
 * Les trois gardes de FORME ne sont pas cosmétiques, et chacune vient d'une
 * source LUE :
 *
 *   · `/` initial — Android (`Bridge.java`) concatène `appUrl += appUrlPath`
 *     SANS séparateur pour le schéma `https` : sans lui, la valeur
 *     fusionnerait avec l'hôte (`https://localhostc/…`) ;
 *   · AUCUNE extension de fichier — iOS ne réécrit vers `index.html` que les
 *     chemins SANS extension (`CapacitorRouter.route(for:)`,
 *     `@capacitor/ios` 8.5.1 `Router.swift` : `if pathUrl.pathExtension.isEmpty`).
 *     Un `/c/x.json` serait servi littéralement, donc 404 ;
 *   · AUCUN segment `..` (revue #6027) — depuis #6027 ce chemin n'est plus
 *     seulement une URL : `scripts/shell-start-path-hook.mjs` en DÉRIVE un
 *     chemin de fichier, que `path.join` NORMALISE. `/c/../../../tmp/x`
 *     posait le placeholder dans `apps/web-v2/tmp/x`, HORS de `public/`,
 *     pendant que le journal du hook annonçait « placeholder posé » et que la
 *     coque sortait quand même au lancement. La garde vit ICI plutôt que dans
 *     le hook parce qu'elle vaut pour les DEUX plateformes et refuse AVANT
 *     que quoi que ce soit ne soit écrit.
 *
 * La garde porte sur la FORME, jamais sur une route particulière : les 40+
 * surfaces à porter emploieront la même recette sur leur propre chemin, et
 * aucune ne doit avoir à modifier ce fichier — qui est, lui, LIVRÉ.
 *
 * QUATRIÈME GARDE, INVERSÉE AU PROFIT D'UN MÉCANISME (#6027) — `server.appStartPath`
 * NE FONCTIONNAIT PAS sur iOS, quelle que soit la forme du chemin : au
 * premier lancement, `WKWebView` charge le chemin de départ comme un FICHIER
 * sous `public/` (`App.app/public/` + `appStartPath`, d'où le `public//c/…`
 * à double barre observé) — seule la navigation QUI SUIT passe par
 * `CapacitorRouter.route(for:)`, qui aurait réécrit vers `index.html`. La
 * coque sortait donc immédiatement après le lancement, SANS rapport de
 * plantage (`SpringBoard` ne journalise qu'une sortie volontaire) ; le seul
 * signe est `xcrun simctl launch --console-pty` : « Unable to load
 * …/public//c/… — This file is the root of your web app and must exist
 * before Capacitor can run ».
 *
 * Revue #5774 avait donc fait LEVER cette fonction dès que la cible
 * déclarée était iOS — un refus sûr, mais qui laissait la coque iOS
 * INDÉMARRABLE par cette recette. `scripts/shell-start-path-hook.mjs`
 * (hooks `capacitor:{copy,sync}:{before,after}` de `package.json`) pose
 * désormais, APRÈS que `cap sync ios` a réécrit `ios/App/App/public/`, le
 * FICHIER LITTÉRAL que `CAPBridgeViewController.loadWebView()` exige — le
 * même effet que Android (`Bridge.java`), obtenu autrement : cette fonction
 * n'a donc plus besoin de connaître la plateforme visée pour refuser, elle
 * pose `server.appStartPath` pour LES DEUX et se contente d'avertir. La
 * validation « la cible déclarée correspond-elle à la plateforme réellement
 * synchronisée ? » VIT DÉSORMAIS DANS LE HOOK (`planStartPathHook`), invoqué
 * par la CLI avec `CAPACITOR_PLATFORM_NAME` — une donnée que la CLI fournit
 * et que ce module, chargé AVANT que la plateforme soit sélectionnée, n'a
 * jamais eue. `MEESHY_SHELL_SYNC_TARGET` reste néanmoins EXIGÉE ici (garde
 * ci-dessous) : elle n'est plus ce qui décide du refus dans CE fichier, mais
 * la DÉCLARATION que le hook vérifie ensuite contre la réalité — sans elle,
 * l'appelant pourrait poser un chemin sans jamais dire pour quelle
 * plateforme, et le hook n'aurait rien à comparer.
 *
 * CETTE GARDE PORTE SUR LA PLATEFORME VISÉE, JAMAIS SUR CE QUI EXISTE SUR LE
 * DISQUE (revue #5774, défaut majeur 2 — corrige la version qui sondait
 * `existsSync('ios/App/App.xcodeproj')` : la présence du dossier iOS n'a
 * aucun rapport avec la plateforme réellement synchronisée, et bloquait
 * `cap sync android` dès que `ios/` existait, y compris quand Android seul
 * était visé). `MEESHY_SHELL_START_PATH` exige donc `MEESHY_SHELL_SYNC_TARGET`
 * (`"android"` ou `"ios"`) : l'appelant DÉCLARE la plateforme qu'il
 * synchronise plutôt que ce module (ou le hook, en aval) ne la DÉDUISE d'un
 * fichier voisin — et la déclaration explicite est aussi ce qui a permis de
 * retirer `node:fs` / `node:path` / `node:url` de CE fichier, source du
 * défaut bloquant 1 de revue #5774. Recette (symétrique désormais) :
 *
 *   MEESHY_SHELL_START_PATH=/c/c-deploiement MEESHY_SHELL_SYNC_TARGET=android bunx cap sync android
 *   MEESHY_SHELL_START_PATH=/c/c-deploiement MEESHY_SHELL_SYNC_TARGET=ios     bunx cap sync ios
 *
 * Les DEUX cibles sont désormais ACCEPTÉES ici ; toute valeur de
 * `MEESHY_SHELL_SYNC_TARGET` absente ou mal orthographiée lève toujours —
 * refuser tôt plutôt que deviner. Détail du mécanisme iOS : voir le
 * doc-comment de `scripts/shell-start-path-hook.mjs` et `decisions.md` § D-27
 * « Complément 2026-09-12 (#6027) ».
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
    if (startPath.split('/').includes('..')) {
      throw new Error(
        `MEESHY_SHELL_START_PATH ne doit contenir aucun segment ".." ("${startPath}" donné) — le hook ` +
          'iOS en dérive un chemin de FICHIER (join(CAPACITOR_ROOT_DIR, "ios/App/App/public", chemin), ' +
          'que join NORMALISE) : le placeholder serait posé HORS de public/, le journal annoncerait ' +
          '« placeholder posé » et la coque sortirait quand même au lancement.',
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
      console.warn(
        `  MEESHY_SHELL_START_PATH="${startPath}" sur iOS — le placeholder que ` +
          'CAPBridgeViewController.loadWebView() exige sous public/ est posé par le hook ' +
          '`capacitor:{copy,sync}:{before,after}` (scripts/shell-start-path-hook.mjs), APRÈS que ' +
          '`cap sync ios` a réécrit ce dossier — jamais par ce fichier.',
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
