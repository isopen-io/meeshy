/**
 * LE FIL S'OUVRE SUR UN FAVORI PLUS ANCIEN QUE SES PAGES (#7420) — l'étape
 * navigateur du critère de fin de l'issue, jouée par
 * `check-thread-virtualization.mjs` (le gate du défilement et de la
 * pagination du fil).
 *
 * Sur le corpus des archives (`fixtures-archive.ts` : 160 messages, `arch-12`
 * en favori, trois pages plus haut que le présent) :
 *
 *  A1 toucher le favori sur l'écran des favoris ouvre `/c/c-archives?message=arch-12` ;
 *  A2 la rangée du favori est mise en évidence (enregistrée par un observateur
 *     ARMÉ AVANT le toucher) et posée à l'écran, sans aucun défilement de la
 *     main du gate ;
 *  A3 la fenêtre est DÉTACHÉE du présent : son pied attend le présent
 *     (`data-thread-newer="idle"`), le dernier message n'est pas monté ;
 *  A4 défiler vers le bas charge les pages plus récentes jusqu'à rejoindre le
 *     présent (`data-thread-newer="exhausted"`), et le dernier message paraît ;
 *  A5 aucun trou ni doublon : partout où l'on regarde, la rangée d'index N
 *     porte `arch-N` — 160 rangées pour 160 messages.
 *
 * #9302 — LE FIL DIT QU'IL CHARGE. Le client de fixtures sert sur-le-champ :
 * le gate RETIENT la fenêtre `?around=` puis la première page plus récente
 * (`fixture-hold.ts`, posé par `addInitScript`) et ne la relâche qu'après
 * avoir lu, sur le bouton « revenir en bas », l'état « en vol » :
 *  L1 pendant la fenêtre : `data-thread-loading="seeking"`, `aria-busy`,
 *     insensible (`aria-disabled`), « Recherche… » annoncé par la région
 *     `role="status"` — puis, relâchée, le bouton revient à l'état ordinaire ;
 *  L2 pendant la page plus récente : `data-thread-loading="newer"`, puis
 *     l'état ordinaire dès qu'elle est servie.
 *
 * Aucune attente à durée fixe : chaque lecture attend le FAIT qu'elle juge
 * (`fixed-delay-ratchet.test.ts`).
 */
const STARRED = 'arch-12';
const LAST = 'arch-159';
const TOTAL = 160;

const newerState = (page) =>
  page.evaluate(() => document.querySelector('[data-thread-newer]')?.getAttribute('data-thread-newer') ?? null);

/** L'observateur de la mise en évidence, ARMÉ AVANT le geste : elle s'éteint
 * d'elle-même (`HIGHLIGHT_MS`), une lecture après coup la raterait. */
const armHighlight = (page, messageId) =>
  page.evaluate((mid) => {
    const lit = () => {
      const row = document.querySelector(`main li [data-message="${mid}"]`);
      if (row === null) return false;
      const bg = getComputedStyle(row).backgroundColor;
      return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    };
    const state = { seen: false };
    window.__anchorHighlight = state;
    const observer = new MutationObserver(() => {
      if (!lit()) return;
      state.seen = true;
      observer.disconnect();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'], childList: true, subtree: true });
  }, messageId);

/** La rangée montée ET immobile d'une image à l'autre (le virtualiseur a fini de la mesurer). */
const rowSettled = (page, messageId) =>
  page.waitForFunction(
    (mid) => {
      const top = document.querySelector(`main li [data-message="${mid}"]`)?.getBoundingClientRect().top ?? null;
      const previous = window.__anchorRowTop;
      window.__anchorRowTop = top;
      return top !== null && typeof previous === 'number' && Math.abs(top - previous) < 0.5;
    },
    messageId,
    { timeout: 10_000, polling: 'raf' },
  );

/**
 * LA RETENUE (#9302) — `globalThis.__meeshyFixtureHold` (`src/lib/api/fixture-hold.ts`) :
 * toute page de fenêtre d'une nature encore RETENUE attend que le gate la
 * relâche ; relâcher une nature la laisse ensuite passer librement.
 */
const HOLD_WINDOW_PAGES = () => {
  const holding = new Set(['around', 'after']);
  const held = [];
  window.__fixtureHeld = held;
  window.__meeshyFixtureHold = (channel, detail) => {
    if (channel !== 'messages-window' || !holding.has(detail)) return undefined;
    return new Promise((resolve) => held.push({ detail, resolve }));
  };
  window.__releaseFixture = (detail) => {
    holding.delete(detail);
    for (const entry of held.filter((h) => h.detail === detail)) entry.resolve();
  };
};

const heldRequest = (page, detail) =>
  page
    .waitForFunction((d) => (window.__fixtureHeld ?? []).some((h) => h.detail === d), detail, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

/** Le bouton « revenir en bas » dans l'état de chargement attendu, lu d'une traite. */
const loadingButton = (page, kind) =>
  page
    .waitForFunction(
      (k) => {
        const button = document.querySelector(`button[data-thread-loading="${k}"]`);
        if (button === null) return null;
        const status = Array.from(document.querySelectorAll('[role="status"]'), (n) => n.textContent ?? '').find((t) => t !== '') ?? '';
        return {
          busy: button.getAttribute('aria-busy'),
          disabled: button.getAttribute('aria-disabled'),
          label: button.getAttribute('aria-label'),
          status,
        };
      },
      kind,
      { timeout: 10_000 },
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);

/** Relâche la retenue, puis attend que le bouton quitte l'état de chargement. */
const releaseAndSettle = async (page, detail) => {
  await page.evaluate((d) => window.__releaseFixture?.(d), detail);
  return page
    .waitForFunction(() => document.querySelector('[data-thread-loading]') === null, null, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
};

export async function checkThreadAnchor({ browser, BASE, expect }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  await context.addInitScript(HOLD_WINDOW_PAGES);
  const page = await context.newPage();
  await page.goto(`${BASE}/me/starred-messages`, { waitUntil: 'load' });
  const open = page.locator(`[data-starred-row="${STARRED}"] a[data-starred-open]`);
  await open.waitFor({ timeout: 30_000 });

  // ===== A1 & A2 — le toucher ouvre le fil SUR le favori, mis en évidence, à l'écran =====
  await armHighlight(page, STARRED);
  await open.click();
  await page.waitForURL(`**/c/c-archives?message=${STARRED}`, { timeout: 10_000 });
  expect(true, `[ancre] toucher le favori ouvre ${new URL(page.url()).pathname}${new URL(page.url()).search}`);

  // ===== L1 — la fenêtre ?around= en vol : le bouton « revenir en bas » cherche =====
  const aroundHeld = await heldRequest(page, 'around');
  const seeking = aroundHeld ? await loadingButton(page, 'seeking') : null;
  expect(
    seeking !== null && seeking.busy === 'true' && seeking.disabled === 'true' && seeking.label === 'Recherche…' && seeking.status === 'Recherche…',
    `[chargement] pendant la fenêtre ?around= retenue, le bouton « revenir en bas » se monte en « Recherche… », occupé et insensible, annoncé discrètement (lu : ${JSON.stringify(seeking)})`,
  );
  const seekingDone = await releaseAndSettle(page, 'around');
  expect(seekingDone, `[chargement] la fenêtre servie, le bouton quitte l'état de chargement`);
  const highlighted = await page
    .waitForFunction(() => window.__anchorHighlight?.seen === true, null, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  expect(highlighted, `[ancre] la rangée de « ${STARRED} », trois pages plus haut que le présent, est mise en évidence à l'ouverture`);
  await rowSettled(page, STARRED);
  const onScreen = await page.evaluate((mid) => {
    const row = document.querySelector(`main li [data-message="${mid}"]`)?.getBoundingClientRect();
    const main = document.querySelector('main#contenu')?.getBoundingClientRect();
    return row !== undefined && main !== undefined && row.top >= main.top && row.bottom <= main.bottom;
  }, STARRED);
  expect(onScreen, `[ancre] la bulle du favori est ENTIÈRE à l'écran, sans défilement à la main`);

  // ===== A3 — la fenêtre est détachée du présent =====
  const rowCount = () => page.evaluate(() => Number(document.querySelector('main#contenu ol')?.getAttribute('data-thread-rows') ?? 0));
  const opened = await rowCount();
  const detached = (await newerState(page)) === 'idle' && (await page.locator(`[data-message="${LAST}"]`).count()) === 0;
  expect(
    detached && opened < TOTAL,
    `[ancre] la fenêtre (${opened} rangées) ne touche pas le présent : son pied l'attend (état lu : ${await newerState(page)})`,
  );

  // ===== A4 — redescendre jusqu'au présent =====
  let newerPages = 0;
  for (let turn = 0; turn < 10 && (await newerState(page)) !== 'exhausted'; turn += 1) {
    const before = await rowCount();
    await page.evaluate(() => {
      const main = document.querySelector('main#contenu');
      if (main !== null) main.scrollTop = main.scrollHeight;
    });
    if (turn === 0) {
      // ===== L2 — la page plus récente en vol : le bouton le dit, puis se tait =====
      const afterHeld = await heldRequest(page, 'after');
      const loadingNewer = afterHeld ? await loadingButton(page, 'newer') : null;
      expect(
        loadingNewer !== null && loadingNewer.busy === 'true' && loadingNewer.disabled === null && loadingNewer.status === 'Chargement…',
        `[chargement] pendant la page plus récente retenue, le bouton « revenir en bas » se dit occupé, « Chargement… », et reste actif (lu : ${JSON.stringify(loadingNewer)})`,
      );
      const newerDone = await releaseAndSettle(page, 'after');
      expect(newerDone, `[chargement] la page plus récente servie, le bouton quitte l'état de chargement`);
    }
    const grew = await page
      .waitForFunction(
        (count) => {
          const state = document.querySelector('[data-thread-newer]')?.getAttribute('data-thread-newer');
          const rows = Number(document.querySelector('main#contenu ol')?.getAttribute('data-thread-rows') ?? 0);
          return rows > count && state !== 'loading-more';
        },
        before,
        { timeout: 10_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (!grew) break;
    newerPages += 1;
  }
  const joined = await rowCount();
  expect(
    (await newerState(page)) === 'exhausted' && newerPages >= 1 && joined === TOTAL,
    `[ancre] défiler vers le bas rejoint le présent : ${opened} → ${joined} rangées en ${newerPages} page(s) plus récente(s) (état du pied : ${await newerState(page)})`,
  );
  await page.evaluate(() => {
    const main = document.querySelector('main#contenu');
    if (main !== null) main.scrollTop = main.scrollHeight;
  });
  const reached = await page
    .waitForFunction((id) => document.querySelector(`main li [data-message="${id}"]`) !== null, LAST, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  expect(reached, `[ancre] le dernier message (« ${LAST} ») paraît au bas du fil`);

  // ===== A5 — aucun trou, aucun doublon : la rangée N porte arch-N, du haut au bas =====
  const mismatches = [];
  const seen = new Set();
  for (const fraction of [1, 0.75, 0.5, 0.25, 0]) {
    const rows = await page
      .waitForFunction(
        ({ f, last }) => {
          const main = document.querySelector('main#contenu');
          if (main === null) return null;
          const target = Math.round((main.scrollHeight - main.clientHeight) * f);
          if (Math.abs(main.scrollTop - target) > 1) main.scrollTop = target;
          const box = main.getBoundingClientRect();
          const found = Array.from(main.querySelectorAll('li[data-index]'), (li) => {
            const r = li.getBoundingClientRect();
            return {
              index: Number(li.getAttribute('data-index')),
              id: li.querySelector('[data-message]')?.getAttribute('data-message') ?? null,
              visible: r.bottom > box.top && r.top < box.bottom,
            };
          });
          /* Les rangées de la position PRÉCÉDENTE restent montées une image : on
             attend celles que la nouvelle position rend visibles, et le bord
             lui-même aux deux extrémités. */
          const edge = f === 1 ? last : f === 0 ? 0 : null;
          const ready =
            found.some((r) => r.visible) &&
            found.every((r) => r.id !== null) &&
            (edge === null || found.some((r) => r.index === edge && r.visible));
          return ready ? found.map(({ index, id }) => ({ index, id })) : null;
        },
        { f: fraction, last: TOTAL - 1 },
        { timeout: 10_000 },
      )
      .then((handle) => handle.jsonValue())
      .catch(() => []);
    for (const row of rows) {
      seen.add(row.index);
      if (row.id !== `arch-${row.index}`) mismatches.push(`${row.index}→${row.id}`);
    }
  }
  /* La rangée 0 porte arch-0 et la rangée 159 porte arch-159, et chaque rangée
     lue entre les deux porte son propre numéro : un trou ou un doublon
     décalerait la correspondance quelque part avant le bas. */
  expect(
    seen.has(0) && seen.has(TOTAL - 1) && mismatches.length === 0,
    `[ancre] aucun trou ni doublon sur ${TOTAL} messages : ${seen.size} rangée(s) lue(s) du haut au bas, chaque index N porte arch-N${mismatches.length > 0 ? ` — écarts ${mismatches.slice(0, 6).join(', ')}` : ''}`,
  );
  await context.close();
  return { newerPages, sampled: seen.size };
}
