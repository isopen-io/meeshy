#!/usr/bin/env node
/**
 * LE MÉCANISME QUI ARME iOS POUR `MEESHY_SHELL_START_PATH` (#6027).
 *
 * `CAPBridgeViewController.loadWebView()` (`@capacitor/ios` 8.5.1) exige
 * qu'un FICHIER existe LITTÉRALEMENT sous `public/` avant même d'atteindre
 * `Router.swift`, sinon `fatalLoadError()` (`exit(1)`, sans rapport de
 * plantage). Android n'a besoin de rien : `Bridge.java` réécrit déjà le
 * chemin en URL, servi par le repli `html5mode` ordinaire. La garde qui
 * LEVAIT pour iOS (revue #5774) cède la place à CE hook, qui pose le
 * placeholder APRÈS que `cap sync` a réécrit `ios/App/App/public/` — le même
 * effet qu'Android, obtenu autrement, jamais un `if (platform === 'ios')`
 * dans `capacitor.config.ts`.
 *
 * QUATRE CLÉS DE `package.json`, POUR DEUX PHASES (`common.js` de
 * `@capacitor/cli` 8.5.1, lu) : `before` VALIDE (cible déclarée == plateforme
 * réellement synchronisée) et ne pose rien ; `after` POSE le placeholder iOS
 * (Android reste `skip`). Les DEUX `copy:*` ET les DEUX `sync:*` sont
 * nécessaires : `sync.js` enveloppe `copy()` dans un `try { } catch (e) {
 * logger.error(e) }` qui AVALE toute erreur levée par un hook `copy:*`
 * pendant `cap sync` (RC 0 quand même) — un refus posé UNIQUEMENT en
 * `copy:before` y serait silencieux. `sync:before`/`sync:after`, eux, sont
 * appelés HORS de ce `try/catch` : une levée y remonte jusqu'à
 * `syncCommand`, qui l'escalade en `FatalException` (code de sortie non
 * nul). `cap copy` seul n'exécute JAMAIS les hooks `sync:*` ; les `copy:*`
 * restent donc le seul moyen de poser le placeholder pour lui. Le plan
 * "after" = "place" est IDEMPOTENT : le rejouer deux fois dans un même
 * `cap sync` (`copy:after` puis `sync:after`) ne réécrit rien la seconde
 * fois ; si la première pose échoue en silence, la seconde la répète et
 * REMONTE l'échec.
 *
 * `planStartPathHook(env, phase)` est PURE — un type SOMME (`skip` | `place`)
 * ou une levée, aucune I/O. `applyStartPathPlan(plan, fs)` prend un `fs`
 * INJECTÉ (jamais `node:fs` en dur) — seul le pilote appelle le vrai `node:fs`.
 * La CLI fournit, dans l'environnement du hook (`runPlatformHook`, lu) :
 * `CAPACITOR_CONFIG` (le MÊME objet que `resolveCapacitorConfig` a résolu),
 * `CAPACITOR_PLATFORM_NAME` (la plateforme RÉELLEMENT synchronisée, jamais
 * devinée) et `CAPACITOR_ROOT_DIR` (la racine du paquet). `MEESHY_SHELL_SYNC_TARGET`
 * vient de l'environnement de L'APPELANT (spread `...process.env` en dernier
 * dans `runPlatformHook`).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Le dossier natif iOS où `@capacitor/ios` copie le web (mesuré :
 * `config.ios.webDirAbs` = `.../ios/App/App/public`) — relatif à
 * `CAPACITOR_ROOT_DIR` (la racine du paquet), PAS à `ios/`.
 * `check-capacitor-config.mjs` DÉRIVE de cette même constante l'attendu de
 * `ios.webDir` (relatif, lui, à `ios/`), plutôt que de la recopier.
 */
export const IOS_NATIVE_WEB_DIR = 'ios/App/App/public';

/** Les deux seules phases que la CLI invoque via ce script (avant/après la copie). */
export const HOOK_PHASES = Object.freeze(['before', 'after']);

function readAppStartPath(rawConfig) {
  if (rawConfig === undefined) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(rawConfig);
  } catch (err) {
    throw new Error(
      `shell-start-path-hook: CAPACITOR_CONFIG illisible (${err instanceof Error ? err.message : String(err)}) — ` +
        "la CLI Capacitor n'a pas fourni le JSON attendu (@capacitor/cli/dist/common.js::runPlatformHook).",
    );
  }
  return parsed && typeof parsed === 'object' ? parsed.server?.appStartPath : undefined;
}

/**
 * PURE — décide quoi faire, ne fait rien. Voir le doc-comment du module pour
 * le partage before/after entre les quatre clés de `package.json`.
 */
export function planStartPathHook(env, phase) {
  if (!HOOK_PHASES.includes(phase)) {
    throw new Error(`shell-start-path-hook: phase inconnue "${phase}" — attendu "before" ou "after".`);
  }

  const startPath = readAppStartPath(env.CAPACITOR_CONFIG);
  if (startPath === undefined) {
    return {
      action: 'skip',
      reason: 'aucun MEESHY_SHELL_START_PATH posé (server.appStartPath absent) — cap sync/copy normal.',
    };
  }

  const capacitorPlatform = env.CAPACITOR_PLATFORM_NAME;
  if (typeof capacitorPlatform !== 'string' || capacitorPlatform.length === 0) {
    throw new Error(
      'shell-start-path-hook: CAPACITOR_PLATFORM_NAME absent alors que server.appStartPath est posé — ' +
        "la CLI Capacitor ne l'a pas fourni (ce script n'est censé être invoqué que par elle).",
    );
  }

  const declaredTarget = env.MEESHY_SHELL_SYNC_TARGET;
  if (declaredTarget !== 'android' && declaredTarget !== 'ios') {
    throw new Error(
      `shell-start-path-hook: MEESHY_SHELL_SYNC_TARGET="${declaredTarget ?? ''}" invalide (attendu "android" ou ` +
        '"ios") alors que MEESHY_SHELL_START_PATH est posé — la cible se DÉCLARE, elle ne se devine jamais.',
    );
  }

  if (declaredTarget !== capacitorPlatform) {
    throw new Error(
      `shell-start-path-hook: MEESHY_SHELL_SYNC_TARGET="${declaredTarget}" ne correspond pas à la plateforme ` +
        `RÉELLEMENT synchronisée ("${capacitorPlatform}") — relancer \`bunx cap sync ${capacitorPlatform}\` avec ` +
        `MEESHY_SHELL_SYNC_TARGET=${capacitorPlatform}, ou retirer MEESHY_SHELL_START_PATH avant de synchroniser ` +
        `${declaredTarget}.`,
    );
  }

  if (capacitorPlatform === 'android') {
    return {
      action: 'skip',
      reason: 'Android : Bridge.java réécrit déjà appStartPath en URL — rien à poser sur le disque.',
    };
  }

  // capacitorPlatform === 'ios' à partir d'ici — cible confirmée, forme validée.
  if (phase === 'before') {
    return { action: 'skip', reason: 'validation faite — le placement iOS se fait en phase "after".' };
  }

  const root = env.CAPACITOR_ROOT_DIR;
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error(
      `shell-start-path-hook: CAPACITOR_ROOT_DIR absent — impossible de localiser ${IOS_NATIVE_WEB_DIR}.`,
    );
  }

  return { action: 'place', filePath: join(root, IOS_NATIVE_WEB_DIR, startPath) };
}

/**
 * Applique un plan — `fs` INJECTÉ (jamais `node:fs` en dur), pour rester
 * falsifiable sans toucher au disque. Idempotent : un chemin déjà présent
 * (fichier OU dossier — `existsSync` ne distingue pas les deux, et aucun des
 * deux n'a besoin d'être réécrit) n'entraîne aucune écriture.
 */
export function applyStartPathPlan(plan, fs) {
  if (plan.action === 'skip') {
    return { placed: false };
  }

  const { filePath } = plan;
  if (fs.existsSync(filePath)) {
    return { placed: false };
  }

  fs.mkdirSync(dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '');

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `shell-start-path-hook: impossible de poser le placeholder à "${filePath}" — ` +
        'CAPBridgeViewController.loadWebView() (@capacitor/ios 8.5.1) exige que ce FICHIER existe ' +
        'littéralement sous public/ avant que la coque puisse démarrer ; sans lui, `cap sync ios` ' +
        'réussirait en silence et la coque sortirait au premier lancement (fatalLoadError, exit(1), ' +
        'sans rapport de plantage).',
    );
  }

  return { placed: true };
}

// ---------------------------------------------------------------------------
// Le pilote — invoqué par la CLI Capacitor comme script npm, jamais en test.
// ---------------------------------------------------------------------------

function main() {
  const phase = process.argv[2];
  let plan;
  try {
    plan = planStartPathHook(process.env, phase);
  } catch (err) {
    console.error(`\n  shell-start-path-hook (${String(phase)}) refuse :\n    ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  if (plan.action === 'skip') {
    console.log(`  shell-start-path-hook (${phase}) : ${plan.reason}`);
    return;
  }

  try {
    const result = applyStartPathPlan(plan, { existsSync, mkdirSync, writeFileSync });
    console.log(
      `  shell-start-path-hook (${phase}) : ` +
        `${result.placed ? 'placeholder posé' : 'placeholder déjà présent'} — ${plan.filePath}`,
    );
  } catch (err) {
    console.error(`\n  shell-start-path-hook (${phase}) refuse :\n    ${err.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
