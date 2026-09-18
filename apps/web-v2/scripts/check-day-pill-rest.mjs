#!/usr/bin/env node
/**
 * LA PILULE DE JOUR NE RECOUVRE AUCUN TEXTE AU REPOS (#6101) — le témoin
 * GÉOMÉTRIQUE de la décision « elle s'efface au repos » (`decisions.md`).
 *
 * Mesuré avant ce lot, fil ouvert au repos à 390 × 844 : la pilule collante
 * tombait sur la première rangée lisible sous la bande et masquait le NOM de
 * son auteur. Ce n'est pas un défaut de virtualisation — les rangées ne se
 * chevauchent pas — mais un overlay posé sur du texte.
 *
 * CE QU'IL MESURE, dans les DEUX schémas, à 390 × 844 ET 320 × 568, dans
 * chaque mode de lecture que le fil REND (Focal, Script, Bulles) :
 *
 * 1. AU REPOS À L'OUVERTURE (le fil s'ancre en bas par le CODE) : pour chaque
 *    texte de rangée VISIBLE dont la boîte coupe celle de la capsule, la
 *    pilule est d'opacité calculée 0. Un texte recouvert par une pilule
 *    visible est un échec, nommé.
 * 2. AU REPOS APRÈS UN DÉFILEMENT DU CODE vers le milieu du fil — même
 *    assertion : un `scrollTop` programmé n'est pas un geste.
 * 3. PENDANT LE GESTE (doigt posé qui tire la liste) : la pilule est à 1 —
 *    c'est le geste où elle sert, le seul où elle a le droit de passer sur
 *    un texte.
 * 4. APRÈS LA LEVÉE, une fenêtre de révélé (900 ms) plus le fondu (180 ms)
 *    plus une marge : retour à 0.
 * 5. NON-VACUITÉ : au moins une mesure de repos a trouvé un texte SOUS la
 *    boîte de la capsule — sinon ce témoin ne prouverait rien, et il le dit.
 *
 * La Rivière n'est PAS rendue par le fil de la v2.0 (`THREAD_RENDERABLE_MODES`,
 * `lib/reading-mode/catalog.ts`, « Bientôt disponible ») : la clé est posée
 * quand même et le mode RENDU est relevé — le jour où elle entre au
 * catalogue de rendu, ce témoin la mesure sans changer une ligne.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const CAPTURES = join(APP, '..', '..', '.cache', 'web-v2-workflow', 'rendus');
/* Le serveur vit dans `lib/` depuis #6988 : celui qui était écrit ici
   repliait TOUT sur `index.html`, y compris un `/assets/*.js` dont la lecture
   échouait — le navigateur rendait alors « Failed to fetch dynamically imported
   module » pour une panne transitoire, sans aucune trace au journal. */
const served = await startDistServer(DIST);
const BASE = served.base;
await mkdir(CAPTURES, { recursive: true });

const failures = [];
const expect = (ok, what) => {
  if (!ok) failures.push(what);
  console.log(`  ${ok ? 'ok   ' : 'ECHEC'} ${what}`);
  return ok;
};

/** Le corpus de `check-thread-chrome.mjs` § 3 : trois jours, plusieurs écrans. */
const CONVERSATION = 'c-rattrapage';
const MODE_KEY = `meeshy.reading-mode.u_u-viewer.${CONVERSATION}`;
const LINGER_MS = 900;
const FADE_MS = 180;

const browser = await launchChromium();

const touch = (page, kind, dy = 0) =>
  page.evaluate(
    ({ kind, dy }) => {
      const el = document.querySelector('main');
      const rect = el.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      const point = (clientY) => new Touch({ identifier: 1, target: el, clientX: x, clientY });
      if (kind === 'start') {
        const t = point(y);
        el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
        return;
      }
      if (kind === 'move') {
        el.scrollTop -= dy;
        const t = point(y + dy);
        el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
        return;
      }
      const t = point(y);
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], targetTouches: [], changedTouches: [t] }));
    },
    { kind, dy },
  );

/**
 * La capsule, son opacité EFFECTIVE (produit des ancêtres) et les textes de
 * rangée VISIBLES que sa boîte recouvre — mesurés sur les boîtes des NŒUDS
 * TEXTE (`Range`), jamais sur celles des rangées entières.
 */
const pillOverText = (page) =>
  page.evaluate(() => {
    const effectiveOpacity = (el) => {
      let value = 1;
      for (let node = el; node instanceof Element; node = node.parentElement) {
        value *= Number.parseFloat(getComputedStyle(node).opacity);
      }
      return value;
    };
    const capsule = document.querySelector('.thread-day-pill [role="heading"]');
    if (capsule === null) return { mounted: false };
    const box = capsule.getBoundingClientRect();
    const covered = [];
    const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
      const value = text.textContent.trim();
      const parent = text.parentElement;
      if (value === '' || parent === null || parent.closest('li') === null) continue;
      if (effectiveOpacity(parent) === 0 || getComputedStyle(parent).visibility === 'hidden') continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      const hit = [...range.getClientRects()].some(
        (r) => r.width > 0 && r.height > 0 && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top,
      );
      if (hit) covered.push(value.slice(0, 32));
    }
    return {
      mounted: true,
      label: capsule.textContent,
      top: Math.round(box.top),
      bottom: Math.round(box.bottom),
      opacity: effectiveOpacity(capsule),
      covered,
    };
  });

const openThread = async ({ scheme, viewport, mode }) => {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    hasTouch: true,
    colorScheme: scheme === 'light' ? 'light' : 'dark',
  });
  await context.addInitScript(
    ({ scheme, key, mode }) => {
      try {
        localStorage.setItem('meeshy.scheme', scheme);
        localStorage.setItem(key, mode);
      } catch {
        /* navigation privée */
      }
    },
    { scheme, key: MODE_KEY, mode },
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/c/${CONVERSATION}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('main li', { timeout: 20_000 });
  await page.waitForTimeout(LINGER_MS + FADE_MS + 300);
  return { page, context };
};

const renderedMode = (page) =>
  page.evaluate(() => {
    if (document.querySelector('main li [data-reading-mode="focal"]') !== null) return 'focal';
    if (document.querySelector('main li [data-reading-mode="script"]') !== null) return 'script';
    if (document.querySelector('main li .rounded-bubble') !== null) return 'bubbles';
    return 'autre';
  });

const hazards = [];

const assertRest = (where, measure) => {
  if (!measure.mounted) {
    expect(true, `${where} · aucune pilule montée (aucun jour à coller) — rien ne recouvre`);
    return;
  }
  if (measure.covered.length > 0) hazards.push(where);
  expect(
    measure.opacity === 0 || measure.covered.length === 0,
    `${where} · au repos, la pilule « ${measure.label} » (y ${measure.top}..${measure.bottom}, opacité ${measure.opacity}) ne recouvre aucun texte lisible${
      measure.covered.length > 0 ? ` — sous sa boîte : ${measure.covered.map((t) => `« ${t} »`).join(', ')}` : ''
    }`,
  );
};

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];
const MODES = ['focal', 'script', 'bubbles', 'river'];

for (const scheme of ['light', 'dark']) {
  for (const viewport of VIEWPORTS) {
    for (const mode of MODES) {
      const tag = `${scheme} · ${viewport.width}×${viewport.height} · ${mode}`;
      console.log(`\n--- ${tag} ---`);
      const { page, context } = await openThread({ scheme, viewport, mode });
      const rendered = await renderedMode(page);
      if (mode === 'river') {
        expect(
          rendered !== 'river',
          `${tag} · la Rivière n'est pas rendue par le fil (rendu « ${rendered} ») — mesurée ci-dessous dans le mode servi`,
        );
      } else {
        expect(rendered === mode, `${tag} · le fil est bien rendu en « ${mode} » (relevé « ${rendered} »)`);
      }

      // 1 — au repos, à l'ouverture.
      assertRest(`${tag} · ouverture`, await pillOverText(page));
      if (viewport.width === 390 && mode !== 'river') {
        await page.screenshot({ path: join(CAPTURES, `day-pill-rest.${mode}.${scheme}.png`) });
      }

      // 2 — au repos, après un défilement du CODE vers le milieu du fil.
      await page.evaluate(() => {
        const m = document.querySelector('main');
        m.scrollTop = Math.round((m.scrollHeight - m.clientHeight) / 2);
      });
      await page.waitForTimeout(LINGER_MS + FADE_MS + 300);
      assertRest(`${tag} · milieu du fil`, await pillOverText(page));

      // 3 — pendant le geste.
      await touch(page, 'start');
      for (let i = 0; i < 6; i += 1) {
        await touch(page, 'move', 50);
        await page.waitForTimeout(30);
      }
      await page.waitForTimeout(FADE_MS + 100);
      const during = await pillOverText(page);
      if (during.mounted) {
        expect(during.opacity === 1, `${tag} · pendant le geste, la pilule « ${during.label} » SERT (opacité ${during.opacity})`);
      } else {
        expect(true, `${tag} · pendant le geste, la tête visible ouvre son jour — aucune pilule à coller`);
      }

      // 4 — après la levée, retour au repos.
      await touch(page, 'end');
      await page.waitForTimeout(LINGER_MS + FADE_MS + 300);
      const after = await pillOverText(page);
      if (after.mounted) {
        expect(after.opacity === 0, `${tag} · une fenêtre après la levée, la pilule s'est effacée (opacité ${after.opacity})`);
      }

      await page.close();
      await context.close();
    }
  }
}

// 5 — non-vacuité.
expect(
  hazards.length > 0,
  `le témoin n'est pas vide : ${hazards.length} mesure(s) de repos ont trouvé un texte sous la capsule (${hazards.slice(0, 3).join(' ; ')}${hazards.length > 3 ? ' ; …' : ''})`,
);

await browser.close();
served.close();

if (failures.length > 0) {
  console.error('\n  LA PILULE DE JOUR RECOUVRE UN TEXTE AU REPOS (#6101) :\n');
  for (const f of failures) console.error(`    · ${f}`);
  console.error('');
  process.exit(1);
}
console.log('\n  Au repos, la pilule de jour ne recouvre aucun texte (deux schémas, deux gabarits, modes rendus).');
console.log(`  Captures : ${join(CAPTURES, 'day-pill-rest.{focal,script,bubbles}.{light,dark}.png')}`);
