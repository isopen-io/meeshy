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
import { createServer } from 'node:http';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { launchChromium } from './lib/browser.mjs';

const APP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT_DIR = 'dist-capacitor';
const OUT = join(APP, OUT_DIR);

/**
 * Fonction PURE, exportée pour être rejouée sur un HTML/une liste de fichiers
 * arbitraires (voir la preuve de ROUGE en tête de fichier) sans reconstruire.
 */
export function auditShellDist(html, files) {
  const violations = [];

  /* LA BALISE <base href="/"> (#5725) — L'UNIQUE HREF ABSOLUE TOLÉRÉE.
   *
   * Sans elle, un lien profond (`/c/<id>`) charge bien `index.html` (les
   * deux coques servent la coquille pour tout chemin sans extension —
   * html5mode Android, routeur iOS, voir vite.config.ts §
   * capacitorBaseHref), mais le NAVIGATEUR résout ensuite `./assets/x.js`
   * contre le chemin NAVIGUÉ (`https://localhost/c/assets/x.js`, 404) plutôt
   * que contre la racine : le corps arrive, le script jamais. `<base
   * href="/">` fixe la résolution de TOUT le document sur la racine sans
   * réécrire un seul chemin généré par Vite. */
  const baseMatches = [...html.matchAll(/<base\s+href=["']([^"']*)["']\s*\/?>/gi)];
  if (baseMatches.length !== 1 || baseMatches[0][1] !== '/') {
    violations.push(
      'balise <base href="/"> absente ou incorrecte — sans elle, un lien profond (/c/<id>) ' +
        'charge index.html mais résout ses actifs relatifs contre le chemin navigué ' +
        '(/c/assets/…, 404) : la coquille arrive, le fil jamais (#5725).',
    );
  }
  const htmlSansBase = html.replace(/<base\s+href=["'][^"']*["']\s*\/?>/gi, '');

  // `="/x` est une base ABSOLUE ; `="./x` ou `="//x` (protocole-relatif,
  // absent ici) ne doivent pas matcher — d'où l'ancrage sur le caractère qui
  // suit `/` plutôt que sur `/` seul. La balise <base>, seule href absolue
  // tolérée, a déjà été retirée ci-dessus et jugée à part.
  if (/=["']\/(?!\/)/.test(htmlSansBase)) {
    violations.push(
      'base ABSOLUE détectée dans index.html (attendu : chemins relatifs "./…", hors <base>) — ' +
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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

/**
 * REPLI SPA, MÊME MÉCANIQUE QUE LES DEUX COQUES (#5725).
 *
 * Un fichier réel se sert tel quel ; à défaut, `index.html` — c'est
 * EXACTEMENT ce qu'`html5mode` fait sur Android (`WebViewLocalServer.java`,
 * vrai par défaut) et ce que `CapacitorRouter.route(for:)` fait
 * INCONDITIONNELLEMENT sur iOS (`Router.swift`) pour un chemin sans
 * extension. Ce serveur JOUE ce contrat pour prouver, avec un navigateur
 * RÉEL, que le HTML qui en résulte fait effectivement monter le fil — la
 * seule chose qu'un audit statique de `index.html` ne peut pas voir.
 */
function serveShellDist(dist) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const direct = join(dist, decodeURIComponent(url.pathname));
    try {
      const bytes = readFileSync(direct);
      res.writeHead(200, { 'content-type': MIME[extname(direct)] ?? 'application/octet-stream' });
      res.end(bytes);
      return;
    } catch {
      /* pas un fichier réel : repli, seulement pour un chemin sans extension —
         html5mode ne fait rien d'autre. */
    }
    if (extname(url.pathname) === '') {
      const bytes = readFileSync(join(dist, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(bytes);
      return;
    }
    res.writeHead(404).end('404');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/**
 * LE LIEN PROFOND, JOUÉ AVEC UN NAVIGATEUR RÉEL (#5725, critère 3).
 *
 * `auditShellDist` garde la FORME statique de `index.html` (dont la balise
 * `<base>`) ; ceci garde le COMPORTEMENT — une navigation DIRECTE (jamais un
 * `pushState` interne) vers `/c/<id>`, exactement ce qu'un lien profond, une
 * restauration ou un App Link produit dans une coque, doit faire monter le
 * FIL, pas seulement livrer un corps non vide.
 */
async function auditDeepLink(dist) {
  const server = await serveShellDist(dist);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    await page.goto(`${base}/c/c-deploiement`, { waitUntil: 'networkidle' });
    const bodyLen = await page.evaluate(() => document.body.innerHTML.length);
    const rootChildren = await page.evaluate(() => document.getElementById('root')?.childElementCount ?? -1);
    const violations = [];
    if (bodyLen === 0) {
      violations.push('lien profond /c/c-deploiement : corps VIDE (bodyLen = 0) — page blanche.');
    }
    if (rootChildren <= 0) {
      violations.push(
        `lien profond /c/c-deploiement : #root n'a monté AUCUN enfant (${rootChildren}) — la coquille ` +
          'arrive, le fil jamais.',
      );
    }
    if (pageErrors.length > 0) {
      violations.push(`lien profond /c/c-deploiement : ${pageErrors.length} erreur(s) JS — ${pageErrors[0]}`);
    }
    return violations;
  } finally {
    await browser.close();
    server.close();
  }
}

async function main() {
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

  console.log('  navigation directe vers /c/c-deploiement (repli SPA, comme les deux coques) …');
  violations.push(...(await auditDeepLink(OUT)));

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
      'viewport-fit=cover, theme-color #0b0c14, lien profond /c/<id> monte le fil.',
  );
}

/* Le pilote ne tourne QUE si ce fichier est le point d'entrée : importé (par
   son témoin), le module n'expose que `auditShellDist`, sans construire. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('\n  check-shell-dist.mjs a échoué :', err);
    rmSync(OUT, { recursive: true, force: true });
    process.exit(1);
  });
}
