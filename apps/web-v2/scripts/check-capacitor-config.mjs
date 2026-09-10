#!/usr/bin/env node
/**
 * PROUVE QUE `capacitor.config.ts` SE CHARGE DANS LE CHARGEUR RÉEL DE LA CLI
 * (revue #5774, défaut bloquant 1).
 *
 * La CLI Capacitor charge `capacitor.config.ts` en CJS via
 * `require.extensions['.ts']` (`@capacitor/cli/dist/util/node.js`) — jamais
 * en ESM, quel que soit `"type": "module"` du `package.json` du paquet.
 * `bun test` importe ce même fichier en ESM (un chargeur DIFFÉRENT) : un
 * `import.meta` fautif y reste VERT alors qu'il rend TOUTES les commandes de
 * coque (`cap sync`, `cap ls`, `cap run`, `cap add`) inutilisables — exactement
 * le motif « ce qui ne s'exécute pas ne se signale pas ». Ce gate rejoue le
 * VRAI chargeur : `bunx cap ls`, qui échoue fort (`[fatal] ReferenceError:
 * exports is not defined`) si `capacitor.config.ts` contient `import.meta`
 * (ou tout autre motif ESM-only que le transpileur CJS de la CLI ne digère
 * pas), et réussit sinon (« Listing plugins for web is not possible » —
 * message attendu, aucune plateforme synchronisée dans ce dépôt de gate).
 *
 * Aucune installation réseau : `@capacitor/cli` est une `optionalDependency`
 * du paquet déjà résolue par `bun install` (mesuré #5774 : `bunx cap
 * --version` répond en local sans sortir du cache).
 */
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function run() {
  const result = spawnSync('bunx', ['cap', 'ls'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });

  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  if (result.error) {
    throw new Error(
      `check-capacitor-config: impossible de lancer \`bunx cap ls\` (${result.error.message}) — ` +
        "@capacitor/cli est une optionalDependency de ce paquet ; sans elle, ce gate ne peut " +
        'pas prouver que capacitor.config.ts se charge dans le VRAI chargeur CJS de la CLI.',
    );
  }

  if (result.status !== 0) {
    throw new Error(
      'check-capacitor-config: `bunx cap ls` a échoué — capacitor.config.ts ne se charge PAS ' +
        "dans le chargeur CJS réel de la CLI Capacitor (require.extensions['.ts'], " +
        "@capacitor/cli/dist/util/node.js). Cause typique : un `import.meta` (ou tout autre " +
        'motif ESM-only) dans capacitor.config.ts fait basculer Node sur `loadESMFromCJS`, qui ' +
        `échoue sur le module transpilé. Sortie :\n${combined}`,
    );
  }

  console.log('✓ capacitor.config.ts se charge dans le chargeur CJS réel de `cap` (bunx cap ls, RC=0).');
}

run();
