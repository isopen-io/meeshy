#!/usr/bin/env node
/**
 * LA LECTURE DES STORIES ET DES RÉELS SOUS UN ANDROID LENT (#9277, #6925).
 *
 * Une MESURE, pas un gate : elle rend des nombres à comparer d'une
 * construction à l'autre (`DIST=<dossier> node scripts/measure-playback.mjs`),
 * sous Chromium bridé comme un Android d'entrée de gamme (CPU ×6, 360 × 740,
 * tactile). Quatre questions :
 *
 *  1. un BUFFER vidéo en pleine lecture d'un réel composé : la barre
 *     avance-t-elle pendant que l'image est figée, et combien de seeks de
 *     rattrapage la scène tire-t-elle sur la vidéo qui attend ?
 *  2. la même question sur la barre d'une story vidéo ;
 *  3. l'appui long met-il en pause la VIDÉO de la story, pas seulement sa barre ?
 *  4. le coût en script d'un passage d'un réel au suivant (cinq balayages
 *     clavier) et les tâches longues pendant le geste.
 *
 * Le buffer est SIMULÉ sur l'élément même (`readyState` < 3, `currentTime`
 * figé, évènement `waiting`) : les fixtures servent des `data:` qu'aucun
 * bridage réseau n'atteint, et c'est exactement l'état qu'un réseau lent
 * produit côté DOM.
 */
import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const DIST = process.env.DIST ?? new URL('../dist/', import.meta.url).pathname;
const CPU_SLOWDOWN = Number(process.env.CPU_SLOWDOWN ?? 6);
const STALL_MS = 3000;

const served = await startDistServer(DIST, { serviceWorker: false });
const browser = await launchChromium();
const results = {};

const newPage = async () => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  await cdp.send('Performance.enable');
  return { context, page, cdp };
};

/** Fige la vidéo comme un réseau lent le ferait, et compte les seeks tentés. */
const stall = (page, selector) =>
  page.evaluate((sel) => {
    const v = document.querySelector(sel);
    if (v === null) return false;
    const frozen = v.currentTime;
    window.__seeks = 0;
    Object.defineProperty(v, 'readyState', { configurable: true, get: () => 2 });
    Object.defineProperty(v, 'currentTime', { configurable: true, get: () => frozen, set: () => (window.__seeks += 1) });
    v.dispatchEvent(new Event('waiting'));
    return true;
  }, selector);

const unstall = (page, selector) =>
  page.evaluate((sel) => {
    const v = document.querySelector(sel);
    if (v === null) return;
    delete v.readyState;
    delete v.currentTime;
    v.dispatchEvent(new Event('canplay'));
    v.dispatchEvent(new Event('playing'));
  }, selector);

/** La fraction d'une barre au début et à la fin d'une FENÊTRE de mesure, lue
 * dans la page : la durée est l'objet de la mesure, pas une attente d'état. */
const barOver = (page, selector, ms) =>
  page.evaluate(
    async ({ sel, span }) => {
      const read = () => {
        const root = document.querySelector(sel);
        const node = root === null ? undefined : [root, ...root.querySelectorAll('*')].find((el) => /scaleX/.test(el.style.transform));
        const match = node?.style.transform.match(/scaleX\(([\d.e-]+)\)/);
        return match === null || match === undefined ? null : Number(match[1]);
      };
      const start = read();
      await new Promise((resolve) => setTimeout(resolve, span));
      return { start, end: read(), stallShown: document.querySelector('[data-playback-stall]') !== null, seeks: window.__seeks ?? 0 };
    },
    { sel: selector, span: ms },
  );

const settleFor = (page, ms) => page.evaluate((span) => new Promise((resolve) => setTimeout(resolve, span)), ms);

const round = (n) => (n === null ? null : Math.round(n * 1000) / 1000);

try {
  {
    const { context, page } = await newPage();
    await page.goto(`${served.base}/reel/reel-scene-loop`);
    const video = '[data-reel-mode="active"] [data-scene-player] video';
    await page.waitForSelector(video, { timeout: 15000 });
    await page.waitForFunction((sel) => {
      const v = document.querySelector(sel);
      return v !== null && !v.paused && v.readyState >= 2;
    }, video, { timeout: 15000 });
    await settleFor(page, 800);
    const bar = '[data-reel-mode="active"] [data-reel-progress]';
    await stall(page, video);
    const during = await barOver(page, bar, STALL_MS);
    await unstall(page, video);
    const after = await barOver(page, bar, 600);
    results.reelStall = {
      barBefore: round(during.start),
      barAfter3s: round(during.end),
      barMovedDuringStall: round(during.end !== null && during.start !== null ? Math.abs(during.end - during.start) : null),
      seeksDuringStall: during.seeks,
      stallIndicatorShown: during.stallShown,
      barMovesAgainAfterResume: after.start !== after.end,
    };
    await context.close();
  }

  {
    const { context, page } = await newPage();
    await page.goto(`${served.base}/story/st-video-long`);
    const video = '[data-story-scene] video';
    await page.waitForSelector(video, { timeout: 15000 });
    await settleFor(page, 1200);
    const bar = '[data-story-scene] [role="slider"]';
    await stall(page, video);
    const during = await barOver(page, bar, STALL_MS);
    await unstall(page, video);
    results.storyStall = {
      barBefore: round(during.start),
      barAfter3s: round(during.end),
      barMovedDuringStall: round(during.end !== null && during.start !== null ? Math.abs(during.end - during.start) : null),
      stallIndicatorShown: during.stallShown,
    };

    await context.close();
  }

  {
    const { context, page } = await newPage();
    await page.goto(`${served.base}/story/st-video-long`);
    const video = '[data-story-scene] video';
    await page.waitForSelector(video, { timeout: 15000 });
    await settleFor(page, 800);
    await page.mouse.move(180, 370);
    await page.mouse.down();
    await page.waitForSelector('[data-story-scene][data-story-paused="true"]', { timeout: 10000 });
    const pausedWhileHeld = await page.evaluate((sel) => document.querySelector(sel)?.paused ?? null, video);
    await page.mouse.up();
    results.storyHold = { videoPausedWhileHeld: pausedWhileHeld };
    await context.close();
  }

  {
    const { context, page, cdp } = await newPage();
    const longTasks = [];
    await page.exposeFunction('__longTask', (d) => longTasks.push(d));
    await page.addInitScript(() => {
      new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__longTask(e.duration))).observe({ type: 'longtask', buffered: true });
    });
    await page.goto(`${served.base}/reels?seed=reel-studio`);
    await page.waitForSelector('[data-reel-mode="active"]', { timeout: 15000 });
    await settleFor(page, 1500);
    longTasks.length = 0;
    const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    const start = await metric();
    const swipes = 5;
    for (let i = 0; i < swipes; i += 1) {
      await page.keyboard.press('ArrowDown');
      await page.waitForSelector(`[data-reel-index="${i + 1}"][data-reel-mode="active"]`, { timeout: 10000 });
      await settleFor(page, 400);
    }
    const end = await metric();
    results.reelPager = {
      swipes,
      scriptMsPerSwipe: Math.round(((end.ScriptDuration - start.ScriptDuration) * 1000) / swipes),
      layoutMsPerSwipe: Math.round(((end.LayoutDuration - start.LayoutDuration) * 1000) / swipes),
      longTasks: longTasks.length,
      worstLongTaskMs: Math.round(Math.max(0, ...longTasks)),
    };
    await context.close();
  }
} finally {
  await browser.close();
  await served.close();
}

console.log(JSON.stringify({ dist: DIST, cpuSlowdown: CPU_SLOWDOWN, ...results }, null, 2));
