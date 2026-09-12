#!/usr/bin/env node
/**
 * LA SONDE DE COQUE — UN SEUL JUGEMENT POUR DEUX PREUVES (#5812).
 *
 * `scripts/check-shell-dist.mjs` (dans `bun run gate`) prouve, avec un
 * navigateur RÉEL sur le dist capacitor SERVI, que `/c/<id>` monte le fil et
 * `/c/zzz-inconnu` monte le refus (D-6). Ce script rejoue EXACTEMENT le même
 * jugement (`readDeepLinkSnapshot` + `auditDeepLinkPage`, réutilisées —
 * jamais une seconde lecture du DOM) contre la WebView RÉELLE de l'AVD
 * `Meeshy_Poc_Web-v31`.
 *
 * Ce script n'entre PAS dans `bun run gate` — aucun gate ne dépend d'un
 * appareil connecté. Il sert la RECETTE manuelle, et sera rejoué sous la même
 * forme par chacune des 40+ surfaces à porter : un script qui applique la loi
 * du gate, jamais un jugement à l'œil.
 *
 * CDP BRUT, ET C'EST MESURÉ (revue #5812). La première écriture passait par
 * `chromium.connectOverCDP()` de Playwright ; contre la WebView Android
 * (Chrome 133) elle échoue à la POIGNÉE DE MAIN — « Protocol error
 * (Browser.setDownloadBehavior): Browser context management is not
 * supported » : une WebView expose une cible `page`, jamais un navigateur
 * complet. Le protocole lui-même, sur le socket de la PAGE
 * (`/json/list` → `webSocketDebuggerUrl`), répond parfaitement — d'où ces
 * quelques lignes de CDP nu, sans dépendance, plutôt qu'un outil qui exige
 * une surface que l'objet testé n'a pas.
 *
 * USAGE (AVD `Meeshy_Poc_Web-v31`, APK debug installé, WebView débogable car
 * `Bridge.java` l'active en debug) :
 *
 *   adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof me.meeshy.app)
 *   node scripts/shell-deeplink-probe.mjs --cdp http://127.0.0.1:9222 --path /c/c-deploiement --expect thread
 *
 * PREUVE iOS : la sonde ne pilote PAS le simulateur iOS — WKWebView ne parle
 * aucun CDP. La capture iOS se prend par `xcrun simctl io <udid> screenshot`,
 * après un lien profond posé par `MEESHY_SHELL_START_PATH` (README.md § « Le
 * lien profond dans une coque »). Le placeholder que
 * `CAPBridgeViewController.loadWebView()` exige sous `ios/App/App/public/c/<id>`
 * (garde `FileManager.fileExists` qui précède `Router.swift`) est posé
 * AUTOMATIQUEMENT par le hook `capacitor:{copy,sync}:{before,after}`
 * (`scripts/shell-start-path-hook.mjs`, #6027) — `bunx cap sync ios` avec la
 * variable posée suffit désormais, aucun geste manuel avant `xcodebuild`.
 * Android n'en a jamais eu besoin.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { auditDeepLinkPage, readDeepLinkSnapshot } from './check-shell-dist.mjs';

/* MÊME dossier de captures que les autres scripts de recette du dépôt
   (`check-reading-mode.mjs` : `<racine>/.cache/web-v2-workflow/…`) — une
   convention, jamais deux. */
const APP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUT_DIR = join(APP, '..', '..', '.cache', 'web-v2-workflow', 'recette');

function parseArgs(argv) {
  const args = { cdp: 'http://127.0.0.1:9222', path: '/c/c-deploiement', expect: 'thread' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--cdp') args.cdp = argv[++i];
    else if (flag === '--path') args.path = argv[++i];
    else if (flag === '--expect') args.expect = argv[++i];
    else throw new Error(`argument inconnu : ${flag}`);
  }
  return args;
}

/** UN CLIENT CDP DE VINGT LIGNES — une promesse par `id` de message. */
function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let next = 0;
  socket.addEventListener('message', (event) => {
    const frame = JSON.parse(event.data);
    const settle = pending.get(frame.id);
    if (settle === undefined) return;
    pending.delete(frame.id);
    if (frame.error) settle.reject(new Error(`${frame.error.message} (${JSON.stringify(frame.error)})`));
    else settle.resolve(frame.result);
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', () => reject(new Error(`connexion CDP impossible : ${url}`)));
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      next += 1;
      pending.set(next, { resolve, reject });
      socket.send(JSON.stringify({ id: next, method, params }));
    });
  return { ready, send, close: () => socket.close() };
}

/** `Runtime.evaluate` d'une fonction du dépôt, SANS fermeture (comme le gate). */
async function evaluate(session, fn, ...args) {
  const expression = `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(', ')})`;
  const result = await session.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(`évaluation refusée : ${result.exceptionDetails.text}`);
  return result.result.value;
}

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { cdp, path, expect } = parseArgs(process.argv.slice(2));

  const targets = await (await fetch(`${cdp}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (page === undefined) throw new Error(`aucune cible « page » sur ${cdp} — la WebView est-elle lancée ?`);
  console.log(`  cible : ${page.title} — ${page.url}`);

  const session = connect(page.webSocketDebuggerUrl);
  await session.ready;
  try {
    console.log(`  navigation directe vers ${path} …`);
    await evaluate(session, (target) => {
      window.location.href = target;
    }, path);
    await settle(3000);

    const snapshot = await evaluate(session, readDeepLinkSnapshot);
    const violations = auditDeepLinkPage(snapshot, { expect });
    console.log(`  instantané : ${JSON.stringify(snapshot)}`);

    mkdirSync(OUT_DIR, { recursive: true });
    const shot = await session.send('Page.captureScreenshot', { format: 'png' });
    const screenshotPath = join(OUT_DIR, `shell-deeplink${path.replace(/\//g, '-')}.png`);
    writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));
    writeFileSync(
      join(OUT_DIR, 'shell-deeplink.json'),
      JSON.stringify({ path, expect, snapshot, violations }, null, 2),
    );
    console.log(`  capture : ${screenshotPath}`);

    if (violations.length > 0) {
      console.error(`\n  ${path} (attendu : ${expect}) ne respecte pas le contrat du lien profond :\n`);
      for (const v of violations) console.error(`    · ${v}`);
      process.exit(1);
    }
    console.log(`\n  ${path} monte ${expect === 'thread' ? 'le fil' : 'le refus (D-6)'} — conforme.`);
  } finally {
    session.close();
  }
}

main().catch((err) => {
  console.error('\n  shell-deeplink-probe.mjs a échoué :', err);
  process.exit(1);
});
