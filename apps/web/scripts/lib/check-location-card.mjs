/**
 * 6.15 — LA CARTE DE LIEU RESTE DANS SA CELLULE, EN SCRIPT, FOCAL ET BULLES
 * (#7598), extrait de `check-thread-states.mjs` dès la naissance (l'hôte
 * approche du budget de taille, § Code Style du `CLAUDE.md`).
 *
 * Le défaut iOS (#7601) : une carte plus large que la bulle et une hauteur
 * qui grandissait après la mesure de la cellule — la carte chevauchait le
 * message d'au-dessus. `LocationCard` (`message-body-blocks.tsx`) est
 * commune aux trois modes du web ; rien ne CONSTATAIT jusqu'ici qu'elle ne
 * reproduit pas ce défaut. On mesure ce que voit le lecteur, à 375 px (le
 * plus étroit des écrans visés) : la rangée du lieu ne touche jamais la
 * précédente, la carte tient entière dans sa rangée, dans son conteneur
 * (la bulle en Bulles) et dans l'écran, et sa hauteur ne bouge pas.
 *
 * `expect` est REMIS par l'hôte, jamais redéfini.
 */
import { awaitCondition, awaitFact } from './await-fact.mjs';
import { requireRowSettled, waitForRowSettled } from './check-media.mjs';

const CONVERSATION = 'c-matrice';
const MODE_KEY = `meeshy.reading-mode.u_u-viewer.${CONVERSATION}`;
const VIEWPORT = { width: 375, height: 812 };
/** Arrondis sous-pixel du reflux : un demi-pixel n'est pas un chevauchement. */
const TOLERANCE = 0.5;
/** Le lieu reçu suit une rangée de réactions, le lieu envoyé suit le lieu reçu (`fixtures-render-matrix.ts`). */
const PAIRS = [
  { place: 'mx-place-text', previous: 'mx-piece-reactions' },
  { place: 'mx-place-text-mine', previous: 'mx-place-text' },
];
const MODES = [
  { mode: 'focal', label: 'Focal', flat: true },
  { mode: 'script', label: 'Script', flat: true },
  { mode: 'bubbles', label: 'Bulles', flat: false },
];

async function openMode({ browser, BASE, mode }) {
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'fr-FR' });
  await context.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* sans stockage, la pose retombe sur le mode par défaut — le témoin du mode le dira. */
      }
    },
    { key: MODE_KEY, value: mode },
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/c/${CONVERSATION}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-message]');
  return { context, page };
}

function mountRow(page, id) {
  return awaitCondition(
    page,
    (mid) => {
      if (document.querySelector(`[data-message="${mid}"]`) !== null) return true;
      const scroller = document.querySelector('main#contenu');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      return false;
    },
    id,
  );
}

function measure(page, { place, previous }) {
  return page.evaluate(
    ({ place: placeId, previous: previousId }) => {
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
      };
      const row = document.querySelector(`[data-message="${placeId}"]`);
      const card = row?.querySelector('[data-location-card]') ?? null;
      return {
        row: box(row),
        previous: box(document.querySelector(`[data-message="${previousId}"]`)),
        card: box(card),
        container: box(card?.parentElement ?? null),
        flatMode: row?.getAttribute('data-reading-mode') ?? null,
      };
    },
    { place, previous },
  );
}

const inside = (inner, outer) =>
  inner.top >= outer.top - TOLERANCE &&
  inner.bottom <= outer.bottom + TOLERANCE &&
  inner.left >= outer.left - TOLERANCE &&
  inner.right <= outer.right + TOLERANCE;

const fmt = (b) => (b ? `${Math.round(b.left)}→${Math.round(b.right)} × ${Math.round(b.top)}→${Math.round(b.bottom)}` : 'absente');

async function checkPair({ page, expect, label, flat, mode, pair }) {
  const tag = `[lieu/${label}] \`${pair.place}\``;
  await mountRow(page, pair.place);
  const row = page.locator(`[data-message="${pair.place}"]`).first();
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  if (!(await requireRowSettled(page, pair.place, expect))) return;
  const first = await measure(page, pair);
  if (!expect(first.card !== null, `${tag} rend sa carte de lieu (\`[data-location-card]\`)`)) return;
  expect(
    flat ? first.flatMode === mode : first.flatMode === null,
    `${tag} est rendu dans le mode demandé (data-reading-mode=${first.flatMode ?? 'aucun'}, attendu ${flat ? mode : 'aucun, bulle'})`,
  );
  expect(
    first.previous === null || first.previous.bottom <= first.row.top + TOLERANCE,
    `${tag} ne touche pas la rangée précédente \`${pair.previous}\` (précédente ${fmt(first.previous)}, lieu ${fmt(first.row)})`,
  );
  expect(
    first.previous === null || first.previous.bottom <= first.card.top + TOLERANCE,
    `${tag} : la carte reste sous la rangée précédente (carte ${fmt(first.card)}, précédente ${fmt(first.previous)})`,
  );
  expect(inside(first.card, first.row), `${tag} : la carte tient dans sa rangée (carte ${fmt(first.card)}, rangée ${fmt(first.row)})`);
  expect(
    inside(first.card, first.container),
    `${tag} : la carte tient dans son conteneur${flat ? '' : ' (la bulle)'} (carte ${fmt(first.card)}, conteneur ${fmt(first.container)})`,
  );
  expect(
    first.card.left >= -TOLERANCE && first.card.right <= VIEWPORT.width + TOLERANCE,
    `${tag} : la carte tient dans l'écran de ${VIEWPORT.width} px (${fmt(first.card)})`,
  );
  await waitForRowSettled(page, pair.place);
  const later = await measure(page, pair);
  expect(
    later.card !== null && Math.abs(later.card.height - first.card.height) <= TOLERANCE,
    `${tag} : la hauteur de la carte ne bouge pas après le rendu (${first.card.height}px puis ${later.card?.height ?? 'absente'}px)`,
  );
}

export async function checkLocationCard({ browser, BASE, expect }) {
  for (const { mode, label, flat } of MODES) {
    const { context, page } = await openMode({ browser, BASE, mode });
    try {
      await mountRow(page, PAIRS[0].place);
      await awaitFact(page.locator(`[data-message="${PAIRS[0].place}"]`).first());
      for (const pair of PAIRS) await checkPair({ page, expect, label, flat, mode, pair });
    } finally {
      await context.close();
    }
  }
}
