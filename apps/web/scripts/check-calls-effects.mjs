#!/usr/bin/env node
/**
 * EFFETS, ZOOM, CONVERSATION, MICRO, MONTAGE — LA VUE D'APPEL DANS UN
 * NAVIGATEUR RÉEL (#8442, #8441, #8436, #8434, #8432, #8550, #8551, #8552,
 * #8576, #8578, #8580).
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
 *  3. les commandes de ma caméra, dans ma vignette : Caméra, (Retourner),
 *     Effets, Écran — chaque bouton fait 44, sans verre à lui, et le (…) ne
 *     les double pas (#8432, #8550, #8626) ;
 *  4. « Effets » entre dans le MODE Effets (#8578) : l'en-tête, la pilule et
 *     ses rangées partent, ma vidéo prend tout l'écran ; « Visage · Couleur »
 *     au-dessus d'UN carrousel centré en bas ; « Chaud » remplace la piste
 *     envoyée par la piste traitée, et le pair continue de DÉCODER des images
 *     (aucune image perdue) ;
 *  4 bis. l'effet de visage « Éruption » teint l'image ENVOYÉE : le rouge y
 *     domine le bleu nettement plus qu'avant (lave, braises, étalonnage
 *     orangé), et le pair décode toujours (#8551) ;
 *  5. micro coupé AVANT le mode, un effet de plus : la piste audio reste
 *     coupée et le pair l'a appris (#8434) ; « Réglages » ouvre la luminosité ;
 *  6. Valider garde les effets et rend l'écran d'appel ; Échap (✕) quitte le
 *     mode en rendant les effets d'avant, sans réduire l'appel ;
 *  7. la caméra simulée n'offre pas de zoom : rien n'est affiché (#8441) ;
 *     une caméra qui l'offre (capacité injectée) ne montre la capsule « 1× »
 *     que quand MON image est en plein écran (#8576), et « Zoomer » la règle ;
 *  8. « Capturer » entre dans le MODE Montage (#8578, #8580) : l'aperçu plein
 *     écran et les TREIZE montages du carrousel, dans l'ordre (Écran,
 *     Couverture, Doré, Tapis rouge, Grille, Bande, Polaroid, Magazine,
 *     Pellicule, Néon, Noir et blanc, BD, Cœur), se PEIGNENT en direct ;
 *     « Couverture » passe l'aperçu, et le déclencheur télécharge un PNG de
 *     1080 × 1920 ; « Chaque visage » en télécharge un par tuile affichée ;
 *  9. aucune erreur de page.
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
const vanishes = (page, selector, timeout = 4000) => page.waitForSelector(selector, { state: 'detached', timeout }).then(() => true, () => false);

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
  await appears(page, '[data-call-actions]');
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

/** La couleur moyenne de l'image que ma vignette montre — celle qui PART. */
const sentColor = (page) =>
  page.evaluate(() => {
    const video = document.querySelector('[data-call-corner] video, [data-call-tile-self] video');
    if (video === null || video.videoWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, 64, 64);
    const data = context.getImageData(0, 0, 64, 64).data;
    const sum = [0, 0, 0];
    for (let index = 0; index < data.length; index += 4) {
      sum[0] += data[index];
      sum[1] += data[index + 1];
      sum[2] += data[index + 2];
    }
    const count = data.length / 4;
    return { r: sum[0] / count, g: sum[1] / count, b: sum[2] / count };
  });

/** Un canevas PEINT : assez de pixels non transparents, et plus d'une couleur. */
const painted = (page, selector) =>
  page.$$eval(selector, (canvases) =>
    canvases.map((canvas) => {
      const context = canvas.getContext('2d');
      if (context === null || canvas.width === 0) return false;
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      let opaque = 0;
      for (let index = 0; index < data.length; index += 16) {
        if (data[index + 3] > 0) opaque += 1;
        colors.add(`${data[index] >> 4}-${data[index + 1] >> 4}-${data[index + 2] >> 4}`);
      }
      return opaque > data.length / 16 / 2 && colors.size > 3;
    }),
  );

const pngSize = async (path) => {
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(path);
  return { png: bytes.subarray(1, 4).toString('latin1') === 'PNG', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

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

      // ------------------------------------------------ 3. la rangée de mon image
      check((await page.$('[data-call-row="mine"]')) === null, `${label} : le (…) ne double pas les commandes de ma caméra`);
      const mine = await page.$$eval('[data-call-corner-frame] [data-call-self-controls="tile"] button', (buttons) => buttons.map((button) => ({ label: button.getAttribute('aria-label'), glass: button.className.includes('glass-call'), w: button.getBoundingClientRect().width, h: button.getBoundingClientRect().height })));
      const labels = mine.map((button) => button.label).filter((name) => name !== 'Retourner la caméra');
      check(JSON.stringify(labels) === JSON.stringify(['Couper la caméra', 'Effets de ma vidéo', 'Partager l’écran']), `${label} : mon image — ${mine.map((b) => b.label).join(' · ')}`);
      check(mine.every((button) => !button.glass && button.w >= TAP_FLOOR && button.h >= TAP_FLOOR), `${label} : les boutons de la rangée de ma vignette font ${TAP_FLOOR} et n'ont pas de verre à eux`);

      // ------------------------------------------------ 5 (avant le mode). le micro coupé
      await page.click('[data-call-screen] button[aria-label="Couper le micro"]');
      await appears(page, '[data-call-screen] button[aria-label="Activer le micro"]');

      // ------------------------------------------------ 4. le mode Effets
      const before = await sentVideo(page);
      const natural = await sentColor(page);
      await openActions(page);
      await page.click('[data-call-control="effects"]');
      check(await appears(page, '[data-call-mode="effects"]'), `${label} : « Effets » entre dans le mode Effets`);
      const left = await page.evaluate(() => ['[data-call-header]', '[data-call-control-pill]', '[data-call-row]'].filter((selector) => document.querySelector(selector) !== null));
      check(left.length === 0, `${label} : l'en-tête, la pilule et les rangées partent (${JSON.stringify(left)})`);
      check(await appears(page, '[data-call-mode-preview="effects"] video'), `${label} : ma vidéo prend tout l'écran`);
      const categories = await page.$$eval('[data-call-effects-category]', (tabs) => tabs.map((tab) => [tab.getAttribute('data-call-effects-category'), tab.getAttribute('aria-pressed'), tab.textContent]));
      check(JSON.stringify(categories) === JSON.stringify([['face', 'true', 'Visage'], ['color', 'false', 'Couleur']]), `${label} : « Visage · Couleur », Visage d'abord (${JSON.stringify(categories)})`);
      const carousel = await page.$eval('[data-call-mode-carousel]', (element) => {
        const box = element.getBoundingClientRect();
        return { center: Math.round(box.left + box.width / 2), bottom: Math.round(box.bottom), overflowX: getComputedStyle(element.querySelector('[data-call-row-scroll]')).overflowX };
      });
      check(Math.abs(carousel.center - width / 2) <= 2 && carousel.bottom > height * 0.6 && carousel.overflowX === 'auto', `${label} : UN carrousel, centré en bas, qui défile (${JSON.stringify(carousel)})`);
      const faces = await page.$$eval('[data-call-mode="effects"] [data-carousel-item]', (chips) => chips.map((chip) => ({ id: chip.getAttribute('data-carousel-item'), h: chip.getBoundingClientRect().height, glyph: chip.querySelector('svg') !== null })));
      check(JSON.stringify(faces.map((chip) => chip.id)) === JSON.stringify(['none', 'smoothing', 'toad', 'angel', 'demon', 'volcano']) && faces.every((chip) => chip.h >= TAP_FLOOR && chip.glyph), `${label} : six effets de visage de ${TAP_FLOOR}, chacun son aperçu`);
      check((await nestedGlass(page)) === 0, `${label} : aucun verre posé dans un verre, mode ouvert`);
      await page.click('[data-call-effects-category="color"]');
      const presets = await page.$$eval('[data-call-mode="effects"] [data-carousel-item]', (chips) => chips.map((chip) => chip.getAttribute('data-carousel-item')));
      check(JSON.stringify(presets) === JSON.stringify(['natural', 'warm', 'cool', 'vivid', 'muted']), `${label} : « Couleur » : cinq préréglages (${presets.join(' · ')})`);
      await page.click('[data-carousel-item="warm"]');
      check((await page.getAttribute('[data-carousel-item="warm"]', 'aria-checked')) === 'true', `${label} : « Chaud » est coché`);
      check(await until(page, (id) => {
        const video = document.querySelector('[data-call-corner] video, [data-call-tile-self] video, [data-call-mode-preview] video');
        const track = video?.srcObject?.getVideoTracks?.()[0];
        return track !== undefined && track.id !== id && track.readyState === 'live';
      }, before?.id ?? ''), `${label} : la piste envoyée est désormais la piste traitée`);
      check(await peerReceives(page), `${label} : le pair décode toujours des images (aucune perdue)`);
      await capture(page, `effets-mode-${slug}`);

      // ------------------------------------------------ 4 bis. l'éruption
      await page.click('[data-call-effects-category="face"]');
      await page.click('[data-carousel-item="volcano"]');
      check((await page.getAttribute('[data-carousel-item="volcano"]', 'aria-checked')) === 'true', `${label} : « Éruption » est coché`);
      const warmth = (color) => (color === null ? 0 : color.r - color.b);
      const tinted = await until(page, (base) => {
        const video = document.querySelector('[data-call-mode-preview] video');
        if (video === null || video.videoWidth === 0) return false;
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(video, 0, 0, 64, 64);
        const data = context.getImageData(0, 0, 64, 64).data;
        let red = 0;
        let blue = 0;
        for (let index = 0; index < data.length; index += 4) {
          red += data[index];
          blue += data[index + 2];
        }
        return (red - blue) / (data.length / 4) > base + 25 && red > blue;
      }, warmth(natural), 4000);
      check(natural !== null && tinted, `${label} : l'éruption teint l'image envoyée d'orangé (r−b au départ ${Math.round(warmth(natural))})`);
      check(await peerReceives(page), `${label} : le pair décode toujours des images, éruption posée`);
      await capture(page, `effets-eruption-${slug}`);

      // ------------------------------------------------ 5. le micro coupé le reste ; les réglages
      check(JSON.stringify(await localAudioEnabled(page)) === '[false]', `${label} : micro coupé, poser un effet ne le rouvre pas`);
      const toggles = await peerToggles(page);
      check(toggles.filter((t) => t.event === 'call:toggle-audio').at(-1)?.enabled === false, `${label} : le pair sait le micro coupé`);
      await page.click('[data-call-effects-settings-toggle]');
      check(await appears(page, '[data-call-effects-settings] input[type="range"]'), `${label} : « Réglages » ouvre la luminosité`);
      check((await page.$('[data-call-mode="effects"] [data-carousel-item]')) === null, `${label} : à la place du carrousel`);
      await page.click('[data-call-effects-settings-toggle]');
      check(await appears(page, '[data-call-mode="effects"] [data-carousel-item]'), `${label} : un second appui rend le carrousel`);

      // ------------------------------------------------ 6. valider, puis quitter sans garder
      await page.click('[data-call-effects-validate]');
      check(await vanishes(page, '[data-call-mode]'), `${label} : Valider quitte le mode`);
      check(await appears(page, '[data-call-control-pill]'), `${label} : la pilule revient`);
      check(await until(page, () => document.activeElement?.hasAttribute('data-call-more') === true), `${label} : le focus revient au (…)`);
      await openActions(page);
      await page.click('[data-call-control="effects"]');
      await appears(page, '[data-call-mode="effects"]');
      check((await page.getAttribute('[data-carousel-item="volcano"]', 'aria-checked')) === 'true', `${label} : l'effet validé est gardé`);
      await page.click('[data-call-effects-category="color"]');
      await page.click('[data-carousel-item="cool"]');
      await page.focus('[data-carousel-item="cool"]');
      await page.keyboard.press('Escape');
      check(await vanishes(page, '[data-call-mode]') && (await page.$('[data-call-screen="connected"]')) !== null, `${label} : Échap quitte le mode sans réduire l'appel`);
      await openActions(page);
      await page.click('[data-call-control="effects"]');
      await appears(page, '[data-call-mode="effects"]');
      await page.click('[data-call-effects-category="color"]');
      check((await page.getAttribute('[data-carousel-item="warm"]', 'aria-checked')) === 'true', `${label} : quitter rend les effets d'avant (« Chaud », pas « Froid »)`);
      await page.click('[data-call-mode-quit]');
      await vanishes(page, '[data-call-mode]');

      // ------------------------------------------------ 7. pas de zoom proposé : rien
      check((await page.$('[data-call-zoom]')) === null, `${label} : une caméra sans zoom n'affiche aucune commande de zoom`);

      // ------------------------------------------------ 8. le mode Montage
      await openActions(page);
      await page.click('[data-call-screen] button[aria-label="Activer le micro"]').catch(() => undefined);
      await page.click('[data-call-control="capture"]');
      check(await appears(page, '[data-call-mode="montage"]'), `${label} : « Capturer » entre dans le mode Montage`);
      check((await page.$('[data-call-control-pill]')) === null, `${label} : la pilule part`);
      const order = await page.$$eval('[data-call-mode="montage"] [data-carousel-item]', (items) => items.map((item) => item.getAttribute('data-carousel-item')));
      check(JSON.stringify(order) === JSON.stringify(['screen', 'cover', 'gold', 'redcarpet', 'grid', 'strip', 'polaroid', 'magazine', 'film', 'neon', 'noir', 'comic', 'heart']), `${label} : treize montages, dans l'ordre (${order.join(' · ')})`);
      const paintedAll = (selector) =>
        until(
          page,
          (target) =>
            [...document.querySelectorAll(target)].every((canvas) => {
              const context = canvas.getContext('2d');
              if (context === null || canvas.width === 0) return false;
              const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
              const colors = new Set();
              let opaque = 0;
              for (let index = 0; index < data.length; index += 16) {
                if (data[index + 3] > 0) opaque += 1;
                colors.add(`${data[index] >> 4}-${data[index + 1] >> 4}-${data[index + 2] >> 4}`);
              }
              return opaque > data.length / 16 / 2 && colors.size > 3;
            }) && document.querySelectorAll(target).length > 0,
          selector,
        );
      check(await paintedAll('[data-call-capture-preview]'), `${label} : l'aperçu plein écran se peint en direct`);
      check(await paintedAll('[data-call-capture-thumb]'), `${label} : les treize vignettes se peignent (${(await painted(page, '[data-call-capture-thumb]')).filter(Boolean).length}/13)`);
      await page.click('[data-carousel-item="cover"]');
      check((await page.getAttribute('[data-call-capture-preview]', 'data-call-capture-preview')) === 'cover', `${label} : l'aperçu passe en Couverture`);
      check(await paintedAll('[data-call-capture-preview]'), `${label} : la couverture se peint`);
      await capture(page, `montage-couverture-${slug}`);
      const shot = page.waitForEvent('download', { timeout: 8000 });
      await page.click('[data-call-capture-shoot]');
      const download = await shot.catch(() => null);
      check(download !== null && /^meeshy-appel-cover-\d{8}-\d{6}\.png$/.test(download.suggestedFilename()), `${label} : le déclencheur télécharge le montage (${download?.suggestedFilename() ?? 'rien'})`);
      if (download !== null) {
        const path = join(CAPTURE_DIR ?? '/tmp', `capture-montage-${slug}.png`);
        await download.saveAs(path);
        const size = await pngSize(path);
        check(size.png && size.width === 1080 && size.height === 1920, `${label} : un PNG de 1080 × 1920 (${size.width} × ${size.height})`);
      }
      check(await until(page, () => document.querySelector('[data-call-capture-status]')?.textContent === 'Capture enregistrée'), `${label} : « Capture enregistrée »`);
      const tiles = await page.$$eval('video[data-call-stream]', (videos) => videos.filter((video) => video.videoWidth > 0).length);
      const downloads = [];
      page.on('download', (item) => downloads.push(item.suggestedFilename()));
      await page.click('[data-call-capture-faces]');
      check(await until(page, () => /visages? enregistrés?/.test(document.querySelector('[data-call-capture-status]')?.textContent ?? '')), `${label} : « Chaque visage » le dit (${await page.textContent('[data-call-capture-status]')})`);
      const deadline = Date.now() + 3000;
      while (downloads.length < tiles && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
      check(tiles > 0 && downloads.length === tiles && downloads.every((name) => /^meeshy-appel-visage-/.test(name)), `${label} : un portrait par tuile affichée (${downloads.length}/${tiles})`);
      await page.keyboard.press('Escape');
      check(await vanishes(page, '[data-call-mode]'), `${label} : Échap quitte le mode Montage`);

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
    check((await page.$('[data-call-zoom]')) === null, 'zoom : pas de capsule sur ma vignette en coin');
    await page.click('[data-call-corner]');
    check(await appears(page, '[data-call-zoom]'), 'zoom : mon image en plein écran montre la capsule, sur le bord');
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
console.log('\n  Les effets de couleur et de visage partent chez le pair sans perdre une image, dans un mode qui libère l’écran ; le micro coupé le reste ; les treize montages se peignent en direct et s’enregistrent ; le zoom n’apparaît que sur mon image en plein écran.\n');
