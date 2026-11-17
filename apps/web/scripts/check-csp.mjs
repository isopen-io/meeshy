#!/usr/bin/env node
/**
 * L'APPLICATION DÉMARRE SOUS SA POLITIQUE DE SÉCURITÉ DU CONTENU, ET LA
 * POLITIQUE MORD (#18986) — prouvé dans Chromium, sur `dist/` servi avec
 * EXACTEMENT l'en-tête que `nginx.conf` enverrait derrière Traefik
 * (`scripts/lib/csp.mjs`, `documentPolicy`).
 *
 * Une politique se prouve dans les deux sens, et chacun a coûté ailleurs :
 *
 *  1. ELLE LAISSE VIVRE CE QUE L'ORIGINE SERT. La coquille, la landing, une
 *     page institutionnelle et une landing de langue se peignent sans AUCUNE
 *     violation (`securitypolicyviolation`), amorces en ligne comprises ; le
 *     pont libsignal s'instancie (`'wasm-unsafe-eval'` — mesuré par la
 *     contre-analyse du 2026-11-17 : sans lui, `script-src 'self'` CASSE le
 *     pont).
 *  2. ELLE REFUSE CE QUI N'EST PAS À ELLE. `new Function` lève ; une amorce
 *     ALTÉRÉE d'un caractère ne s'exécute pas et se signale ; un script d'un
 *     hôte tiers ne se charge pas.
 *
 * Elle ne prouve PAS les en-têtes réellement servis par nginx et Traefik en
 * ligne (la recette sur staging le fait), ni Safari ni Firefox.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium, reportOpenPages } from './lib/browser.mjs';
import { documentPolicy } from './lib/csp.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const POLICY = documentPolicy(readFileSync(join(APP, 'nginx.conf'), 'utf8'), { forwardedProto: 'https' });
/** Les actifs ne portent pas la politique (`nginx.conf` : `/assets/`, `/og/`) — un Worker la recevrait de SA réponse. */
const ACTIF = /^\/(?:assets|og)\//;

const failures = [];
const check = (ok, label) => {
  console.log(`  ${ok ? 'ok  ' : 'ÉCHEC'}  ${label}`);
  if (!ok) failures.push(label);
};

const bridgeChunk = readdirSync(join(DIST, 'assets')).find((name) => /^libsignal-bridge-[A-Za-z0-9_-]+\.js$/.test(name));
if (bridgeChunk === undefined) {
  console.error('  dist/assets ne porte pas le chunk du pont libsignal — lancer `bun run build`.');
  process.exit(1);
}

const served = await startDistServer(DIST, {
  serviceWorker: false,
  headers: (pathname) => (ACTIF.test(pathname) ? {} : { 'content-security-policy': POLICY }),
});
const browser = await launchChromium();

const recordViolations = () => {
  window.__cspViolations = [];
  document.addEventListener('securitypolicyviolation', (event) => {
    window.__cspViolations.push({ directive: event.violatedDirective, blocked: event.blockedURI, sample: event.sample });
  });
};

/**
 * Le gate sert `dist/` sur `http://127.0.0.1` : la passerelle déduite de cet
 * hôte serait `http://127.0.0.1:3000`, une connexion EN CLAIR que la politique
 * servie derrière TLS refuse — à raison. La configuration de déploiement
 * déclare donc une passerelle `https:` (`config.json`, #18988), comme le
 * ferait la page servie sous `https://meeshy.me` ; ses appels échouent au
 * réseau, jamais à la politique.
 */
const DECLARED_GATEWAY = JSON.stringify({ apiUrl: 'https://gate.meeshy.invalid', webUrl: 'https://meeshy.invalid' });

/**
 * Un script de la PAGE — jamais `page.evaluate`, que Chromium exécute hors de
 * la politique — tente de fabriquer du code depuis une chaîne.
 */
const EVAL_PROBE = `try { window.__evalProbe = new Function('return "exécuté"')(); } catch (error) { window.__evalProbe = error.name; }`;

try {
  const context = await browser.newContext();
  await context.addInitScript(recordViolations);
  await context.route('**/config.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: DECLARED_GATEWAY }));
  await context.route('**/__sonde-eval.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: EVAL_PROBE }));
  const page = await context.newPage();

  for (const [path, label] of [
    ['/chats', 'la coquille de l’application'],
    ['/c/c-salon-riviere', 'un fil de conversation'],
    ['/feeds', 'le fil des publications'],
    ['/settings', 'les réglages'],
    ['/', 'la landing'],
    ['/about', 'une page institutionnelle'],
    ['/en', 'une landing de langue'],
  ]) {
    const response = await page.goto(`${served.base}${path}`, { waitUntil: 'networkidle' });
    check(response?.headers()['content-security-policy'] === POLICY, `${label} (${path}) est servie sous la politique de nginx.conf`);
    const violations = await page.evaluate(() => window.__cspViolations);
    check(violations.length === 0, `${label} (${path}) se peint sans aucune violation — ${JSON.stringify(violations)}`);
  }

  await page.goto(`${served.base}/chats`, { waitUntil: 'networkidle' });
  const painted = await page.evaluate(() => ({
    scheme: document.documentElement.classList.contains('dark') || document.documentElement.classList.contains('light'),
    lang: document.documentElement.lang,
    root: (document.getElementById('root')?.childElementCount ?? 0) > 0,
  }));
  check(painted.scheme, 'l’amorce du schéma s’est exécutée (classe `dark`/`light` posée)');
  check(painted.lang === 'fr', `l’amorce de la langue d’interface s’est exécutée (lang=${painted.lang})`);
  check(painted.root, 'l’application a rendu sa coquille');

  const bridge = await page.evaluate(async (url) => {
    try {
      const { openLibsignalBridge } = await import(url);
      const opened = await openLibsignalBridge();
      const identity = await opened.generateIdentity();
      return { version: opened.version, identityKeyLength: identity.identityKey.length };
    } catch (error) {
      return { error: String(error) };
    }
  }, `/assets/${bridgeChunk}`);
  check(bridge.identityKeyLength === 33, `le pont libsignal s’instancie et tire une identité (${JSON.stringify(bridge)})`);

  const evaluated = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = '/__sonde-eval.js';
        script.onload = () => resolve(window.__evalProbe);
        script.onerror = () => resolve('sonde non chargée');
        document.head.append(script);
      }),
  );
  check(evaluated === 'EvalError', `\`new Function\`, appelé par un script de la page, lève (${evaluated})`);

  const shell = readFileSync(join(DIST, 'index.html'), 'utf8');
  const altered = shell.replace('<script>(function(){', '<script>window.__amorceAlteree=true;(function(){');
  check(altered !== shell, 'la coquille porte bien une amorce en ligne à altérer');
  await page.route('**/__amorce-alteree', (route) =>
    route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': POLICY }, body: altered }),
  );
  await page.goto(`${served.base}/__amorce-alteree`, { waitUntil: 'domcontentloaded' });
  const alteredRun = await page.evaluate(() => ({ ran: window.__amorceAlteree === true, violations: window.__cspViolations }));
  check(!alteredRun.ran, 'une amorce altérée d’un seul script ne s’exécute pas');
  check(
    alteredRun.violations.some(({ directive }) => directive.startsWith('script-src')),
    `et la politique le signale (${JSON.stringify(alteredRun.violations.map(({ directive }) => directive))})`,
  );

  await page.goto(`${served.base}/chats`, { waitUntil: 'networkidle' });
  const thirdParty = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/left-pad@1.3.0/index.js';
        script.onload = () => resolve('chargé');
        script.onerror = () => resolve('refusé');
        document.head.append(script);
      }),
  );
  const refusedHost = await page.evaluate(() => window.__cspViolations.some(({ blocked }) => blocked.startsWith('https://cdn.jsdelivr.net')));
  check(thirdParty === 'refusé' && refusedHost, `un script d’un hôte tiers ne se charge pas (${thirdParty})`);

  await context.close();
} catch (error) {
  reportOpenPages();
  throw error;
} finally {
  await browser.close();
  served.close();
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} échec(s) — la politique de sécurité du contenu casse l’application ou ne mord pas (#18986).`);
  process.exit(1);
}
console.log('\n  L’application démarre sous sa politique de sécurité du contenu, et la politique refuse ce qui n’est pas à elle (#18986).');
