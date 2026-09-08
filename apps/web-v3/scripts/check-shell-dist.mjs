#!/usr/bin/env node
/**
 * VÉRIFIE QUE LE DIST CAPACITOR HONORE LE CONTRAT DE LA VARIANTE B (#5604, T2).
 *
 * `capacitor.config.ts` déclare le contrat en prose : « le MÊME `dist/` que le
 * web, empaqueté … Aucune ligne de code applicatif ne connaît Capacitor ». Ce
 * contrat n'avait AUCUN témoin machine — seule une inspection à l'œil du dist
 * généré pouvait le garder, et une inspection qu'on oublie de refaire ne garde
 * rien. Ce script construit la variante B dans un dossier séparé
 * (`dist-capacitor`, couvert par le motif `dist-*` du `.gitignore`) et affirme
 * sur `index.html` et la liste des fichiers émis :
 *
 *   1. la base est RELATIVE — la coque charge depuis le système de fichiers,
 *      jamais depuis une origine http ; un chemin absolu (`/assets/…`) casse ;
 *   2. AUCUN service worker n'est émis (`sw.js`, `registerSW.js`) — la coque
 *      gère son propre cycle de vie, deux caches sur le même bundle se
 *      marcheraient dessus ;
 *   3. `viewport-fit=cover` est présent — sans lui la safe-area basse
 *      (défaut 3a) n'est jamais exposée dans le dist réellement embarqué ;
 *   4. le `theme-color` sombre `#0b0c14` est présent — sans lui, un flash
 *      blanc précède l'application au démarrage à froid en schéma sombre.
 *
 * Vu ROUGIR sur une valeur falsifiée : un `vite build` SANS `MEESHY_TARGET`
 * fait tomber (1) — base absolue `/assets/…` — et (2) — `sw.js` /
 * `registerSW.js` sont émis. `auditShellDist` est exportée PURE et le pilote
 * ci-dessous ne s'exécute que lorsque ce fichier est le POINT D'ENTRÉE : sans
 * cette garde, `import { auditShellDist }` déclenchait une construction
 * complète, et la « pureté » annoncée par ce commentaire était fausse — le
 * témoin `check-shell-dist.test.ts` ne pouvait pas exister (#5604,
 * revue-correction).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT_DIR = 'dist-capacitor';
const OUT = join(APP, OUT_DIR);

/**
 * Fonction PURE, exportée pour être rejouée sur un HTML/une liste de fichiers
 * arbitraires (voir la preuve de ROUGE en tête de fichier) sans reconstruire.
 */
export function auditShellDist(html, files) {
  const violations = [];

  // `="/x` est une base ABSOLUE ; `="./x` ou `="//x` (protocole-relatif,
  // absent ici) ne doivent pas matcher — d'où l'ancrage sur le caractère qui
  // suit `/` plutôt que sur `/` seul.
  if (/=["']\/(?!\/)/.test(html)) {
    violations.push(
      'base ABSOLUE détectée dans index.html (attendu : chemins relatifs "./…") — ' +
        'la coque native charge le bundle depuis le système de fichiers, jamais depuis une origine http.',
    );
  }

  /* Tout script de service worker, quel que soit son NOM (#5604,
     revue-correction) : la première écriture n'attrapait que `sw.js` et
     `registerSW.js`, et laissait passer `sw-institutional.js`, que Vite
     recopiait de `public/` dans la variante B — un service worker MORT
     embarqué dans l'APK et l'IPA sous une affirmation contraire. Une clause
     qui énumère des noms garde les noms, pas la propriété. */
  const serviceWorkerFiles = files.filter((f) =>
    /(?:^|\/)(?:sw[-.].*\.js|sw\.js|registerSW\.js|.*service-worker.*\.js|workbox-[^/]*\.js)$/.test(f),
  );
  if (serviceWorkerFiles.length > 0) {
    violations.push(
      `un service worker est émis (${serviceWorkerFiles.join(', ')}) — la coque gère son propre ` +
        'cycle de vie, deux caches sur le même bundle se marcheraient dessus.',
    );
  }

  if (!html.includes('viewport-fit=cover')) {
    violations.push(
      'viewport-fit=cover absent de index.html — la safe-area basse (composeur, barre de ' +
        'recherche) ne sera pas exposée dans le dist réellement embarqué (défaut 3a).',
    );
  }

  if (!html.includes('#0b0c14')) {
    violations.push(
      'theme-color #0b0c14 absent de index.html — un flash blanc précède l’application au ' +
        'démarrage à froid en schéma sombre.',
    );
  }

  return violations;
}

function allFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? allFiles(path) : [path];
  });
}

function main() {
  rmSync(OUT, { recursive: true, force: true });

  console.log(`  construction MEESHY_TARGET=capacitor → ${OUT_DIR}/ …`);
  const build = spawnSync('bunx', ['vite', 'build', '--outDir', OUT_DIR], {
    cwd: APP,
    env: { ...process.env, MEESHY_TARGET: 'capacitor' },
    stdio: 'inherit',
  });
  if (build.status !== 0) {
    console.error('\n  la construction de la variante B a échoué — voir la sortie ci-dessus.\n');
    process.exit(1);
  }

  const html = readFileSync(join(OUT, 'index.html'), 'utf8');
  const files = allFiles(OUT).map((f) => f.slice(APP.length + 1));
  const violations = auditShellDist(html, files);

  /* Le dossier de travail est EFFACÉ avant de rendre le verdict : laissé en
     place, il faisait rougir `check-git-tracking.mjs` au tour SUIVANT (quinze
     fichiers « non suivis »), donc le gate composite passait une fois puis
     échouait — un gate non idempotent ment sur la deuxième exécution
     (#5604, revue-correction). */
  rmSync(OUT, { recursive: true, force: true });

  if (violations.length > 0) {
    console.error(`\n  ${OUT_DIR}/ ne respecte pas le contrat de la variante B (capacitor.config.ts) :\n`);
    for (const v of violations) console.error(`    · ${v}`);
    console.error('');
    process.exit(1);
  }

  console.log(
    `  ${OUT_DIR}/ honore le contrat de la variante B : base relative, sans service worker, ` +
      'viewport-fit=cover, theme-color #0b0c14.',
  );
}

/* Le pilote ne tourne QUE si ce fichier est le point d'entrée : importé (par
   son témoin), le module n'expose que `auditShellDist`, sans construire. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
