/**
 * 6.14 — EN BULLES, LE MENU D'UN MESSAGE S'ANCRE SOUS SA BULLE (#12635),
 * extrait de `check-thread-states.mjs` (l'hôte approche du budget de taille,
 * § Code Style du `CLAUDE.md` : on extrait AVANT d'ajouter).
 *
 * Le défaut, mesuré sur Chromium 390×844 (`/c/c-deploiement` en Bulles) : la
 * rangée `[data-row]` occupe 14→376, la bulle envoyée `m2` 123→376 — et la
 * liste tombait à 75→315, centrée sur l'ÉCRAN, à gauche de la bulle tenue.
 * iOS (`MessageOverlayMenu.swift:321-334`) la centre sur la BULLE, puis la
 * borne aux marges. On mesure ici ce que voit le lecteur : la liste posée,
 * la bulle de l'aperçu cloné, et le départ du FLIP (#11206) — la première
 * image clé de l'élévation doit poser la bulle de l'aperçu SUR la bulle
 * vivante, sinon elle saute au départ.
 *
 * TROIS POSES : Bulles en LTR, Bulles en RTL (le gate pose `dir`, comme
 * `check-story-self-rail.mjs` — l'application ne le pose pas encore), et
 * Focal, dont la rangée plate garde le centrage sur l'aperçu.
 */
import { awaitCondition, awaitFact } from './await-fact.mjs';
import { requireRowSettled } from './check-media.mjs';

const CONVERSATION = 'c-deploiement';
const MODE_KEY = `meeshy.reading-mode.u_u-viewer.${CONVERSATION}`;
/** `SIDE_PADDING` (`src/lib/view/message-menu-metrics.ts`). */
const SIDE_PADDING = 16;
const VIEWPORT = { width: 390, height: 844 };
/** Le reflux de la rangée à l'écran moins deux marges (#11206) peut rogner la bulle d'un pixel. */
const TOLERANCE = 2;

const SENT = 'm2';
const RECEIVED = 'm1';

async function openPose({ browser, BASE, mode, dir }) {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'fr-FR' });
  await context.addInitScript(
    ({ key, mode, dir }) => {
      try {
        localStorage.setItem(key, mode);
      } catch {
        /* sans stockage, la pose retombe sur le mode par défaut — le témoin le dira. */
      }
      if (dir === 'rtl') document.addEventListener('DOMContentLoaded', () => (document.documentElement.dir = 'rtl'));
    },
    { key: MODE_KEY, mode, dir },
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/c/${CONVERSATION}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-message]');
  return { context, page };
}

/** Ouvre le menu sur la rangée `id` et rend ce que le lecteur voit, l'élévation finie. */
async function measureMenu(page, id) {
  const row = page.locator(`[data-row="${id}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.click({ button: 'right' });
  await awaitFact(page.locator('.message-menu-list'));
  const flip = await page.evaluate(() => {
    const host = document.querySelector('[data-message-menu-preview-host]');
    const first = host?.getAnimations?.()[0]?.effect?.getKeyframes?.()[0]?.transform ?? null;
    const match = typeof first === 'string' ? /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(first) : null;
    return match === null ? null : { dx: Number(match[1]), dy: Number(match[2]) };
  });
  await awaitCondition(page, () => document.querySelector('[data-message-menu-preview-host][data-lifting]') === null);
  const geometry = await page.evaluate((rowId) => {
    const span = (el) => {
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right };
    };
    return {
      list: span(document.querySelector('.message-menu-list')),
      preview: span(document.querySelector('[data-message-menu-preview-host]')),
      cloneBubble: span(document.querySelector('[data-message-menu-preview-host] .thread-bubble-measure')),
      liveBubble: span(document.querySelector(`[data-row="${rowId}"] .thread-bubble-measure`)),
    };
  }, id);
  await page.keyboard.press('Escape');
  await awaitCondition(page, () => document.querySelector('.message-menu-list') === null);
  return { ...geometry, flip };
}

const center = (span) => (span.left + span.right) / 2;
const round = (n) => Math.round(n);
const spanText = (span) => (span === null ? '∅' : `${round(span.left)}→${round(span.right)}`);

/** La liste centrée sous `target`, ou ramenée à la marge quand le centre la pousserait hors de l'écran. */
function listUnder(list, target) {
  const width = list.right - list.left;
  const wanted = Math.min(Math.max(center(target) - width / 2, SIDE_PADDING), VIEWPORT.width - SIDE_PADDING - width);
  return Math.abs(list.left - wanted) <= TOLERANCE;
}

export async function checkMenuBubbleAnchor({ browser, BASE, expect }) {
  for (const dir of ['ltr', 'rtl']) {
    const tag = `[bulles ${dir}]`;
    const { context, page } = await openPose({ browser, BASE, mode: 'bubbles', dir });
    await requireRowSettled(page, SENT, expect);
    for (const [id, who] of [
      [SENT, 'envoyé'],
      [RECEIVED, 'reçu'],
    ]) {
      const seen = await measureMenu(page, id);
      if (!expect(seen.list !== null && seen.cloneBubble !== null && seen.liveBubble !== null, `${tag} ${who} : le menu, l'aperçu et sa bulle sont mesurés`)) continue;
      expect(
        listUnder(seen.list, seen.cloneBubble),
        `${tag} ${who} : la liste (${spanText(seen.list)}) se centre sous sa bulle (${spanText(seen.cloneBubble)}), bornée aux marges`,
      );
      const sentSide = dir === 'ltr' ? 'right' : 'left';
      const side = id === SENT ? sentSide : sentSide === 'right' ? 'left' : 'right';
      /* Le bord que la bulle TIENT — le reflux à 70 % de l'aperçu peut rogner
         son bord opposé, jamais celui-ci. */
      expect(
        seen.flip !== null && Math.abs(seen.cloneBubble[side] + seen.flip.dx - seen.liveBubble[side]) <= 1,
        `${tag} ${who} : l'élévation part de la bulle vivante, bord ${side === 'right' ? 'droit' : 'gauche'} (dx ${seen.flip?.dx}, aperçu ${spanText(seen.cloneBubble)}, rangée ${spanText(seen.liveBubble)})`,
      );
    }
    await context.close();
  }

  const { context, page } = await openPose({ browser, BASE, mode: 'focal', dir: 'ltr' });
  await requireRowSettled(page, SENT, expect);
  const flat = await measureMenu(page, SENT);
  if (expect(flat.list !== null && flat.preview !== null, '[focal ltr] le menu et l’aperçu de la rangée plate sont mesurés')) {
    expect(
      Math.abs(center(flat.list) - center(flat.preview)) <= TOLERANCE,
      `[focal ltr] la rangée plate garde le centrage : liste ${spanText(flat.list)} sous l'aperçu ${spanText(flat.preview)}`,
    );
  }
  await context.close();
}
