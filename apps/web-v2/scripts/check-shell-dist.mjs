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
 *   1. la base est ROOT-ABSOLUE (`/assets/…`) et AUCUNE balise `<base>` n'est
 *      émise — les deux coques servent une origine VIRTUELLE
 *      (`https://localhost/…` Android, `capacitor://localhost/…` iOS) montée
 *      à la RACINE ; un chemin relatif (`./assets/…`) servi en réponse à un
 *      chemin navigué autre que `/` résout contre CE chemin (404), et une
 *      balise `<base>` qui le rattraperait casserait au passage toutes les
 *      URL réduites à un fragment (D-27 corrigée en revue, #5812) ;
 *   2. AUCUN service worker n'est émis (`sw.js`, `registerSW.js`) — la coque
 *      gère son propre cycle de vie, deux caches sur le même bundle se
 *      marcheraient dessus ;
 *   3. `viewport-fit=cover` est présent — sans lui la safe-area basse
 *      (défaut 3a) n'est jamais exposée dans le dist réellement embarqué ;
 *   4. le `theme-color` sombre `#0b0c14` est présent — sans lui, un flash
 *      blanc précède l'application au démarrage à froid en schéma sombre.
 *
 * Vu ROUGIR sur une valeur falsifiée : un `vite build` SANS `MEESHY_TARGET`
 * fait tomber (2) — `sw.js` / `registerSW.js` sont émis ; un build de la
 * variante B revenu à `base: './'` fait tomber (1). `auditShellDist` est exportée PURE et le pilote
 * ci-dessous ne s'exécute que lorsque ce fichier est le POINT D'ENTRÉE : sans
 * cette garde, `import { auditShellDist }` déclenchait une construction
 * complète, et la « pureté » annoncée par ce commentaire était fausse — le
 * témoin `check-shell-dist.test.ts` ne pouvait pas exister (#5604,
 * revue-correction).
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { launchChromium } from './lib/browser.mjs';
import { allFiles } from './lib/files.mjs';
import { INSTITUTIONAL_ROUTES } from './lib/institutional-routes.mjs';

const APP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT_DIR = 'dist-capacitor';
const OUT = join(APP, OUT_DIR);

/**
 * Fonction PURE, exportée pour être rejouée sur un HTML/une liste de fichiers
 * arbitraires (voir la preuve de ROUGE en tête de fichier) sans reconstruire.
 */
export function auditShellDist(html, files) {
  const violations = [];

  /* AUCUNE BALISE <base> — ELLE EST LE CORRECTIF QUI A ÉTÉ ESSAYÉ, PUIS
   * REFUSÉ (#5725 → #5812).
   *
   * `<base href="/">` répare bien la résolution des actifs d'un lien
   * profond, mais elle déplace la résolution de TOUTE URL relative du
   * document — les URL RÉDUITES À UN FRAGMENT comprises. Mesuré sur le dist
   * de la coque : depuis `/c/<id>`, le lien d'évitement `<a href="#contenu">`
   * (`src/components/shell.tsx`, présent sur CHAQUE écran) résolvait vers
   * `https://localhost/#contenu` — l'activer quittait le fil pour la liste.
   * Le correctif retenu est la BASE de Vite elle-même (`base: '/'`, la même
   * que la variante A) ; cette clause interdit le retour de la balise. */
  if (/<base[\s>]/i.test(html)) {
    violations.push(
      'une balise <base> est émise — elle déplace la résolution de TOUTE URL relative du ' +
        'document, fragments compris : depuis /c/<id>, le lien d’évitement <a href="#contenu"> ' +
        'quitte le fil pour la liste (mesuré, #5812). La base se règle par `base` de Vite.',
    );
  }

  /* LES ACTIFS SONT ROOT-ABSOLUS (#5725, #5812).
   *
   * `./assets/x.js` servi en réponse à une navigation vers `/c/<id>` résout
   * contre le chemin NAVIGUÉ (`https://localhost/c/assets/x.js`, 404) :
   * `index.html` arrive, son script jamais — une coquille inerte. Les deux
   * coques montent leur origine virtuelle à la RACINE, donc `/assets/x.js`
   * résout correctement quel que soit le chemin navigué. */
  const relatifs = [...html.matchAll(/(?:src|href)=["'](\.\/[^"']*)["']/gi)].map((m) => m[1]);
  if (relatifs.length > 0) {
    violations.push(
      `des actifs RELATIFS sont émis (${relatifs.slice(0, 3).join(', ')}) — servis en réponse à ` +
        'un chemin navigué autre que la racine, ils résolvent contre CE chemin (/c/assets/…, 404) : ' +
        'la coquille arrive, le fil jamais (D-27, #5725).',
    );
  }
  if (!/(?:src|href)=["']\/assets\//i.test(html)) {
    violations.push(
      'aucun actif root-absolu (/assets/…) dans index.html — la base de la variante B doit être ' +
        'la racine, comme celle de la variante A (D-27 corrigée en revue, #5812).',
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

  /* LES CINQ PAGES INSTITUTIONNELLES SONT DANS *CE* DIST, PAS DANS SON VOISIN
   * (#5812, élargit #5821).
   *
   * `scripts/prerender-institutional.tsx` écrivait `../dist` EN DUR : une
   * construction de la variante B les écrivait dans la sortie de la
   * variante A, et `dist-capacitor/` (celui que CE gate embarque dans l'APK
   * et l'IPA) n'en recevait AUCUNE — un défaut qu'aucune des quatre clauses
   * ci-dessus ne pouvait voir, puisque toutes portent sur `index.html`
   * seul. `files` est déjà préfixé du nom du dossier de sortie
   * (`allFiles(OUT).map(f => f.slice(APP.length + 1))`) : chercher
   * `${route}/index.html` en SUFFIXE, pas en préfixe, pour rester correct
   * quel que soit ce préfixe. */
  const routesManquantes = INSTITUTIONAL_ROUTES.filter(
    (route) => !files.some((f) => f.endsWith(`${route}/index.html`)),
  );
  if (routesManquantes.length > 0) {
    violations.push(
      `page(s) institutionnelle(s) absente(s) de CE dist : ${routesManquantes.join(', ')} — le ` +
        'préchauffage a écrit ailleurs (D-27 corrigée en revue, #5812, élargit #5821).',
    );
  }

  return violations;
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
 * L'INSTANTANÉ DE PAGE, SÉRIALISÉ VERS LE NAVIGATEUR (#5812).
 *
 * SANS FERMETURE : `page.evaluate(readDeepLinkSnapshot)` envoie le CORPS de
 * cette fonction dans la page (Playwright la sérialise) — toute variable
 * capturée de ce module y serait `undefined`. C'est pourquoi elle est aussi
 * le site que réutilise `scripts/shell-deeplink-probe.mjs` (Étape 3, WebView
 * réelle d'un appareil via CDP) : la MÊME loi, jouée par le gate et par la
 * recette manuelle, jamais deux lectures divergentes du même DOM.
 *
 * `hasComposer` : `textarea` n'apparaît qu'à un seul endroit du dépôt
 * (`src/components/composer.tsx`) — ni `ThreadRefused`, ni `ThreadSkeleton`,
 * ni `NotFound` n'en montent. Le sélecteur le plus simple qui est VRAI sur
 * le fil et FAUX partout ailleurs, mesuré.
 *
 * `skipLinkTarget` / `documentUrl` : le lien d'évitement est le PREMIER
 * contrôle du clavier sur chaque écran (`src/components/shell.tsx`). Un
 * chargement direct ne se juge pas seulement à ce qui MONTE : la moitié du
 * correctif de #5725 (une balise `<base>`) montait le fil et faisait quitter
 * l'écran au premier appui sur Tab+Entrée. On rapporte donc l'URL RÉSOLUE de
 * ce lien, pas son attribut — c'est la résolution qui change, jamais la
 * source.
 */
export function readDeepLinkSnapshot() {
  const skipLink = document.querySelector('.skip-link');
  return {
    bodyLen: document.body.innerHTML.length,
    rootChildren: document.getElementById('root')?.childElementCount ?? -1,
    hasThreadMain: document.querySelector('main#contenu') !== null,
    hasComposer: document.querySelector('textarea') !== null,
    documentUrl: location.href,
    skipLinkTarget: skipLink instanceof HTMLAnchorElement ? skipLink.href : null,
  };
}

/**
 * LE JUGEMENT SUR UN INSTANTANÉ, PUR (#5812).
 *
 * `auditDeepLink` prouvait jusqu'ici `bodyLen > 0`, `#root` non vide et zéro
 * `pageerror` — un seuil qu'un écran REFUSÉ (D-6) ou `NotFound` franchissent
 * tout autant qu'un fil réel (mesuré : REFUSÉ `bodyLen 1627`, INTROUVABLE
 * `bodyLen 479` — les DEUX passaient). `expect: 'thread'` exige la preuve
 * POSITIVE que c'est le fil (repères structurels, jamais seulement « non
 * vide ») ; `expect: 'refused'` exige la preuve que ce N'EST PAS le fil — un
 * seuil qui ne peut dire que « vide/non vide » ne peut pas garder D-6.
 */
export function auditDeepLinkPage(snapshot, { expect }) {
  const violations = [];

  if (snapshot.bodyLen === 0) {
    violations.push('page blanche : corps VIDE (bodyLen = 0) — la coquille arrive, rien ne monte.');
    return violations;
  }
  if (snapshot.rootChildren <= 0) {
    violations.push(
      `#root n'a monté AUCUN enfant (${snapshot.rootChildren}) — la coquille arrive, rien ne monte.`,
    );
    return violations;
  }

  if (expect === 'thread' && !(snapshot.hasThreadMain && snapshot.hasComposer)) {
    violations.push(
      `ce n'est pas le fil qui a monté (hasThreadMain=${snapshot.hasThreadMain}, ` +
        `hasComposer=${snapshot.hasComposer}) — un autre écran (refus D-6, introuvable) a pris sa place.`,
    );
  }
  if (expect === 'refused' && snapshot.hasThreadMain) {
    violations.push(
      'le FIL a monté alors qu’un refus était attendu (id inconnu) — fuite de contenu, D-6.',
    );
  }

  /* LE LIEN D'ÉVITEMENT RESTE SUR L'ÉCRAN CHARGÉ (#5812).
   *
   * Route-indépendant, donc jugé pour les deux attentes : c'est une
   * propriété de la RÉSOLUTION D'URL du document, que seule la coque
   * changeait (une balise `<base>`). Comparer les URL privées de leur
   * fragment — l'ancre `#contenu` est précisément ce que le lien AJOUTE. */
  if (snapshot.skipLinkTarget === null || snapshot.skipLinkTarget === undefined) {
    violations.push(
      'aucun lien d’évitement (.skip-link) sur l’écran chargé — la coquille en pose un sur CHAQUE ' +
        'route (src/components/shell.tsx) ; son absence rendrait cette clause muette (#5812).',
    );
  } else {
    const cible = snapshot.skipLinkTarget.split('#')[0];
    const ici = (snapshot.documentUrl ?? '').split('#')[0];
    if (cible !== ici) {
      violations.push(
        `le lien d’évitement QUITTE l’écran chargé (${snapshot.skipLinkTarget} depuis ` +
          `${snapshot.documentUrl}) — le premier contrôle du clavier ramène à la racine. ` +
          'Une balise <base> déplace la résolution des URL réduites à un fragment (#5812).',
      );
    }
  }

  return violations;
}

/**
 * LE LIEN PROFOND, JOUÉ AVEC UN NAVIGATEUR RÉEL (#5725, #5812, critère 3).
 *
 * `auditShellDist` garde la FORME statique de `index.html` (dont la balise
 * `<base>`) ; ceci garde le COMPORTEMENT — une navigation DIRECTE (jamais un
 * `pushState` interne) vers `/c/<id>`, exactement ce qu'un lien profond, une
 * restauration ou un App Link produit dans une coque. DEUX cas, le même
 * serveur, le même navigateur : un id CONNU doit monter le fil, un id
 * INCONNU doit monter le refus (D-6) — jamais l'un à la place de l'autre.
 */
async function auditDeepLink(dist) {
  const server = await serveShellDist(dist);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launchChromium();
  const cases = [
    { path: '/c/c-deploiement', expect: 'thread' },
    { path: '/c/zzz-inconnu', expect: 'refused' },
  ];
  try {
    const violations = [];
    for (const { path, expect } of cases) {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(String(err)));
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      const snapshot = await page.evaluate(readDeepLinkSnapshot);
      await page.close();
      if (pageErrors.length > 0) {
        violations.push(`lien profond ${path} : ${pageErrors.length} erreur(s) JS — ${pageErrors[0]}`);
      }
      violations.push(...auditDeepLinkPage(snapshot, { expect }).map((v) => `lien profond ${path} : ${v}`));
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
    /* Le dossier de travail est EFFACÉ même sur cet échec précoce (#5812,
       revue-correction du point d'étape) — sinon `dist-capacitor/` restait
       au sol et faisait rougir `check-git-tracking.mjs` au tour suivant,
       exactement le défaut que le nettoyage de fin de `main()` existe déjà
       pour éviter. */
    rmSync(OUT, { recursive: true, force: true });
    process.exit(1);
  }

  const html = readFileSync(join(OUT, 'index.html'), 'utf8');
  const files = allFiles(OUT).map((f) => f.slice(APP.length + 1));
  const violations = auditShellDist(html, files);

  console.log('  navigation directe vers /c/c-deploiement (fil) et /c/zzz-inconnu (refus D-6), repli SPA …');
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
    `  ${OUT_DIR}/ honore le contrat de la variante B : base root-absolue sans balise <base>, ` +
      'sans service worker, ' +
      'viewport-fit=cover, theme-color #0b0c14 ; lien profond /c/c-deploiement monte le fil, ' +
      '/c/zzz-inconnu rend le refus (D-6).',
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
