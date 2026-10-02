#!/usr/bin/env node
/**
 * LES EFFETS DE MA VIDÉO NE COÛTENT AUCUNE IMAGE (#9099, #8471, #8441) — la
 * mesure, dans Chromium, sur le `dist` construit (source fixtures), avec le
 * pair simulé qui décroche et la caméra simulée à 30 images par seconde.
 *
 * Trois passes de dix secondes, chacune pendant que le carrousel du mode
 * Effets est GLISSÉ en continu (le rendu Preact du fil principal que le
 * traitement ne doit plus payer) :
 *
 *  1. un effet de couleur ET de visage (« Chaud » + « Éruption ») ;
 *  2. le flou d'arrière-plan par segmentation (la caméra simulée n'offre pas
 *     `backgroundBlur`) — et il FLOUTE : la netteté de l'image envoyée chute ;
 *  3. le zoom numérique (#8441) : l'image ENVOYÉE est recadrée.
 *
 * Pour chacune : images par seconde que la piste ENVOYÉE remet au lien
 * (`media-source` du lien sortant) ≥ 28, images perdues < 5 % (contre la
 * cadence de la caméra) — l'`outbound-rtp` est rapporté à côté, mais sur un
 * lien local l'estimation de débit de WebRTC le bride les premières secondes
 * (`qualityLimitationReason: bandwidth`), quel que soit le traitement ; aucune tâche longue
 * pendant un glissé, et le p95 du traitement d'une image ≤ 4 ms (relevé par le
 * worker, publié en marque `meeshy-call-effects`).
 *
 * `DIST=<dossier>` mesure un autre build (la mesure « avant »).
 * `REPORT_ONLY=1` imprime sans échouer. `CAPTURE_DIR=<dossier>` écrit l'image
 * envoyée avant et pendant le flou. `CPU_THROTTLE=4` ralentit le
 * processeur de la page (CDP) comme un téléphone moyen.
 */
import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const DIST = process.env.DIST ?? new URL('../dist/', import.meta.url).pathname;
const REPORT_ONLY = process.env.REPORT_ONLY === '1';
const WINDOW_MS = 10_000;
const CAMERA_FPS = 30;
const FLOOR = { fps: 28, dropped: 0.05, p95: 4 };
const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
const capture = async (page, name) => {
  if (CAPTURE_DIR !== null) await page.screenshot({ path: `${CAPTURE_DIR}/${name}.png` });
};

const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

const failures = [];
const check = (ok, what) => {
  if (ok) console.log(`  ok    ${what}`);
  else failures.push(what);
};

/**
 * LE TEMPS SE LIT SUR L'HORLOGE DE LA PAGE, jamais en délai fixe : une fenêtre
 * de mesure est un FAIT (« dix secondes de la page se sont écoulées »), un pas
 * de geste attend l'image suivante du navigateur.
 */
const elapse = (page, ms) => page.evaluate((wait) => new Promise((resolve) => setTimeout(resolve, wait)), ms);
const nextFrame = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));

const appears = (page, selector, timeout = 8000) => page.waitForSelector(selector, { timeout }).then(() => true, () => false);
const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

const ARM = () => {
  localStorage.setItem('meeshy.fixtures.callPeer', '1');
  const Native = window.RTCPeerConnection;
  const links = [];
  window.__gateLinks = links;
  window.RTCPeerConnection = class extends Native {
    constructor(...args) {
      super(...args);
      links.push(this);
    }
  };
  window.__gateLong = [];
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__gateLong.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    window.__gateLong = null;
  }
};

const openActions = async (page) => {
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
  return (await appears(page, 'button[aria-label="Couper la caméra"]')) && until(page, () => (document.querySelector('[data-call-corner] video, [data-call-tile-self] video')?.videoWidth ?? 0) > 0);
};

/** Le lien qui ENVOIE le plus d'images vidéo : celui de l'appel (le pair simulé reçoit). */
const sending = (page) =>
  page.evaluate(async () => {
    const found = [];
    for (const link of window.__gateLinks ?? []) {
      if (link.connectionState === 'closed') continue;
      const stats = await link.getStats();
      let out = null;
      let source = null;
      stats.forEach((entry) => {
        if (entry.type === 'outbound-rtp' && entry.kind === 'video') out = entry;
        if (entry.type === 'media-source' && entry.kind === 'video') source = entry;
      });
      if (out !== null && (out.framesSent ?? 0) > 0) found.push({ sent: out.framesSent, encoded: out.framesEncoded, width: out.frameWidth, height: out.frameHeight, limitation: out.qualityLimitationReason, sourceFrames: source?.frames ?? null });
    }
    found.sort((a, b) => b.sent - a.sent);
    return { at: performance.now(), link: found[0] ?? null };
  });

const processing = (page) =>
  page.evaluate(() => {
    const marks = performance.getEntriesByName('meeshy-call-effects');
    return marks.at(-1)?.detail ?? null;
  });

/** La netteté de l'image envoyée : l'écart moyen d'un pixel à ses voisins (laplacien), sur une réduction 160 × 90. */
const sharpness = (page) =>
  page.evaluate(() => {
    const video = document.querySelector('[data-call-mode-preview] video, [data-call-corner] video');
    if (video === null || video.videoWidth === 0) return null;
    const [w, h] = [160, 90];
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, 0, 0, w, h);
    const data = context.getImageData(0, 0, w, h).data;
    const luma = (x, y) => {
      const i = (y * w + x) * 4;
      return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    };
    let sum = 0;
    for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) sum += Math.abs(4 * luma(x, y) - luma(x - 1, y) - luma(x + 1, y) - luma(x, y - 1) - luma(x, y + 1));
    return sum / ((w - 2) * (h - 2));
  });

/** Glisse le carrousel du mode à la molette, dans un sens puis dans l'autre ; rend la fenêtre du glissé (horloge de la page). */
const glide = async (page, direction) => {
  const row = await page.$eval('[data-call-mode-carousel] [data-call-row-scroll]', (element) => {
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  await page.mouse.move(row.x, row.y);
  const start = await page.evaluate(() => performance.now());
  for (let step = 0; step < 12; step += 1) {
    await page.mouse.wheel(direction * 40, 0);
    await nextFrame(page);
  }
  const end = await page.evaluate(() => performance.now());
  return { start, end };
};

const measure = async (page, name, { reference = false } = {}) => {
  await elapse(page, 1500);
  const first = await sending(page);
  const longBefore = await page.evaluate(() => window.__gateLong?.length ?? -1);
  const glides = [];
  const deadline = Date.now() + WINDOW_MS;
  let direction = 1;
  while (Date.now() < deadline) {
    if (reference) {
      await elapse(page, 500);
      continue;
    }
    glides.push(await glide(page, direction));
    direction = -direction;
    await elapse(page, 150);
  }
  const last = await sending(page);
  const long = await page.evaluate((from) => (window.__gateLong === null ? null : window.__gateLong.slice(from)), longBefore);
  const timing = await processing(page);
  if (first.link === null || last.link === null) {
    failures.push(`${name} : aucun lien n'envoie d'images vidéo`);
    return null;
  }
  const seconds = (last.at - first.at) / 1000;
  const delivered = (last.link.sourceFrames ?? 0) - (first.link.sourceFrames ?? 0);
  const fps = delivered / seconds;
  const dropped = Math.max(0, 1 - delivered / (seconds * CAMERA_FPS));
  const encoderFps = Math.round(((last.link.sent - first.link.sent) / seconds) * 10) / 10;
  const duringGlide = long === null ? null : long.filter((task) => glides.some((g) => task.start < g.end && task.start + task.duration > g.start));
  const result = { name, fps: Math.round(fps * 10) / 10, encoderFps, dropped: Math.round(dropped * 1000) / 10, size: `${last.link.width}×${last.link.height}`, limitation: last.link.limitation, longTasks: long?.length ?? null, longTasksDuringGlide: duringGlide?.length ?? null, worstLongTask: long === null || long.length === 0 ? 0 : Math.round(Math.max(...long.map((task) => task.duration))), p95: timing?.p95 ?? null, p50: timing?.p50 ?? null, frames: timing?.frames ?? null, glides: glides.length };
  console.log(`  mesure ${JSON.stringify(result)}`);
  if (reference) return result;
  check(fps >= FLOOR.fps, `${name} : ${result.fps} images par seconde remises à l’envoi (≥ ${FLOOR.fps} ; l’encodeur en envoie ${encoderFps}, limité par « ${result.limitation} »)`);
  check(dropped < FLOOR.dropped, `${name} : ${result.dropped} % d'images perdues (< ${FLOOR.dropped * 100} %)`);
  check(duringGlide !== null && duringGlide.length === 0, `${name} : aucune tâche longue pendant ${glides.length} glissés (${result.longTasksDuringGlide})`);
  check(timing !== null && timing.p95 <= FLOOR.p95, `${name} : p95 du traitement d'une image ${result.p95} ms (≤ ${FLOOR.p95})`);
  return result;
};

const browser = await launchChromium({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream=fps=30', '--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', locale: 'fr-FR', permissions: ['camera', 'microphone'] });
await context.addInitScript(ARM);
const page = await context.newPage();
page.setDefaultTimeout(10_000);
const throttle = Number(process.env.CPU_THROTTLE ?? '1');
if (throttle > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  check(await startConnectedVideoCall(page), 'l’appel se connecte et la caméra s’allume');
  check((await page.evaluate(() => window.__gateLong)) !== null, 'le navigateur rapporte les tâches longues');
  await measure(page, 'caméra seule (référence)', { reference: true });

  await openActions(page);
  await page.click('[data-call-control="effects"]');
  check(await appears(page, '[data-call-mode="effects"]'), 'le mode Effets s’ouvre');
  await page.click('[data-call-effects-category="color"]');
  await page.click('[data-carousel-item="warm"]');
  await page.click('[data-call-effects-category="face"]');
  await page.click('[data-carousel-item="volcano"]');
  await measure(page, 'effet (Chaud + Éruption)');

  await page.click('[data-carousel-item="none"]');
  await page.click('[data-call-effects-category="color"]');
  await page.click('[data-carousel-item="natural"]');
  await until(page, () => (document.querySelector('[data-call-mode-preview] video')?.videoWidth ?? 0) > 0);
  await nextFrame(page);
  await nextFrame(page);
  const sharp = await sharpness(page);
  check(sharp !== null && sharp > 0, `la netteté de l’image envoyée se mesure sans flou (${sharp})`);
  await capture(page, 'perf-sans-flou');
  await page.click('[data-call-effects-settings-toggle]');
  const offered = await appears(page, '[data-call-effects-blur]', 3000);
  check(offered, 'le flou d’arrière-plan est offert sans flou de caméra (#8471)');
  if (offered) {
    await page.click('[data-call-effects-blur]');
    await page.click('[data-call-effects-settings-toggle]');
    const blurred = await until(
      page,
      async (base) => {
        const video = document.querySelector('[data-call-mode-preview] video');
        if (video === null || video.videoWidth === 0) return false;
        const [w, h] = [160, 90];
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(video, 0, 0, w, h);
        const data = context.getImageData(0, 0, w, h).data;
        const luma = (x, y) => 0.299 * data[(y * w + x) * 4] + 0.587 * data[(y * w + x) * 4 + 1] + 0.114 * data[(y * w + x) * 4 + 2];
        let sum = 0;
        for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) sum += Math.abs(4 * luma(x, y) - luma(x - 1, y) - luma(x + 1, y) - luma(x, y - 1) - luma(x, y + 1));
        return sum / ((w - 2) * (h - 2)) < base * 0.6;
      },
      sharp ?? 0,
      20_000,
    );
    check(blurred, `le flou floute l’image envoyée (netteté avant ${sharp === null ? '?' : sharp.toFixed(2)}, après ${((await sharpness(page)) ?? 0).toFixed(2)})`);
    await elapse(page, 3000);
    await capture(page, 'perf-flou');
    console.log(`  netteté avec le masque : ${((await sharpness(page)) ?? 0).toFixed(2)} (sans flou : ${(sharp ?? 0).toFixed(2)})`);
    await measure(page, 'flou d’arrière-plan (segmentation)');
    await page.click('[data-call-effects-settings-toggle]');
    await page.click('[data-call-effects-blur]');
    await page.click('[data-call-effects-settings-toggle]');
  }

  await page.click('[data-call-effects-validate]');
  await until(page, () => document.querySelector('[data-call-mode]') === null);
  const step = '[data-call-corner-frame] [data-call-self-row="camera"] [data-call-self-control="zoom"]';
  const zoomOffered = (await page.getAttribute(step, 'data-call-zoom-mode').catch(() => null)) === 'local';
  check(zoomOffered, 'le cran du zoom numérique est offert sur une caméra sans zoom (#8441)');
  if (zoomOffered) {
    await page.$eval(step, (button) => button.click());
    await openActions(page);
    await page.click('[data-call-control="effects"]');
    await appears(page, '[data-call-mode="effects"]');
    await elapse(page, 1500);
    await capture(page, 'perf-zoom');
    await measure(page, 'zoom numérique 2×');
  }
} catch (error) {
  failures.push(`${error instanceof Error ? error.message : String(error)} — erreurs de page ${JSON.stringify(errors)}`);
} finally {
  check(errors.length === 0, `aucune erreur de page — ${JSON.stringify(errors)}`);
  await context.close();
  await browser.close();
  served.close();
}

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const f of failures) console.error(`    · ${f}`);
  process.exit(REPORT_ONLY ? 0 : 1);
}
console.log('\n  Les effets, le flou et le zoom de ma vidéo tiennent 30 images par seconde sans tâche longue pendant un glissé : le traitement vit hors du fil principal.\n');
