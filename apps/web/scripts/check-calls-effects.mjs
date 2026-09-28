#!/usr/bin/env node
/**
 * EFFETS, ZOOM, CONVERSATION, MICRO — LA VUE D'APPEL DANS UN NAVIGATEUR RÉEL
 * (#8442, #8441, #8436, #8434, #8432).
 *
 * Les témoins `bun test` prouvent les règles avec des doublures de WebRTC et
 * de caméra. Aucun ne prouve qu'un effet posé dans Chromium arrive au PAIR
 * sans couper son image, que le micro coupé le reste quand la piste vidéo
 * change sous lui, ni qu'une caméra SANS zoom n'affiche rien. Ce gate le
 * mesure sur le `dist` construit (source fixtures), avec le pair qui décroche
 * (`fixtures-call-peer.ts`) et la caméra simulée de Chromium, en clair et en
 * sombre et aux deux gabarits (390 × 844, 320 × 568) :
 *
 *  1. un appel vocal se connecte, la caméra s'allume ;
 *  2. l'en-tête porte Réduire puis « Conversation » (verre isolé, 44 px), et
 *     « Messages » a quitté les actions (#8436) ;
 *  3. le rail de mon image : Caméra, (Retourner), Effets, Écran — chaque
 *     bouton fait 44, le rail porte le verre, ses boutons non (#8432) ;
 *  4. « Effets » ouvre le panneau de verre au-dessus de la pilule ; « Chaud »
 *     remplace la piste envoyée par la piste traitée, et le pair continue de
 *     DÉCODER des images (aucune image perdue) ;
 *  5. micro coupé, un effet de plus : la piste audio reste coupée et le pair
 *     l'a appris (#8434) ;
 *  6. Échap ferme le panneau sans réduire l'appel ;
 *  7. la caméra simulée n'offre pas de zoom : rien n'est affiché (#8441) ;
 *     une caméra qui l'offre (capacité injectée) montre la capsule « 1× »,
 *     et « Zoomer » la règle ;
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

const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) });
};

const appears = (page, selector, timeout = 8000) => page.waitForSelector(selector, { timeout }).then(() => true, () => false);
const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

const ARM_PEER = () => localStorage.setItem('meeshy.fixtures.callPeer', '1');

/* Une caméra qui OFFRE le zoom (Chrome sur Android) : la capacité est injectée, le réglage retenu. */
const ARM_PEER_AND_ZOOM = () => {
  localStorage.setItem('meeshy.fixtures.callPeer', '1');
  const capabilities = MediaStreamTrack.prototype.getCapabilities;
  const settings = MediaStreamTrack.prototype.getSettings;
  const zooms = new WeakMap();
  MediaStreamTrack.prototype.getCapabilities = function getCapabilities() {
    const base = capabilities.call(this);
    return this.kind === 'video' ? { ...base, zoom: { min: 1, max: 4, step: 0.1 } } : base;
  };
  MediaStreamTrack.prototype.getSettings = function getSettings() {
    const base = settings.call(this);
    return this.kind === 'video' ? { ...base, zoom: zooms.get(this) ?? 1 } : base;
  };
  const apply = MediaStreamTrack.prototype.applyConstraints;
  MediaStreamTrack.prototype.applyConstraints = function applyConstraints(constraints) {
    const zoom = constraints?.advanced?.find((set) => typeof set.zoom === 'number')?.zoom;
    if (zoom === undefined) return apply.call(this, constraints);
    zooms.set(this, zoom);
    window.__gateZoom = zoom;
    return Promise.resolve();
  };
};

const peerToggles = (page) => page.evaluate(() => window.__meeshyFixtureCallPeer?.toggles ?? []);
const peerFrames = (page) => page.evaluate(() => window.__meeshyFixtureCallPeer?.videoFrames() ?? 0);

const peerReceives = async (page) => {
  const before = await peerFrames(page);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(300);
    if ((await peerFrames(page)) > before + 3) return true;
  }
  return false;
};

const openActions = async (page) => {
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 3);
  await page.mouse.move(width / 2 + 8, height / 3 + 8);
  await appears(page, '[data-call-chrome="shown"]');
  const more = page.locator('[data-call-more]');
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
};

const startConnectedVideoCall = async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForSelector('[data-row] a');
  const first = await page.$eval('[data-row]', (el) => el.getAttribute('data-row'));
  await page.click(`[data-row="${first}"] a`);
  await page.waitForURL(`**/c/${first}`);
  await page.click('[data-thread-call="menu"]');
  await page.getByRole('menuitem', { name: 'Appel vocal' }).click();
  if (!(await appears(page, '[data-call-screen="connected"]', 15_000))) return false;
  await openActions(page);
  await page.click('button[aria-label="Activer la caméra"]');
  return appears(page, 'button[aria-label="Couper la caméra"]');
};

/** La piste vidéo que ma vignette montre — celle qui part. */
const sentVideo = (page) =>
  page.evaluate(() => {
    const video = document.querySelector('[data-call-corner] video, [data-call-tile-self] video');
    const track = video?.srcObject?.getVideoTracks?.()[0];
    return track === undefined ? null : { id: track.id, state: track.readyState };
  });

const localAudioEnabled = (page) =>
  page.evaluate(() => {
    const video = document.querySelector('[data-call-corner] video, [data-call-tile-self] video');
    return video?.srcObject?.getAudioTracks?.().map((track) => track.enabled) ?? null;
  });

const nestedGlass = (page) =>
  page.evaluate(() => {
    const GLASS = '.glass-call, .glass-call-prominent';
    return [...document.querySelectorAll(GLASS)].filter((glass) => glass.parentElement?.closest(GLASS) != null).length;
  });

const browser = await launchChromium({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const [scheme, width, height] of [
    ['light', 390, 844],
    ['dark', 390, 844],
    ['dark', 320, 568],
  ]) {
    const label = `${scheme === 'light' ? 'clair' : 'sombre'} ${width}×${height}`;
    const slug = `${scheme}-${width}x${height}`;
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'fr-FR', permissions: ['camera', 'microphone'] });
    await context.addInitScript(ARM_PEER);
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    try {
      // ------------------------------------------------ 1. un appel, caméra allumée
      check(await startConnectedVideoCall(page), `${label} : l'appel se connecte et la caméra s'allume`);

      // ------------------------------------------------ 2. l'en-tête
      const header = await page.$$eval('[data-call-header] button', (buttons) => buttons.map((button) => ({ label: button.getAttribute('aria-label'), glass: button.className.includes('glass-call'), w: button.getBoundingClientRect().width, h: button.getBoundingClientRect().height })));
      check(header[0]?.label === 'Réduire l’appel' && header[1]?.label === 'Ouvrir la conversation', `${label} : l'en-tête porte Réduire puis « Conversation » (${header.map((b) => b.label).join(' · ')})`);
      check(header[1] !== undefined && header[1].glass && header[1].w >= TAP_FLOOR && header[1].h >= TAP_FLOOR, `${label} : « Conversation » est un verre isolé de ${TAP_FLOOR} au moins`);
      await openActions(page);
      check((await page.$('[data-call-control="messages"]')) === null, `${label} : « Messages » a quitté les actions`);

      // ------------------------------------------------ 3. le rail de mon image
      const mine = await page.$$eval('[data-call-rail="mine"] button', (buttons) => buttons.map((button) => ({ label: button.getAttribute('aria-label'), glass: button.className.includes('glass-call'), w: button.getBoundingClientRect().width, h: button.getBoundingClientRect().height })));
      const labels = mine.map((button) => button.label).filter((name) => name !== 'Retourner la caméra');
      check(JSON.stringify(labels) === JSON.stringify(['Couper la caméra', 'Effets de ma vidéo', 'Partager l’écran']), `${label} : mon image — ${mine.map((b) => b.label).join(' · ')}`);
      check(mine.every((button) => !button.glass && button.w >= TAP_FLOOR && button.h >= TAP_FLOOR), `${label} : les boutons du rail font ${TAP_FLOOR} et n'ont pas de verre à eux`);

      // ------------------------------------------------ 4. les effets
      const before = await sentVideo(page);
      await page.click('[data-call-control="effects"]');
      check(await appears(page, '[data-call-effects-panel]'), `${label} : « Effets » ouvre le panneau`);
      check((await page.getAttribute('[data-call-control="effects"]', 'aria-expanded')) === 'true', `${label} : « Effets » dit que son panneau est ouvert`);
      check((await nestedGlass(page)) === 0, `${label} : aucun verre posé dans un verre, panneau ouvert`);
      await page.click('[data-call-effects-preset="warm"]');
      check((await page.getAttribute('[data-call-effects-preset="warm"]', 'aria-checked')) === 'true', `${label} : « Chaud » est coché`);
      check(await until(page, (id) => {
        const video = document.querySelector('[data-call-corner] video, [data-call-tile-self] video');
        const track = video?.srcObject?.getVideoTracks?.()[0];
        return track !== undefined && track.id !== id && track.readyState === 'live';
      }, before?.id ?? ''), `${label} : la piste envoyée est désormais la piste traitée`);
      check(await peerReceives(page), `${label} : le pair décode toujours des images (aucune perdue)`);
      await capture(page, `effets-panneau-${slug}`);

      // ------------------------------------------------ 5. le micro coupé le reste
      await page.click('[data-call-screen] button[aria-label="Couper le micro"]');
      await page.click('[data-call-effects-preset="vivid"]');
      await page.fill('[data-call-effects-panel] input[type="range"]', '20').catch(() => undefined);
      await page.waitForTimeout(300);
      check(JSON.stringify(await localAudioEnabled(page)) === '[false]', `${label} : micro coupé, poser un effet ne le rouvre pas`);
      const toggles = await peerToggles(page);
      check(toggles.filter((t) => t.event === 'call:toggle-audio').at(-1)?.enabled === false, `${label} : le pair sait le micro coupé`);

      // ------------------------------------------------ 6. Échap
      await page.focus('[data-call-effects-preset="vivid"]');
      await page.keyboard.press('Escape');
      const closed = await page.waitForSelector('[data-call-effects-panel]', { state: 'detached', timeout: 4000 }).then(() => true, () => false);
      check(closed && (await page.$('[data-call-screen="connected"]')) !== null, `${label} : Échap ferme le panneau sans réduire l'appel`);

      // ------------------------------------------------ 7. pas de zoom proposé : rien
      check((await page.$('[data-call-zoom]')) === null, `${label} : une caméra sans zoom n'affiche aucune commande de zoom`);

      await page.click('[data-call-screen] button[aria-label="Activer le micro"]').catch(() => undefined);
      await openActions(page);
      await page.click('[data-call-screen] button[aria-label="Raccrocher"]');
    } catch (error) {
      failures.push(`${label} : ${error instanceof Error ? error.message : String(error)} — erreurs de page ${JSON.stringify(errors)}`);
    }
    check(errors.length === 0, `${label} : aucune erreur de page — ${JSON.stringify(errors)}`);
    await context.close();
  }

  // ------------------------------------------------ 7 bis. une caméra qui offre le zoom
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', locale: 'fr-FR', permissions: ['camera', 'microphone'] });
  await context.addInitScript(ARM_PEER_AND_ZOOM);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    check(await startConnectedVideoCall(page), 'zoom : l’appel se connecte et la caméra s’allume');
    check(await appears(page, '[data-call-zoom]'), 'zoom : la capsule apparaît sous ma vignette');
    const value = () => page.$eval('[data-call-zoom-value]', (el) => el.textContent ?? '');
    check((await value()) === '1×', `zoom : l’indicateur dit « ${await value()} »`);
    const plus = await page.locator('[data-call-zoom-in]').boundingBox();
    check(plus !== null && plus.width >= TAP_FLOOR && plus.height >= TAP_FLOOR, `zoom : « Zoomer » fait ${TAP_FLOOR} au moins`);
    await page.click('[data-call-zoom-in]');
    check(await until(page, () => window.__gateZoom === 1.3), 'zoom : « Zoomer » règle la caméra (zoom 1,3)');
    check((await value()) === '1,3×', `zoom : l’indicateur suit (« ${await value()} »)`);
    await capture(page, 'zoom-capsule-dark-390x844');
    await openActions(page);
    await page.click('[data-call-screen] button[aria-label="Raccrocher"]');
  } catch (error) {
    failures.push(`zoom : ${error instanceof Error ? error.message : String(error)} — erreurs de page ${JSON.stringify(errors)}`);
  }
  check(errors.length === 0, `zoom : aucune erreur de page — ${JSON.stringify(errors)}`);
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
console.log('\n  Les effets partent chez le pair sans perdre une image, le micro coupé le reste, la conversation est à un geste, le zoom n’apparaît que là où il existe.\n');
