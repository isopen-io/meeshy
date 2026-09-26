#!/usr/bin/env node
/**
 * ON PARTAGE SON ÉCRAN PENDANT UN APPEL (#8063).
 *
 * Les témoins `bun test` prouvent les LOIS du moteur (la piste remplacée sur
 * chaque lien, l'annonce, la caméra rendue) avec des doublures de WebRTC. Aucun
 * ne prouve que l'écran ARRIVE à l'autre bout : une renégociation ratée en
 * appel vocal (la ligne vidéo ne faisait que recevoir), un `replaceTrack` sur
 * le mauvais émetteur, une vidéo rognée chez le receveur les laissent tous
 * verts. Ce gate les mesure dans un navigateur réel, sur le `dist` construit
 * (source fixtures), avec un PAIR qui décroche vraiment (`fixtures-call-peer.ts`,
 * une `RTCPeerConnection` dans la page, armée par `meeshy.fixtures.callPeer`)
 * et un `getDisplayMedia` simulé (un canevas animé — le sélecteur d'écran du
 * navigateur ne s'ouvre pas sans tête), dans les DEUX schémas et aux deux
 * gabarits (390 × 844, 320 × 568) :
 *
 *  1. un appel VOCAL se connecte au pair ;
 *  2. le bouton « Partager l’écran » est offert, cible de 44 ;
 *  3. le toucher annonce le partage, et le pair DÉCODE des images de l'écran
 *     (la renégociation d'un appel vocal a eu lieu) ; la pastille « Vous
 *     partagez votre écran » s'affiche, le bouton est enfoncé ;
 *  4. « Arrêter le partage » du navigateur (fin de la piste) arrête le partage
 *     et l'annonce — l'appel reste vocal ;
 *  5. la caméra allumée, un partage puis son arrêt au bouton rendent la caméra ;
 *  6. le pair partage à son tour : son écran s'affiche en grand, ENTIER
 *     (`object-fit: contain`), des images arrivent, sous la bannière « Nadia
 *     Benali partage son écran » ; son arrêt rend l'écran d'appel ;
 *  7. sans `getDisplayMedia` (la WebView de la coque Android, Safari iOS),
 *     aucun bouton ne promet le partage — mais la RÉCEPTION n'en dépend pas :
 *     dans un appel VOCAL où personne n'a allumé de caméra, l'écran du pair
 *     s'affiche en grand, entier, sous sa bannière, puis on revient au portrait ;
 *  8. aucune erreur de page.
 *
 * `CAPTURE_DIR=<dossier>` écrit les captures de recette.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

const failures = [];
const check = (ok, what) => {
  if (ok) console.log(`  ok    ${what}`);
  else failures.push(what);
};

const TAP_FLOOR = 44;
const SHARE = '[data-call-screen-share]';
const PEER_NAME = 'Nadia Benali';

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

const appears = (page, selector, timeout = 8000) => page.waitForSelector(selector, { timeout }).then(() => true, () => false);
const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

/* Le pair est armé, et getDisplayMedia rend un canevas animé : ce qu'un écran enverrait. */
const ARM_PEER_AND_DISPLAY = () => {
  localStorage.setItem('meeshy.fixtures.callPeer', '1');
  navigator.mediaDevices.getDisplayMedia = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext('2d');
    let tick = 0;
    setInterval(() => {
      context.fillStyle = '#0f766e';
      context.fillRect(0, 0, 1280, 720);
      context.fillStyle = '#ffffff';
      context.font = 'bold 72px sans-serif';
      context.fillText(`Mon écran ${tick++}`, 80, 360);
    }, 100);
    const stream = canvas.captureStream(10);
    window.__gateDisplayTrack = stream.getVideoTracks()[0];
    return stream;
  };
};

const WITHOUT_DISPLAY = () => {
  localStorage.setItem('meeshy.fixtures.callPeer', '1');
  delete MediaDevices.prototype.getDisplayMedia;
};

const peerToggles = (page) => page.evaluate(() => window.__meeshyFixtureCallPeer?.toggles ?? []);
const peerFrames = (page) => page.evaluate(() => window.__meeshyFixtureCallPeer?.videoFrames() ?? 0);

/** Les images que le pair décode AUGMENTENT : l'écran lui arrive, maintenant. */
const peerReceives = async (page) => {
  const before = await peerFrames(page);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(300);
    if ((await peerFrames(page)) > before + 3) return true;
  }
  return false;
};

const startConnectedAudioCall = async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForSelector('[data-row] a');
  const first = await page.$eval('[data-row]', (el) => el.getAttribute('data-row'));
  await page.click(`[data-row="${first}"] a`);
  await page.waitForURL(`**/c/${first}`);
  await page.click('[data-thread-call="menu"]');
  await page.getByRole('menuitem', { name: 'Appel vocal' }).click();
  return appears(page, '[data-call-screen="connected"]', 15_000);
};

const browser = await launchChromium({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const scheme of ['light', 'dark']) {
    for (const [width, height] of [
      [390, 844],
      [320, 568],
    ]) {
      const label = `${scheme === 'light' ? 'clair' : 'sombre'} ${width}×${height}`;
      const slug = `${scheme}-${width}x${height}`;
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR', permissions: ['camera', 'microphone'] });
      await context.addInitScript(ARM_PEER_AND_DISPLAY);
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      try {
        // ------------------------------------------------ 1. un appel vocal connecté
        check(await startConnectedAudioCall(page), `${label} : l'appel vocal se connecte au pair`);

        // ------------------------------------------------ 2. le bouton
        const share = page.locator(SHARE);
        check((await share.count()) === 1 && (await share.getAttribute('aria-label')) === 'Partager l’écran', `${label} : « Partager l’écran » est offert`);
        const box = await share.boundingBox();
        check(box !== null && box.height >= TAP_FLOOR && box.width >= TAP_FLOOR, `${label} : le bouton fait au moins ${TAP_FLOOR} (${JSON.stringify(box && [Math.round(box.width), Math.round(box.height)])})`);

        // ------------------------------------------------ 3. partager
        await share.click();
        check(await appears(page, '[data-call-pill="screen-sharing"]'), `${label} : la pastille « Vous partagez votre écran » s'affiche`);
        check((await share.getAttribute('aria-pressed')) === 'true' && (await share.getAttribute('aria-label')) === 'Arrêter le partage d’écran', `${label} : le bouton devient « Arrêter le partage d’écran », enfoncé`);
        check((await peerToggles(page)).some((t) => t.event === 'call:toggle-screen' && t.enabled), `${label} : le partage est annoncé (call:toggle-screen)`);
        check(await peerReceives(page), `${label} : le pair décode l'écran partagé (renégociation d'un appel vocal)`);
        await capture(page, `partage-emis-${slug}`);

        // ------------------------------------------------ 4. fin système de la piste
        await page.evaluate(() => {
          const track = window.__gateDisplayTrack;
          track.stop();
          track.dispatchEvent(new Event('ended'));
        });
        const stopped = await page.waitForSelector('[data-call-pill="screen-sharing"]', { state: 'detached', timeout: 5000 }).then(() => true, () => false);
        check(stopped && (await share.getAttribute('aria-pressed')) === 'false', `${label} : « Arrêter le partage » du navigateur arrête le partage`);
        const toggles = await peerToggles(page);
        check(toggles.at(-1)?.event === 'call:toggle-screen' && toggles.at(-1)?.enabled === false, `${label} : la fin du partage est annoncée`);
        check((await page.locator('button[aria-label="Activer la caméra"]').count()) === 1 && (await page.$('[data-call-screen="connected"]')) !== null, `${label} : l'appel reste vocal et connecté`);

        // ------------------------------------------------ 5. la caméra revient
        await page.click('button[aria-label="Activer la caméra"]');
        await appears(page, 'button[aria-label="Couper la caméra"]');
        await share.click();
        await appears(page, '[data-call-pill="screen-sharing"]');
        check(await page.locator('button[aria-label="Couper la caméra"], button[aria-label="Activer la caméra"]').first().isDisabled(), `${label} : la caméra ne se rallume pas par-dessus un partage`);
        await share.click();
        check(await appears(page, 'button[aria-label="Couper la caméra"][aria-pressed="true"]:not([disabled])'), `${label} : arrêter le partage rend la caméra qui tournait`);
        await page.click('button[aria-label="Couper la caméra"]');
        await appears(page, 'button[aria-label="Activer la caméra"]');

        // ------------------------------------------------ 6. le pair partage
        await page.evaluate(() => window.__meeshyFixtureCallPeer?.share());
        check(await appears(page, '[data-call-shared-screen] video'), `${label} : l'écran du pair prend la scène`);
        const fit = await page.$eval('[data-call-shared-screen] video', (video) => getComputedStyle(video).objectFit).catch(() => null);
        check(fit === 'contain', `${label} : l'écran partagé s'affiche ENTIER (object-fit ${fit})`);
        check(await until(page, () => (document.querySelector('[data-call-shared-screen] video')?.videoWidth ?? 0) > 0), `${label} : des images de l'écran du pair arrivent`);
        const banner = await page.$eval('[data-call-screen-banner]', (el) => el.textContent ?? '').catch(() => '');
        check(banner === `${PEER_NAME} partage son écran`, `${label} : la bannière nomme celui qui partage (« ${banner} »)`);
        await capture(page, `partage-recu-${slug}`);
        await page.evaluate(() => window.__meeshyFixtureCallPeer?.stopShare());
        const back = await page.waitForSelector('[data-call-shared-screen]', { state: 'detached', timeout: 5000 }).then(() => true, () => false);
        check(back && (await page.$('[data-call-screen="connected"]')) !== null, `${label} : la fin du partage du pair rend l'écran d'appel`);

        await page.click('[data-call-screen] button[aria-label="Raccrocher"]');
      } catch (error) {
        failures.push(`${label} : ${error instanceof Error ? error.message : String(error)} — erreurs de page ${JSON.stringify(errors)}`);
      }
      check(errors.length === 0, `${label} : aucune erreur de page — ${JSON.stringify(errors)}`);
      await context.close();
    }
  }

  // ------------------------------------------------ 7. sans getDisplayMedia
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', permissions: ['camera', 'microphone'] });
  await context.addInitScript(WITHOUT_DISPLAY);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  check(await startConnectedAudioCall(page), 'sans getDisplayMedia : l’appel VOCAL se connecte (aucune caméra, d’aucun côté)');
  check((await page.$(SHARE)) === null, 'sans getDisplayMedia (coque Android, Safari iOS) : aucun bouton ne promet le partage');
  // La RÉCEPTION ne dépend d'aucune capacité d'émission : le pair partage, l'écran s'affiche.
  await page.evaluate(() => window.__meeshyFixtureCallPeer?.share());
  check(await appears(page, '[data-call-shared-screen] video'), 'sans getDisplayMedia : l’écran partagé du pair prend la scène dans un appel vocal');
  const fitNoDisplay = await page.$eval('[data-call-shared-screen] video', (video) => getComputedStyle(video).objectFit).catch(() => null);
  check(fitNoDisplay === 'contain', `sans getDisplayMedia : l’écran reçu s’affiche ENTIER (object-fit ${fitNoDisplay})`);
  check(await until(page, () => (document.querySelector('[data-call-shared-screen] video')?.videoWidth ?? 0) > 0), 'sans getDisplayMedia : des images de l’écran du pair arrivent');
  const bannerNoDisplay = await page.$eval('[data-call-screen-banner]', (el) => el.textContent ?? '').catch(() => '');
  check(bannerNoDisplay === `${PEER_NAME} partage son écran`, `sans getDisplayMedia : la bannière nomme celui qui partage (« ${bannerNoDisplay} »)`);
  await capture(page, 'partage-recu-sans-getDisplayMedia');
  await page.evaluate(() => window.__meeshyFixtureCallPeer?.stopShare());
  check(await page.waitForSelector('[data-call-shared-screen]', { state: 'detached', timeout: 5000 }).then(() => true, () => false), 'sans getDisplayMedia : la fin du partage rend le portrait de l’appel vocal');
  check(errors.length === 0, `sans getDisplayMedia : aucune erreur de page — ${JSON.stringify(errors)}`);
  await context.close();
} finally {
  await browser.close();
  served.close();
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.error(`    · ${f}`);
  process.exit(1);
}
console.log('\n  On partage son écran pendant un appel : il arrive entier chez le pair, et l’appel retombe sur la caméra ou la voix.\n');
