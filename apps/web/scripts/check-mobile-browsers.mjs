#!/usr/bin/env node
/**
 * LES ÉCRANS WEB TIENNENT SUR SAFARI ET CHROME iOS COMME SUR CHROME ANDROID
 * (#10005, note « plat » de la planche du milestone World Wide).
 *
 * Quatre adresses — la landing `/`, l'entrée invité `/world`, la liste
 * `/chats` et un fil — en émulation iPhone (390 × 664, la vue visible sous les
 * barres de Safari) et Pixel (412 × 839), dans les deux schémas :
 *
 *   1. le cadre ne défile jamais de côté ;
 *   2. chaque champ visible est écrit à 16 px au moins — sous ce seuil, Safari
 *      iOS zoome la page au focus et ne la rend jamais ;
 *   3. la barre du navigateur (`theme-color` actif) a la couleur de la surface
 *      peinte sous elle ;
 *
 * et, sur le fil, clavier ouvert :
 *
 *   4. iPhone : le clavier RECOUVRE (Safari ignore
 *      `interactive-widget=resizes-content`) et Safari a fait glisser la page
 *      pour montrer le champ — simulé par un `visualViewport` piloté (336 px
 *      de clavier, 200 px de glissement). Le composeur est collé au bord haut
 *      du clavier, l'en-tête est revenu en place ;
 *   5. Pixel : le clavier RÉDUIT la vue (`resizes-content`) — simulé en
 *      réduisant la fenêtre. Le composeur reste collé au bas, et
 *      `data-keyboard="open"` est posé quand même ;
 *   6. clavier refermé, rien ne reste posé sur `<html>` ;
 *   7. le retour système (l'historique du navigateur) ramène du fil à /chats.
 *
 * WEBKIT RÉEL N'EST PAS ICI : Chromium émule l'iPhone (agent, densité, tactile)
 * mais pas le moteur. La recette sur appareil réel est l'issue de suivi du
 * lot ; ce témoin garde la LOGIQUE (mesure du clavier, `h-app`, encoches).
 *
 * `BASE=http://localhost:5317` vise un serveur déjà lancé (`vite`) ; sans lui
 * le témoin sert `dist`. `OUT=<dossier>` y écrit les captures de recette.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const served = process.env.BASE === undefined ? await startDistServer(join(APP, 'dist'), { serviceWorker: false }) : null;
const BASE = process.env.BASE ?? served.base;

const OUT = process.env.OUT;
const KB = 336;

const DEVICES = {
  iphone: {
    viewport: { width: 390, height: 664 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
  pixel: {
    viewport: { width: 412, height: 839 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  },
};

const fakeViewport = () => {
  const target = new EventTarget();
  const state = { inset: 0, offsetTop: 0 };
  const fake = target;
  Object.defineProperties(fake, {
    width: { get: () => window.innerWidth },
    height: { get: () => window.innerHeight - state.inset },
    offsetTop: { get: () => state.offsetTop },
    offsetLeft: { get: () => 0 },
    pageTop: { get: () => window.scrollY + state.offsetTop },
    scale: { get: () => 1 },
  });
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
  window.__keyboard = (inset, offsetTop = 0) => {
    state.inset = inset;
    state.offsetTop = offsetTop;
    fake.dispatchEvent(new Event('resize'));
  };
  const scrollTo = window.scrollTo.bind(window);
  window.scrollTo = (...args) => {
    state.offsetTop = 0;
    scrollTo(...args);
  };
};

const failures = [];
const check = (label, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail === undefined ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

const frameFacts = (page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    const fields = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({ name: el.getAttribute('name') ?? el.getAttribute('aria-label') ?? el.tagName, size: parseFloat(getComputedStyle(el).fontSize) }));
    const themes = [...document.querySelectorAll('meta[name="theme-color"]')]
      .filter((m) => matchMedia(m.media || 'all').matches)
      .map((m) => m.content.toLowerCase());
    const rgb = getComputedStyle(document.body).backgroundColor;
    return { sideways: doc.scrollWidth - doc.clientWidth, fields, themes, body: rgb };
  });

const hex = (rgb) => {
  const m = rgb.match(/\d+/g) ?? [];
  return `#${m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
};

const browser = await launchChromium();
try {
  for (const [device, options] of Object.entries(DEVICES)) {
    for (const scheme of ['dark', 'light']) {
      const context = await browser.newContext({ ...options, colorScheme: scheme });
      await context.addInitScript((s) => {
        try {
          localStorage.setItem('meeshy.scheme', s);
        } catch {
          /* navigation privée : le schéma du système s'applique */
        }
      }, scheme);
      if (device === 'iphone') await context.addInitScript(fakeViewport);
      const page = await context.newPage();
      for (const path of ['/', '/world', '/chats', '/c/c-amina']) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
        await page.locator('input:visible, textarea:visible').first().waitFor({ timeout: 15000 });
        const facts = await frameFacts(page);
        const tag = `${device}/${scheme} ${path}`;
        check(`${tag} : aucun défilement de côté`, facts.sideways <= 0, `${facts.sideways}px`);
        const small = facts.fields.filter((f) => f.size < 16);
        check(`${tag} : saisie ≥ 16 px (${facts.fields.length} champ(s))`, small.length === 0, JSON.stringify(small));
        check(`${tag} : theme-color = surface`, facts.themes.length > 0 && facts.themes.every((t) => t === hex(facts.body)), `${facts.themes} vs ${hex(facts.body)}`);
        if (OUT && scheme === 'dark') await page.screenshot({ path: `${OUT}/${device}${path.replace(/\//g, '_') || '_root'}.png` });
      }
      if (scheme === 'dark') {
        await page.goto(`${BASE}/c/c-amina`, { waitUntil: 'networkidle' });
        const composer = page.locator('textarea').first();
        await composer.waitFor({ timeout: 15000 });
        await composer.focus();
        if (device === 'iphone') {
          await page.evaluate((kb) => window.__keyboard(kb, 200), KB);
        } else {
          await page.setViewportSize({ width: options.viewport.width, height: options.viewport.height - KB });
        }
        await page.waitForFunction(() => document.documentElement.getAttribute('data-keyboard') === 'open');
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        const glue = await page.evaluate(() => {
          const area = document.querySelector('textarea');
          let bar = area;
          while (bar && bar.parentElement && getComputedStyle(bar).position !== 'absolute' && getComputedStyle(bar).position !== 'fixed') bar = bar.parentElement;
          const vv = window.visualViewport;
          const header = document.querySelector('header');
          return {
            barBottom: bar.getBoundingClientRect().bottom,
            visibleTop: vv.offsetTop,
            visibleBottom: vv.offsetTop + vv.height,
            headerTop: header?.getBoundingClientRect().top ?? null,
            attribute: document.documentElement.getAttribute('data-keyboard'),
            inset: document.documentElement.style.getPropertyValue('--keyboard-inset'),
            scrollY: window.scrollY,
            padding: getComputedStyle(bar).paddingBottom,
          };
        });
        const tag = `${device} fil, clavier ouvert`;
        check(`${tag} : data-keyboard=open`, glue.attribute === 'open', JSON.stringify(glue));
        check(`${tag} : composeur collé au clavier`, Math.abs(glue.barBottom - glue.visibleBottom) <= 1, `${glue.barBottom} vs ${glue.visibleBottom}`);
        check(`${tag} : en-tête en place`, glue.headerTop === null || glue.headerTop >= glue.visibleTop, `${glue.headerTop} vs ${glue.visibleTop}`);
        if (OUT) await page.screenshot({ path: `${OUT}/${device}_thread_keyboard.png` });
        if (device === 'iphone') await page.evaluate(() => window.__keyboard(0, 0));
        else await page.setViewportSize(options.viewport);
        await page.waitForFunction(() => !document.documentElement.hasAttribute('data-keyboard'));
        const closed = await page.evaluate(() => ({ attribute: document.documentElement.getAttribute('data-keyboard'), inset: document.documentElement.style.getPropertyValue('--keyboard-inset') }));
        check(`${device} fil, clavier fermé : rien ne reste posé`, closed.attribute === null && closed.inset === '', JSON.stringify(closed));
        await page.goto(`${BASE}/chats`, { waitUntil: 'networkidle' });
        await page.goto(`${BASE}/c/c-amina`, { waitUntil: 'networkidle' });
        await page.goBack({ waitUntil: 'networkidle' });
        check(`${device} retour système : du fil à /chats`, new URL(page.url()).pathname === '/chats', page.url());
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  served?.close();
}
console.log(failures.length === 0 ? 'TOUT VERT' : `${failures.length} échec(s)`);
process.exit(failures.length === 0 ? 0 : 1);
